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
  /**
   * 「小程序是否正在进入后台」标志（白噪音作用域控制）。
   *   - App.onHide 中置 true → 紧随其后的 Page.onHide 表示「切后台」，保留白噪音；
   *   - App.onShow 中置 false → 紧随其后的 Page.onShow 表示「从后台回来」，专注页恢复播放；
   *   - 页面间 navigateTo 切换不触发 App.onHide，故保持 false → 专注页 Page.onHide 立即停止白噪音。
   * 依据：微信小程序生命周期——App.onHide 在所有 Page.onHide 之前触发；
   *       navigateTo 不会触发 App.onHide/Show，仅触发 Page.onHide/onShow。
   */
  globalData: { becomingHidden: false },

  onLaunch() {
    // 全局音频稳定设置：混音 + 忽略物理静音键（修复静音键无声 / 音频抢占中断）
    audio.applyGlobalAudioOptions();
    // 白噪音仅在专注页有效：不在 App 层自动恢复，避免声音渗入其他页面
    if (silenceAfterOfflineTimeout()) this.globalData.becomingHidden = true; // 9h 超时：保持静音
  },
  onShow() {
    // 从后台回到前台：清标志位；白噪音恢复交由专注页 onShow 处理
    this.globalData.becomingHidden = false;
    if (silenceAfterOfflineTimeout()) this.globalData.becomingHidden = true; // 离线超时：保持静音
  },
  onHide() {
    // 标记「正在进入后台」：专注页 Page.onHide 据此判断是「页面离开」还是「后台化」
    this.globalData.becomingHidden = true;
    // 白噪音按系统规则：进入后台后由小程序框架自动暂停音频焦点
  },
});