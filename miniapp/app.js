// GG RESET 小程序 —— 全局入口
const audio = require('./utils/audio');

App({
  onLaunch() {
    // 启动时根据已保存设置恢复白噪音（若上次开启）
    audio.reconcileFromSettings();
  },
  onShow() {
    // 回到前台：后台期间若被系统中断（如来电），续播白噪音
    audio.reconcileFromSettings();
  },
  onHide() {
    // 白噪音已声明 requiredBackgroundModes: ["audio"]，
    // 切后台/锁屏时继续播放，无需处理（官方限制：后台态不可调用播放控制 API）
  },
  globalData: {},
});
