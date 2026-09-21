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
  archive: 'gg_focus_archive', // 冷数据归档（60 天前的日志压缩层）
};

/** 热数据保留天数：近 N 天原始日志留在 gg_focus_logs，更早的自动归档 */
const HOT_DAYS = 60;

const SESSION_KEYS = {
  affirm: 'gg_active_session_affirm',
  breath: 'gg_active_session_breath',
};

const FOCUS_TAB_KEY = 'gg_focus_tab';
const AFFIRM_SELECTION_KEY = 'gg_affirm_selection';
/** 上次活跃时间戳（毫秒）：用于 9 小时离线超时判定 */
const LAST_ACTIVE_KEY = 'gg_last_active';

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
  whiteNoiseVolume: 0.6, // 白噪音独立音量 0-1（与计数器提示音互不影响）
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
const getTags = () => get(KEYS.tags, []); // 用户自建标签
const setTags = (v) => set(KEYS.tags, v);

/* ---------- 日志冷热分层 ----------
 * 热层 gg_focus_logs：近 HOT_DAYS 天原始日志（含 id/affirmationId/timestamp）
 * 冷层 gg_focus_archive：更早的日志压缩条目 {date,tag,kind,affirmationId,count,durationSec}
 *   —— 去掉长 id 与 timestamp、按 (date,tag,kind,affId) 合并同键，体积约为原始的 1/3。
 * 统计/徽标读取用 getAllLogs() 合并两层；今日写入只发生在热层，写入时自动分层。
 */
function cutoffDateKey() {
  const d = new Date(Date.now() - HOT_DAYS * 86400000);
  return todayKey(d);
}
function isCold(l) {
  return !!(l && l.date && l.date < cutoffDateKey());
}
function archiveKeyOf(e) {
  return (e.date || '') + '|' + (e.tag || '') + '|' + (e.kind || 'affirm') + '|' + (e.affirmationId || 'none');
}
function getArchive() {
  return get(KEYS.archive, []);
}
/** 把冷日志合并进归档（同键累加 count/durationSec），返回是否写盘 */
function mergeIntoArchive(coldEntries) {
  if (!coldEntries || !coldEntries.length) return false;
  const cur = get(KEYS.archive, []);
  const byKey = {};
  cur.forEach((e) => { byKey[archiveKeyOf(e)] = e; });
  coldEntries.forEach((l) => {
    const k = archiveKeyOf(l);
    if (byKey[k]) {
      byKey[k].count = (byKey[k].count || 0) + (l.count || 0);
      byKey[k].durationSec = (byKey[k].durationSec || 0) + (l.durationSec || 0);
    } else {
      byKey[k] = {
        date: l.date,
        tag: l.tag,
        kind: l.kind || 'affirm',
        affirmationId: l.affirmationId || undefined,
        count: l.count || 0,
        durationSec: l.durationSec || 0,
      };
    }
  });
  const next = Object.keys(byKey).map((k) => byKey[k]);
  next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  set(KEYS.archive, next);
  return true;
}
function getLogs() { return get(KEYS.logs, []); }
function setLogs(v) {
  const cold = (v || []).filter(isCold);
  if (!cold.length) { set(KEYS.logs, v); return; }
  const hot = (v || []).filter((l) => !isCold(l));
  mergeIntoArchive(cold);
  set(KEYS.logs, hot);
}
/** 全量日志（热层原始 + 冷层归档还原），供统计/徽标/单日明细使用 */
function getAllLogs() {
  const hot = get(KEYS.logs, []);
  const cold = get(KEYS.archive, []).map((e) => ({
    id: dailyLogId(e.date, e.tag, e.affirmationId, e.kind),
    date: e.date,
    tag: e.tag,
    affirmationId: e.affirmationId,
    count: e.count || 0,
    durationSec: e.durationSec || 0,
    timestamp: Date.parse(e.date) || 0,
    kind: e.kind || 'affirm',
  }));
  return hot.concat(cold);
}
/** 过滤并同时作用于热层与归档层（重置计数 / 删除引用场景） */
function filterLogs(fn) {
  set(KEYS.logs, get(KEYS.logs, []).filter(fn));
  set(KEYS.archive, get(KEYS.archive, []).filter(fn));
}
/** 手动触发一次整理：把热层里过旧的日志立即归档，并压缩归档重复项 */
function runArchive() {
  setLogs(get(KEYS.logs, []));
  // 归档层内部同键去重合并（导入/历史数据可能出现同键多条）
  const cur = get(KEYS.archive, []);
  const byKey = {};
  cur.forEach((e) => {
    const k = archiveKeyOf(e);
    if (byKey[k]) {
      byKey[k] = Object.assign({}, byKey[k], {
        count: (byKey[k].count || 0) + (e.count || 0),
        durationSec: (byKey[k].durationSec || 0) + (e.durationSec || 0),
      });
    } else {
      byKey[k] = Object.assign({}, e);
    }
  });
  const next = Object.keys(byKey).map((k) => byKey[k]);
  next.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  set(KEYS.archive, next);
  return next.length;
}

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
/** 上次活跃时间戳：0 表示尚未建立基准（首次运行） */
function getLastActive() { return Number(get(LAST_ACTIVE_KEY, 0)) || 0; }
function setLastActive(ts) { set(LAST_ACTIVE_KEY, Number(ts) || Date.now()); }

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

