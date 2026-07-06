// Tencent CloudBase Web SDK wrapper (browser-only).
// The SDK is loaded lazily so the SSR bundle never evaluates browser code.

export const CLOUDBASE_ENV = "gg-reset-d1gb1eso5144bc964";

type AnyApp = any;
type AnyAuth = any;

let _app: AnyApp | null = null;
let _auth: AnyAuth | null = null;

export function getApp(): AnyApp {
  if (typeof window === "undefined") throw new Error("CloudBase is browser-only");
  if (!_app) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("@cloudbase/js-sdk");
    const cloudbase = mod.default || mod;
    _app = cloudbase.init({
      env: CLOUDBASE_ENV,
      region: "ap-shanghai",
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

/** Normalize phone: user inputs 11-digit CN number, SDK wants "+8613800138000". */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\s+/g, "").replace(/^\+?86/, "");
  return `+86${digits}`;
}
