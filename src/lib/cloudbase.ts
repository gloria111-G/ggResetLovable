// Tencent CloudBase Web SDK wrapper (browser-only).
// SSR-safe: all APIs must be called inside client-only paths.

import cloudbase from "@cloudbase/js-sdk";

export const CLOUDBASE_ENV = "gg-reset-d1gb1eso5144bc964";

type App = ReturnType<typeof cloudbase.init>;
type Auth = ReturnType<App["auth"]>;

let _app: App | null = null;
let _auth: Auth | null = null;

export function getApp(): App {
  if (typeof window === "undefined") throw new Error("CloudBase is browser-only");
  if (!_app) {
    _app = cloudbase.init({ env: CLOUDBASE_ENV });
  }
  return _app;
}

export function getAuth(): Auth {
  if (!_auth) {
    _auth = getApp().auth({ persistence: "local" });
  }
  return _auth;
}

export function getDB() {
  return getApp().database();
}

/** Normalize phone: user inputs 11-digit CN number, SDK wants "+86 138...". */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\s+/g, "").replace(/^\+?86/, "");
  return `+86 ${digits}`;
}
