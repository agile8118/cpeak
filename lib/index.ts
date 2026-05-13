import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import type net from "node:net";
import type { Readable } from "node:stream";
import type { Buffer } from "node:buffer";

import {
  resolveCompressionOptions,
  compressAndSend
} from "./internal/compression";
import { MIME_TYPES } from "./internal/mimeTypes";

import type {
  StringMap,
  CpeakHttpServer,
  CpeakOptions,
  CpeakRequest,
  CpeakResponse,
  Middleware,
  RouteMiddleware,
  Handler,
  RoutesMap
} from "./types";

import type { ResolvedCompressionConfig } from "./internal/types";

// A utility function to create an error with a custom stack trace
export function frameworkError(
  message: string,
  skipFn: Function,
  code?: string,
  status?: number
) {
  const err = new Error(message) as Error & {
    code?: string;
    cpeak_err?: boolean;
  };
  Error.captureStackTrace(err, skipFn);

  err.cpeak_err = true;

  if (code) err.code = code;
  if (status) (err as any).status = status;

  return err;
}

export enum ErrorCode {
  MISSING_MIME = "CPEAK_ERR_MISSING_MIME",
  FILE_NOT_FOUND = "CPEAK_ERR_FILE_NOT_FOUND",
  NOT_A_FILE = "CPEAK_ERR_NOT_A_FILE",
  SEND_FILE_FAIL = "CPEAK_ERR_SEND_FILE_FAIL",
  INVALID_JSON = "CPEAK_ERR_INVALID_JSON",
  PAYLOAD_TOO_LARGE = "CPEAK_ERR_PAYLOAD_TOO_LARGE",
  WEAK_SECRET = "CPEAK_ERR_WEAK_SECRET",
  COMPRESSION_NOT_ENABLED = "CPEAK_ERR_COMPRESSION_NOT_ENABLED"
}

export class CpeakIncomingMessage extends http.IncomingMessage {
  // We define body and params here for better V8 optimization (not changing the shape of the object at runtime)
  public body: any = undefined;
  public params: StringMap = {};

  #query?: StringMap;

  // Parse the URL parameters (like /users?key1=value1&key2=value2)
  // We will call this query to be more familiar with other node.js frameworks.
  // This is a getter method (accessed like a property)
  get query(): StringMap {
    // This way if a developer writes req.query multiple times, we don't parse it multiple times
    if (this.#query) return this.#query;

    const url = this.url || "";
    const qIndex = url.indexOf("?");

    if (qIndex === -1) {
      this.#query = {};
    } else {
      const searchParams = new URLSearchParams(url.substring(qIndex + 1));
      this.#query = Object.fromEntries(searchParams.entries());
    }

    return this.#query;
  }
}

export class CpeakServerResponse extends http.ServerResponse<CpeakIncomingMessage> {
  // Set per-request from the Cpeak instance. Undefined when compression isn't enabled.
  _compression?: ResolvedCompressionConfig;

  // Send a file back to the client
  async sendFile(path: string, mime?: string) {
    if (!mime) {
      const dotIndex = path.lastIndexOf(".");
      const fileExtension = dotIndex >= 0 ? path.slice(dotIndex + 1) : "";
      mime = MIME_TYPES[fileExtension];
      if (!mime) {
        throw frameworkError(
          `MIME type is missing for "${path}". Pass it as the second argument or register the extension via cpeak({ mimeTypes: { ${fileExtension || "ext"}: "..." } }).`,
          this.sendFile,
          ErrorCode.MISSING_MIME
        );
      }
    }

    try {
      const stat = await fs.stat(path);
      if (!stat.isFile()) {
        throw frameworkError(
          `Not a file: ${path}`,
          this.sendFile,
          ErrorCode.NOT_A_FILE
        );
      }

      if (this._compression) {
        await compressAndSend(
          this,
          mime,
          createReadStream(path),
          this._compression,
          stat.size
        );
        return;
      }

      this.setHeader("Content-Type", mime);
      this.setHeader("Content-Length", String(stat.size));

      // Properly propagate stream errors and respect backpressure
      await pipeline(createReadStream(path), this);
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        throw frameworkError(
          `File not found: ${path}`,
          this.sendFile,
          ErrorCode.FILE_NOT_FOUND
        );
      }

      throw frameworkError(
        `Failed to send file: ${path}`,
        this.sendFile,
        ErrorCode.SEND_FILE_FAIL
      );
    }
  }

