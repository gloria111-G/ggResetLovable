const store = require('../../utils/storage');
const auth = require('../../utils/auth');
const GUIDE = require('../../utils/guide');

const BG = {
  light: '/images/ocean-bg.jpg',
  dark: '/images/ocean-bg-dark.jpg',
};

Page({
  data: {
    dark: false,
    bg: BG.light,
    logged: false,
    nickname: '微信用户',
    mask: '',
    existingId: '',
    showGuide: false,
    showLogin: false,
    showAccount: false,
    guideShortcut: true,
    guide: GUIDE,
    tiles: [
      { key: 'focus', glyph: '✦', label: '进入专注', sub: 'FOCUS · BREATHE', url: '/pages/focus/focus' },
      { key: 'manifest', glyph: '✓', label: '目标列表', sub: 'LIST · AFFIRMATIONS', url: '/pages/manifest/manifest' },
      { key: 'data', glyph: '▤', label: '数据中心', sub: 'INSIGHTS', url: '/pages/data/data' },
      { key: 'settings', glyph: '⚙', label: '设置', sub: 'PREFERENCES', url: '/pages/settings/settings' },
    ],
  },

  onLoad() {
    const s = store.getSettings();
    this.setData({ guideShortcut: s.homeGuideShortcut !== false });
  },
  onShow() {
    this.refresh();
  },

  refresh() {
    const s = store.getSettings();
    const dark = s.theme === 'dark';
    const device = auth.getDeviceOpenId();
    const session = auth.getSessionOpenId();
    const logged = !!(device && session && device === session);
    this.setData({
      dark,
      bg: s.customBg || (dark ? BG.dark : BG.light),
      logged,
      nickname: '微信用户',
      mask: logged ? auth.maskOpenId(device) : '',
      guideShortcut: s.homeGuideShortcut !== false,
    });
    try {
      wx.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#0c1424' : '#e9f1f8',
      });
    } catch (e) { /* noop */ }
  },

  go(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.navigateTo({ url });
  },

  /* ---------- 使用指南 ---------- */
  openGuide() {
    this.setData({ showGuide: true });
  },
  closeGuide() {
    this.setData({ showGuide: false });
  },

  /* ---------- 登录 / 账户 ---------- */
  openLogin() {
    const device = auth.getDeviceOpenId();
    this.setData({
      showLogin: true,
      existingId: device ? auth.maskOpenId(device) : '',
    });
  },
  closeLogin() {
    this.setData({ showLogin: false });
  },
  noop() {},

  doLogin() {
    // 微信一键快捷登录：纯本地 OpenID 模拟，无网络请求，点击即登录
    const r = auth.quickLogin();
    this.setData({ showLogin: false, logged: true, nickname: '微信用户', mask: auth.maskOpenId(r.openid) });
    wx.showToast({ title: '登录成功', icon: 'success' });
  },

  openAccount() {
    this.setData({ showAccount: true });
  },
  closeAccount() {
    this.setData({ showAccount: false });
  },
  doSignOut() {
    wx.showModal({
      title: '退出登录？',
      content: '数据仍保存在本机与账号标识中，之后可随时一键重新登录同一账号。',
      confirmText: '退出登录',
      confirmColor: '#d74745',
      success: (res) => {
        if (!res.confirm) return;
        auth.clearSession();
        this.setData({ showAccount: false, logged: false });
        wx.showToast({ title: '已退出', icon: 'none' });
      },
    });
  },
});
