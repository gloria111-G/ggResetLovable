/**
 * manifest.js —— 目标列表页（对应 Web manifest.tsx）
 * 我的肯定语（全量列表 + 标签 chips + 内联新增标签 + 编辑弹窗）+ 目标列表（可排序）
 */
const store = require('../../utils/storage');

const BG = { light: '/images/ocean-bg.jpg', dark: '/images/ocean-bg-dark.jpg' };

Page({
  data: {
    dark: false,
    bg: BG.light,
    // 标签
    tagChips: [], // [{ tag, custom }] 展示用（含 # 前缀由模板处理）
    curTag: '',
    newTagText: '',
    // 肯定语
    affs: [], // 全量
    newAffText: '',
    // 编辑肯定语
    editVisible: false,
    editAff: null,
    editCountText: '0',
    // 目标
    addInput: '',
    goalActive: [],
    goalDone: [],
    celebrating: false,
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
    const affs = store
      .getAffirmations()
      .slice()
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const tagChips = allTags.map((t) => ({ tag: t, custom: customTags.indexOf(t) >= 0 }));
    this.setData({
      dark,
      bg: s.customBg || (dark ? BG.dark : BG.light),
      tagChips,
      curTag,
      affs,
    });
    this.reloadGoals();
    try {
      wx.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#0c1424' : '#e9f1f8',
      });
    } catch (e) { /* noop */ }
  },

  /* ============ 标签 ============ */
  tagTap(e) {
    this.setData({ curTag: e.currentTarget.dataset.tag });
  },
  onNewTag(e) {
    this.setData({ newTagText: e.detail.value });
  },
  addTag() {
    const t = (this.data.newTagText || '').trim();
    if (!t) return;
    const cur = store.getTags();
    if (cur.indexOf(t) >= 0 || (store.DEFAULT_TAGS || []).indexOf(t) >= 0) {
      wx.showToast({ title: '标签已存在', icon: 'none' });
      return;
    }
    store.setTags(cur.concat([t]));
    this.setData({ newTagText: '' });
    this.refresh();
  },
  delTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const affs = store.getAffirmations().filter((a) => a.tag === tag);
    const extra = affs.length ? '\n该标签下的肯定语会保留。' : '';
    wx.showModal({
      title: '删除标签',
      content: '标签「' + tag + '」将被移除' + extra,
      confirmText: '删除',
      confirmColor: '#d74745',
      success: (res) => {
        if (!res.confirm) return;
        store.setTags(store.getTags().filter((t) => t !== tag));
        if (this.data.curTag === tag) this.setData({ curTag: '' });
        this.refresh();
      },
    });
  },

  /* ============ 肯定语 ============ */
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
  },

  /* ---------- 编辑 / 删除肯定语 ---------- */
  affOpenEdit(e) {
    const id = e.currentTarget.dataset.id;
    const aff = store.getAffirmations().find((a) => a.id === id);
    if (!aff) return;
    this.setData({
      editVisible: true,
      editAff: Object.assign({}, aff),
      editCountText: String(aff.count || 0),
    });
  },
  closeEdit() {
    this.setData({ editVisible: false, editAff: null });
  },
  noop() {},
  onEditCount(e) {
    this.setData({ editCountText: e.detail.value });
  },
  /** 切换标签：立即迁移该肯定语的历史日志（与 Web changeAffirmTag 一致） */
  editTagTap(e) {
    const tag = e.currentTarget.dataset.tag;
    const aff = this.data.editAff;
    if (!aff || aff.tag === tag) return;
    this._remapAffTag(aff.id, tag);
    this.setData({ editAff: Object.assign({}, aff, { tag }) });
  },
  _remapAffTag(id, newTag) {
    const affs = store.getAffirmations().map((a) =>
      a.id === id ? Object.assign({}, a, { tag: newTag }) : a,
    );
    store.setAffirmations(affs);
    // 迁移历史日志 id 并合并同 id 冲突
    let logs = store.getLogs();
    const remapped = logs.map((l) => {
      if (l.affirmationId !== id) return l;
      const kind = l.kind || 'affirm';
      return Object.assign({}, l, { tag: newTag, id: store.dailyLogId(l.date, newTag, id, kind) });
    });
    const byId = new Map();
    remapped.forEach((l) => {
      const cur = byId.get(l.id);
      if (!cur) byId.set(l.id, l);
      else
        byId.set(l.id, Object.assign({}, cur, {
          count: cur.count + l.count,
          durationSec: cur.durationSec + l.durationSec,
          timestamp: Math.max(cur.timestamp || 0, l.timestamp || 0),
        }));
    });
    store.setLogs(Array.from(byId.values()));
  },
  editSave() {
    const aff = this.data.editAff;
    if (!aff) return;
    const newCount = Math.max(0, parseInt(this.data.editCountText, 10) || 0);
    const old = store.getAffirmations().find((a) => a.id === aff.id);
    const delta = newCount - (old ? old.count || 0 : 0);
    store.setAffirmations(
      store.getAffirmations().map((a) =>
        a.id === aff.id ? Object.assign({}, a, { tag: aff.tag, count: newCount }) : a,
      ),
    );
    if (delta !== 0) {
      store.setLogs(
        store.upsertDailyLog(store.getLogs(), {
          tag: aff.tag,
          affId: aff.id,
          addCount: delta,
          kind: 'affirm',
        }),
      );
    }
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
      confirmColor: '#d74745',
      success: (res) => {
        if (!res.confirm) return;
        store.setAffirmations(store.getAffirmations().filter((a) => a.id !== aff.id));
        const sel = store.getAffirmSelection();
        if (sel && sel.affId === aff.id) store.setAffirmSelection({ tag: sel.tag, affId: null });
        this.setData({ editVisible: false, editAff: null });
        this.refresh();
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
    goals.forEach((g) => {
      if (g.done) done.push(Object.assign({}, g, { doneAt: g.doneAt || 0 }));
      else active.push(Object.assign({}, g));
    });
    this.setData({
      goalActive: active,
      goalDone: done.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)),
    });
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
    store.setGoals(updated);
    this.reloadGoals();
    if (!wasDone) {
      this.setData({ celebrating: true });
      setTimeout(() => this.setData({ celebrating: false }), 2200);
    }
  },
  _reorderActive(delta) {
    const active = this.data.goalActive;
    const id = this._activeMovedId;
    const idx = active.findIndex((x) => x.id === id);
    const targetIdx = idx + delta;
    if (idx < 0 || targetIdx < 0 || targetIdx >= active.length) return;
    const targetId = active[targetIdx].id;
    const sorted = store
      .getGoals()
      .map((g) => Object.assign({}, g))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const mi = sorted.findIndex((g) => g.id === id);
    const ti = sorted.findIndex((g) => g.id === targetId);
    if (mi < 0 || ti < 0) return;
    const tmp = sorted[mi];
    sorted[mi] = sorted[ti];
    sorted[ti] = tmp;
    sorted.forEach((g, i) => { g.order = (i + 1) * 100; });
    store.setGoals(sorted);
    this.reloadGoals();
  },
  goalUp(e) {
    this._activeMovedId = e.currentTarget.dataset.id;
    this._reorderActive(-1);
  },
  goalDown(e) {
    this._activeMovedId = e.currentTarget.dataset.id;
    this._reorderActive(1);
  },
  goalDel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除目标',
      content: '确定删除这条目标吗？',
      confirmText: '删除',
      confirmColor: '#d74745',
      success: (res) => {
        if (!res.confirm) return;
        store.setGoals(store.getGoals().filter((g) => g.id !== id));
        this.reloadGoals();
      },
    });
  },
});
