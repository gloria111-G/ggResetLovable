/**
 * storage.js —— 本地数据层（映射 Web 版 src/lib/storage.ts）
 * 小程序 wx storage 键值即对象，无需 JSON 序列化；导出/导入时才序列化。
 */

const KEYS = {
  affirmations: 'gg_affirmations',
  goals: 'gg_goals',
  logs: 'gg_focus_logs',
  settings: 'gg_settings',
  tags: 'gg_tags',
};

const SESSION_KEYS = {
  affirm: 'gg_active_session_affirm',
  breath: 'gg_active_session_breath',
};

const FOCUS_TAB_KEY = 'gg_focus_tab';
const AFFIRM_SELECTION_KEY = 'gg_affirm_selection';

const DEFAULT_TAGS = ['爱情', '财富', '健康', '事业', '自我概念', '人际关系'];

const DEFAULT_SETTINGS = {
  theme: 'light',
  customBg: undefined, // 图片文件路径（非 dataURL，小程序单 key 容量有限）
  showBreath: true,
  showCounter: true,
  sound: false,
  breathMode: 'box', // box | 478 | custom | off
  customBreath: { inhale: 4, hold1: 4, exhale: 4, hold2: 4 },
  autoCountEnabled: false,
  autoCountInterval: 1,
  counterMode: 'today', // today | total
  keyboardCounter: false, // 小程序无键盘，保留兼容字段
  focusDuration: 300,
  breathFocusDuration: 300,
  whiteNoise: 'off', // off | waves | fire | rain
  timerMode: 'countdown',
  affirmTimerMode: 'countdown',
  breathTimerMode: 'countdown',
  homeGuideShortcut: true,
  resetCounterEnabled: false,
};

function get(key, fb) {
  try {
    const v = wx.getStorageSync(key);
    return v === '' || v === undefined || v === null ? fb : v;
  } catch (e) {
    return fb;
  }
}
function set(key, value) {
  try {
    wx.setStorageSync(key, value);
  } catch (e) {
    console.warn('storage set failed', key, e);
  }
}
function remove(key) {
  try {
    wx.removeStorageSync(key);
  } catch (e) { /* noop */ }
}

/* ---------- settings ---------- */
function getSettings() {
  return Object.assign({}, DEFAULT_SETTINGS, get(KEYS.settings, {}));
}
/** updater: 对象 或 函数(prev) -> next；返回新 settings 并落盘 */
function setSettings(updater) {
  const next = typeof updater === 'function' ? updater(getSettings()) : updater;
  set(KEYS.settings, next);
  return next;
}
function patchSettings(patch) {
  return setSettings(Object.assign({}, getSettings(), patch));
}

/* ---------- 业务集合 ---------- */
const getAffirmations = () => get(KEYS.affirmations, []);
const setAffirmations = (v) => set(KEYS.affirmations, v);
const getGoals = () => get(KEYS.goals, []);
const setGoals = (v) => set(KEYS.goals, v);
const getLogs = () => get(KEYS.logs, []);
const setLogs = (v) => set(KEYS.logs, v);
const getTags = () => get(KEYS.tags, []); // 用户自建标签
const setTags = (v) => set(KEYS.tags, v);

/* ---------- 会话 / 页面记忆 ---------- */
function getActiveSession(kind) { return get(SESSION_KEYS[kind], null); }
function saveActiveSession(kind, obj) {
  if (obj) set(SESSION_KEYS[kind], obj);
  else remove(SESSION_KEYS[kind]);
}
function getFocusTab() { return get(FOCUS_TAB_KEY, 'affirm'); }
function setFocusTab(tab) { set(FOCUS_TAB_KEY, tab); }
function getAffirmSelection() { return get(AFFIRM_SELECTION_KEY, null); }
function setAffirmSelection(sel) { set(AFFIRM_SELECTION_KEY, sel); }

/* ---------- 日期 / id ---------- */
function pad(n) { return n < 10 ? '0' + n : '' + n; }
/** 本地日期 key YYYY-MM-DD（Web 版用 UTC，这里统一本地，数据更符合直觉） */
function todayKey(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}
function dailyLogId(date, tag, affId, kind) {
  return 'daily-' + (kind || 'affirm') + '-' + date + '-' + tag + '-' + (affId || 'none');
}
function uid() {
  return (
    Math.random().toString(36).slice(2, 10) +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 6)
  );
}

/**
 * upsertDailyLog —— 与 Web 版语义一致：同 id 累加
 * @param logs FocusLog[]
 * @param patch { tag, affId?, addCount?, addDuration?, kind? }
 */
function upsertDailyLog(logs, patch) {
  const date = todayKey();
  const kind = patch.kind || 'affirm';
  const id = dailyLogId(date, patch.tag, patch.affId, kind);
  const idx = logs.findIndex((l) => l.id === id);
  if (idx >= 0) {
    const next = logs.slice();
    next[idx] = Object.assign({}, next[idx], {
      count: next[idx].count + (patch.addCount || 0),
      durationSec: next[idx].durationSec + (patch.addDuration || 0),
      timestamp: Date.now(),
    });
    return next;
  }
  return [
    {
      id,
      date,
      tag: patch.tag,
      affirmationId: patch.affId,
      count: patch.addCount || 0,
      durationSec: patch.addDuration || 0,
      timestamp: Date.now(),
      kind,
    },
  ].concat(logs);
}

/* ---------- 导出 / 导入 / 重置 ---------- */
function exportAll() {
  const out = {};
  Object.keys(KEYS).forEach((k) => {
    const key = KEYS[k];
    const v = wx.getStorageSync(key);
    if (v !== '' && v !== undefined && v !== null) out[key] = v;
  });
  return out;
}
function importAll(data) {
  const allowed = Object.keys(KEYS).map((k) => KEYS[k]);
  Object.keys(data).forEach((key) => {
    if (allowed.indexOf(key) >= 0) set(key, data[key]);
  });
}
function clearAll() {
  Object.keys(KEYS).forEach((k) => remove(KEYS[k]));
  remove(SESSION_KEYS.affirm);
  remove(SESSION_KEYS.breath);
}

module.exports = {
  KEYS,
  SESSION_KEYS,
  FOCUS_TAB_KEY,
  AFFIRM_SELECTION_KEY,
  DEFAULT_TAGS,
  DEFAULT_SETTINGS,
  get,
  set,
  remove,
  getSettings,
  setSettings,
  patchSettings,
  getAffirmations,
  setAffirmations,
  getGoals,
  setGoals,
  getLogs,
  setLogs,
  getTags,
  setTags,
  getActiveSession,
  saveActiveSession,
  getFocusTab,
  setFocusTab,
  getAffirmSelection,
  setAffirmSelection,
  todayKey,
  dailyLogId,
  uid,
  upsertDailyLog,
  exportAll,
  importAll,
  clearAll,
};
