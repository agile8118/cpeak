import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import type {
  StringMap,
  CpeakRequest,
  CpeakResponse,
  Middleware,
  RouteMiddleware,
  Handler,
  RoutesMap
} from "./types";

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
  PAYLOAD_TOO_LARGE = "CPEAK_ERR_PAYLOAD_TOO_LARGE"
}

class CpeakIncomingMessage extends http.IncomingMessage {
  // We define body and params here for better V8 optimization (not changing the shape of the object at runtime)
  public body: any = undefined;
  public params: StringMap = {};

  private _query?: StringMap;

  // Parse the URL parameters (like /users?key1=value1&key2=value2)
  // We will call this query to be more familiar with other node.js frameworks.
  // This is a getter method (accessed like a property)
  get query(): StringMap {
    // This way if a developer writes req.query multiple times, we don't parse it multiple times
    if (this._query) return this._query;

    const url = this.url || "";
    const qIndex = url.indexOf("?");

    if (qIndex === -1) {
      this._query = {};
    } else {
      const searchParams = new URLSearchParams(url.substring(qIndex + 1));
      this._query = Object.fromEntries(searchParams.entries());
    }

    return this._query;
  }
}

class CpeakServerResponse extends http.ServerResponse<CpeakIncomingMessage> {
  // Send a file back to the client
  async sendFile(path: string, mime: string) {
    if (!mime) {
      throw frameworkError(
        'MIME type is missing. Use res.sendFile(path, "mime-type").',
        this.sendFile,
        ErrorCode.MISSING_MIME
      );
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

  // Redirects to a new URL
  redirect(location: string) {
    this.writeHead(302, { Location: location });
    this.end();
    return this;
  }

  // Send a json data back to the client (for small json data, less than the highWaterMark)
  json(data: any) {
    // This is only good for bodies that their size is less than the highWaterMark value
    this.setHeader("Content-Type", "application/json");
    this.end(JSON.stringify(data));
  }
}

class Cpeak {
  private server: http.Server<
    typeof CpeakIncomingMessage,
    typeof CpeakServerResponse
  >;
  private routes: RoutesMap;
  private middleware: Middleware[];
  private _handleErr?: (
    err: unknown,
    req: CpeakRequest,
    res: CpeakResponse
  ) => void;

  constructor() {
    this.server = http.createServer({
      IncomingMessage: CpeakIncomingMessage,
      ServerResponse: CpeakServerResponse
    });
    this.routes = {};
    this.middleware = [];

    this.server.on("request", async (req: CpeakRequest, res: CpeakResponse) => {
      // Get the url without the URL parameters (query strings)
      const qIndex = req.url?.indexOf("?");
      const urlWithoutQueries =
        qIndex === -1 ? req.url || "" : req.url?.substring(0, qIndex);

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
            await cb(req, res, (error) => {
              res.setHeader("Connection", "close");
              this._handleErr?.(error, req, res);
            });
          } catch (error) {
            res.setHeader("Connection", "close");
            this._handleErr?.(error, req, res);
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
                  res.setHeader("Connection", "close");
                  return this._handleErr?.(error, req, res);
                }
                await runHandler(req, res, middleware, cb, index + 1);
              },
              // Error handler for a route middleware
              (error) => {
                res.setHeader("Connection", "close");
                this._handleErr?.(error, req, res);
              }
            );
          } catch (error) {
            res.setHeader("Connection", "close");
            this._handleErr?.(error, req, res);
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
          const routes = this.routes[req.method?.toLowerCase() || ""];
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
                res.setHeader("Connection", "close");
                return this._handleErr?.(err, req, res);
              }
              await runMiddleware(req, res, middleware, index + 1);
            });
          } catch (error) {
            res.setHeader("Connection", "close");
            this._handleErr?.(error, req, res);
          }
        }
      };

      await runMiddleware(req, res, this.middleware, 0);
    });
  }

  route(method: string, path: string, ...args: (RouteMiddleware | Handler)[]) {
    if (!this.routes[method]) this.routes[method] = [];

    // The last argument should always be our handler
    const cb = args.pop() as Handler;

    if (!cb || typeof cb !== "function") {
      throw new Error("Route definition must include a handler");
    }

    // Rest will be our middleware functions
    const middleware = args.flat() as RouteMiddleware[];

    const regex = this.#pathToRegex(path);
    this.routes[method].push({ path, regex, middleware, cb });
  }

  beforeEach(cb: Middleware) {
    this.middleware.push(cb);
  }

  handleErr(cb: (err: unknown, req: CpeakRequest, res: CpeakResponse) => void) {
    this._handleErr = cb;
  }

  listen(port: number, cb?: () => void) {
    return this.server.listen(port, cb);
  }

  close(cb?: (err?: Error) => void) {
    this.server.close(cb);
  }

  // ------------------------------
  // PRIVATE METHODS:
  // ------------------------------
  #pathToRegex(path: string) {
    const paramNames: string[] = [];
    const regexString =
      "^" +
      path.replace(/:\w+/g, (match, offset) => {
        paramNames.push(match.slice(1));
        return "([^/]+)";
      }) +
      "$";

    const regex = new RegExp(regexString);
    return regex;
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
export { serveStatic } from "./utils/serveStatic.js";
export { parseJSON } from "./utils/paseJSON.js";
export { render } from "./utils/render.js";

export type {
  Cpeak,
  CpeakRequest,
  CpeakResponse,
  Next,
  HandleErr,
  Middleware,
  RouteMiddleware,
  Handler,
  RoutesMap
} from "./types";

export default function cpeak() {
  return new Cpeak();
}
