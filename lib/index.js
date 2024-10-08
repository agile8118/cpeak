import http from "node:http";
import fs from "node:fs/promises";

import { serveStatic, parseJSON } from "./utils/index.js";

class Cpeak {
  constructor() {
    this.server = http.createServer();
    this.routes = {};
    this.middleware = [];
    this.handleErr;

    this.server.on("request", (req, res) => {
      // Send a file back to the client
      res.sendFile = async (path, mime) => {
        const fileHandle = await fs.open(path, "r");
        const fileStream = fileHandle.createReadStream();

        res.setHeader("Content-Type", mime);

        fileStream.pipe(res);
      };

      // Set the status code of the response
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };

      // Send a json data back to the client (for small json data, less than the highWaterMark)
      res.json = (data) => {
        // This is only good for bodies that their size is less than the highWaterMark value
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(data));
      };

      // Get the url without the URL parameters
      const urlWithoutParams = req.url.split("?")[0];

      // Parse the URL parameters (like /users?key1=value1&key2=value2)
      // We put this here to also parse them for all the middleware functions
      const params = new URLSearchParams(req.url.split("?")[1]);
      req.params = Object.fromEntries(params.entries());

      // Run all the middleware functions before we run the corresponding route
      const runMiddleware = (req, res, middleware, index) => {
        // Out exit point...
        if (index === middleware.length) {
          const routes = this.routes[req.method.toLowerCase()];
          if (routes && typeof routes[Symbol.iterator] === "function")
            for (const route of routes) {
              const match = urlWithoutParams.match(route.regex);

              if (match) {
                // Parse the URL variables from the matched route (like /users/:id)
                const vars = this.#extractVars(route.path, match);
                req.vars = vars;

                // Call the route handler with the modified req and res objects
                return route.cb(req, res, (error) => {
                  res.setHeader("Connection", "close");
                  this.handleErr(error, req, res);
                });
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

  route(method, path, cb) {
    if (!this.routes[method]) this.routes[method] = [];

    const regex = this.#pathToRegex(path);
    this.routes[method].push({ path, regex, cb });
  }

  beforeEach(cb) {
    this.middleware.push(cb);
  }

  handleErr(cb) {
    this.handleErr = cb;
  }

  listen(port, cb) {
    this.server.listen(port, cb);
  }

  close(cb) {
    this.server.close(cb);
  }

  // ------------------------------
  // PRIVATE METHODS:
  // ------------------------------
  #pathToRegex(path) {
    const varNames = [];
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

  #extractVars(path, match) {
    // Extract url variable values from the matched route
    const varNames = (path.match(/:\w+/g) || []).map((varParam) =>
      varParam.slice(1)
    );
    const vars = {};
    varNames.forEach((name, index) => {
      vars[name] = match[index + 1];
    });
    return vars;
  }
}

export { serveStatic, parseJSON };

export default Cpeak;
