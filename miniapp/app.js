// GG RESET 小程序 —— 全局入口
const audio = require('./utils/audio');
const store = require('./utils/storage');

/** 最大允许离线/后台时长：9 小时（毫秒）——与专注页封顶结算阈值保持一致 */
const MAX_OFFLINE_TIME = 9 * 3600 * 1000;

/**
 * 离线超时静音兜底：超过 9 小时不自动恢复白噪音，并销毁音频上下文保证不发声。
 * 仅负责「静音」，封顶结算（补算 9 小时上限、强制暂停）由专注页 onShow 完成，
 * 因此这里不刷新 lastActiveTime，避免专注页失去超时判定的依据。
 */
function silenceAfterOfflineTimeout() {
  const last = store.getLastActive();
  if (!last || Date.now() - last < MAX_OFFLINE_TIME) return false;
  if (store.getSettings().whiteNoise !== 'off') store.patchSettings({ whiteNoise: 'off' });
  audio.releaseAll();
  return true;
}

App({
  onLaunch() {
    // 全局音频稳定设置：混音 + 忽略物理静音键（修复静音键无声 / 音频抢占中断）
    audio.applyGlobalAudioOptions();
    // 启动时按已保存设置恢复白噪音（离线超时则静音，不自动恢复）
    if (!silenceAfterOfflineTimeout()) audio.reconcileFromSettings();
  },
  onShow() {
    // 从后台回到前台时恢复被系统暂停的白噪音（离线超时则静音，不自动恢复）
    if (silenceAfterOfflineTimeout()) return;
    audio.reconcileFromSettings();
  },
  onHide() {
    // 白噪音按系统规则：进入后台后由小程序框架自动暂停
  },
  globalData: {},
});