  // Set the status code of the response
  status(code: number) {
    this.statusCode = code;
    return this;
  }

  // Set the Content-Disposition header to prompt the user to download a file
  attachment(filename?: string) {
    const contentDisposition = filename
      ? `attachment; filename="${filename}"`
      : "attachment";
    this.setHeader("Content-Disposition", contentDisposition);
    return this;
  }

  // Redirects to a new URL
  redirect(location: string) {
    this.writeHead(302, { Location: location });
    this.end();
  }

  // Send a json data back to the client.
  // This is only good for bodies that their size is less than the highWaterMark value.
  json(data: any): Promise<void> {
    const body = JSON.stringify(data);
    if (this._compression) {
      return compressAndSend(this, "application/json", body, this._compression);
    }
    this.setHeader("Content-Type", "application/json");
    this.end(body);
    return Promise.resolve();
  }

  // Explicit compression entry point. A developer can use this in any custom handler to compress arbitrary responses
  compress(
    mime: string,
    body: Buffer | string | Readable,
    size?: number
  ): Promise<void> {
    if (!this._compression) {
      throw frameworkError(
        "compression is not enabled. Pass `compression` to cpeak({ compression: true | { ... } }) to use res.compress.",
        this.compress,
        ErrorCode.COMPRESSION_NOT_ENABLED
      );
    }
    return compressAndSend(this, mime, body, this._compression, size);
  }
}

export class Cpeak {
  #server: CpeakHttpServer;
  #routes: RoutesMap;
  #middleware: Middleware[];
  #handleErr?: (err: unknown, req: CpeakRequest, res: CpeakResponse) => void;
  #compression?: ResolvedCompressionConfig;

