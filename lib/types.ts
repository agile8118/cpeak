import { IncomingMessage, ServerResponse, type Server } from "node:http";
import type { Readable } from "node:stream";
import type { Buffer } from "node:buffer";
import type { CompressionOptions } from "./internal/types";
import type { CpeakIncomingMessage, CpeakServerResponse } from "./index";

export type { Cpeak } from "./index";

export type CpeakHttpServer = Server<typeof CpeakIncomingMessage, typeof CpeakServerResponse>;

// For constructor options passed to `cpeak()`
export interface CpeakOptions {
  compression?: boolean | CompressionOptions;
  mimeTypes?: StringMap;
}

// Extending Node.js's Request and Response objects to add our custom properties
export type StringMap = Record<string, string>;

export interface CpeakRequest<
  ReqBody = any,
  ReqQueries = any
> extends IncomingMessage {
  params: StringMap;
  query: ReqQueries;
  body?: ReqBody;
  cookies?: StringMap;
  signedCookies?: Record<string, string | false>;
  [key: string]: any; // allow developers to add their onw extensions (e.g. req.test)
}

export interface CpeakResponse extends ServerResponse {
  sendFile: (path: string, mime?: string) => Promise<void>;
  status: (code: number) => CpeakResponse;
  attachment: (filename?: string) => CpeakResponse;
  cookie: (name: string, value: string, options?: any) => CpeakResponse;
  redirect: (location: string) => void;
  json: (data: any) => void | Promise<void>; // sync when compression is off, async when enabled
  compress: (
    mime: string,
    body: Buffer | string | Readable,
    size?: number
  ) => Promise<void>;
  [key: string]: any; // allow developers to add their onw extensions (e.g. res.test)
}

export type Next = (err?: any) => void;
export type HandleErr = (err: any) => void;

// beforeEach middleware: (req, res, next)
export type Middleware<ReqBody = any, ReqParams = any> = (
  req: CpeakRequest<ReqBody, ReqParams>,
  res: CpeakResponse,
  next: Next
) => void;

// Route middleware:      (req, res, next, handleErr)
export type RouteMiddleware<ReqBody = any, ReqParams = any> = (
  req: CpeakRequest<ReqBody, ReqParams>,
  res: CpeakResponse,
  next: Next,
  handleErr: HandleErr
) => void | Promise<void>;

// Route handlers: (req, res, handleErr)
export type Handler<ReqBody = any, ReqParams = any> = (
  req: CpeakRequest<ReqBody, ReqParams>,
  res: CpeakResponse,
  handleErr: HandleErr
) => void | Promise<void>;

// For a route object value in Cpeak.routes. The key is the method name.
export interface Route {
  path: string;
  regex: RegExp;
  middleware: RouteMiddleware[];
  cb: Handler;
}

// For Cpeak.routes:
export interface RoutesMap {
  [method: string]: Route[];
}
