/**
 * audio.js —— 音频管理（对应 Web 版 audio-manager.ts）
 * 规则（不变式）：
 *   1. 计数滴答 与 白噪音互相独立；
 *   2. 白噪音开启即循环播放，与计时器状态无关；
 *   3. 滴答只在 sound 开启时播放；结束庆祝音 force=true 无视开关。
 *
 * ==================== 体积瘦身 / 音频云端化（2026-09）====================
 * 1. 本地打包音频已全部移除：原 miniapp/audios/ 目录不再随主包发布，
 *    从根源上消除约 2210KB 的 MP3/WAV 负载（原 source size 2591KB → 远低于 2MB）。
 * 2. 白噪音 / 滴答声改为公网 HTTPS URL。默认托管于 jsDelivr 对本仓库
 *    （GitHub 公开仓库 gloria111-G/ggResetLovable）public/ 目录的缓存：
 *      海浪  https://cdn.jsdelivr.net/gh/gloria111-G/ggResetLovable@main/public/海浪.mp3
 *      篝火  https://cdn.jsdelivr.net/gh/gloria111-G/ggResetLovable@main/public/篝火.mp3
 *      雨声  https://cdn.jsdelivr.net/gh/gloria111-G/ggResetLovable@main/public/雨声.mp3
 *      滴答  https://cdn.jsdelivr.net/gh/gloria111-G/ggResetLovable@main/public/tick.wav
 * 3. 换用自有 HTTPS CDN/OSS 时只需替换下方 TRACK_URLS / TICK_URLS，
 *    并把对应域名加入微信公众平台「开发 → 开发设置 → 服务器域名 →
 *    downloadFile 合法域名」；本地预览/真机调试由 project.config.json
 *    的 urlCheck=false 放行域名校验（正式版必须配置合法域名）。
 * 4. 网络音频的预加载与异常兜底：
 *      - 循环曲目复用同一个 InnerAudioContext，开启即缓冲并循环播放；
 *      - 每首曲目支持多条候选 URL，失败自动顺延下一跳，全部失败才停止；
 *      - 首次成功播放后自动下载缓存到 USER_DATA_PATH，后续会话直接播缓存，
 *        弱网/断网也能即时出声（相当于离线预加载）；
 *      - 滴答音仅 5KB 级，首次使用时缓冲，失败静默跳过，不影响计数流程。
 */
const store = require('./storage');

/* ---------------- 音频源配置（可替换起点） ---------------- */
const JS_DELIVR_BASE = 'https://cdn.jsdelivr.net/gh/gloria111-G/ggResetLovable@main/public/';
const u = (name) => JS_DELIVR_BASE + encodeURIComponent(name);

// 每首白噪音：一组候选 URL（顺序尝试；把自建 CDN 放最前面即可优先使用）
const TRACK_URLS = {
  waves: [u('海浪.mp3')],
  fire: [u('篝火.mp3')],
  rain: [u('雨声.mp3')],
};
// 白噪音本地缓存文件名（扩展名需与原格式一致）
const TRACK_CACHE_FILE = {
  waves: 'gg_noise_waves.mp3',
  fire: 'gg_noise_fire.mp3',
  rain: 'gg_noise_rain.mp3',
};
// 滴答声候选 URL 与缓存文件名
const TICK_URLS = [u('tick.wav')];
const TICK_CACHE_FILE = 'gg_noise_tick.wav';

/* ---------------- 状态 ---------------- */
let noise = null;
let noiseTrack = 'off'; // 当前期望曲目
let noiseGen = 0; // 防止切换曲目后迟到的旧 onError 误触发重试
let noiseSrcFail = 0; // 当前曲目已失败源个数
let noiseWarned = false;

let tick = null;
let tickBroken = false;

const fsm = () => {
  try {
    return wx.getFileSystemManager();
  } catch (e) {
    return null;
  }
};

/** 本地缓存文件路径（USER_DATA_PATH），不存在返回 null */
function cachePath(name) {
  const dir = wx.env && wx.env.USER_DATA_PATH;
  if (!dir) return null;
  const file = dir + '/' + name;
  const fm = fsm();
  if (!fm) return null;
  try {
    fm.accessSync(file);
    return file;
  } catch (e) {
    return null;
  }
}

