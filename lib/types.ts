import { IncomingMessage, ServerResponse } from "node:http";
import CpeakClass from "./index";

export type Cpeak = InstanceType<typeof CpeakClass>;

// Extending Node.js's Request and Response objects to add our custom properties
export type StringMap = Record<string, string>;

export interface CpeakRequest extends IncomingMessage {
  params: StringMap;
  vars?: StringMap;
  body?: unknown;
  [key: string]: any; // allow developers to add their onw extensions (e.g. req.test)
}

export interface CpeakResponse extends ServerResponse {
  sendFile: (path: string, mime: string) => Promise<void>;
  status: (code: number) => CpeakResponse;
  redirect: (location: string) => CpeakResponse;
  json: (data: any) => void;
  [key: string]: any; // allow developers to add their onw extensions (e.g. res.test)
}

export type Next = () => void;
export type HandleErr = (err: any) => void;

// beforeEach middleware: (req, res, next)
export type Middleware = (
  req: CpeakRequest,
  res: CpeakResponse,
  next: Next
) => void;

// Route middleware:      (req, res, next, handleErr)
export type RouteMiddleware = (
  req: CpeakRequest,
  res: CpeakResponse,
  next: Next,
  handleErr: HandleErr
) => void | Promise<void>;

// Route handlers: (req, res, handleErr)
export type Handler = (
  req: CpeakRequest,
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
