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

type Ctx = {
  ready: boolean;
  user: AuthUser | null;
  syncing: boolean;
  lastSyncedAt: number | null;
  sendSmsCode: (phone: string) => Promise<{ verificationId: string }>;
  loginWithSms: (
    phone: string,
    code: string,
    verificationId: string,
  ) => Promise<void>;
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
  if (!data || typeof data !== "object") return;
  const map: Record<string, string> = {
    affirmations: storage.KEYS.affirmations,
    goals: storage.KEYS.goals,
    logs: storage.KEYS.logs,
    settings: storage.KEYS.settings,
    tags: storage.KEYS.tags,
  };
  for (const [k, key] of Object.entries(map)) {
    const v = (data as Record<string, unknown>)[k];
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const lastHash = useRef<string>("");
  const userRef = useRef<AuthUser | null>(null);
  userRef.current = user;

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const auth = getAuth();
      const state = await auth.hasLoginState();
      if (!state) {
        setUser(null);
        return null;
      }
      // currentUser may be lazy — try to read
      // @ts-expect-error currentUser typing
      const cu = auth.currentUser;
      const u: AuthUser = {
        uid: cu?.uid || state.user?.uid || "unknown",
        phone: cu?.phoneNumber || cu?.phone_number,
        username: cu?.username,
      };
      setUser(u);
      return u;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  const pullFromCloud = useCallback(async (uid: string) => {
    try {
      setSyncing(true);
      const db = getDB();
      const res = await db.collection(COLLECTION).doc(uid).get();
      const doc = (res as { data?: unknown[] }).data?.[0] as
        | Record<string, unknown>
        | undefined;
      if (doc) {
        // Merge strategy: cloud wins if it has newer updatedAt than local pack.
        const localPack = pack();
        const cloudUpdatedAt = Number(doc.updatedAt || 0);
        const localUpdatedAt = Number(localPack.updatedAt || 0);
        // On very first login (local is empty/new) prefer cloud.
        const localHasData =
          (localPack.affirmations as unknown[]).length > 0 ||
          (localPack.logs as unknown[]).length > 0 ||
          (localPack.goals as unknown[]).length > 0;
        if (!localHasData || cloudUpdatedAt >= localUpdatedAt) {
          applyRemote(doc);
          lastHash.current = hashPayload(pack());
          // Reload so React state re-reads localStorage.
          setTimeout(() => window.location.reload(), 50);
          return;
        }
      }
      // No cloud doc OR local is newer → push local up.
      await pushCore(uid);
    } catch (e) {
      console.warn("[auth] pull failed", e);
    } finally {
      setSyncing(false);
    }
  }, []);

  const pushCore = useCallback(async (uid: string) => {
    const payload = pack();
    const h = hashPayload(payload);
    if (h === lastHash.current) return;
    const db = getDB();
    try {
      // Upsert via set(); if doc missing, create.
      await db
        .collection(COLLECTION)
        .doc(uid)
        .set(payload as unknown as Record<string, unknown>);
    } catch {
      try {
        await db
          .collection(COLLECTION)
          .add({ _id: uid, ...payload });
      } catch (e2) {
        console.warn("[auth] push failed", e2);
        return;
      }
    }
    lastHash.current = h;
    setLastSyncedAt(Date.now());
  }, []);

  const pushNow = useCallback(async () => {
    const u = userRef.current;
    if (!u) return;
    setSyncing(true);
    try {
      await pushCore(u.uid);
    } finally {
      setSyncing(false);
    }
  }, [pushCore]);

  // Boot: restore session.
  useEffect(() => {
    if (typeof window === "undefined") return;
    (async () => {
      const u = await refreshUser();
      if (u) {
        await pullFromCloud(u.uid);
      }
      setReady(true);
    })();
  }, [refreshUser, pullFromCloud]);

  // Background push loop for incremental sync.
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

  const sendSmsCode = useCallback(async (phone: string) => {
    const auth = getAuth();
    // @ts-expect-error SDK v2 API
    const v = await auth.getVerification({ phone_number: normalizePhone(phone) });
    return { verificationId: v.verification_id };
  }, []);

  const loginWithSms = useCallback(
    async (phone: string, code: string, verificationId: string) => {
      const auth = getAuth();
      // @ts-expect-error SDK v2 API
      const verifyResult = await auth.verify({
        verification_id: verificationId,
        verification_code: code,
      });
      const token = verifyResult.verification_token;
      const phoneNorm = normalizePhone(phone);
      try {
        // @ts-expect-error SDK v2 API
        await auth.signIn({ username: phoneNorm, verification_token: token });
      } catch {
        // New user → signUp
        // @ts-expect-error SDK v2 API
        await auth.signUp({
          phone_number: phoneNorm,
          verification_code: code,
          verification_token: token,
        });
      }
      const u = await refreshUser();
      if (u) {
        // First-login merge (local → cloud if cloud empty).
        await pullFromCloud(u.uid);
      }
    },
    [refreshUser, pullFromCloud],
  );

  const loginWithPassword = useCallback(
    async (username: string, password: string) => {
      const auth = getAuth();
      const uname = username.match(/^\d{11}$/) ? normalizePhone(username) : username;
      // @ts-expect-error SDK v2 API
      await auth.signIn({ username: uname, password });
      const u = await refreshUser();
      if (u) await pullFromCloud(u.uid);
    },
    [refreshUser, pullFromCloud],
  );

  const setPassword = useCallback(async (username: string, newPassword: string) => {
    const auth = getAuth();
    // @ts-expect-error SDK v2 API
    const cu = auth.currentUser;
    if (!cu) throw new Error("未登录");
    if (username) {
      try {
        if (typeof cu.updateUsername === "function") {
          await cu.updateUsername(username);
        }
      } catch (e) {
        console.warn("update username failed", e);
      }
    }
    if (typeof cu.updatePassword === "function") {
      await cu.updatePassword(newPassword);
    } else if (typeof cu.setPassword === "function") {
      await cu.setPassword(newPassword);
    } else {
      throw new Error("当前 SDK 不支持修改密码");
    }
  }, []);

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
