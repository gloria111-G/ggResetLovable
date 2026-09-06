// GG RESET 小程序 —— 全局入口
const audio = require('./utils/audio');

App({
  onLaunch() {
    // 启动时根据已保存设置恢复白噪音（若上次开启）
    audio.reconcileFromSettings();
  },
  onShow() {
    // 从后台回到前台时恢复被系统暂停的白噪音
    audio.reconcileFromSettings();
  },
  onHide() {
    // 白噪音按系统规则：进入后台后由小程序框架自动暂停
  },
  globalData: {},
});
