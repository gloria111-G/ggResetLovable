import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getDeviceOpenId,
  getSessionOpenId,
  mockWxLogin,
  startSession,
  clearSession,
} from "./wx-login";
import { userDataGateway } from "./sync-gateway";

export type AuthUser = {
  /** 本机模拟的 OpenID，等价于微信小程序里的 openid：唯一且保持不变 */
  openid: string;
  /** 展示名 */
  nickname: string;
  /** 本次登录是否为首次创建（新访客自动建号） */
  isNew: boolean;
  /** 最近一次登录时间戳 */
  loggedInAt: number;
};

type Ctx = {
  /** 启动时会话恢复是否已完成（避免首屏闪现“未登录”按钮） */
  ready: boolean;
  user: AuthUser | null;
  /** 数据同步网关信息（当前阶段为 local 本机模式，见 sync-gateway.ts） */
  sync: { name: string; remote: boolean };
  /**
   * 微信一键快捷登录：
   *  - 已在本机存过标识 → 直接复用并静默完成身份校验（秒登）；
   *  - 全新访客 → 自动生成本机 OpenID 并建号。
   * 全程前端/本地凭证完成，不请求任何外部短信/授权 API。
   */
  quickLogin: () => Promise<AuthUser>;
  /** 退出登录：仅清除登录会话，保留本机 OpenID，之后仍可一键恢复到同一账号 */
  signOut: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export const DISPLAY_NAME = "微信用户";

function buildUser(openid: string, isNew: boolean): AuthUser {
  return {
    openid,
    nickname: DISPLAY_NAME,
    isNew,
    loggedInAt: Date.now(),
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  // 启动：若本机已存 OpenID 且存在有效会话 → 静默恢复登录（对标 wx 自动登录）。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const openid = getDeviceOpenId();
    const sessionOpenid = getSessionOpenId();
    if (openid && sessionOpenid && openid === sessionOpenid) {
      setUser(buildUser(openid, false));
    }
    setReady(true);
  }, []);

  const quickLogin = useCallback(async (): Promise<AuthUser> => {
    // 模拟 wx.login：已有标识直接复用；新访客自动生成并保存。
    const { openid, created } = mockWxLogin();
    startSession(openid); // 维护本机登录态

    // 预留：数据同步 —— 接入远端网关后，可在此拉取 user_data/<openid>
    // 并合并回本机（见 src/lib/sync-gateway.ts）：
    //   const remote = await userDataGateway.fetch(openid);
    //   if (remote) applyRemoteUserData(remote);

    const u = buildUser(openid, created);
    setUser(u); // 更新页面全局“已登录”状态
    return u;
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    clearSession(); // 仅清除会话；OpenID 保留，确保本机身份与数据不被误删
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider
      value={{
        ready,
        user,
        sync: { name: userDataGateway.name, remote: userDataGateway.remote },
        quickLogin,
        signOut,
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
