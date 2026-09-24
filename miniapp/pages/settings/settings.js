/**
 * settings.js —— 设置页
 */
const store = require('../../utils/storage');
const audio = require('../../utils/audio');
const GUIDE = require('../../utils/guide');

const BG = { light: '/images/ocean-bg.jpg', dark: '/images/ocean-bg-dark.jpg' };

Page({
  data: {
    dark: false,
    bg: BG.light,
    customBg: '',

    // 外观
    theme: 'light',
    // 使用说明（内联展开，对应 Web UsageGuide）
    guide: GUIDE,
    guideOpen: false,
    homeGuideShortcut: true,
    // 计数设置
    sound: false,
    counterMode: 'today',
    autoCountEnabled: false,
    autoCountInterval: 1,
    resetCounterEnabled: false,
    affirmTimerMode: 'countdown',
    breathTimerMode: 'countdown',
    // 呼吸设置
    breathMode: 'box',
    inhale: 4,
    hold1: 4,
    exhale: 4,
    hold2: 4,
    // 数据
    importVisible: false,
    importText: '',
    resetVisible: false,
    resetText: '',
    resetOk: false,
    // 关于
    logVisible: false,
  },

  onShow() {
    this._load();
  },

  _load() {
    let s = store.getSettings();
    const c = s.customBreath || {};
    const dark = s.theme === 'dark';
    // Web 版中计数器与呼吸页签恒常可见，无开关；兼容旧数据强制为 true
    if (s.showBreath === false || s.showCounter === false) {
      store.patchSettings({ showBreath: true, showCounter: true });
      s = store.getSettings();
    }
    this.setData({
      dark,
      theme: s.theme || 'light',
      customBg: s.customBg || '',
      bg: s.customBg || (dark ? BG.dark : BG.light),
      homeGuideShortcut: s.homeGuideShortcut !== false,
      sound: !!s.sound,
      counterMode: s.counterMode || 'today',
      autoCountEnabled: !!s.autoCountEnabled,
      autoCountInterval: Math.min(25, Math.max(0.1, Math.round(parseFloat(s.autoCountInterval || 1) * 10) / 10)),
      resetCounterEnabled: !!s.resetCounterEnabled,
      affirmTimerMode: s.affirmTimerMode || 'countdown',
      breathTimerMode: s.breathTimerMode || 'countdown',
      breathMode: s.breathMode || 'box',
      inhale: c.inhale || 4,
      hold1: c.hold1 || 4,
      exhale: c.exhale || 4,
      hold2: c.hold2 || 4,
    });
    this._nav(dark);
  },

  _nav(dark) {
    try {
      wx.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#0c1424' : '#e9f1f8',
      });
    } catch (e) { /* noop */ }
  },

  _patch(p) {
    store.patchSettings(p);
    return store.getSettings();
  },

  /* ============ 外观 ============ */
  themeTap(e) {
    const t = e.currentTarget.dataset.t;
    const s = this._patch({ theme: t });
    const dark = t === 'dark';
    this.setData({
      theme: t,
      dark,
      bg: s.customBg || (dark ? BG.dark : BG.light),
    });
    this._nav(dark);
  },
  pickBg() {
    const self = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success(res) {
        const file = res.tempFiles[0].tempFilePath;
        const fs = wx.getFileSystemManager();
        const dir = (wx.env && wx.env.USER_DATA_PATH) || '';
        const filePath = dir + '/gg-bg-' + Date.now() + '.jpg';
        fs.saveFile({
          tempFilePath: file,
          filePath,
          success() {
            const s = self._patch({ customBg: filePath });
            self.setData({ customBg: filePath, bg: filePath });
            if (s.theme === 'dark') self.setData({ bg: filePath });
          },
          fail() {
            // 部分基础库不支持 filePath 直存，退回保存到用户目录
            fs.saveFile({
              tempFilePath: file,
              success(res2) {
                self._patch({ customBg: res2.savedFilePath });
                self.setData({ customBg: res2.savedFilePath, bg: res2.savedFilePath });
              },
              fail() {
                wx.showToast({ title: '保存图片失败', icon: 'none' });
              },
            });
          },
        });
      },
    });
  },
  resetBg() {
    const s = store.getSettings();
    delete s.customBg;
    store.setSettings(s);
    const dark = s.theme === 'dark';
    this.setData({ customBg: '', bg: dark ? BG.dark : BG.light });
    wx.showToast({ title: '已恢复默认背景', icon: 'none' });
  },

  /* ============ 通用 switch / seg ============ */
  onSwitch(e) {
    const field = e.currentTarget.dataset.field;
    this._patch({ [field]: e.detail.value }); // 先落盘 Storage，保证跨页读取到最新值
    if (field === 'sound') {
      this.setData({ sound: e.detail.value });
      if (e.detail.value) audio.playTick(false);
    } else {
      this._load();
    }
    // 自动计数开关：立即驱动 Focus 页重建/停用自动计数定时器（无需等返回主界面）
    if (field === 'autoCountEnabled') this._notifyFocus('syncAutoCountState');
  },
  /** 通知页面栈中的 Focus 页立即响应某一状态变更（可选传参，如实时拖拽的间隔秒数） */
  _notifyFocus(method, arg) {
    try {
      const pages = getCurrentPages() || [];
      for (let i = pages.length - 1; i >= 0; i--) {
        const p = pages[i];
        if (p && (p.route || '').indexOf('pages/focus/focus') >= 0 && typeof p[method] === 'function') {
          p[method](arg); // 同步调用（同步落盘 + 重建定时器），保证节奏立即生效
          return;
        }
      }
    } catch (e) {
      /* noop：页面栈异常时忽略，返回主界面 onShow 仍会兜底同步 */
    }
  },
  segTap(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.currentTarget.dataset.value;
    const patch = { [field]: value };
    this._patch(patch);
    const p = {};
    p[field] = value;
    this.setData(p);
  },
  onSlider(e) {
    const field = e.currentTarget.dataset.field;
    // 精度修剪：保留 1 位小数，彻底消除 3.60000004 之类的浮点抖动
    const value = Math.round(Number(e.detail.value) * 10) / 10;
    this._patch({ [field]: value });
    this.setData({ [field]: value });
    // 自动计数间隔：松手落盘后立即按新间隔重建 Focus 的自动计数节奏
    if (field === 'autoCountInterval') this._notifyFocus('syncAutoCountInterval', value);
  },
  /** 拖拽过程中实时刷新显示（不落盘，松手由 bindchange 持久化），并实时驱动计数节奏 */
  onSliderLive(e) {
    const field = e.currentTarget.dataset.field;
    const value = Math.round(Number(e.detail.value) * 10) / 10;
    this.setData({ [field]: value });
    if (field === 'autoCountInterval') this._notifyFocus('syncAutoCountInterval', value);
  },
  /** 数字输入（自动计数间隔，支持 0.1 秒精度，范围 0.1 ~ 25 秒） */
  onInt(e) {
    const field = e.currentTarget.dataset.field;
    let v = parseFloat(e.detail.value);
    if (!isFinite(v)) return;
    v = Math.min(25, Math.max(0.1, Math.round(v * 10) / 10));
    this._patch({ [field]: v });
    this.setData({ [field]: v });
    // 输入框直接填写间隔：同样立即重排 Focus 的自动计数节奏
    if (field === 'autoCountInterval') this._notifyFocus('syncAutoCountInterval', v);
  },

  /* ============ 呼吸自定义 ============ */
  breathModeTap(e) {
    const m = e.currentTarget.dataset.mode;
    this._patch({ breathMode: m });
    this.setData({ breathMode: m });
  },
  customNum(e) {
    const field = e.currentTarget.dataset.field;
    const v = Math.max(0, parseInt(e.detail.value, 10) || 0);
    const c = store.getSettings().customBreath || {};
    c[field] = v;
    store.patchSettings({ customBreath: c });
    this.setData({ [field]: v });
  },

  /* ============ 数据导出 / 导入 / 重置 ============ */
  doExport() {
    const data = store.exportAll();
    const text = JSON.stringify(data, null, 2);
    wx.setClipboardData({
      data: text,
      success() {
        wx.showToast({ title: '已复制数据到剪贴板', icon: 'success' });
      },
    });
  },
  openImport() {
    this.setData({ importVisible: true, importText: '' });
  },
  closeImport() {
    this.setData({ importVisible: false });
  },
  onImportInput(e) {
    this.setData({ importText: e.detail.value });
  },
  doImport() {
    let data = null;
    // ---------- 容错修复：Web 端导出的 JSON 可能缺失首尾括号 ----------
    let cleanStr = (this.data.importText || '').trim(); // 1. 自动去除前后的空格和换行
    if (!cleanStr) cleanStr = '{}';
    // 2. 开头缺少 {：自动补上
    if (!cleanStr.startsWith('{')) {
      cleanStr = '{' + cleanStr;
    }
    // 3. 结尾缺少 }：自动补上
    if (!cleanStr.endsWith('}')) {
      cleanStr = cleanStr + '}';
    }
    // 4. 解析；仍失败则提示真正的格式错误
    try {
      data = JSON.parse(cleanStr);
    } catch (err) {
      wx.showToast({ title: 'JSON 解析失败，请检查内容是否完整', icon: 'none', duration: 3000 });
      return;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      wx.showToast({ title: '数据格式不正确', icon: 'none' });
      return;
    }
    store.importAll(data);
    this.setData({ importVisible: false });
    this._load();
    // 白噪音仅在专注页生效：导入后不在此页面播放；用户进入专注页时由 _syncNoisePlayback 自动续上
    wx.showToast({ title: '导入成功', icon: 'success' });
  },
  openReset() {
    this.setData({ resetVisible: true, resetText: '', resetOk: false });
  },
  closeReset() {
    this.setData({ resetVisible: false });
  },
  onResetInput(e) {
    this.setData({ resetText: e.detail.value, resetOk: e.detail.value === 'reset' });
  },
  doReset() {
    if (!this.data.resetOk) return;
    store.clearAll();
    store.patchSettings({
      theme: this.data.theme || 'light',
      customBg: this.data.customBg || undefined,
    });
    audio.setWhiteNoise('off');
    this.setData({ resetVisible: false });
    wx.showToast({ title: '已重置全部数据', icon: 'success' });
    setTimeout(() => this._load(), 400);
  },

  noop() {},
  openLog() { this.setData({ logVisible: true }); },
  closeLog() { this.setData({ logVisible: false }); },
  guideToggle() { this.setData({ guideOpen: !this.data.guideOpen }); },
});
