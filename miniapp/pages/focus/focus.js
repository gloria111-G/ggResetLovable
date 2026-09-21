/**
 * focus.js —— 专注页（肯定语计数 + 呼吸调整）
 * 移植自 Web 版 focus.tsx 的计时/计数核心语义：
 *   - 定时器使用「墙钟 + 已过秒」锚点，切后台/被杀可恢复；
 *   - 计数落库：daily 日志（kind affirm）+ 肯定语累计字段；
 *   - 呼吸结束写入 kind=breath、tag=呼吸调整 的时长日志。
 */
const store = require('../../utils/storage');
const audio = require('../../utils/audio');
const util = require('../../utils/util');

const BG = { light: '/images/ocean-bg.jpg', dark: '/images/ocean-bg-dark.jpg' };
const DUR_CHIPS = [1, 3, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120]; // 分钟
const MAX_H = 16;
const NOISE_TRACKS = [
  { key: 'off', label: '关闭' },
  { key: 'waves', label: '海浪', icon: '🌊' },
  { key: 'fire', label: '篝火', icon: '🔥' },
  { key: 'rain', label: '雨声', icon: '🌧️' },
];
const RELAX_INTRO = '身心放松指南收集了一些简单的小练习，帮你在紧张或疲惫时，让身体慢慢回到平静、安稳的状态。当你更放松时，会更容易专注并保持积极的想法，让日常生活变得更轻松、更自然。';
const TIPS = [
  { title: '放松体验的温柔启动', body: '用冰水轻拍面颊或含一口冰水，能快速带来清凉的放松体验，帮助身体从紧绷回到松弛状态。' },
  { title: '4-7-8 呼吸', body: '吸气 4 秒、屏息 7 秒、呼气 8 秒。重复 4 组，呼吸节奏放慢后，身体会进入深层放松，紧绷感会自然减轻。' },
  { title: '哼鸣 (Humming)', body: '闭上嘴轻轻哼一段 30 秒，喉部的轻微震动会带来放松体验，让人慢慢松弛下来。' },
  { title: '20 秒拥抱', body: '一个超过 20 秒的拥抱（或自我拥抱）会带来温暖安心的感觉，帮助自己放松下来。' },
  { title: 'Grounding 5-4-3-2-1', body: '说出 5 个看到、4 个听到、3 个触到、2 个闻到、1 个尝到的东西，把自己带回当下。' },
  { title: '节奏轻点放松', body: '用指尖依次轻敲眉头、眼角、颧骨、人中、下巴、锁骨与腋下，每个点位轻敲 5-7 下并配合深呼吸，让注意力回到身体的节奏上，慢慢放松下来。' },
];
const PHASE_LABEL = { in: '吸气', hold: '屏息', out: '呼气' };

/* 拨盘（对应 Web WheelDuration）：行高 36px，高 180px 显示 5 行 */
const ITEM_H = 36;
const WHEEL_H = [];
const WHEEL_M = [];
for (let i = 0; i <= MAX_H; i++) WHEEL_H.push(util.pad(i));
for (let i = 0; i < 60; i++) WHEEL_M.push(util.pad(i));

function buildPhases(settings) {
  const m = settings.breathMode;
  if (m === 'box') {
    return [
      { kind: 'in', sec: 4 }, { kind: 'hold', sec: 4 },
      { kind: 'out', sec: 4 }, { kind: 'hold', sec: 4 },
    ];
  }
  if (m === '478') {
    return [{ kind: 'in', sec: 4 }, { kind: 'hold', sec: 7 }, { kind: 'out', sec: 8 }];
  }
  if (m === 'custom') {
    const c = settings.customBreath || {};
    const p = [{ kind: 'in', sec: Math.max(1, c.inhale || 4) }];
    if ((c.hold1 || 0) > 0) p.push({ kind: 'hold', sec: c.hold1 });
    p.push({ kind: 'out', sec: Math.max(1, c.exhale || 4) });
    if ((c.hold2 || 0) > 0) p.push({ kind: 'hold', sec: c.hold2 });
    return p;
  }
  return [];
}