/* ---------- 存储用量监控 ---------- */
const KEY_LABELS = {
  gg_affirmations: '肯定语',
  gg_goals: '目标',
  gg_focus_logs: '专注日志（热）',
  gg_focus_archive: '日志归档（冷）',
  gg_settings: '设置',
  gg_tags: '标签',
};
/** 各 key 体积估算（KB，按序列化后字符数近似） */
function keySizeKB(key) {
  let v;
  try { v = wx.getStorageSync(key); } catch (e) { v = ''; }
  if (v === '' || v === undefined || v === null) return 0;
  let n = 0;
  try { n = (JSON.stringify(v) || '').length; } catch (e) { n = 0; }
  return Math.round((n / 1024) * 10) / 10;
}
/**
 * 存储用量报告：
 * { currentKB, limitKB, pct, hotCount, archiveCount, hotDays,
 *   keys: [{key,label,kb,pct}] }
 */
function getStorageUsage() {
  let currentKB = 0;
  let limitKB = 10240;
  try {
    const info = wx.getStorageInfoSync();
    currentKB = info.currentSize || 0;
    limitKB = info.limitSize || 10240;
  } catch (e) { /* noop */ }
  const keys = Object.keys(KEYS).map((k) => {
    const key = KEYS[k];
    return { key, label: KEY_LABELS[key] || key, kb: keySizeKB(key) };
  });
  keys.sort((a, b) => b.kb - a.kb);
  const estTotal = keys.reduce((x, r) => x + r.kb, 0) || 1;
  keys.forEach((r) => { r.pct = Math.min(100, Math.round((r.kb / estTotal) * 100)); });
  const pct = Math.min(100, Math.round((currentKB / limitKB) * 100));
  return {
    currentKB,
    limitKB,
    pct,
    keys,
    hotCount: get(KEYS.logs, []).length,
    archiveCount: get(KEYS.archive, []).length,
    hotDays: HOT_DAYS,
  };
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
  getAllLogs,
  filterLogs,
  getArchive,
  runArchive,
  getStorageUsage,
  getTags,
  setTags,
  getActiveSession,
  saveActiveSession,
  getFocusTab,
  setFocusTab,
  getAffirmSelection,
  setAffirmSelection,
  getLastActive,
  setLastActive,
  todayKey,
  dailyLogId,
  uid,
  upsertDailyLog,
  exportAll,
  importAll,
  clearAll,
};
