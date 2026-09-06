/**
 * auth.js —— 模拟微信小程序 OpenID 登录机制（纯本地，无后端依赖）
 * 与 Web 版 src/lib/wx-login.ts 语义一致：
 *   - gg_device_openid：本设备唯一身份标识（等价 openid），首次一键登录生成，永不因退出而清除
 *   - gg_auth_session：当前登录会话（等价登录态），退出登录清除
 * 本版本未来接入真实 code2session 时，替换 quickLogin 实现即可。
 */

const OPENID_KEY = 'gg_device_openid';
const SESSION_KEY = 'gg_auth_session';

function _get(key) {
  try {
    const v = wx.getStorageSync(key);
    return v === '' || v === undefined || v === null ? null : v;
  } catch (e) {
    return null;
  }
}
function _set(key, v) {
  try { wx.setStorageSync(key, v); } catch (e) { /* noop */ }
}
function _remove(key) {
  try { wx.removeStorageSync(key); } catch (e) { /* noop */ }
}

function genId() {
  return (
    'openid-' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

/** 读取本机 OpenID；从未登录过返回 null */
function getDeviceOpenId() {
  return _get(OPENID_KEY);
}
/** 有则复用，无则生成并保存 */
function getOrCreateOpenId() {
  let id = getDeviceOpenId();
  if (id) return id;
  id = genId();
  _set(OPENID_KEY, id);
  return id;
}

/**
 * 一键快捷登录：新访客自动建号；老访客复用本机 OpenID。
 * 返回值语义对齐 wx.login（code 仅本地模拟，不参与真实换取）。
 */
function quickLogin() {
  const created = !getDeviceOpenId();
  const openid = getOrCreateOpenId();
  const code = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  startSession(openid);
  return { openid, code, created };
}

function getSessionOpenId() {
  return _get(SESSION_KEY);
}
function startSession(openid) {
  _set(SESSION_KEY, openid);
}
function clearSession() {
  _remove(SESSION_KEY);
}

/** 展示用掩码：abcd…wxyz */
function maskOpenId(openid) {
  if (!openid) return '';
  if (openid.length <= 12) return openid;
  return openid.slice(0, 4) + '…' + openid.slice(-4);
}

module.exports = {
  OPENID_KEY,
  SESSION_KEY,
  getDeviceOpenId,
  getOrCreateOpenId,
  quickLogin,
  getSessionOpenId,
  startSession,
  clearSession,
  maskOpenId,
};