/** 网络 URL → 本地缓存（失败静默，不阻塞主流程） */
function downloadToCache(name, url) {
  const dir = wx.env && wx.env.USER_DATA_PATH;
  const fm = fsm();
  if (!dir || !fm) return;
  const file = dir + '/' + name;
  try {
    wx.downloadFile({
      url,
      filePath: file,
      success: (res) => {
        if (res.statusCode !== 200) return;
        // 兼容忽略 filePath 参数的旧基础库：手动从临时文件落盘
        try {
          fm.accessSync(file);
        } catch (e) {
          fm.writeFileSync(file, fm.readFileSync(res.tempFilePath));
        }
      },
      fail: () => {},
    });
  } catch (e) {
    /* noop */
  }
}

/* ---------------- 白噪音 ---------------- */
function ensureNoise() {
  if (!noise) {
    noise = wx.createInnerAudioContext();
    noise.loop = true;
    noise.obeyMuteSwitch = false;
    noise.onError((err) => onNoiseError(err));
  }
  return noise;
}

function safeStop(el) {
  try {
    if (el) el.stop();
  } catch (e) {
    /* noop */
  }
}

/** 按当前设置期望的白噪音曲目恢复/停止（App onLaunch / onShow 时调用） */
function reconcileFromSettings() {
  const s = store.getSettings();
  setWhiteNoise(s.whiteNoise || 'off');
}

function setWhiteNoise(track) {
  const next = track && TRACK_URLS[track] ? track : 'off';
  const el = ensureNoise();
  if (noiseTrack === next && next !== 'off') {
    // 同一曲目：此前可能被系统暂停/缓冲失败，续播并优先使用已缓存的本地文件
    const cached = cachePath(TRACK_CACHE_FILE[next]);
    if (cached && el.src !== cached) el.src = cached;
    el.play();
    return;
  }
  safeStop(el);
  noiseTrack = next;
  if (next === 'off') return;
  noiseGen += 1;
  el._ggGen = noiseGen;
  noiseSrcFail = 0;
  // 优先本地缓存（上次会话已下载），否则播网络候选并顺带后台缓存
  const cached = cachePath(TRACK_CACHE_FILE[next]);
  if (cached) {
    el.src = cached;
    el.play();
    return;
  }
  playNoiseUrl(el, next);
  downloadToCache(TRACK_CACHE_FILE[next], TRACK_URLS[next][0]);
}

function playNoiseUrl(el, track) {
  const urls = TRACK_URLS[track] || [];
  if (noiseSrcFail >= urls.length) {
    if (!noiseWarned) {
      noiseWarned = true;
      console.warn('[audio] 白噪音候选源均不可用，已停止：', track, urls);
    }
    noiseTrack = 'off';
    return;
  }
  el.src = urls[noiseSrcFail];
  el.play();
}

function onNoiseError() {
  const el = noise;
  if (!el) return;
  if (el._ggGen !== noiseGen) return; // 已切换曲目，忽略迟到的错误
  const track = noiseTrack;
  if (!track || track === 'off') return;
  // 本地缓存播放失败 → 退回网络候选；网络候选失败 → 顺延下一跳
  if (el.src === cachePath(TRACK_CACHE_FILE[track])) {
    noiseSrcFail = 0;
    playNoiseUrl(el, track);
    return;
  }
  noiseSrcFail += 1;
  playNoiseUrl(el, track);
}

/* ---------------- 滴答 / 震动 ---------------- */
function ensureTick() {
  if (!tick) {
    tick = wx.createInnerAudioContext();
    tick.obeyMuteSwitch = false;
    tick.onError(() => {
      tickBroken = true; // 网络不可用则静默跳过（计数/UI 不受影响）
    });
  }
  return tick;
}

/** 播放一次滴答。force=true 忽略 sound 开关（用于完成庆祝） */
function playTick(force) {
  const s = store.getSettings();
  if (!force && !s.sound) return;
  if (tickBroken) return;
  try {
    const t = ensureTick();
    if (!t.src) {
      // 优先本地缓存，其次网络源；随后后台缓存一次供后续会话离线使用
      const cached = cachePath(TICK_CACHE_FILE);
      t.src = cached || TICK_URLS[0];
      if (!cached) downloadToCache(TICK_CACHE_FILE, TICK_URLS[0]);
    }
    t.stop();
    t.play();
  } catch (e) {
    /* noop */
  }
}

/** 轻震动反馈（部分机型） */
function vibrate() {
  try {
    wx.vibrateShort({ type: 'light', fail: () => {} });
  } catch (e) {
    /* noop */
  }
}

module.exports = {
  reconcileFromSettings,
  setWhiteNoise,
  playTick,
  vibrate,
};
