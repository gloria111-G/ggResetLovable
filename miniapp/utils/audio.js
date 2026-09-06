/**
 * audio.js —— 音频管理（对应 Web 版 audio-manager.ts）
 * 规则（不变式）：
 *   1. 计数滴答 与 白噪音互相独立；
 *   2. 白噪音开启即循环播放，与计时器状态无关；
 *   3. 滴答只在 sound 开启时播放；结束庆祝音 force=true 无视开关。
 * 小程序无 WebAudio：滴答使用打包的短音 tick.wav，长音用 InnerAudioContext。
 */
const store = require('./storage');

const TRACK_SRC = {
  waves: '/audios/waves.mp3',
  fire: '/audios/fire.mp3',
  rain: '/audios/rain.mp3',
};

let noise = null;
let noiseTrack = 'off';

let tick = null;

function ensureNoise() {
  if (!noise) {
    noise = wx.createInnerAudioContext();
    noise.loop = true;
    noise.obeyMuteSwitch = false;
    noise.onError(() => {});
  }
  return noise;
}

function ensureTick() {
  if (!tick) {
    tick = wx.createInnerAudioContext();
    tick.src = '/audios/tick.wav';
    tick.obeyMuteSwitch = false;
    tick.onError(() => {});
  }
  return tick;
}

/** 按当前设置期望的白噪音曲目恢复/停止（App onShow 时调用） */
function reconcileFromSettings() {
  const s = store.getSettings();
  setWhiteNoise(s.whiteNoise || 'off');
}

function setWhiteNoise(track) {
  const next = track && TRACK_SRC[track] ? track : 'off';
  const el = ensureNoise();
  if (noiseTrack === next && !(next === 'off')) {
    // 已是同一曲目且应播放
    el.play();
    return;
  }
  try { el.stop(); } catch (e) { /* noop */ }
  noiseTrack = next;
  if (next === 'off') return;
  el.src = TRACK_SRC[next];
  el.play();
}

/** 播放一次滴答。force=true 忽略 sound 开关（用于完成庆祝） */
function playTick(force) {
  const s = store.getSettings();
  if (!force && !s.sound) return;
  try {
    const t = ensureTick();
    t.stop();
    t.play();
  } catch (e) { /* noop */ }
}

/** 轻震动反馈（部分机型） */
function vibrate() {
  try {
    wx.vibrateShort({ type: 'light', fail: () => {} });
  } catch (e) { /* noop */ }
}

module.exports = {
  reconcileFromSettings,
  setWhiteNoise,
  playTick,
  vibrate,
};
