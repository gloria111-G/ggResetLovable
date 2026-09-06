// Tencent CloudBase Web SDK wrapper. All exported functions are
// browser-only — they read `window` and must not be invoked during SSR.

import cloudbase from "@cloudbase/js-sdk";

// CloudBase Env ID（云开发控制台 → 环境 → 环境ID），
// 下方代码内默认值即当前使用的环境：gg-reset-d1gb1eso5144bc964。
// 若以后要切换到其它云开发环境，可新建 .env.local 并设置
// VITE_TCB_ENV=<新环境ID> 来覆盖默认值（可选，不配置则用下面的默认值）。
export const CLOUDBASE_ENV =
  (import.meta.env?.VITE_TCB_ENV as string | undefined)?.trim() ||
  "gg-reset-d1gb1eso5144bc964";

type AnyApp = any;
type AnyAuth = any;

let _app: AnyApp | null = null;
let _auth: AnyAuth | null = null;

export function getApp(): AnyApp {
  if (typeof window === "undefined") throw new Error("CloudBase is browser-only");
  if (!_app) {
    _app = (cloudbase as unknown as { init: (c: unknown) => AnyApp }).init({
      env: CLOUDBASE_ENV,
      region: "ap-shanghai", // 短信验证码（OTP）仅支持上海地域
    });
  }
  return _app;
}

export function getAuth(): AnyAuth {
  if (!_auth) {
    _auth = getApp().auth({ persistence: "local" });
  }
  return _auth;
}

export function getDB(): any {
  return getApp().database();
}

/** Normalize a user-entered Chinese mobile number to the bare 11 digits that
 *  CloudBase Auth v2 SMS/OTP APIs expect, e.g.
 *  "138 0013 8000" / "+86 13800138000" → "13800138000". */
export function normalizePhone(raw: string): string {
  return raw
    .replace(/[\s-]/g, "")
    .replace(/^\+?86/, "")
    .slice(-11);
}
