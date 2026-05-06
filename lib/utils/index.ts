import { parseJSON } from "./parseJSON";
import { serveStatic } from "./serveStatic";
import { render } from "./render";
import { swagger } from "./swagger";
import { auth, hashPassword, verifyPassword } from "./auth";
import type { AuthOptions, PbkdfOptions } from "./auth";
import { cookieParser } from "./cookieParser";
import type { CookieOptions } from "./cookieParser";
import { cors } from "./cors";
import type { CorsOptions } from "./cors";

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
};
export type { AuthOptions, PbkdfOptions, CookieOptions, CorsOptions };
