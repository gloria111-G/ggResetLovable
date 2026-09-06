/**
 * manifest.js —— 目标列表页（肯定语 + 标签 + 目标列表）
 */
const store = require('../../utils/storage');
const util = require('../../utils/util');

const BG = { light: '/images/ocean-bg.jpg', dark: '/images/ocean-bg-dark.jpg' };

Page({
  data: {
    dark: false,
    bg: BG.light,
    // 肯定语
    defaultTags: [],
    customTags: [],
    allTags: [],
    curTag: '',
    affs: [],
    newAffText: '',
    // 标签弹层
    tagModalVisible: false,
    newTagText: '',
    // 编辑肯定语
    editVisible: false,
    editAff: null,
    editCountText: '0',
    editTags: [],
    // 目标
    addInput: '',
    goalActive: [],
    goalDone: [],
    celebrating: '',
  },

  onLoad() {
    this.refresh();
  },
  onShow() {
    this.refresh();
  },

  refresh() {
    const s = store.getSettings();
    const dark = s.theme === 'dark';
    const defaultTags = (store.DEFAULT_TAGS || []).slice();
    const customTags = store.getTags();
    const allTags = defaultTags.concat(customTags.filter((t) => defaultTags.indexOf(t) < 0));
    let curTag = this.data.curTag;
    if (!curTag || allTags.indexOf(curTag) < 0) curTag = allTags[0] || '';
    const affs = store.getAffirmations();
    const affsOfTag = affs
      .filter((a) => !a.tag || a.tag === curTag)
      .sort((a, b) => a.createdAt - b.createdAt);
    this.setData({
      dark,
      bg: s.customBg || (dark ? BG.dark : BG.light),
      defaultTags,
      customTags,
      allTags,
      curTag,
      affs: affsOfTag,
    });
    this.reloadGoals();
    try {
      wx.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#0c1424' : '#e9f1f8',
      });
    } catch (e) { /* noop */ }
  },

  /* ============ 肯定语 ============ */
  tagTap(e) {
    const tag = e.currentTarget.dataset.tag;
    const affs = store
      .getAffirmations()
      .filter((a) => !a.tag || a.tag === tag)
      .sort((a, b) => a.createdAt - b.createdAt);
    this.setData({ curTag: tag, affs });
  },

  onAffInput(e) {
    this.setData({ newAffText: e.detail.value });
  },
  affAdd() {
    const text = (this.data.newAffText || '').trim();
    if (!text) return;
    const affs = store.getAffirmations();
    affs.push({
      id: store.uid(),
      text,
      tag: this.data.curTag,
      count: 0,
      createdAt: Date.now(),
    });
    store.setAffirmations(affs);
    this.setData({ newAffText: '' });
    this.refresh();
    wx.showToast({ title: '已添加', icon: 'none' });
  },

  /* ---------- 标签管理 ---------- */
  openTagModal() {
    this.setData({ tagModalVisible: true, newTagText: '' });
  },
  closeTagModal() {
    this.setData({ tagModalVisible: false });
  },
  noop() {},
  onTagInput(e) {
    this.setData({ newTagText: e.detail.value });
  },
  addCustomTag() {
    const t = (this.data.newTagText || '').trim();
    if (!t) return;
    const cur = store.getTags();
    if (cur.indexOf(t) >= 0 || (store.DEFAULT_TAGS || []).indexOf(t) >= 0) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    store.setTags(cur.concat([t]));
    this.setData({ tagModalVisible: false });
    this.refresh();
    wx.showToast({ title: '已添加标签', icon: 'none' });
  },
  delCustomTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const affs = store.getAffirmations().filter((a) => a.tag === tag);
    if (affs.length) {
      wx.showToast({ title: '该标签下还有 ' + affs.length + ' 条肯定语', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除标签',
      content: '确定删除标签「' + tag + '」吗？',
      confirmText: '删除',
      success: (res) => {
        if (!res.confirm) return;
        store.setTags(store.getTags().filter((t) => t !== tag));
        this.refresh();
      },
    });
  },

  /* ---------- 编辑/删除肯定语 ---------- */
  affOpenEdit(e) {
    const id = e.currentTarget.dataset.id;
    const aff = store.getAffirmations().find((a) => a.id === id);
    if (!aff) return;
    this.setData({
      editVisible: true,
      editAff: aff,
      editCountText: String(aff.count || 0),
      editTags: this.data.allTags,
    });
  },
  closeEdit() {
    this.setData({ editVisible: false, editAff: null });
  },
  onEditCount(e) {
    this.setData({ editCountText: e.detail.value });
  },
  editTagTap(e) {
    const tag = e.currentTarget.dataset.tag;
    const aff = this.data.editAff;
    if (!aff) return;
    this.setData({ editAff: Object.assign({}, aff, { tag }) });
  },
  editSave() {
    const aff = this.data.editAff;
    if (!aff) return;
    const count = Math.max(0, parseInt(this.data.editCountText, 10) || 0);
    store.setAffirmations(
      store.getAffirmations().map((a) =>
        a.id === aff.id ? Object.assign({}, a, { tag: aff.tag, count }) : a,
      ),
    );
    this.setData({ editVisible: false, editAff: null });
    this.refresh();
    wx.showToast({ title: '已保存', icon: 'none' });
  },
  editDelete() {
    const aff = this.data.editAff;
    if (!aff) return;
    wx.showModal({
      title: '删除肯定语',
      content: '将删除这条肯定语（历史日志保留）。',
      confirmText: '删除',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.setAffirmations(store.getAffirmations().filter((a) => a.id !== aff.id));
        const sel = store.getAffirmSelection();
        if (sel && sel.affId === aff.id) store.setAffirmSelection({ tag: sel.tag, affId: null });
        this.setData({ editVisible: false, editAff: null });
        this.refresh();
        wx.showToast({ title: '已删除', icon: 'none' });
      },
    });
  },

  /* ============ 目标列表 ============ */
  reloadGoals() {
    const goals = store
      .getGoals()
      .slice()
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const done = [];
    const active = [];
    goals.forEach((g, i) => {
      if (g.done) done.push(Object.assign({}, g, { doneAt: g.doneAt || 0 }));
      else active.push(Object.assign({}, g, { activeIndex: active.length }));
    });
    this.setData({ goalActive: active, goalDone: done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)) });
  },
  onGoalInput(e) {
    this.setData({ addInput: e.detail.value });
  },
  goalAdd() {
    const text = (this.data.addInput || '').trim();
    if (!text) return;
    const goals = store.getGoals();
    const nextOrder = goals.length ? Math.max.apply(null, goals.map((g) => g.order || 0)) + 1 : 1;
    goals.push({
      id: store.uid(),
      text,
      order: nextOrder,
      done: false,
      doneAt: 0,
      createdAt: Date.now(),
    });
    store.setGoals(goals);
    this.setData({ addInput: '' });
    this.reloadGoals();
    wx.showToast({ title: '已写下目标', icon: 'none' });
  },
  _persist(nextGoals) {
    store.setGoals(nextGoals);
    this.reloadGoals();
  },
  goalToggle(e) {
    const id = e.currentTarget.dataset.id;
    const goals = store.getGoals();
    const g = goals.find((x) => x.id === id);
    if (!g) return;
    const wasDone = !!g.done;
    const updated = goals.map((x) =>
      x.id === id ? Object.assign({}, x, { done: !wasDone, doneAt: wasDone ? 0 : Date.now() }) : x,
    );
    this._persist(updated);
    if (!wasDone) {
      const t = g.text;
      this.setData({ celebrating: t });
      setTimeout(() => this.setData({ celebrating: '' }), 2200);
    }
  },
  goalUp(e) {
    const id = e.currentTarget.dataset.id;
    const active = this.data.goalActive;
    const idx = active.findIndex((x) => x.id === id);
    if (idx <= 0) return;
    this._move(active, idx, idx - 1);
  },
  goalDown(e) {
    const id = e.currentTarget.dataset.id;
    const active = this.data.goalActive;
    const idx = active.findIndex((x) => x.id === id);
    if (idx < 0 || idx >= active.length - 1) return;
    this._move(active, idx, idx + 1);
  },
  _move(active, from, to) {
    const goals = store.getGoals();
    const arr = active.slice();
    const tmp = arr[from];
    arr[from] = arr[to];
    arr[to] = tmp;
    const order = arr.reduce((acc, g, i) => {
      acc[g.id] = (i + 1) * 100;
      return acc;
    }, {});
    // 保留未参与排序条目的相对顺序基数
    const next = goals.map((g) =>
      order[g.id] !== undefined ? Object.assign({}, g, { order: order[g.id] }) : g,
    );
    store.setGoals(next);
    this.reloadGoals();
  },
  goalDel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除目标',
      content: '确定删除这条目标吗？',
      confirmText: '删除',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        store.setGoals(store.getGoals().filter((g) => g.id !== id));
        this.reloadGoals();
      },
    });
  },
});
