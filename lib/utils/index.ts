import { parseJSON } from "./parseJSON";
import { serveStatic } from "./serveStatic";
import { render } from "./render";
import { swagger } from "./swagger";
import { auth, hashPassword, verifyPassword } from "./auth";
import type { AuthOptions, PbkdfOptions } from "./auth";
import { cookieParser } from "./cookieParser";
import type { CookieOptions } from "./cookieParser";

export {
  serveStatic,
  parseJSON,
  render,
  swagger,
  auth,
  hashPassword,
  verifyPassword,
  cookieParser
};
export type { AuthOptions, PbkdfOptions, CookieOptions };
