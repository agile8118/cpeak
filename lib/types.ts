import { IncomingMessage, ServerResponse } from "node:http";
import cpeak from "./index";

export type Cpeak = ReturnType<typeof cpeak>;

// Extending Node.js's Request and Response objects to add our custom properties
export type StringMap = Record<string, string>;

// Error type for Cpeak framework errors
export type CpeakError = Error & {
  status?: number;
  code?: string;
  cpeak_err?: boolean;
};

export interface CpeakRequest<
  ReqBody = unknown,
  ReqQueries = unknown
> extends IncomingMessage {
  params: StringMap;
  query: ReqQueries;
  // vars?: StringMap;
  body?: ReqBody;
  [key: string]: unknown; // allow developers to add their own extensions (e.g. req.test)
}

export interface CpeakResponse extends ServerResponse {
  sendFile: (path: string, mime: string) => Promise<void>;
  status: (code: number) => CpeakResponse;
  redirect: (location: string) => CpeakResponse;
  json: <T = unknown>(data: T) => void;
  render?: (path: string, data: Record<string, unknown>, mime: string) => Promise<void>;
  [key: string]: unknown; // allow developers to add their own extensions (e.g. res.test)
}

export type Next = (err?: unknown) => void;
export type HandleErr = (err: unknown) => void;

// beforeEach middleware: (req, res, next)
export type Middleware<ReqBody = unknown, ReqParams = unknown> = (
  req: CpeakRequest<ReqBody, ReqParams>,
  res: CpeakResponse,
  next: Next
) => void | Promise<void>;

// Route middleware:      (req, res, next, handleErr)
export type RouteMiddleware<ReqBody = unknown, ReqParams = unknown> = (
  req: CpeakRequest<ReqBody, ReqParams>,
  res: CpeakResponse,
  next: Next,
  handleErr: HandleErr
) => void | Promise<void>;

// Route handlers: (req, res, handleErr)
export type Handler<ReqBody = unknown, ReqParams = unknown> = (
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
