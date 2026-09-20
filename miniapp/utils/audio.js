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

/* ---------------- 全局音频选项 ---------------- */
/**
 * 全局音频稳定设置（修复静音键无声 / 抢占中断问题）：
 *   mixWithOther: true    —— 与其他 App 混音，避免互抢音频焦点后被系统掐断；
 *   obeyMuteSwitch: false —— 忽略物理静音键，静音模式下白噪音与滴答仍可发声。
 * 幂等操作：重复调用无副作用，App onLaunch 与音频初始化时各调一次。
 */
function applyGlobalAudioOptions() {
  try {
    wx.setInnerAudioOption({
      mixWithOther: true,
      obeyMuteSwitch: false,
    });
  } catch (e) {
    /* 低版本基础库无此 API 时静默跳过 */
  }
}
applyGlobalAudioOptions(); // 模块加载（即音频初始化）时先行应用一次

/* ---------------- 状态 ---------------- */
let noise = null;
let noiseTrack = 'off'; // 当前期望曲目
let noiseGen = 0; // 防止切换曲目后迟到的旧 onError 误触发重试
let noiseSrcFail = 0; // 当前曲目已失败源个数
let noiseWarned = false;

let tick = null;
let tickBroken = false;
let tickErrCount = 0; // 滴答上下文连续错误计数（防错误自愈无限循环）

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
/** 读取设置中的白噪音音量（0-1），缺省 0.6 */
function currentNoiseVolume() {
  const s = store.getSettings();
  const v = Number(s.whiteNoiseVolume);
  return isNaN(v) ? 0.6 : Math.max(0, Math.min(1, v));
}
/* ---------------- 上下文存活检查与自愈 ---------------- */
/**
 * 音频上下文存活检查：实例为空、已被微信回收（destroyed=true）、
 * 或属性访问直接抛错（被系统挂起/销毁）均视为失效。
 * 频繁切后台时微信可能回收 InnerAudioContext，切回前台必须先检测再重建。
 */
function isCtxAlive(el) {
  if (!el) return false;
  try {
    if (el.destroyed) return false;
    if (typeof el.src !== 'string') return false;
    return true;
  } catch (e) {
    return false;
  }
}

/** 丢弃失效的白噪音上下文（src 由 setWhiteNoise 完整流程重新绑定） */
function discardNoiseCtx() {
  try {
    if (noise) noise.destroy();
  } catch (e) {
    /* noop */
  }
  noise = null;
}

/** 丢弃失效的滴答上下文（下次 playTick 按需重建） */
function discardTickCtx() {
  try {
    if (tick) tick.destroy();
  } catch (e) {
    /* noop */
  }
  tick = null;
}

function ensureNoise() {
  // 切后台被系统回收的实例：先销毁再重建，播放地址由调用方重新绑定
  if (noise && !isCtxAlive(noise)) discardNoiseCtx();
  if (!noise) {
    applyGlobalAudioOptions(); // 单例创建前再确认全局选项（混音 / 忽略静音键）
    noise = wx.createInnerAudioContext();
    noise.loop = true;
    noise.obeyMuteSwitch = false;
    noise.volume = currentNoiseVolume(); // 白噪音独立音量
    noise.onError((err) => onNoiseError(err));
  }
  return noise;
}

/** 独立调节白噪音音量（0-1），不触碰计数器滴答音量。persist=false 时仅即时生效（拖动预览） */
function setWhiteNoiseVolume(vol, persist) {
  const v = Math.max(0, Math.min(1, Number(vol)));
  if (isNaN(v)) return;
  if (persist !== false) store.patchSettings({ whiteNoiseVolume: v });
  const el = noise;
  if (el) {
    try {
      el.volume = v;
    } catch (e) {
      /* noop */
    }
  }
}

function safeStop(el) {
  try {
    if (el) el.stop();
  } catch (e) {
    /* noop */
  }
}

/** 按当前设置期望的白噪音曲目恢复/停止（App onLaunch / onShow 切回前台时调用） */
function reconcileFromSettings() {
  const s = store.getSettings();
  // 切回前台自愈：先做上下文存活检查，被系统回收/异常的实例立即销毁重建并重绑
  if (noise && !isCtxAlive(noise)) discardNoiseCtx();
  if (tick && !isCtxAlive(tick)) discardTickCtx();
  setWhiteNoise(s.whiteNoise || 'off');
}

function setWhiteNoise(track) {
  const next = track && TRACK_URLS[track] ? track : 'off';
  const el = ensureNoise();
  // 同一曲目续播须以实例已绑定 src 为前提：重建后的空上下文走下方完整重绑流程
  if (noiseTrack === next && next !== 'off' && el.src) {
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
  // 上下文本身已被系统回收/销毁：立即销毁重建并重绑当前曲目（音频错误自愈）
  if (!isCtxAlive(el)) {
    const track = noiseTrack;
    discardNoiseCtx();
    if (track && track !== 'off') setWhiteNoise(track);
    return;
  }
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
  // 切后台被系统回收的实例：先销毁再重建（播放地址在 playTick 中按需重绑）
  if (tick && !isCtxAlive(tick)) discardTickCtx();
  if (!tick) {
    applyGlobalAudioOptions(); // 单例创建前再确认全局选项（混音 / 忽略静音键）
    tick = wx.createInnerAudioContext();
    tick.obeyMuteSwitch = false;
    tick.onError(() => {
      // 错误自愈：销毁上下文，下次播放时重建重绑；
      // 连续失败超过 3 次则本会话内静默跳过（计数/UI 不受影响，防无限循环）
      tickErrCount += 1;
      if (tickErrCount > 3) {
        tickBroken = true;
        return;
      }
      discardTickCtx();
    });
    tick.onPlay(() => {
      tickErrCount = 0; // 播放成功即复位错误计数
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
    // 播放前状态防护：ensureTick 内含存活检查，失效实例自动销毁重建并重绑播放地址
    const t = ensureTick();
    if (!t.src) {
      // 优先本地缓存，其次网络源；随后后台缓存一次供后续会话离线使用
      const cached = cachePath(TICK_CACHE_FILE);
      t.src = cached || TICK_URLS[0];
      if (!cached) downloadToCache(TICK_CACHE_FILE, TICK_URLS[0]);
    }
    t.stop();
    try {
      t.seek(0); // 重置播放进度，防止复用单例时残留进度导致卡死无声
    } catch (e2) {
      /* 部分机型在 stop 后立即 seek 可能报错，忽略即可 */
    }
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
  applyGlobalAudioOptions,
  reconcileFromSettings,
  setWhiteNoise,
  setWhiteNoiseVolume,
  playTick,
  vibrate,
};
