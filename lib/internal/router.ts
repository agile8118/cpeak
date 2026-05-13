import type { Handler, RouteMiddleware, StringMap } from "../types";
import { frameworkError, ErrorCode } from "./errors";

// A node in our radix tree. Each one can hold up to three kinds of children:
// an exact static segment, a single ":param" placeholder, or a tail "*"
// wildcard. The handler and middleware here belong to the route whose path
// ends at this node, if any.
interface RadixNode {
  staticChildren: Map<string, RadixNode>;
  paramChild?: { name: string; node: RadixNode };
  wildcardChild?: { handler: Handler; middleware: RouteMiddleware[] };
  handler?: Handler;
  middleware?: RouteMiddleware[];
}

export interface RouteMatch {
  middleware: RouteMiddleware[];
  handler: Handler;
  params: StringMap;
}

function createNode(): RadixNode {
  return { staticChildren: new Map() };
}

// We keep one radix tree per HTTP method so different methods can safely
// share a path shape. POST /comments/:pageId and PUT /comments/:id can
// coexist without conflict because they live in separate trees.
export class Router {
  #treesByMethod: Map<string, RadixNode> = new Map();

  add(
    method: string,
    path: string,
    middleware: RouteMiddleware[],
    handler: Handler
  ) {
    const methodKey = method.toLowerCase();
    let root = this.#treesByMethod.get(methodKey);
    if (!root) {
      root = createNode();
      this.#treesByMethod.set(methodKey, root);
    }

    const segments = splitPath(path);
    let currentNode = root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLastSegment = i === segments.length - 1;

      // Named wildcards like "*name" are not a thing here. Only a bare "*"
      // is allowed, and only as the very last segment.
      if (segment.length > 1 && segment.startsWith("*")) {
        throw frameworkError(
          `Invalid route "${path}": named wildcards (e.g. "*name") are not supported. Use a plain "*" at the end of the path.`,
          this.add,
          ErrorCode.INVALID_ROUTE
        );
      }

      // A "*" segment installs a tail wildcard on the current node. After
      // that there's nothing more to walk, so we register and bail out.
      if (segment === "*") {
        if (!isLastSegment) {
          throw frameworkError(
            `Invalid route "${path}": "*" is only allowed as the final path segment.`,
            this.add,
            ErrorCode.INVALID_ROUTE
          );
        }
        if (currentNode.wildcardChild) {
          throw frameworkError(
            `Duplicate route: ${method.toUpperCase()} ${path}`,
            this.add,
            ErrorCode.DUPLICATE_ROUTE
          );
        }
        currentNode.wildcardChild = { handler, middleware };
        return;
      }

      // A ":name" segment walks into the param branch at this depth, or
      // creates one. We allow only one param name per position. Two routes
      // that disagree on the param name at the same spot would be ambiguous
      // to the matcher, so we flag it instead of silently picking one.
      if (segment.startsWith(":")) {
        const paramName = segment.slice(1);
        if (!paramName) {
          throw frameworkError(
            `Invalid route "${path}": empty parameter name.`,
            this.add,
            ErrorCode.INVALID_ROUTE
          );
        }
        if (currentNode.paramChild) {
          if (currentNode.paramChild.name !== paramName) {
            throw frameworkError(
              `Route conflict for ${method.toUpperCase()} ${path}: parameter ":${paramName}" conflicts with existing ":${currentNode.paramChild.name}" at the same position.`,
              this.add,
              ErrorCode.PARAM_CONFLICT
            );
          }
          currentNode = currentNode.paramChild.node;
        } else {
          const nextNode = createNode();
          currentNode.paramChild = { name: paramName, node: nextNode };
          currentNode = nextNode;
        }
        continue;
      }

      // Plain static segment. Walk into the existing child or create a new one.
      let staticChild = currentNode.staticChildren.get(segment);
      if (!staticChild) {
        staticChild = createNode();
        currentNode.staticChildren.set(segment, staticChild);
      }
      currentNode = staticChild;
    }

    // We have consumed every segment of the path. The terminal node is where
    // the handler gets attached. If something is already attached here, the
    // user registered this exact path twice.
    if (currentNode.handler) {
      throw frameworkError(
        `Duplicate route: ${method.toUpperCase()} ${path}`,
        this.add,
        ErrorCode.DUPLICATE_ROUTE
      );
    }
    currentNode.handler = handler;
    currentNode.middleware = middleware;
  }

  find(method: string, path: string): RouteMatch | null {
    const root = this.#treesByMethod.get(method.toLowerCase());
    if (!root) return null;

    const segments = splitPath(path);
    const params: StringMap = {};
    return matchSegments(root, segments, 0, params);
  }
}

// Walk the tree one segment at a time, always trying static before param
// before wildcard. That ordering is where our precedence rules come from:
// static beats param beats wildcard. Because each branch is tried in turn
// and recursion lets us unwind a failed path, the matcher also backtracks.
// If the static branch dead-ends deeper down, we come back up and try the
// param sibling with the same segment value.
function matchSegments(
  node: RadixNode,
  segments: string[],
  segmentIndex: number,
  params: StringMap
): RouteMatch | null {
  // Out of segments to walk. If this node has a handler, that's our match.
  // Otherwise let a wildcard at this depth catch the empty remainder so
  // routes like "/foo/*" still match a request to "/foo".
  if (segmentIndex === segments.length) {
    if (node.handler) {
      return { middleware: node.middleware!, handler: node.handler, params };
    }
    if (node.wildcardChild) {
      return {
        middleware: node.wildcardChild.middleware,
        handler: node.wildcardChild.handler,
        params
      };
    }
    return null;
  }

  const segment = segments[segmentIndex];

  // Try the exact static child first. Exact matches always win.
  const staticChild = node.staticChildren.get(segment);
  if (staticChild) {
    const foundMatch = matchSegments(
      staticChild,
      segments,
      segmentIndex + 1,
      params
    );
    if (foundMatch) return foundMatch;
  }

  // Then try the param branch. We capture the value before recursing so
  // the handler will see it. If the recursion fails, we have to remove the
  // value again so any sibling branch (or the caller unwinding above us)
  // sees a clean params map.
  if (node.paramChild) {
    params[node.paramChild.name] = safeDecode(segment);
    const foundMatch = matchSegments(
      node.paramChild.node,
      segments,
      segmentIndex + 1,
      params
    );
    if (foundMatch) return foundMatch;
    delete params[node.paramChild.name];
  }

  // Last resort. A wildcard at this node swallows whatever segments remain.
  if (node.wildcardChild) {
    return {
      middleware: node.wildcardChild.middleware,
      handler: node.wildcardChild.handler,
      params
    };
  }

  return null;
}

// Decode a URL segment without ever throwing. Malformed percent encoding is
// rare but it does happen in the wild. Falling back to the raw segment keeps
// the request matchable instead of blowing up before the handler runs.
// Example: safeDecode("a%20b%2Fc") returns "a b/c", while safeDecode("a%ZZb") returns "a%ZZb".
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

// Split a URL path into segments with no leading slash. We treat "" and "/"
// the same way: zero segments, meaning the root of the tree.
// Example: "/a/b/c" becomes ["a", "b", "c"]
function splitPath(path: string): string[] {
  if (path === "" || path === "/") return [];
  const withoutLeadingSlash = path.startsWith("/") ? path.slice(1) : path;
  return withoutLeadingSlash.split("/");
}