  constructor(options: CpeakOptions = {}) {
    this.#server = http.createServer({
      IncomingMessage: CpeakIncomingMessage,
      ServerResponse: CpeakServerResponse
    });
    this.#routes = {};
    this.#middleware = [];

    // Resolve compression options once at app startup.
    if (options.compression) {
      this.#compression = resolveCompressionOptions(options.compression);
    }

    // Merge developer-supplied mime types with the defaults once at startup
    if (options.mimeTypes) Object.assign(MIME_TYPES, options.mimeTypes);

    this.#server.on(
      "request",
      async (req: CpeakRequest, res: CpeakResponse) => {
        res._compression = this.#compression;

        // Get the url without the URL parameters (query strings)
        const qIndex = req.url?.indexOf("?");
        const urlWithoutQueries =
          qIndex === -1 ? req.url || "" : req.url?.substring(0, qIndex);

        const dispatchError = (error: unknown) => {
          if (res.headersSent) {
            req.socket?.destroy();
            return;
          }
          res.setHeader("Connection", "close");
          this.#handleErr?.(error, req, res);
        };

        // Run all the specific middleware functions for that router only and then run the handler
        const runHandler = async (
          req: CpeakRequest,
          res: CpeakResponse,
          middleware: RouteMiddleware[],
          cb: Handler,
          index: number
        ) => {
          // Our exit point...
          if (index === middleware.length) {
            // Call the route handler with the modified req and res objects.
            // Also handle the promise errors by passing them to the handleErr to save developers from having to manually wrap every handler in try catch.
            try {
              await cb(req, res, dispatchError);
            } catch (error) {
              dispatchError(error);
            }
          } else {
            // Handle the promise errors by passing them to the handleErr to save developers from having to manually wrap every handler middleware in try catch.
            try {
              await middleware[index](
                req,
                res,
                // The next function
                async (error) => {
                  // this function only accepts an error argument to be more compatible with NPM modules that are built for express
                  if (error) {
                    return dispatchError(error);
                  }
                  await runHandler(req, res, middleware, cb, index + 1);
                },
                // Error handler for a route middleware
                dispatchError
              );
            } catch (error) {
              dispatchError(error);
            }
          }
        };

        // Run all the middleware functions (beforeEach functions) before we run the corresponding route
        const runMiddleware = async (
          req: CpeakRequest,
          res: CpeakResponse,
          middleware: Middleware[],
          index: number
        ) => {
          // Our exit point...
          if (index === middleware.length) {
            const routes = this.#routes[req.method?.toLowerCase() || ""];
            if (routes && typeof routes[Symbol.iterator] === "function")
              for (const route of routes) {
                const match = urlWithoutQueries?.match(route.regex);

                if (match) {
                  // Parse the URL path variables from the matched route (like /users/:id)
                  const pathVariables = this.#extractPathVariables(
                    route.path,
                    match
                  );

                  // We will call this params to be more familiar with other node.js frameworks.
                  req.params = pathVariables;

                  return await runHandler(
                    req,
                    res,
                    route.middleware,
                    route.cb,
                    0
                  );
                }
              }

            // If the requested route dose not exist, return 404
            return res
              .status(404)
              .json({ error: `Cannot ${req.method} ${urlWithoutQueries}` });
          } else {
            try {
              await middleware[index](req, res, async (err?: unknown) => {
                if (err) {
                  return dispatchError(err);
                }
                await runMiddleware(req, res, middleware, index + 1);
              });
            } catch (error) {
              dispatchError(error);
            }
          }
        };

        await runMiddleware(req, res, this.#middleware, 0);
      }
    );
  }

  route(method: string, path: string, ...args: (RouteMiddleware | Handler)[]) {
    if (!this.#routes[method]) this.#routes[method] = [];

    // The last argument should always be our handler
    const cb = args.pop() as Handler;

    if (!cb || typeof cb !== "function") {
      throw new Error("Route definition must include a handler");
    }

    // Rest will be our middleware functions
    const middleware = args.flat() as RouteMiddleware[];

    const regex = this.#pathToRegex(path);
    this.#routes[method].push({ path, regex, middleware, cb });
  }

  beforeEach(cb: Middleware) {
    this.#middleware.push(cb);
  }

  handleErr(cb: (err: unknown, req: CpeakRequest, res: CpeakResponse) => void) {
    this.#handleErr = cb;
  }

  // The first 3 listens are just TS overloads for better type inference and editor autocompletion. The last one is the actual implementation.
  listen(port: number, cb?: () => void): CpeakHttpServer;
  listen(port: number, host: string, cb?: () => void): CpeakHttpServer;
  listen(options: net.ListenOptions, cb?: () => void): CpeakHttpServer;
  listen(...args: any[]) {
    return this.#server.listen(...args);
  }

  address() {
    return this.#server.address();
  }

  close(cb?: (err?: Error) => void) {
    return this.#server.close(cb);
  }

  // ------------------------------
  // PRIVATE METHODS:
  // ------------------------------
  #pathToRegex(path: string) {
    const regexString =
      "^" + path.replace(/:\w+/g, "([^/]+)").replace(/\*/g, ".*") + "$";

    return new RegExp(regexString);
  }

  #extractPathVariables(path: string, match: RegExpMatchArray) {
    // Extract path url variable values from the matched route
    const paramNames = (path.match(/:\w+/g) || []).map((param) =>
      param.slice(1)
    );
    const params: StringMap = {};
    paramNames.forEach((name, index) => {
      params[name] = match[index + 1];
    });
    return params;
  }
}

// Util functions
export {
  serveStatic,
  parseJSON,
  render,
  swagger,
  auth,
  hashPassword,
  verifyPassword,
  cookieParser,
  cors
} from "./utils";

export type {
  AuthOptions,
  PbkdfOptions,
  CookieOptions,
  CorsOptions
} from "./utils/types";

export type { CompressionOptions } from "./internal/types";

export type {
  CpeakHttpServer,
  CpeakOptions,
  CpeakRequest,
  CpeakResponse,
  Next,
  HandleErr,
  Middleware,
  RouteMiddleware,
  Handler,
  RoutesMap
} from "./types";

export default function cpeak(options?: CpeakOptions): Cpeak {
  return new Cpeak(options);
}