Page({
  data: {
    dark: false,
    bg: BG.light,
    tab: 'affirm', // affirm | breath
    settings: {},
    showBreath: true,
    showCounter: true,
    sound: false,
    noiseOn: 'off',
    noiseVolume: 60, // 白噪音独立音量 0-100
    noiseTracks: NOISE_TRACKS,
    relaxIntro: RELAX_INTRO,
    tips: TIPS,

    // 肯定语
    tags: [],
    selectedTag: '',
    affs: [],
    selectedAff: '',
    selectedAffText: '',
    todayBadge: 0,
    cumBadge: 0,
    count: 0, // 本次会话计数
    countDisplay: 0,
    autoOn: false,
    autoEnabled: false,

    // 通用计时
    isTimer: true, // countdown 或 stopwatch
    running: false,
    paused: false,
    elapsed: 0, // 已进行秒（整数展示）
    total: 0, // 倒计时目标秒
    clock: '00:00',
    clockSuffix: '',
    counterModeLabel: '今日计数',
    autoInterval: 1,

    // 时长选择
    durChips: DUR_CHIPS,
    showDurPanel: true,
    showDurCustom: false,
    customHours: 0,
    customMinutes: 0,
    hourIndex: 0,
    minIndex: 0,
    hoursArr: [],
    minsArr: [],
    whVals: WHEEL_H,
    wmVals: WHEEL_M,
    wsVals: WHEEL_M,
    whSel: 0,
    wmSel: 5,
    wsSel: 0,
    scrollH: 0,
    scrollM: 180,
    scrollS: 0,

    // 呼吸
    breathLabel: '',
    phaseLabel: '',
    ballScale: 1,
    ballTransition: 'transform 0.4s linear',
    ballCss: 'transform:scale(1)',

    // 其它
    celebration: false,
    celebrationText: '',
    resetEnabled: false,
    guideVisible: false,
  },

  /* ================= 生命周期 ================= */
  onLoad() {
    this._destroyed = false;
    this._engine = null; // {kind:'affirm'|'breath', ...}
    this._phaseTimer = null;
    this._ticker = null;
    this._sums = null; // 徽标增量缓存（避免每次 +1 遍历日志）
    const s = store.getSettings();
    this._lastAffirmMode = s.affirmTimerMode; // 记录当前计时模式，外部切换后据此清理残留引擎
    this._applySettings(s, true);
  },
  onShow() {
    if (this._destroyed) return;
    const s = store.getSettings();
    this._applySettings(s, false);
    // 若用户在设置页切换了「倒计时 / 正计时」，先清掉残留的旧模式引擎与会话，
    // 避免点击【开始】沿用上一段倒计时的 05:00 等初始状态
    this._checkAffirmModeChange();
    this._refreshAfterReturn();
    this._restoreSession();
    // 从设置页返回：按最新开关状态重建/停用自动计数定时器（重开开关后立即恢复生效）
    this.syncAutoCountState();
    this._maybeSyncWheel();
  },
  onHide() {
    this._suspendEngine(true);
    this._stopTicker();
    this._stopPhaseTimer();
  },
  onUnload() {
    this._destroyed = true;
    this._suspendEngine(true);
    this._stopTicker();
    this._stopPhaseTimer();
  },

  /* ================= 设置 / 主题 ================= */
  _applySettings(s, full) {
    const dark = s.theme === 'dark';
    const showBreath = s.showBreath !== false;
    const patch = {
      dark,
      bg: s.customBg || (dark ? BG.dark : BG.light),
      settings: s,
      showBreath,
      showCounter: s.showCounter !== false,
      sound: !!s.sound,
      noiseOn: s.whiteNoise || 'off',
      noiseVolume: Math.round((Number(s.whiteNoiseVolume) >= 0 ? Number(s.whiteNoiseVolume) : 0.6) * 100),
      resetEnabled: !!s.resetCounterEnabled,
      autoEnabled: !!s.autoCountEnabled,
      // 间隔精度统一修剪为 1 位小数（0.1 秒为最小单位），范围 0.1 ~ 25 秒
      autoInterval: Math.min(25, Math.max(0.1, Number((Number(s.autoCountInterval) || 1).toFixed(1)))),
      counterModeLabel: s.counterMode === 'total' ? '累计计数' : '今日计数',
    };
    if (full) {
      patch.tab = store.getFocusTab();
      patch.tags = (store.DEFAULT_TAGS || []).concat(store.getTags());
      patch.tags = patch.tags.filter((t, i, a) => a.indexOf(t) === i);
      const affs = store.getAffirmations();
      patch.affs = affs;
      patch.autoOn = !!s.autoCountEnabled;
    }
    // 关闭「呼吸调整」页签后，若上次停留在 breath 则回到肯定语，避免只有静态页签却显示呼吸面板
    if (!showBreath) patch.tab = 'affirm';
    const cur = patch.tab || this.data.tab || 'affirm';
    this.setData(patch);
    this._applyTabMeta(cur, s);
    // 设置中关闭「自动计数」：立即停用运行中的自动计数（清空触发锚点并复位 UI 开关）。
    // 返回主界面后无需手动终止，ticker 的自动触发条件已彻底失效，不再计数与发声。
    if (!s.autoCountEnabled) this._stopAutoCount();
    try {
      wx.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#0c1424' : '#e9f1f8',
      });
    } catch (e) { /* noop */ }
  },
  _applyTabMeta(tab, s) {
    s = s || store.getSettings();
    if (tab === 'breath') {
      const label = this._breathLabel(s);
      const ph = buildPhases(s);
      this.setData({
        tab: 'breath',
        breathLabel: label,
        phaseLabel: ph.length ? '准备' : '呼吸模式未开启',
        isTimer: s.breathTimerMode !== 'stopwatch',
      });
    } else {
      this.setData({
        tab: 'affirm',
        isTimer: s.affirmTimerMode !== 'stopwatch',
        autoOn: !!s.autoCountEnabled,
        autoEnabled: !!s.autoCountEnabled,
      });
    }
    store.setFocusTab(tab);
  },
  _breathLabel(s) {
    const m = s.breathMode;
    if (m === 'box') return '箱式呼吸 4-4-4-4';
    if (m === '478') return '4-7-8 呼吸';
    if (m === 'off') return '未开启';
    const c = s.customBreath || {};
    return '自定义 ' + (c.inhale || 4) + '-' + (c.hold1 || 0) + '-' + (c.exhale || 4) + '-' + (c.hold2 || 0);
  },

  /* ================= Tab 切换 ================= */
  segTap(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    const eng = this._engine;
    // 状态检查：未运行（含无引擎）直接流畅切换；运行中/暂停中按下述门槛处理
    const active = !!(eng && !eng.finished && (eng.running || this.data.paused));
    if (!active) {
      this._switchTab(tab);
      return;
    }
    // 30 秒保存门槛：<30s 视为误触/极短体验，不弹窗、不落库（不产生碎片废数据），直接重置并切换
    const secs = Math.max(0, this._autoRunSecs(eng, Date.now()));
    if (secs < 30) {
      if (eng.kind === 'affirm') this.resetAffirm();
      else this.breathReset();
      this._switchTab(tab);
      return;
    }
    // >=30s：拦截切换，弹出保存确认（分钟数保留 1 位小数，整数不带小数点）
    const minsNum = Math.round((secs / 60) * 10) / 10;
    const minsText = Number.isInteger(minsNum) ? String(minsNum) : minsNum.toFixed(1);
    wx.showModal({
      title: '保存并切换？',
      content: '检测到已练习 ' + minsText + ' 分钟，是否保存当前进度并切换？',
      confirmText: '保存切换', // 微信 confirmText 上限 4 个字符，「保存并切换」会被截断
      cancelText: '继续当前',
      success: (res) => {
        if (this._destroyed) return;
        if (!res.confirm) return; // 取消：关闭弹窗，练习不受影响（计时未暂停，继续运行）
        this._settleAndSwitch(tab);
      },
    });
  },
  /** 结算当前进度并切换：已累加计数/已计时长写入数据中心历史记录，重置后切至目标 Bar */
  _settleAndSwitch(tab) {
    const eng = this._engine;
    if (eng && eng.kind === 'affirm') {
      // saveDuration=true：写入时长日志（tag/肯定语/计数随 upsertDailyLog 一并入账）并清空会话
      this.finishAffirm(true);
    } else if (eng && eng.kind === 'breath') {
      this.breathDone(); // 写入呼吸时长日志并清空会话
    }
    this._switchTab(tab);
  },
  _switchTab(tab) {
    // 切换前挂起当前模式引擎
    this._suspendEngine(true);
    this._applyTabMeta(tab, store.getSettings());
    this._resetEngineState();
    this._maybeSyncWheel();
  },

  _resetEngineState() {
    this._engine = null;
    this._stopPhaseTimer();
    this._stopTicker();
    const s = store.getSettings();
    this.setData({
      running: false,
      paused: false,
      elapsed: 0,
      total: 0,
      clock: '00:00',
      count: 0,
      countDisplay: 0,
      showDurPanel: true,
      ballScale: 1,
      ballCss: 'transform:scale(1)',
      celebration: false,
    });
    if (this.data.tab === 'breath') {
      const ph = buildPhases(s);
      this.setData({ phaseLabel: ph.length ? '准备' : '呼吸模式未开启', isTimer: s.breathTimerMode !== 'stopwatch' });
    } else {
      this._loadAffirmSelection();
    }
  },

  /* ================= 肯定语选择 ================= */
  _affirmationsByTag(tag, affs) {
    const list = affs || store.getAffirmations();
    const all = list.filter((a) => !a.tag || a.tag === tag);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },
  _loadAffirmSelection() {
    const s = store.getSettings();
    const tags = (store.DEFAULT_TAGS || []).concat(store.getTags()).filter((t, i, a) => a.indexOf(t) === i);
    const affs = store.getAffirmations();
    const saved = store.getAffirmSelection();
    let tag = saved && tags.indexOf(saved.tag) >= 0 ? saved.tag : tags[0];
    let list = this._affirmationsByTag(tag, affs);
    let aff = null;
    if (saved && list.some((a) => a.id === saved.affId)) aff = saved.affId;
    if (!aff && list.length) aff = list[list.length - 1].id;
    store.setAffirmSelection({ tag, affId: aff || null });
    this.setData({ tags, selectedTag: tag, affs: list });
    this._selectAff(aff, affs, false);
  },
  tagTap(e) {
    const tag = e.currentTarget.dataset.tag;
    const list = this._affirmationsByTag(tag);
    const aff = list.length ? list[list.length - 1].id : '';
    store.setAffirmSelection({ tag, affId: aff || null });
    this.setData({ selectedTag: tag, affs: list });
    this._selectAff(aff, store.getAffirmations(), false);
    this._recalcBadges();
  },
  affTap(e) {
    const id = e.currentTarget.dataset.id;
    this._selectAff(id, store.getAffirmations(), true);
  },
  _selectAff(id, allAffs, persist) {
    const aff = (allAffs || store.getAffirmations()).find((a) => a.id === id) || null;
    const patch = {
      selectedAff: aff ? aff.id : '',
      selectedAffText: aff ? aff.text : '',
    };
    if (persist && this.data.selectedTag) {
      store.setAffirmSelection({ tag: this.data.selectedTag, affId: aff ? aff.id : null });
    }
    this.setData(patch);
    this._recalcBadges();
  },
  _recalcBadges() {
    const logs = store.getAllLogs(); // 含冷归档：累计徽标需全量历史
    const today = store.todayKey();
    const { selectedTag, selectedAff } = this.data;
    let todaySum = 0;
    let cumSum = 0;
    logs.forEach((l) => {
      if (l.kind && l.kind !== 'affirm') return;
      if (l.tag !== selectedTag) return;
      if (selectedAff && l.affirmationId && l.affirmationId !== selectedAff) return;
      cumSum += l.count || 0;
      if (l.date === today) todaySum += l.count || 0;
    });
    // 无肯定语对象时累计回退为日志累计
    const affs = store.getAffirmations();
    const aff = affs.find((a) => a.id === selectedAff);
    if (aff) cumSum = aff.count || 0;
    const cfg = store.getSettings();
    const disp = cfg.counterMode === 'total' ? cumSum : todaySum;
    this._sums = { today: todaySum, cum: cumSum }; // 缓存徽标，供 _addCount 增量更新
    this.setData({ todayBadge: todaySum, cumBadge: cumSum, countDisplay: disp });
  },

  /* ================= 计数 ================= */
  _addCount(n, feedback, vib) {
    if (n <= 0) return;
    const { selectedTag, selectedAff } = this.data;
    const s = store.getSettings();
    // 更新 daily 日志（一次写入；后台补足 n>1 也仅一次落库）
    store.setLogs(store.upsertDailyLog(store.getLogs(), {
      tag: selectedTag, affId: selectedAff || undefined, addCount: n, kind: 'affirm',
    }));
    // 更新肯定语累计
    if (selectedAff) {
      store.setAffirmations(
        store.getAffirmations().map((a) => (a.id === selectedAff ? Object.assign({}, a, { count: (a.count || 0) + n }) : a)),
      );
    }
    // 提示音：手动/自动每次计数播一次；后台补足 n>1 只播一次（防止音效叠加刺耳）
    if (feedback && this.data.sound) audio.playTick(false);
    if (vib) audio.vibrate();
    // 局部增量渲染：仅更新计数字段并复用徽标缓存，避免全量 setData + 日志遍历
    if (!this._sums) this._recalcBadges();
    const sums = this._sums || { today: 0, cum: 0 };
    const todayBadge = sums.today + n;
    const cumBadge = sums.cum + n;
    sums.today = todayBadge;
    sums.cum = cumBadge;
    const count = this.data.count + n;
    const countDisplay = s.counterMode === 'total' ? cumBadge : todayBadge;
    if (this._engine && this._engine.kind === 'affirm') this._engine.count = count;
    this.setData({ count, countDisplay, todayBadge, cumBadge });
  },
  countTap() {
    if (!this.data.showCounter) return;
    this._addCount(1, true, true);
  },

  /* ================= 肯定语计时引擎 ================= */
  _affirmDefaultTotal(s) {
    // 分钟 -> 秒（无记录时用设置默认 5 分钟）
    return Math.max(60, Math.round((s.focusDuration || 300)));
  },
  _makeAffirmEngine(s) {
    const isTimer = s.affirmTimerMode !== 'stopwatch';
    const total = isTimer ? this._affirmDefaultTotal(s) : 0;
    const e = {
      kind: 'affirm',
      isTimer,
      total,
      base: 0, // 已累计秒
      startedAt: Date.now(),
      running: false,
      count: this.data.count,
      finished: false,
      // 自动计数时间戳锚点：autoStartBase 记录「开启自动计数时」的已运行秒，
      // autoFired 记录已执行次数，切后台/回前台用 (now-anchor)/interval 精确补足
      autoActive: false,
      autoStartBase: 0,
      autoFired: 0,
    };
    this._engine = e;
    this.setData({
      running: false,
      paused: false,
      elapsed: 0,
      total,
      clock: '00:00', // 正计时首帧固定 00:00，避免沿用上一段倒计时残留（如 05:00）
      isTimer,
      showDurPanel: true,
    });
    return e;
  },
  startAffirm() {
    const s = store.getSettings();
    // 每次「开始」都重建引擎：彻底清空上一段倒计时/正计时残留的初始状态，保证首帧 00:00 流畅累加
    const e = this._makeAffirmEngine(s);
    const total = e.total || this._affirmDefaultTotal(s);
    e.total = total;
    e.startedAt = Date.now();
    e.running = true;
    // 自动计数完全由设置驱动：设置里开启后，点【开始/继续】即自动按间隔计数，无需主界面再手动开启
    e.autoActive = !!s.autoCountEnabled;
    e.autoStartBase = 0;
    e.autoFired = 0;
    e.autoIntervalMs = this._autoIntervalMs(); // 记录生效间隔，供变更检定与后台补足使用
    const isTimer = e.isTimer;
    this.setData({
      running: true, paused: false, total: e.total, isTimer, showDurPanel: false,
      elapsed: 0,
      clock: isTimer && e.total > 0 ? util.fmtClock(e.total) : '00:00',
    });
    if (e.isTimer && total <= 0) return;
    this._startTicker('affirm');
    this._saveAffirmSession(e);
  },
  pauseAffirm() {
    const e = this._engine;
    if (!e) return;
    const now = Date.now();
    e.base += (now - e.startedAt) / 1000;
    e.startedAt = now;
    e.running = false;
    this._stopTicker();
    this.setData({ running: false, paused: true, elapsed: Math.floor(e.base), clock: this._clockText(e, true) });
    this._saveAffirmSession(e);
  },
  resumeAffirm() {
    const e = this._engine;
    if (!e) return;
    // 暂停期间若切换过自动计数开关，按当前开关校准（开启则重新以当前时刻为锚点）
    if (this.data.autoOn && !e.autoActive) {
      e.autoActive = true;
      e.autoStartBase = this._autoRunSecs(e, Date.now());
      e.autoFired = 0;
      e.autoIntervalMs = this._autoIntervalMs();
    } else if (!this.data.autoOn && e.autoActive) {
      e.autoActive = false;
      e.autoFired = 0;
      e.autoStartBase = 0;
    }
    e.startedAt = Date.now();
    e.running = true;
    this.setData({ running: true, paused: false, showDurPanel: false });
    this._startTicker('affirm');
    this._saveAffirmSession(e);
  },
  /** 完成/结束：saveDuration=true 时补写时长日志（防止重复写入） */
  finishAffirm(saveDuration) {
    const e = this._engine;
    if (!e) return;
    const now = Date.now();
    let elapsed = e.base;
    if (e.running) elapsed += (now - e.startedAt) / 1000;
    if (e.isTimer && e.total > 0 && elapsed > e.total) elapsed = e.total;
    const secs = Math.round(elapsed);
    const wasRunning = e.running;
    e.running = false;
    e.finished = true;
    this._stopTicker();
    this._stopPhaseTimer();
    if (secs > 0 && !e.logged && (wasRunning || saveDuration)) {
      e.logged = true;
      this._saveDurationLog(secs, 'affirm');
    }
    this._saveAffirmSession(null);
    this.setData({
      running: false, paused: false, showDurPanel: true, elapsed: 0,
      clock: '00:00', celebration: false,
    });
    if (wasRunning && secs > 0) {
      const n = e.count || this.data.count || 0;
      this.setData({
        celebration: true,
        celebrationText: '完成 · ' + n + ' 次肯定 · ' + util.fmtClock(secs, true),
      });
      audio.playTick(true);
      audio.vibrate();
      setTimeout(() => {
        if (!this._destroyed) this.setData({ celebration: false });
      }, 3200);
    }
    this._recalcBadges();
    this._engine = null;
  },
  _saveDurationLog(secs, kind) {
    const s = store.getSettings();
    if (kind === 'breath') {
      store.setLogs(store.upsertDailyLog(store.getLogs(), {
        tag: '呼吸调整', addDuration: secs, kind: 'breath',
      }));
    } else {
      store.setLogs(store.upsertDailyLog(store.getLogs(), {
        tag: this.data.selectedTag, affId: this.data.selectedAff || undefined, addDuration: secs, kind: 'affirm',
      }));
    }
    void s;
  },
  _clockText(e, forceHours) {
    // 与 Web 一致：不足 1 小时时省略小时位（fmtClock 自动处理）
    if (e.isTimer && e.total > 0) {
      const rem = Math.max(0, e.total - Math.floor(e.base));
      return util.fmtClock(rem);
    }
    return util.fmtClock(Math.floor(e.base));
  },
  resetAffirm() {
    // 手动重置当前引擎（暂停状态下）
    this._saveAffirmSession(null);
    this._engine = null;
    this.setData({ running: false, paused: false, elapsed: 0, total: 0, count: 0, clock: '00:00', showDurPanel: true, countDisplay: 0 });
    this._recalcBadges();
  },
  _saveAffirmSession(e) {
    if (!e) {
      store.saveActiveSession('affirm', null);
      return;
    }
    store.saveActiveSession('affirm', {
      v: 1,
      running: e.running,
      isTimer: e.isTimer,
      total: e.total,
      base: e.base,
      startedAt: e.startedAt,
      count: e.count,
      tab: 'affirm',
      tag: this.data.selectedTag,
      affId: this.data.selectedAff,
      // 持久化自动计数补偿状态：切回前台/重新打开时按时间戳精确补足
      auto: {
        active: !!e.autoActive,
        startBase: e.autoStartBase || 0,
        fired: e.autoFired || 0,
        intervalMs: e.autoIntervalMs || 0, // 生效间隔（毫秒）：恢复时用于检定间隔是否被改动
      },
    });
  },
  /** 恢复上次会话（页面重新打开时） */
  _restoreSession() {
    const session = store.getActiveSession('affirm');
    const bsession = store.getActiveSession('breath');
    const tab = this.data.tab;
    const cur = tab === 'breath' ? bsession : session;
    const other = tab === 'breath' ? session : bsession;
    if (cur && cur.v === 1) {
      // 尝试恢复当前 tab
      this._resumeFromSession(cur);
    } else if (other && other.v === 1) {
      // 当前 tab 无会话，但另一个 tab 有 —— 切过去前提醒
      wx.showModal({
        title: '进行中的专注',
        content: '检测到「' + (other.tab === 'breath' ? '呼吸调整' : '肯定语') + '」有未完成的练习，是否继续？',
        confirmText: '继续',
        cancelText: '放弃',
        success: (res) => {
          if (this._destroyed) return;
          if (res.confirm) {
            this._applyTabMeta(other.tab === 'breath' ? 'breath' : 'affirm', store.getSettings());
            this._resumeFromSession(other);
          } else {
            store.saveActiveSession(other.tab === 'breath' ? 'breath' : 'affirm', null);
          }
        },
      });
    }
  },
  _resumeFromSession(session) {
    if (session.kind === undefined) {
      // 兼容 affirm/breath 统一的存储格式
    }
    const kind = this.data.tab === 'breath' ? 'breath' : 'affirm';
    if (kind === 'affirm') {
      if (session.tag && session.tag !== this.data.selectedTag) {
        this.setData({ selectedTag: session.tag, affs: this._affirmationsByTag(session.tag) });
      }
      if (session.affId && this.data.affs.some((a) => a.id === session.affId)) {
        this._selectAff(session.affId, store.getAffirmations(), true);
      }
      const now = Date.now();
      const settings = store.getSettings();
      const autoState = session.auto;
      // 会话恢复时以当前设置为最终裁决：设置中已关闭自动计数则强制停用，防旧会话锚点复活自动计数
      const autoActive = !!settings.autoCountEnabled && (autoState ? !!autoState.active : true);
      const autoStartBase = autoState ? Number(autoState.startBase) || 0 : 0;
      const autoFired = autoState ? Number(autoState.fired) || 0 : 0;
      // 上次生效间隔：0 表示无记录，交由 _syncAutoCount 重排锚点（防旧 autoFired 造成计数瘫痪）
      const autoIntervalMs = autoState ? Number(autoState.intervalMs) || 0 : 0;
      if (session.isTimer && session.total > 0) {
        const gapTotal = session.running ? Math.max(0, (now - session.startedAt) / 1000) : 0;
        if (session.base + gapTotal >= session.total) {
          // 后台期间倒计时已走完：先按真实总时长补足自动计数（只播一次音效），再按完成处理
          this._engine = {
            kind: 'affirm', isTimer: true, total: session.total, base: session.total, startedAt: now,
            running: false, count: session.count || 0, finished: true,
            autoActive, autoStartBase, autoFired, autoIntervalMs,
          };
          this.setData({ count: session.count || 0, countDisplay: session.count || 0, total: session.total });
          this._syncAutoCount(this._engine, now, true);
          const finalCount = this.data.count;
          this._recalcBadges();
          this._saveDurationLog(Math.round(session.total), 'affirm');
          this._saveAffirmSession(null);
          this.setData({
            running: false, paused: false, showDurPanel: true, elapsed: 0, clock: '00:00',
            celebration: true,
            celebrationText: '完成 · ' + finalCount + ' 次肯定 · ' + util.fmtClock(session.total, true),
          });
          audio.playTick(true);
          audio.vibrate();
          setTimeout(() => {
            if (!this._destroyed) this.setData({ celebration: false });
          }, 3200);
          this._engine = null;
          this._recalcBadges();
          return;
        }
      }
      const gap = session.running ? Math.max(0, (now - session.startedAt || now) / 1000) : 0;
      const base = session.base + gap;
      const e = {
        kind: 'affirm',
        isTimer: session.isTimer,
        total: session.total || 0,
        base,
        startedAt: now,
        running: session.running,
        count: session.count || 0,
        finished: false,
        autoActive,
        autoStartBase,
        autoFired,
        autoIntervalMs,
      };
      this._engine = e;
      this.setData({
        running: session.running,
        paused: !session.running && base > 0,
        count: e.count,
        countDisplay: e.count,
        elapsed: Math.floor(base),
        total: e.total,
        clock: this._clockText(e, true),
        showDurPanel: !session.running && base === 0,
        autoOn: e.autoActive,
      });
      if (session.running) {
        // 先重算徽标缓存（应对切页期间外部计数），再用时间戳差瞬间补足后台漏掉的自动计数（如 22 秒对齐到 22 次）
        this._recalcBadges();
        if (e.autoActive) this._syncAutoCount(e, now);
        this._startTicker('affirm');
      } else {
        this._recalcBadges();
      }
    } else {
      this._resumeBreathSession(session);
    }
  },

  /* ================= 计时模式切换检查 ================= */
  _checkAffirmModeChange() {
    const mode = store.getSettings().affirmTimerMode;
    if (mode === this._lastAffirmMode) return;
    this._lastAffirmMode = mode;
    const e = this._engine;
    const hasSession = !!store.getActiveSession('affirm');
    if (hasSession) store.saveActiveSession('affirm', null);
    if (e && e.kind === 'affirm') {
      this._stopTicker();
      this._stopPhaseTimer();
      this._engine = null;
    }
    // 清空旧模式残留的初始状态，正计时开始首帧固定 00:00
    this.setData({
      running: false, paused: false, elapsed: 0, total: 0,
      clock: '00:00', count: 0, showDurPanel: true,
    });
    this._recalcBadges();
  },

  /* ================= 自动计数（时间戳差补偿，不依赖 setInterval 计数） ================= */
  /**
   * 自动计数状态响应函数（唯一入口）—— 设置开关 / 主页面 onShow / 计时按钮三处均调用：
   *   autoCount && isTiming 开启：先清除旧定时器句柄，再启动全新 ticker 并激活计数锚点；
   *   autoCount 关闭          ：立即清除定时器并置空句柄，同时停用计数触发状态。
   * 说明：计数触发条件为 autoOn && engine.autoActive，由共享 ticker(200ms) 按时间戳差驱动；
   *       _startTicker 内部即「clearInterval 旧句柄 → setInterval 新句柄」，故重开开关时定时器必然重建。
   */
  syncAutoCountState() {
    const on = !!store.getSettings().autoCountEnabled;
    const e = this._engine;
    const affirm = e && e.kind === 'affirm' && !e.finished ? e : null;
    if (!on) {
      // 关闭：清自动计数触发状态；无进行中计时则连同定时器句柄一并释放
      this._stopAutoCount();
      if (!e || !e.running) this._stopTicker();
      return;
    }
    // 开启：先同步 UI 开关状态
    if (this.data.autoOn !== true || this.data.autoEnabled !== true) {
      this.setData({ autoOn: true, autoEnabled: true });
    }
    if (!affirm || !affirm.running) return; // 无引擎/暂停中：由 startAffirm / resumeAffirm 激活
    if (!affirm.autoActive) {
      // 以「当前已运行秒」为新锚点激活（与 resumeAffirm 口径一致，不补算开启前的历史，避免计数突增）
      affirm.autoActive = true;
      affirm.autoStartBase = this._autoRunSecs(affirm, Date.now());
      affirm.autoFired = 0;
      affirm.autoIntervalMs = this._autoIntervalMs();
    }
    this._startTicker('affirm'); // 清旧建新：自动计数定时器随开关状态重建
    this._saveAffirmSession(affirm);
  },
  /**
   * 间隔变更响应（设置页实时调整 1s → 10s 等大幅变化时调用）：
   *   1) 读取新间隔并换算为毫秒 intervalMs = Math.round(sec * 10) * 100；
   *   2) 销毁旧定时器句柄（_startTicker 内部 clearInterval）；
   *   3) 以当前运行秒重排锚点（autoStartBase = now、autoFired = 0），
   *      再用全新节奏重启 setInterval —— 保证调整后立即按新间隔平滑计数，绝不卡死。
   */
  syncAutoCountInterval(nextSec) {
    const e = this._engine;
    // 拖拽 changing 期间传入实时值（尚未落盘），其余场景回读设置
    const override = Number(nextSec);
    const intervalMs = override > 0
      ? Math.round(Math.min(25, Math.max(0.1, Math.round(override * 10) / 10)) * 10) * 100
      : this._autoIntervalMs();
    const intervalSec = intervalMs / 1000;
    // 页面提示文案（“每 X 秒 +1”）即时跟随
    if (this.data.autoInterval !== intervalSec) this.setData({ autoInterval: intervalSec });
    if (!e || e.kind !== 'affirm' || e.finished) return;
    e.autoIntervalMs = intervalMs;
    if (!e.running || !e.autoActive) return; // 暂停/未开启自动计数：锚点由 start/resume 路径接管
    e.autoStartBase = this._autoRunSecs(e, Date.now());
    e.autoFired = 0;
    this._startTicker('affirm'); // 清旧句柄 → 用新间隔节奏重启定时器
    this._saveAffirmSession(e);
  },
  /**
   * 停用自动计数（设置中关闭开关时调用）：
   * 显式清空引擎触发锚点并复位 UI 开关 —— 计数触发条件 autoOn && autoActive
   * 随即双双失效，等效于 clearInterval 销毁自动计数定时器；
   * 共享 ticker 仅为时钟显示保留，不再产生任何计数与提示音。
   */
  _stopAutoCount() {
    const e = this._engine;
    if (e && e.kind === 'affirm') {
      e.autoActive = false;
      e.autoFired = 0;
      e.autoStartBase = 0;
      // 同步清空持久化会话中的旧锚点，避免重开开关后按旧锚点一次性补算关闭期间的计数
      this._saveAffirmSession(e);
    }
    if (this.data.autoOn || this.data.autoEnabled) {
      this.setData({ autoOn: false, autoEnabled: false });
    }
  },
  /** 引擎已计入的「实际运行秒」（含进行中部分，后台冻结期由 base/墙钟补齐） */
  _autoRunSecs(e, now) {
    if (!e) return 0;
    return (e.base || 0) + (e.running ? (now - (e.startedAt || now)) / 1000 : 0);
  },
  /**
   * 自动计数间隔换算为毫秒（精确到 100ms 即 0.1 秒）：
   *   intervalMs = Math.round(seconds * 10) * 100
   * 范围 0.1 ~ 25 秒；取整数毫秒避免浮点误差累计。
   */
  _autoIntervalMs() {
    const s = store.getSettings();
    const raw = Number(s.autoCountInterval) || Number(this.data.autoInterval) || 1;
    const sec = Math.min(25, Math.max(0.1, Math.round(raw * 10) / 10));
    return Math.round(sec * 10) * 100;
  },
  /**
   * 自动计数补偿核心：后台/切回不依赖定时器已执行次数，
   * 以开启自动计数时锚点 autoStartBase 与墙钟差值重算应达总次数：
   *   expected = floor((runSec - autoStartBase) / interval)
   * 只补差额并统一播放一次提示音（n>1 时不叠加多次音效）。
   */
  _syncAutoCount(e, now, allowStopped) {
    if (!e || e.kind !== 'affirm') return 0;
    if (!e.autoActive) return 0;
    if (!e.running && !allowStopped) return 0;
    const intervalMs = this._autoIntervalMs();
    if (e.autoIntervalMs !== intervalMs) {
      // 间隔变更检定：弃用旧锚点，以当前运行秒重排节奏（等效清旧定时器后按新间隔重启）。
      // 若不重排，旧 autoFired（如 1s 跑了 100 次）会让 expected 骤降到 10，n 恒为 0 → 长时间“瘫痪无反应”。
      e.autoIntervalMs = intervalMs;
      e.autoStartBase = this._autoRunSecs(e, now);
      e.autoFired = 0;
    }
    const intervalSec = intervalMs / 1000;
    const runSec = Math.max(0, this._autoRunSecs(e, now) - (e.autoStartBase || 0));
    const expected = Math.floor(runSec / intervalSec);
    const n = Math.max(0, expected - (e.autoFired || 0));
    if (n <= 0) return 0;
    e.autoFired = expected;
    // 每触发一次自动计数 = 播一次提示音；补足 n>1 时 _addCount 内部只播一次，防叠加
    this._addCount(n, true, false);
    return n;
  },

  /* ================= 自动计数 ticker ================= */
  _startTicker(kind) {
    this._stopTicker();
    const self = this;
    this._ticker = setInterval(() => self._tick(kind), 200);
  },
  _stopTicker() {
    if (this._ticker) {
      clearInterval(this._ticker);
      this._ticker = null;
    }
  },
  _tick(kind) {
    const e = this._engine;
    if (!e || !e.running) return;
    const now = Date.now();
    if (kind === 'affirm') {
      // 自动计数：开关开启且计时器运行中时按间隔触发（倒计时 / 正计时均生效）
      if (this.data.autoOn && e.autoActive) this._syncAutoCount(e, now);
      if (e.isTimer && e.total > 0) {
        const elapsed = e.base + (now - e.startedAt) / 1000;
        if (elapsed >= e.total) {
          // 倒计时结束
          e.base = e.total;
          this.finishAffirm(false);
          return;
        }
        const next = util.fmtClock(Math.max(0, e.total - Math.floor(elapsed)));
        if (next !== this.data.clock) this.setData({ clock: next }); // 仅秒级变化才渲染
      } else {
        const next = util.fmtClock(Math.floor(e.base + (now - e.startedAt) / 1000));
        if (next !== this.data.clock) this.setData({ clock: next });
      }
    } else {
      // 呼吸：倒计时 / 顺计时展示
      const elapsed = e.base + (now - e.startedAt) / 1000;
      if (e.isTimer && e.total > 0 && elapsed >= e.total) {
        e.base = e.total;
        this._endBreath();
        return;
      }
      const next = e.isTimer && e.total > 0
        ? util.fmtClock(Math.max(0, e.total - Math.floor(elapsed)))
        : util.fmtClock(Math.floor(elapsed));
      if (next !== this.data.clock) this.setData({ clock: next });
    }
  },

  /* ================= 呼吸调整 ================= */
  breathStart() {
    const s = store.getSettings();
    const ph = buildPhases(s);
    if (!ph.length) {
      wx.showToast({ title: '请在设置中开启呼吸模式', icon: 'none' });
      return;
    }
    const isTimer = s.breathTimerMode !== 'stopwatch';
    const total = isTimer ? Math.max(60, Math.round((s.breathFocusDuration || 300))) : 0;
    const e = {
      kind: 'breath', isTimer, total, base: 0, startedAt: Date.now(), running: true, count: 0, finished: false,
    };
    this._engine = e;
    this.setData({
      running: true, paused: false, elapsed: 0, total,
      clock: util.fmtClock(isTimer && total > 0 ? total : 0),
      showDurPanel: false, celebration: false,
    });
    this._startTicker('breath');
    this._startBreathPhases();
    this._saveBreathSession(e);
  },
  breathPause() {
    const e = this._engine;
    if (!e || e.kind !== 'breath') return;
    const now = Date.now();
    e.base += (now - e.startedAt) / 1000;
    e.startedAt = now;
    e.running = false;
    this._stopTicker();
    this._stopPhaseTimer();
    this.setData({ running: false, paused: true });
    this._saveBreathSession(e);
  },
  breathResume() {
    const e = this._engine;
    if (!e || e.kind !== 'breath') return;
    e.startedAt = Date.now();
    e.running = true;
    this.setData({ running: true, paused: false });
    this._startTicker('breath');
    this._startBreathPhases(true);
    this._saveBreathSession(e);
  },
  _endBreath() {
    const e = this._engine;
    if (!e) return;
    const now = Date.now();
    const elapsed = e.base + (e.running ? (now - e.startedAt) / 1000 : 0);
    const secs = Math.max(0, Math.round(Math.min(e.total > 0 ? e.total : elapsed, elapsed)));
    e.running = false;
    this._stopTicker();
    this._stopPhaseTimer();
    this._saveBreathSession(null);
    this.setData({
      running: false, paused: false, elapsed: 0, clock: '00:00', showDurPanel: true, celebration: false,
      ballCss: 'transform:scale(1);transition:transform 0.3s ease', phaseLabel: '准备',
    });
    if (secs > 0) this._saveDurationLog(secs, 'breath');
    if (secs > 0) {
      this.setData({ celebration: true, celebrationText: '呼吸练习完成 · ' + util.fmtClock(secs, true) });
      audio.playTick(true);
      audio.vibrate();
      setTimeout(() => {
        if (!this._destroyed) this.setData({ celebration: false });
      }, 3200);
    }
    this._engine = null;
  },
  _saveBreathSession(e) {
    if (!e) {
      store.saveActiveSession('breath', null);
      return;
    }
    store.saveActiveSession('breath', {
      v: 1, running: e.running, isTimer: e.isTimer, total: e.total,
      base: e.base, startedAt: e.startedAt, tab: 'breath',
    });
  },
  _resumeBreathSession(session) {
    const now = Date.now();
    const gap = session.running ? Math.max(0, (now - (session.startedAt || now)) / 1000) : 0;
    const base = session.base + gap;
    if (session.isTimer && session.total > 0 && base >= session.total) {
      this._saveBreathSession(null);
      this._saveDurationLog(Math.round(session.total), 'breath');
      this.setData({
        running: false, paused: false, clock: '00:00', showDurPanel: true,
        celebration: true, celebrationText: '呼吸练习完成 · ' + util.fmtClock(session.total, true),
      });
      audio.playTick(true);
      setTimeout(() => {
        if (!this._destroyed) this.setData({ celebration: false });
      }, 3200);
      return;
    }
    const e = {
      kind: 'breath', isTimer: session.isTimer, total: session.total || 0,
      base, startedAt: now, running: session.running, count: 0, finished: false,
    };
    this._engine = e;
    this.setData({
      running: session.running,
      paused: !session.running && base > 0,
      clock: this._clockText(e, true),
      showDurPanel: !session.running && base === 0,
    });
    if (session.running) {
      this._startTicker('breath');
      this._startBreathPhases(true);
    }
  },
  _startBreathPhases(keepProgress) {
    const s = store.getSettings();
    const ph = buildPhases(s);
    if (!ph.length) return;
    const totalDur = ph.reduce((x, p) => x + p.sec, 0);
    // 从已进行秒计算当前相位
    const e = this._engine;
    const baseEl = e ? e.base + (Date.now() - e.startedAt) / 1000 : 0;
    let idx = 0;
    let offset = baseEl % totalDur;
    let acc = 0;
    for (let i = 0; i < ph.length; i++) {
      acc += ph[i].sec;
      if (offset < acc) { idx = i; break; }
      idx = i;
    }
    this._phaseIdx = idx;
    this._phaseAcc = 0;
    const run = () => {
      if (!this._engine || !this._engine.running) return;
      const phases = buildPhases(store.getSettings());
      const p = phases[this._phaseIdx % phases.length];
      const label = PHASE_LABEL[p.kind];
      let target = 1;
      const prev = phases[(this._phaseIdx - 1 + phases.length) % phases.length];
      if (p.kind === 'in') target = 1.22;
      else if (p.kind === 'out') target = 0.7;
      else target = prev.kind === 'in' ? 1.22 : prev.kind === 'out' ? 0.7 : 1;
      const trans = 'transform ' + p.sec + 's ' + (p.kind === 'hold' ? 'linear' : 'cubic-bezier(0.42,0,0.58,1)');
      this.setData({
        phaseLabel: label,
        ballCss: 'transform:scale(' + target + ');transition:' + trans,
      });
      this._phaseIdx += 1;
      this._phaseTimer = setTimeout(run, p.sec * 1000 + 80);
    };
    this._stopPhaseTimer();
    run();
    void keepProgress;
  },
  _stopPhaseTimer() {
    if (this._phaseTimer) {
      clearTimeout(this._phaseTimer);
      this._phaseTimer = null;
    }
  },
  breathDone() {
    // 用户主动结束呼吸
    const e = this._engine;
    if (!e) return;
    const now = Date.now();
    const elapsed = e.base + (e.running ? (now - e.startedAt) / 1000 : 0);
    e.base = elapsed;
    e.running = false;
    const secs = Math.max(0, Math.round(elapsed));
    this._stopTicker();
    this._stopPhaseTimer();
    this._saveBreathSession(null);
    this.setData({
      running: false, paused: false, clock: '00:00', showDurPanel: true, celebration: false,
      ballCss: 'transform:scale(1);transition:transform 0.3s ease', phaseLabel: '准备',
    });
    if (secs > 0) {
      this._saveDurationLog(secs, 'breath');
      this.setData({ celebration: true, celebrationText: '呼吸练习完成 · ' + util.fmtClock(secs, true) });
      audio.playTick(true);
      audio.vibrate();
      setTimeout(() => {
        if (!this._destroyed) this.setData({ celebration: false });
      }, 3200);
    }
    this._engine = null;
  },
  breathReset() {
    this._saveBreathSession(null);
    this._stopTicker();
    this._stopPhaseTimer();
    this._engine = null;
    this.setData({
      running: false, paused: false, clock: '00:00', showDurPanel: true,
      ballCss: 'transform:scale(1);transition:transform 0.3s ease', phaseLabel: '准备',
    });
  },

  /* ================= 拨盘（Web WheelDuration 等效实现） ================= */
  _maybeSyncWheel() {
    if (this._destroyed) return;
    const d = this.data;
    if (!d.showDurPanel || d.running || d.paused || !d.isTimer) return;
    const s = store.getSettings();
    const secs = Math.max(0, d.tab === 'breath' ? (s.breathFocusDuration || 300) : (s.focusDuration || 300));
    const h = Math.min(MAX_H, Math.floor(secs / 3600));
    const m = Math.min(59, Math.floor((secs % 3600) / 60));
    const ss = Math.min(59, secs % 60);
    this.setData({
      whSel: h, wmSel: m, wsSel: ss,
      scrollH: h * ITEM_H, scrollM: m * ITEM_H, scrollS: ss * ITEM_H,
    });
  },
  wheelScroll(e) {
    const key = e.currentTarget.dataset.key;
    const top = e.detail.scrollTop;
    const max = key === 'h' ? MAX_H : 59;
    const idx = Math.max(0, Math.min(max, Math.round(top / ITEM_H)));
    const k = key === 'h' ? 'whSel' : key === 'm' ? 'wmSel' : 'wsSel';
    const p = {};
    p[k] = idx;
    this.setData(p);
  },
  wheelSettle(e) {
    const key = e.currentTarget.dataset.key;
    const d = this.data;
    const idx = key === 'h' ? d.whSel : key === 'm' ? d.wmSel : d.wsSel;
    const k = key === 'h' ? 'scrollH' : key === 'm' ? 'scrollM' : 'scrollS';
    const p = {};
    p[k] = idx * ITEM_H;
    this.setData(p);
    this._applyWheelDur();
  },
  wheelTap(e) {
    const key = e.currentTarget.dataset.key;
    const idx = Number(e.currentTarget.dataset.idx);
    const max = key === 'h' ? MAX_H : 59;
    const v = Math.max(0, Math.min(max, idx));
    const dk = key === 'h' ? 'whSel' : key === 'm' ? 'wmSel' : 'wsSel';
    const sk = key === 'h' ? 'scrollH' : key === 'm' ? 'scrollM' : 'scrollS';
    const p = {};
    p[dk] = v;
    p[sk] = v * ITEM_H;
    this.setData(p);
    this._applyWheelDur();
  },
  _applyWheelDur() {
    const d = this.data;
    const secs = Math.max(1, d.whSel * 3600 + d.wmSel * 60 + d.wsSel);
    const key = d.tab === 'breath' ? 'breathFocusDuration' : 'focusDuration';
    const patch = {};
    patch[key] = secs;
    store.patchSettings(patch);
    this.setData({ total: secs, clock: util.fmtClock(secs) });
  },

  /* ================= 通用计时控制（两个 Tab 共用一套 UI） ================= */
  timerPrimary() {
    const d = this.data;
    if (d.tab === 'breath') {
      if (d.running) this.breathPause();
      else if (d.paused) this.breathResume();
      else this.breathStart();
    } else {
      if (d.running) this.pauseAffirm();
      else if (d.paused) this.resumeAffirm();
      else this.startAffirm();
    }
    // 开始 / 暂停 / 恢复：按最新开关与计时状态同步自动计数定时器
    this.syncAutoCountState();
  },
  timerEnd() {
    if (!this._engine) return;
    if (this.data.tab === 'breath') this.breathDone();
    else this.finishAffirmNow();
    // 终止：引擎已释放，同步复位自动计数状态与定时器句柄
    this.syncAutoCountState();
  },
  goHome() {
    wx.navigateBack({ delta: 1, fail: () => wx.reLaunch({ url: '/pages/index/index' }) });
  },
  goSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' });
  },

  /* ================= 挂起（页面离开时持久化） ================= */
  _suspendEngine(keepOnTab) {
    const e = this._engine;
    if (!e) return;
    const now = Date.now();
    if (e.running) {
      e.base += (now - e.startedAt) / 1000;
      e.startedAt = now;
    }
    if (e.kind === 'affirm') {
      this._saveAffirmSession(e);
      // 若仍在倒计时进行中，允许继续（tab 不切换时不清引擎）
    } else if (e.kind === 'breath') {
      this._saveBreathSession(e);
    }
    if (!keepOnTab) {
      e.running = false;
    }
  },

  /* ================= 时长选择 ================= */
  durChipTap(e) {
    const minutes = Number(e.currentTarget.dataset.min);
    const secs = minutes * 60;
    const isBreath = this.data.tab === 'breath';
    this.setData({ total: secs });
    if (isBreath) {
      store.patchSettings({ breathFocusDuration: secs });
    } else {
      store.patchSettings({ focusDuration: secs });
    }
    const eng = this._engine;
    if (eng) eng.total = secs;
    this.setData({ clock: util.fmtClock(secs, true), showDurCustom: false });
  },
  openCustomDur() {
    const s = this.data.tab === 'breath' ? store.getSettings().breathFocusDuration : store.getSettings().focusDuration;
    const total = s || 300;
    const hoursArr = [];
    for (let i = 0; i <= MAX_H; i++) hoursArr.push(i + ' 小时');
    const minsArr = [];
    for (let i = 0; i < 60; i++) minsArr.push(i + ' 分钟');
    this.setData({
      showDurCustom: true, hoursArr, minsArr,
      hourIndex: Math.floor(total / 3600),
      minIndex: Math.floor((total % 3600) / 60),
      customHours: Math.floor(total / 3600),
      customMinutes: Math.floor((total % 3600) / 60),
    });
  },
  closeCustomDur() {
    this.setData({ showDurCustom: false });
  },
  onDurColumnsChange(e) {
    const v = e.detail.value;
    this.setData({
      hourIndex: v[0],
      minIndex: v[1],
      customHours: v[0],
      customMinutes: v[1],
    });
  },
  confirmCustomDur() {
    const total = (this.data.customHours * 60 + this.data.customMinutes) * 60;
    const secs = Math.max(60, total);
    this.setData({ showDurCustom: false });
    if (this.data.tab === 'breath') {
      store.patchSettings({ breathFocusDuration: secs });
    } else {
      store.patchSettings({ focusDuration: secs });
    }
    if (this._engine) this._engine.total = secs;
    this.setData({ total: secs, clock: util.fmtClock(secs, true) });
  },

  /* ================= 环境音 / 声音 ================= */
  noiseTap(e) {
    const key = e.currentTarget.dataset.key;
    store.patchSettings({ whiteNoise: key });
    audio.setWhiteNoise(key);
    this.setData({ noiseOn: key });
  },
  /** 拖动滑杆实时预览音量（不写存储，避免高频写入） */
  noiseVolChanging(e) {
    const v = Number(e.detail.value);
    if (isNaN(v)) return;
    audio.setWhiteNoiseVolume(v / 100, false);
    this.setData({ noiseVolume: v });
  },
  /** 松开滑杆：持久化音量（只影响白噪音，不影响计数器提示音） */
  noiseVolChange(e) {
    const v = Number(e.detail.value);
    if (isNaN(v)) return;
    audio.setWhiteNoiseVolume(v / 100, true);
    this.setData({ noiseVolume: v });
  },
  soundSwitch(e) {
    const v = e.detail.value;
    store.patchSettings({ sound: v });
    this.setData({ sound: v });
    if (v) {
      audio.playTick(false);
    }
  },

  /* ================= 重置计数 ================= */
  resetMenu() {
    const self = this;
    wx.showActionSheet({
      itemList: ['清空今日计数', '清空累计计数', '取消'],
      itemColor: '#233041',
      success(res) {
        if (res.tapIndex === 0) self._resetToday();
        else if (res.tapIndex === 1) self._resetTotal();
      },
    });
  },
  _scopeId() {
    const { selectedTag, selectedAff } = this.data;
    return 'daily-affirm-' + (selectedAff ? selectedAff + '-' : '') + store.todayKey() + '-' + selectedTag;
  },
  _resetToday() {
    wx.showModal({
      title: '清空今日计数',
      content: '将清空「' + this.data.selectedTag + '」今日已记录的计数（累计保持不变）。',
      confirmText: '清空',
      success: (res) => {
        if (!res.confirm) return;
        const scope = this._scopeId();
        store.filterLogs((l) => {
          if (l.kind && l.kind !== 'affirm') return true;
          return !(l.date === store.todayKey() && l.tag === this.data.selectedTag &&
            (!this.data.selectedAff || l.affirmationId === this.data.selectedAff));
        });
        this.setData({ count: 0, countDisplay: 0 });
        this._recalcBadges();
        wx.showToast({ title: '已清空今日计数', icon: 'none' });
      },
    });
    void scope;
  },
  _resetTotal() {
    wx.showModal({
      title: '清空累计计数',
      content: '将清空「' + this.data.selectedTag + '」全部历史计数与累计数值，不可恢复。',
      confirmText: '清空',
      confirmColor: '#d9534f',
      success: (res) => {
        if (!res.confirm) return;
        const affs = store.getAffirmations().map((a) =>
          a.tag === this.data.selectedTag && (!this.data.selectedAff || a.id === this.data.selectedAff)
            ? Object.assign({}, a, { count: 0 })
            : a,
        );
        store.setAffirmations(affs);
        store.filterLogs((l) =>
          l.kind && l.kind !== 'affirm'
            ? true
            : !(l.tag === this.data.selectedTag && (!this.data.selectedAff || l.affirmationId === this.data.selectedAff)),
        );
        this.setData({ count: 0, countDisplay: 0 });
        this._recalcBadges();
        wx.showToast({ title: '已清空累计计数', icon: 'none' });
      },
    });
  },

  /* ================= 完成/杂项 ================= */
  finishAffirmNow() {
    this.finishAffirm(true);
  },
  noop() {},
  celebrateClose() {
    this.setData({ celebration: false });
  },
  /** 前台刷新（离开后返回时更新列表与徽标） */
  _refreshAfterReturn() {
    if (this.data.running || this.data.paused) return;
    const s = store.getSettings();
    const tags = (store.DEFAULT_TAGS || []).concat(store.getTags()).filter((t, i, a) => a.indexOf(t) === i);
    const affs = store.getAffirmations();
    let tag = this.data.selectedTag;
    if (tags.indexOf(tag) < 0) tag = tags[0] || '';
    const list = this._affirmationsByTag(tag, affs);
    this.setData({ tags, affs: list, selectedTag: tag });
    this._recalcBadges();
    this._applyTabMeta(this.data.tab, s);
  },
});
