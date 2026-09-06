// =============================================================================
// 模拟微信小程序 wx.login 的「静默登录 / OpenID」机制（纯前端，无任何网络请求）
// -----------------------------------------------------------------------------
// 真实小程序中的行为：
//   1. wx.login() 获取一次性临时 code；
//   2. 服务端拿 code 向微信换取 openid + session_key；
//      openid 是「用户 × 小程序」的唯一且永久的身份标识；
//   3. 客户端用本地登录态判定是否已登录，下次启动可静默恢复。
//
// 本 Web 版用浏览器侧的两份 localStorage 状态模拟同一套行为：
//   - OpenID（OPENID_KEY = "gg_device_openid"）
//       首次点击「微信一键快捷登录」时由本机生成（UUID/设备指纹语义），
//       之后永久保存、始终不变 —— 等价于微信小程序里的 openid。
//       退出登录【不会】清除它，保证同一账号可一键恢复、数据不丢。
//   - 登录会话（SESSION_KEY = "gg_auth_session"）
//       记录当前处于登录态的 openid —— 等价于 wx.login 换来的登录态。
//       退出登录时清除；清除后刷新页面不再自动登录，但一键登录仍回到同一 openid。
// =============================================================================

export const OPENID_KEY = "gg_device_openid";
export const SESSION_KEY = "gg_auth_session";

/** mockWxLogin() 的返回值，对标小程序里 wx.login + 换取 openid 后的信息。 */
export type WxLoginResult = {
  /** 本机模拟的 OpenID（新访客自动生成，老访客直接复用已有值） */
  openid: string;
  /** 本次是否为首次创建（true = 新访问用户） */
  created: boolean;
  /** 一次性 code，语义对齐 wx.login；仅本地模拟，不参与真实换取流程 */
  code: string;
};

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

/** 生成一个足够随机的本机唯一标识（UUID，不可用时降级为随机串）。 */
export function genUuid(): string {
  if (
    hasWindow() &&
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return (
    "openid-" +
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

/** 读取本机已生成的 OpenID；从未登录过的全新访问者返回 null。 */
export function getDeviceOpenId(): string | null {
  if (!hasWindow()) return null;
  return localStorage.getItem(OPENID_KEY);
}

/** 有则复用本机 OpenID；没有则自动生成并保存（新访客建号）。 */
export function getOrCreateOpenId(): string {
  const existing = getDeviceOpenId();
  if (existing) return existing;
  const id = genUuid();
  if (hasWindow()) localStorage.setItem(OPENID_KEY, id);
  return id;
}

/**
 * 模拟 wx.login：无论新老访客都稳定得到一个 openid，并附带一次性 code。
 * 账号创建与身份校验全部在本机完成，不发任何短信 / 授权 / 网络请求。
 */
export function mockWxLogin(): WxLoginResult {
  const created = !getDeviceOpenId();
  const openid = getOrCreateOpenId();
  const code = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return { openid, created, code };
}

/** 读取当前登录态对应的 openid；未登录返回 null。 */
export function getSessionOpenId(): string | null {
  if (!hasWindow()) return null;
  return localStorage.getItem(SESSION_KEY);
}

/** 写入登录态（等价于登录成功后维护本地会话）。 */
export function startSession(openid: string): void {
  if (!hasWindow()) return;
  localStorage.setItem(SESSION_KEY, openid);
}

/** 清除登录态（退出登录）；OpenID 本身保留。 */
export function clearSession(): void {
  if (!hasWindow()) return;
  localStorage.removeItem(SESSION_KEY);
}

/** 展示用掩码（如 "3f2a…c1d8"），避免完整标识刷屏。 */
export function maskOpenId(openid: string): string {
  if (!openid) return "";
  if (openid.length <= 12) return openid;
  return `${openid.slice(0, 4)}…${openid.slice(-4)}`;
}
