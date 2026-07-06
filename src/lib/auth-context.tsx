import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getAuth, getDB, normalizePhone } from "./cloudbase";
import { storage } from "./storage";

export type AuthUser = {
  uid: string;
  phone?: string;
  username?: string;
};

// Handle for a pending OTP challenge — returned by signInWithOtp and used to
// finish the login by verifying the code.
export type OtpHandle = { verifyOtp: (p: { token: string }) => Promise<any> };

type Ctx = {
  ready: boolean;
  user: AuthUser | null;
  syncing: boolean;
  lastSyncedAt: number | null;
  sendSmsCode: (phone: string) => Promise<OtpHandle>;
  loginWithSms: (handle: OtpHandle, code: string) => Promise<void>;
  loginWithPassword: (username: string, password: string) => Promise<void>;
  setPassword: (username: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  pushNow: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

const COLLECTION = "user_data";

function pack() {
  return {
    affirmations: JSON.parse(
      localStorage.getItem(storage.KEYS.affirmations) || "[]",
    ),
    goals: JSON.parse(localStorage.getItem(storage.KEYS.goals) || "[]"),
    logs: JSON.parse(localStorage.getItem(storage.KEYS.logs) || "[]"),
    settings: JSON.parse(localStorage.getItem(storage.KEYS.settings) || "null"),
    tags: JSON.parse(localStorage.getItem(storage.KEYS.tags) || "null"),
    updatedAt: Date.now(),
  };
}

function applyRemote(data: Record<string, unknown>) {
  const map: Record<string, string> = {
    affirmations: storage.KEYS.affirmations,
    goals: storage.KEYS.goals,
    logs: storage.KEYS.logs,
    settings: storage.KEYS.settings,
    tags: storage.KEYS.tags,
  };
  for (const [k, key] of Object.entries(map)) {
    const v = data[k];
    if (v !== undefined && v !== null) {
      localStorage.setItem(key, JSON.stringify(v));
    }
  }
}

function hashPayload(p: unknown): string {
  try {
    return JSON.stringify(p);
  } catch {
    return String(Math.random());
  }
}

async function readCurrentUser(): Promise<AuthUser | null> {
  const auth = getAuth();
  try {
    // Prefer v3 getSession (returns null if signed out).
    if (typeof auth.getSession === "function") {
      const res = await auth.getSession();
      const u = res?.data?.user || res?.user;
      if (u) {
        return {
          uid: u.uid || u.id || "unknown",
          phone: u.phone || u.phone_number || u.phoneNumber,
          username: u.username || u.name,
        };
      }
    }
    // Fallback: v2 hasLoginState.
    if (typeof auth.hasLoginState === "function") {
      const state = await auth.hasLoginState();
      if (state?.user) {
        return {
          uid: state.user.uid,
          phone: state.user.phone_number || state.user.phoneNumber,
          username: state.user.username || state.user.name,
        };
      }
    }
    if (auth.currentUser) {
      return {
        uid: auth.currentUser.uid,
        phone: auth.currentUser.phoneNumber || auth.currentUser.phone_number,
        username: auth.currentUser.username || auth.currentUser.name,
      };
    }
  } catch (e) {
    console.warn("[auth] readCurrentUser", e);
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const lastHash = useRef<string>("");
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  const pushCore = useCallback(async (uid: string) => {
    const payload = pack();
    const h = hashPayload(payload);
    if (h === lastHash.current) return;
    const db = getDB();
    try {
      await db.collection(COLLECTION).doc(uid).set(payload);
    } catch {
      try {
        await db.collection(COLLECTION).add({ _id: uid, ...payload });
      } catch (e2) {
        console.warn("[auth] push failed", e2);
        return;
      }
    }
    lastHash.current = h;
    setLastSyncedAt(Date.now());
  }, []);

  const pullFromCloud = useCallback(
    async (uid: string) => {
      try {
        setSyncing(true);
        const db = getDB();
        const res = await db.collection(COLLECTION).doc(uid).get();
        const doc = res?.data?.[0] as Record<string, unknown> | undefined;
        if (doc) {
          const localPack = pack();
          const cloudUpdatedAt = Number(doc.updatedAt || 0);
          const localUpdatedAt = Number(localPack.updatedAt || 0);
          const localHasData =
            (localPack.affirmations as unknown[]).length > 0 ||
            (localPack.logs as unknown[]).length > 0 ||
            (localPack.goals as unknown[]).length > 0;
          if (!localHasData || cloudUpdatedAt >= localUpdatedAt) {
            applyRemote(doc);
            lastHash.current = hashPayload(pack());
            setTimeout(() => window.location.reload(), 60);
            return;
          }
        }
        await pushCore(uid);
      } catch (e) {
        console.warn("[auth] pull failed", e);
      } finally {
        setSyncing(false);
      }
    },
    [pushCore],
  );

  const pushNow = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    setSyncing(true);
    try {
      lastHash.current = ""; // force
      await pushCore(u.uid);
    } finally {
      setSyncing(false);
    }
  }, [pushCore]);

  // Boot: restore session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      const u = await readCurrentUser();
      if (u) {
        setUser(u);
        await pullFromCloud(u.uid);
      }
      setReady(true);
    })();
  }, [pullFromCloud]);

  // Incremental sync loop.
  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      const payload = pack();
      const h = hashPayload(payload);
      if (h !== lastHash.current) {
        pushCore(user.uid).catch(() => {});
      }
    }, 4000);
    return () => clearInterval(id);
  }, [user, pushCore]);

  const sendSmsCode = useCallback(async (phone: string): Promise<OtpHandle> => {
    const auth = getAuth();
    const phoneNorm = normalizePhone(phone);
    const res = await auth.signInWithOtp({ phone: phoneNorm });
    if (res?.error) throw new Error(res.error.message || "发送验证码失败");
    const handle = res?.data;
    if (!handle?.verifyOtp) throw new Error("SDK 未返回验证句柄");
    return handle as OtpHandle;
  }, []);

  const loginWithSms = useCallback(
    async (handle: OtpHandle, code: string) => {
      const res = await handle.verifyOtp({ token: code });
      if (res?.error) throw new Error(res.error.message || "验证码错误");
      const u = await readCurrentUser();
      if (u) {
        setUser(u);
        await pullFromCloud(u.uid);
      }
    },
    [pullFromCloud],
  );

  const loginWithPassword = useCallback(
    async (username: string, password: string) => {
      const auth = getAuth();
      const uname = /^\d{11}$/.test(username) ? normalizePhone(username) : username;
      const res = await auth.signInWithPassword({ username: uname, password });
      if (res?.error) throw new Error(res.error.message || "登录失败");
      const u = await readCurrentUser();
      if (u) {
        setUser(u);
        await pullFromCloud(u.uid);
      }
    },
    [pullFromCloud],
  );

  const setPassword = useCallback(
    async (username: string, newPassword: string) => {
      const auth = getAuth();
      const payload: Record<string, unknown> = {};
      if (username) payload.username = username;
      if (newPassword) payload.password = newPassword;
      // v3 updateUser
      if (typeof auth.updateUser === "function") {
        const res = await auth.updateUser(payload);
        if (res?.error) throw new Error(res.error.message || "更新失败");
        return;
      }
      // v2 fallback
      if (typeof auth.setPassword === "function") {
        await auth.setPassword({ newPassword });
        return;
      }
      throw new Error("当前 SDK 不支持修改密码");
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      const auth = getAuth();
      await auth.signOut();
    } catch (e) {
      console.warn("signOut", e);
    }
    lastHash.current = "";
    setUser(null);
    setTimeout(() => window.location.reload(), 100);
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        ready,
        user,
        syncing,
        lastSyncedAt,
        sendSmsCode,
        loginWithSms,
        loginWithPassword,
        setPassword,
        signOut,
        pushNow,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
