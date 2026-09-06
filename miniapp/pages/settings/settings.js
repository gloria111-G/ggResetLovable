/**
 * settings.js —— 设置页
 */
const store = require('../../utils/storage');
const audio = require('../../utils/audio');

const BG = { light: '/images/ocean-bg.jpg', dark: '/images/ocean-bg-dark.jpg' };

Page({
  data: {
    dark: false,
    bg: BG.light,
    customBg: '',

    // 外观
    theme: 'light',
    // 计数设置
    sound: false,
    showCounter: true,
    showBreath: true,
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
    // 白噪音
    whiteNoise: 'off',
    // 数据
    importVisible: false,
    importText: '',
    resetVisible: false,
    resetText: '',
    resetOk: false,
    // 关于
    logVisible: false,
    guideVisible: false,
  },

  onShow() {
    this._load();
  },

  _load() {
    const s = store.getSettings();
    const c = s.customBreath || {};
    const dark = s.theme === 'dark';
    this.setData({
      dark,
      theme: s.theme || 'light',
      customBg: s.customBg || '',
      bg: s.customBg || (dark ? BG.dark : BG.light),
      sound: !!s.sound,
      showCounter: s.showCounter !== false,
      showBreath: s.showBreath !== false,
      counterMode: s.counterMode || 'today',
      autoCountEnabled: !!s.autoCountEnabled,
      autoCountInterval: Math.max(1, Math.round(s.autoCountInterval || 1)),
      resetCounterEnabled: !!s.resetCounterEnabled,
      affirmTimerMode: s.affirmTimerMode || 'countdown',
      breathTimerMode: s.breathTimerMode || 'countdown',
      breathMode: s.breathMode || 'box',
      inhale: c.inhale || 4,
      hold1: c.hold1 || 4,
      exhale: c.exhale || 4,
      hold2: c.hold2 || 4,
      whiteNoise: s.whiteNoise || 'off',
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
    this._patch({ [field]: e.detail.value });
    if (field === 'sound') {
      this.setData({ sound: e.detail.value });
      if (e.detail.value) audio.playTick(false);
    } else {
      this._load();
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
    const value = Number(e.detail.value);
    this._patch({ [field]: value });
    this.setData({ [field]: value });
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
    try {
      data = JSON.parse(this.data.importText || '{}');
    } catch (err) {
      wx.showToast({ title: 'JSON 解析失败', icon: 'none' });
      return;
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      wx.showToast({ title: '数据格式不正确', icon: 'none' });
      return;
    }
    store.importAll(data);
    this.setData({ importVisible: false });
    this._load();
    audio.reconcileFromSettings();
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
  openGuide() { this.setData({ guideVisible: true }); },
  closeGuide() { this.setData({ guideVisible: false }); },
});
