// Tencent CloudBase Web SDK wrapper. All exported functions are
// browser-only — they read `window` and must not be invoked during SSR.

import cloudbase from "@cloudbase/js-sdk";

export const CLOUDBASE_ENV = "gg-reset-d1gb1eso5144bc964";

type AnyApp = any;
type AnyAuth = any;

let _app: AnyApp | null = null;
let _auth: AnyAuth | null = null;

export function getApp(): AnyApp {
  if (typeof window === "undefined") throw new Error("CloudBase is browser-only");
  if (!_app) {
    _app = (cloudbase as unknown as { init: (c: unknown) => AnyApp }).init({
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
