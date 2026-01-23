# Cpeak

[![npm version](https://badge.fury.io/js/cpeak.svg)](https://www.npmjs.com/package/cpeak)

Cpeak is a minimal and fast Node.js framework inspired by Express.js.

This project is designed to be improved until it's ready for use in complex production applications, aiming to be more performant and minimal than Express.js. This framework is intended for HTTP applications that primarily deal with JSON and file-based message bodies.

This is an educational project that was started as part of the [Understanding Node.js: Core Concepts](https://www.udemy.com/course/understanding-nodejs-core-concepts/?referralCode=0BC21AC4DD6958AE6A95) course. If you want to learn how to build a framework like this, and get to a point where you can build things like this yourself, check out this course!

## Why Cpeak?

- **Minimalism**: No unnecessary bloat, with zero dependencies. Just the core essentials you need to build fast and reliable applications.
- **Performance**: Engineered to be fast, **Cpeak** won’t sacrifice speed for excessive customizability.
- **Educational**: Every new change made in the project will be explained in great detail in this [YouTube playlist](https://www.youtube.com/playlist?list=PLCiGw8i6NhvqsA-ZZcChJ0kaHZ3hcIVdY). Follow this project and let's see what it takes to build an industry-leading product!
- **Express.js Compatible**: You can easily refactor from Cpeak to Express.js and vice versa. Many npm packages that work with Express.js will also work with Cpeak.

## Table of Contents

- [Getting Started](#getting-started)
  - [Hello World App](#hello-world-app)
- [Documentation](#documentation)
  - [Including](#including)
  - [Initializing](#initializing)
  - [Middleware](#middleware)
  - [Route Handling](#route-handling)
  - [Route Middleware](#route-middleware)
  - [URL Variables & Parameters](#url-variables--parameters)
  - [Sending Files](#sending-files)
  - [Redirecting](#redirecting)
  - [Error Handling](#error-handling)
  - [Listening](#listening)
  - [Util Functions](#util-functions)
    - [serveStatic](#servestatic)
    - [parseJSON](#parsejson)
    - [render](#render)
- [Complete Example](#complete-example)
- [Versioning Notice](#versioning-notice)

## Getting Started

Ready to dive in? Install **Cpeak** via npm:

```bash
npm install cpeak
```

Cpeak is a **pure ESM** package, and to use it, your project needs to be an ESM as well. You can learn more about that [here](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).

### Hello World App:

```javascript
import cpeak from "cpeak";

const server = cpeak();

server.route("get", "/", (req, res) => {
  res.json({ message: "Hi there!" });
});

server.listen(3000, () => {
  console.log("Server has started on port 3000");
});
```

## Documentation

### Including

Include the framework like this:

```javascript
import cpeak from "cpeak";
```

Because of the minimalistic philosophy, you won’t add unnecessary objects to your memory as soon as you include the framework. If at any point you want to use a particular utility function (like `parseJSON` and `serveStatic`), include it like the line below, and only at that point will it be moved into memory:

```javascript
import cpeak, { serveStatic, parseJSON } from "cpeak";
```

### Initializing

Initialize the Cpeak server like this:

```javascript
const server = cpeak();
```

Now you can use this server object to start listening, add route logic, add middleware functions, and handle errors.

### Middleware

If you add a middleware function, that function will run before your route logic kicks in. Here you can customize the request object, return an error, or do anything else you want to do prior to your route logic, like authentication.

After calling `next`, the next middleware function is going to run if there’s any; otherwise, the route logic is going to run.

```javascript
server.beforeEach((req, res, next) => {
  if (req.headers.authentication) {
    // Your authentication logic...
    req.userId = "<something>";
    req.custom = "This is some string";
    next();
  } else {
    // Return an error and close the request...
    return res.status(401).json({ error: "Unauthorized" });
  }
});

server.beforeEach((req, res, next) => {
  console.log(
    "The custom value was added from the previous middleware: ",
    req.custom
  );
  next();
});
```

### Route Middleware

You can also add middleware functions for a particular route handler like this:

```javascript
const requireAuth = (req, res, next, handleErr) => {
  // Check if user is logged in, if so then:
  req.test = "this is a test value";
  next();

  // If user is not logged in:
  return handleErr({ status: 401, message: "Unauthorized" });
};

server.route("get", "/profile", requireAuth, (req, res) => {
  console.log(req.test); // this is a test value
});
```

You can add as many middleware functions as you want for a route:

```javascript
server.route(
  "get",
  "/profile",
  requireAuth,
  anotherFunction,
  oneMore,
  (req, res) => {
    // your logic
  }
);
```

### Route Handling

You can add new routes like this:

```javascript
server.route("patch", "/the-path-you-want", (req, res) => {
  // your route logic
});
```

First add the HTTP method name you want to handle, then the path, and finally, the callback. The `req` and `res` object types are the same as in the Node.js HTTP module (`http.IncomingMessage` and `http.ServerResponse`). You can read more about them in the [official Node.js documentation](https://nodejs.org/docs/latest/api/http.html).

### URL Variables & Parameters

To be more consistent with the broader Node.js community and frameworks, we call the HTTP URL parameters (query strings) '**query**', and the path variables (route parameters) '**params**'.

Here’s how we can read both:

```javascript
// Imagine request URL is example.com/test/my-title/more-text?filter=newest
server.route("patch", "/test/:title/more-text", (req, res) => {
  const title = req.params.title;
  const filter = req.query.filter;

  console.log(title); // my-title
  console.log(filter); // newest
});
```

### Sending Files

You can send a file as a Node.js Stream anywhere in your route or middleware logic like this:

```javascript
server.route("get", "/testing", (req, res) => {
  return res.status(200).sendFile("<file-path>", "<mime-type>");

  // Example:
  // return res.status(200).sendFile("./images/sun.jpeg", "image/jpeg");
});
```

The file’s binary content will be in the HTTP response body content. Make sure you specify a correct path relative to your CWD (use the `path` module for better compatibility) and also the correct HTTP MIME type for that file.

### Redirecting

If you want to redirect to a new URL, you can simply do:

```javascript
res.redirect("https://whatever.com");
```

### Error Handling

If anywhere in your route functions or route middleware functions you want to return an error, you can just throw the error and let the automatic error handler catch it:

```javascript
server.route("get", "/api/document/:title", (req, res) => {
  const title = req.params.title;

  if (title.length > 500) throw { status: 400, message: "Title too long." };

  // The rest of your logic...
});
```

You can also make use of the `handleErr` callback function like this:

```javascript
server.route("get", "/api/document/:title", (req, res, handleErr) => {
  const title = req.params.title;

  if (title.length > 500)
    return handleErr({ status: 400, message: "Title too long." });

  // The rest of your logic...
});
```

**Make sure** to call the `server.handleErr` and pass a function like this to have the automatic error handler work properly:

```javascript
server.handleErr((error, req, res) => {
  if (error && error.status) {
    res.status(error.status).json({ error: error.message });
  } else {
    // Log the unexpected errors somewhere so you can keep track of them...
    console.error(error);
    res.status(500).json({
      error: "Sorry, something unexpected happened on our side."
    });
  }
});
```

_The error object is the object that you threw or passed to the `handleErr` function earlier in your routes._

### Listening

Start listening on a specific port like this:

```javascript
server.listen(3000, () => {
  console.log("Server has started on port 3000");
});
```

### Util Functions

There are utility functions that you can include and use as middleware functions. These are meant to make it easier for you to build HTTP applications. In the future, many more will be added, and you only move them into memory once you include them. No need to have many npm dependencies for simple applications!

The list of utility functions as of now:

- serveStatic
- parseJSON
- render

Including any one of them is done like this:

```javascript
import cpeak, { utilName } from "cpeak";
```

#### serveStatic

With this middleware function, you can automatically set a folder in your project to be served by Cpeak. Here’s how to set it up:

```javascript
server.beforeEach(
  serveStatic("./public", {
    mp3: "audio/mpeg"
  })
);
```

If you have file types in your public folder that are not one of the following, make sure to add the MIME types manually as the second argument in the function as an object where each property key is the file extension, and each value is the correct MIME type for that. You can see all the available MIME types on the [IANA website](https://www.iana.org/assignments/media-types/media-types.xhtml).

```
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain",
  eot: "application/vnd.ms-fontobject",
  otf: "font/otf",
  ttf: "font/ttf",
  woff: "font/woff",
  woff2: "font/woff2"
```

#### parseJSON

With this middleware function, you can easily read and send JSON in HTTP message bodies in route and middleware functions. Fire it up like this:

```javascript
// You can pass an optional limit option to indicate the maximum
// JSON body size that your server will accept.
server.beforeEach(parseJSON({ limit: 1024 * 1024 })); // default value is 1024 * 1024 (1MB)
```

Read and send JSON from HTTP messages like this:

```javascript
server.route("put", "/api/user", (req, res) => {
  // Reading JSON from the HTTP request:
  const email = req.body.email;

  // rest of your logic...

  // Sending JSON in the HTTP response:
  res.status(201).json({ message: "Something was created..." });
});
```

#### render

With this function you can do server side rendering before sending a file to a client. This can be useful for dynamic customization and search engine optimization.

First fire it up like this:

```javascript
server.beforeEach(render());
```

And then for rendering:

```javascript
server.route("get", "/", (req, res, next) => {
  return res.render(
    "./public/index.html",
    {
      title: "Page title",
      name: "Allan"
    },
    "text/html"
  );
});
```

You can then inject the variables into your file in {{ variable_name }} like this:

```HTML
<html>
    <head>
        <title>{{ title }}</title>
    </head>
    <body>
        <h1>{{ name }}</h1>
    </body>
</html>
```

## Complete Example

Here you can see all the features that Cpeak offers, in one small piece of code:

```javascript
import cpeak, { serveStatic, parseJSON, render } from "cpeak";

const server = cpeak();

server.beforeEach(
  serveStatic("./public", {
    mp3: "audio/mpeg"
  })
);

server.beforeEach(render());

// For parsing JSON bodies
server.beforeEach(parseJSON());

// Adding custom middleware functions
server.beforeEach((req, res, next) => {
  req.custom = "This is some string";
  next();
});

// A middleware function that can be specified to run before some particular routes
const testRouteMiddleware = (req, res, next, handleErr) => {
  req.whatever = "some calculated value maybe";

  if (req.params.test !== "something special") {
    return handleErr({ status: 400, message: "an error message" });
  }

  next();
};

// Adding route handlers
server.route("get", "/", (req, res, next) => {
  return res.render(
    "<path-to-file-relative-to-cwd>",
    {
      test: "some testing value",
      number: "2343242"
    },
    "<mime-type>"
  );
});

server.route("get", "/old-url", testRouteMiddleware, (req, res, next) => {
  return res.redirect("/new-url");
});

server.route("get", "/api/document/:title", testRouteMiddleware, (req, res) => {
  // Reading URL variables (route parameters)
  const title = req.params.title;

  // Reading URL parameters (query strings) (like /users?filter=active)
  const filter = req.query.filter;

  // Reading JSON request body
  const anything = req.body.anything;

  // Handling errors
  if (anything === "not-expected-thing")
    throw { status: 400, message: "Invalid property." };

  // Sending a JSON response
  res.status(200).json({ message: "This is a test response" });
});

// Sending a file response
server.route("get", "/file", (req, res) => {
  // Make sure to specify a correct path and MIME type...
  res.status(200).sendFile("<path-to-file-relative-to-cwd>", "<mime-type>");
});

// Handle all the errors that could happen in the routes
server.handleErr((error, req, res) => {
  if (error && error.status) {
    res.status(error.status).json({ error: error.message });
  } else {
    console.error(error);
    res.status(500).json({
      error: "Sorry, something unexpected happened from our side."
    });
  }
});

server.listen(3000, () => {
  console.log("Server has started on port 3000");
});
```

## Versioning Notice

#### Version `1.x.x`

Version `1.x.x` represents the initial release of our framework, developed during the _Understanding Node.js Core Concepts_ course. These versions laid the foundation for our project.

#### Version `2.x.x`

All version `2.x.x` releases are considered to be in active development, following the completion of the course. These versions include ongoing feature additions and API changes as we refine the framework. Frequent updates may require code changes, so version `2.x.x` is not recommended for production environments.
For new features, bug fixes, and other changes that don't break existing code, the patch version will be increased. For changes that break existing code, the minor version will be increased.

#### Version `3.x.x`

Version `3.x.x` and beyond will be our first production-ready releases. These versions are intended for stable, long-term use, with a focus on backward compatibility and minimal breaking changes.
