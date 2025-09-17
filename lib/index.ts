import http from "node:http";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import { serveStatic, parseJSON, render } from "./utils";

import type {
  StringMap,
  CpeakRequest,
  CpeakResponse,
  Middleware,
  RouteMiddleware,
  Handler,
  RoutesMap,
} from "./types";

// A utility function to create an error with a custom stack trace
export function frameworkError(
  message: string,
  skipFn: Function,
  code?: string
) {
  const err = new Error(message) as Error & { code?: string };
  Error.captureStackTrace(err, skipFn);

  if (code) err.code = code;

  return err;
}

export enum ErrorCode {
  MISSING_MIME = "CPEAK_ERR_MISSING_MIME",
  FILE_NOT_FOUND = "CPEAK_ERR_FILE_NOT_FOUND",
  NOT_A_FILE = "CPEAK_ERR_NOT_A_FILE",
  SEND_FILE_FAIL = "CPEAK_ERR_SEND_FILE_FAIL",
}

class Cpeak {
  private server: http.Server;
  private routes: RoutesMap;
  private middleware: Middleware[];
  private _handleErr?: (
    err: unknown,
    req: CpeakRequest,
    res: CpeakResponse
  ) => void;

  constructor() {
    this.server = http.createServer();
    this.routes = {};
    this.middleware = [];

    this.server.on("request", (req: CpeakRequest, res: CpeakResponse) => {
      // Send a file back to the client
      res.sendFile = async (path: string, mime: string) => {
        if (!mime) {
          throw frameworkError(
            'MIME type is missing. Use res.sendFile(path, "mime-type").',
            res.sendFile,
            ErrorCode.MISSING_MIME
          );
        }

        try {
          const stat = await fs.stat(path);
          if (!stat.isFile()) {
            throw frameworkError(
              `Not a file: ${path}`,
              res.sendFile,
              ErrorCode.NOT_A_FILE
            );
          }

          res.setHeader("Content-Type", mime);
          res.setHeader("Content-Length", String(stat.size));

          // Properly propagate stream errors and respect backpressure
          await pipeline(createReadStream(path), res);
        } catch (err: any) {
          if (err?.code === "ENOENT") {
            throw frameworkError(
              `File not found: ${path}`,
              res.sendFile,
              ErrorCode.FILE_NOT_FOUND
            );
          }

          throw frameworkError(
            `Failed to send file: ${path}`,
            res.sendFile,
            ErrorCode.SEND_FILE_FAIL
          );
        }
      };

      // Set the status code of the response
      res.status = (code: number) => {
        res.statusCode = code;
        return res;
      };

      // Redirects to a new URL
      res.redirect = (location: string) => {
        res.writeHead(302, { Location: location });
        res.end();
        return res;
      };

      // Send a json data back to the client (for small json data, less than the highWaterMark)
      res.json = (data: any) => {
        // This is only good for bodies that their size is less than the highWaterMark value
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
      };

      // Get the url without the URL parameters
      const urlWithoutParams = req.url?.split("?")[0];

      // Parse the URL parameters (like /users?key1=value1&key2=value2)
      // We put this here to also parse them for all the middleware functions
      const params = new URLSearchParams(req.url?.split("?")[1]);
      req.params = Object.fromEntries(params.entries());

      // Run all the specific middleware functions for that router only and then run the handler
      const runHandler = (
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
            const handlerResult = cb(req, res, (error) => {
              res.setHeader("Connection", "close");
              this._handleErr?.(error, req, res);
            });

            if (handlerResult && typeof handlerResult.then === "function") {
              handlerResult.catch((error) => {
                res.setHeader("Connection", "close");
                this._handleErr?.(error, req, res);
              });
            }

            return handlerResult;
          } catch (error) {
            res.setHeader("Connection", "close");
            this._handleErr?.(error, req, res);
          }
        } else {
          middleware[index](
            req,
            res,
            // The next function
            () => {
              runHandler(req, res, middleware, cb, index + 1);
            },
            // Error handler for a route middleware
            (error) => {
              res.setHeader("Connection", "close");
              this._handleErr?.(error, req, res);
            }
          );
        }
      };

      // Run all the middleware functions (beforeEach functions) before we run the corresponding route
      const runMiddleware = (
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
              const match = urlWithoutParams?.match(route.regex);

              if (match) {
                // Parse the URL variables from the matched route (like /users/:id)
                const vars = this.#extractVars(route.path, match);
                req.vars = vars;

                return runHandler(req, res, route.middleware, route.cb, 0);
              }
            }

          // If the requested route dose not exist, return 404
          return res
            .status(404)
            .json({ error: `Cannot ${req.method} ${urlWithoutParams}` });
        } else {
          middleware[index](req, res, () => {
            runMiddleware(req, res, middleware, index + 1);
          });
        }
      };

      runMiddleware(req, res, this.middleware, 0);
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
    const varNames: string[] = [];
    const regexString =
      "^" +
      path.replace(/:\w+/g, (match, offset) => {
        varNames.push(match.slice(1));
        return "([^/]+)";
      }) +
      "$";

    const regex = new RegExp(regexString);
    return regex;
  }

  #extractVars(path: string, match: RegExpMatchArray) {
    // Extract url variable values from the matched route
    const varNames = (path.match(/:\w+/g) || []).map((varParam) =>
      varParam.slice(1)
    );
    const vars: StringMap = {};
    varNames.forEach((name, index) => {
      vars[name] = match[index + 1];
    });
    return vars;
  }
}

// Util functions
export { serveStatic, parseJSON, render };

export type {
  Cpeak,
  CpeakRequest,
  CpeakResponse,
  Next,
  HandleErr,
  Middleware,
  RouteMiddleware,
  Handler,
  RoutesMap,
} from "./types";

export default Cpeak;
