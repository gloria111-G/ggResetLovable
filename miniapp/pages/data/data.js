/**
 * data.js —— 数据中心
 * 公式与 Web 版 data.tsx 对齐：
 *  - 累计卡：肯定语总次数 / 肯定语总专注分钟 / 呼吸总分钟 + 主题分布 top6（按 duration 排序、count 归一）
 *  - 近 30 天：热力日历（按日志 tag 上色、取当日最大 count 的 tag）+ 时间分配饼图（近30天 duration）
 *  - 单日明细：当日三次数与主题分布
 */
const store = require('../../utils/storage');
const util = require('../../utils/util');

const BG = { light: '/images/ocean-bg.jpg', dark: '/images/ocean-bg-dark.jpg' };
const TAG_COLORS = [
  '#7FB3D5', '#A9DFBF', '#F9E79F', '#D2B4DE',
  '#F5CBA7', '#AED6F1', '#F1948A', '#F5B7B1',
];
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const MONTH_MS = 30 * 86400000;

function colorOf(tags, tag) {
  return TAG_COLORS[tags.indexOf(tag) % TAG_COLORS.length] || TAG_COLORS[0];
}

Page({
  data: {
    dark: false,
    bg: BG.light,
    // 累计
    allCount: 0,
    allMin: 0,
    breathAllMin: 0,
    distRows: [],
    // 近30天
    monthCount: 0,
    monthMin: 0,
    monthBreathMin: 0,
    heat: [], // {date,day,pad,has,tag,count,color}
    heatLegend: [], // [{tag,color}] 日历图例
    heatWeek: [], // ['日'...'六']
    pie: [], // {tag,color,label} 由 canvas 绘制
    pieRows: [],
    showPie: false,
    // 单日
    dayVisible: false,
    day: { date: '', count: 0, min: 0, breathMin: 0, rows: [] },
  },

  onShow() {
    this.refresh();
  },

  refresh() {
    const s = store.getSettings();
    const dark = s.theme === 'dark';
    this.setData({
      dark,
      bg: s.customBg || (dark ? BG.dark : BG.light),
    });
    try {
      wx.setNavigationBarColor({
        frontColor: dark ? '#ffffff' : '#000000',
        backgroundColor: dark ? '#0c1424' : '#e9f1f8',
      });
    } catch (e) { /* noop */ }

    const logs = store.getLogs();
    const now = Date.now();
    const affirmLogs = logs.filter((l) => (l.kind || 'affirm') === 'affirm');
    const breathLogs = logs.filter((l) => l.kind === 'breath');

    // ---- 累计 ----
    let allCount = 0;
    let allDur = 0;
    const tagMap = {};
    affirmLogs.forEach((l) => {
      allCount += l.count || 0;
      allDur += l.durationSec || 0;
      tagMap[l.tag] = tagMap[l.tag] || { count: 0, dur: 0 };
      tagMap[l.tag].count += l.count || 0;
      tagMap[l.tag].dur += l.durationSec || 0;
    });
    const dist = Object.keys(tagMap)
      .map((tag) => ({ tag, count: tagMap[tag].count, dur: tagMap[tag].dur }))
      .sort((a, b) => b.dur - a.dur);
    const distMax = (dist[0] && dist[0].count) || 1;
    const breathAllMin = Math.floor(breathLogs.reduce((x, l) => x + (l.durationSec || 0), 0) / 60);
    const distRows = dist.slice(0, 6).map((t) => ({
      tag: t.tag,
      count: t.count,
      durMin: Math.floor(t.dur / 60),
      pct: Math.round((t.count / distMax) * 100),
      color: colorOf(Object.keys(tagMap), t.tag),
    }));

    // ---- 近30天 ----
    const monthAffirm = affirmLogs.filter((l) => now - (l.timestamp || now) <= MONTH_MS);
    const monthBreath = breathLogs.filter((l) => now - (l.timestamp || now) <= MONTH_MS);
    const monthCount = monthAffirm.reduce((x, l) => x + (l.count || 0), 0);
    const monthDur = monthAffirm.reduce((x, l) => x + (l.durationSec || 0), 0);
    const monthBreathMin = Math.floor(monthBreath.reduce((x, l) => x + (l.durationSec || 0), 0) / 60);

    // 热力图：最近30天 逐日 map（含呼吸日）→ 取当日 count 最大 tag
    const dayMap = {};
    logs.forEach((l) => {
      const cur = dayMap[l.date];
      if (!cur || (l.count || 0) > cur.count) {
        dayMap[l.date] = { tag: l.tag, count: l.count || 0 };
      }
    });
    const heatTags = [];
    logs.forEach((l) => {
      if (heatTags.indexOf(l.tag) < 0) heatTags.push(l.tag);
    });
    const heatLegend = heatTags.map((t) => ({ tag: t, color: colorOf(heatTags, t) }));
    const cells = util.heatCells(30);
    const heat = cells.map((c) => {
      if (c.pad) return { date: '', day: 0, pad: true, has: false, tag: '', count: 0, color: '#fff' };
      const hit = dayMap[c.date];
      return {
        date: c.date,
        day: c.day,
        pad: false,
        has: !!hit,
        tag: hit ? hit.tag : '',
        count: hit ? hit.count : 0,
        color: hit ? colorOf(heatTags, hit.tag) : 'rgba(255,255,255,0)',
      };
    });

    // 饼图（近30天 duration 分配）
    const mTagMap = {};
    monthAffirm.forEach((l) => {
      mTagMap[l.tag] = mTagMap[l.tag] || { count: 0, dur: 0 };
      mTagMap[l.tag].count += l.count || 0;
      mTagMap[l.tag].dur += l.durationSec || 0;
    });
    const monthTags = Object.keys(mTagMap)
      .map((tag) => ({ tag, count: mTagMap[tag].count, dur: mTagMap[tag].dur }))
      .sort((a, b) => b.dur - a.dur);
    const pieTotal = monthTags.reduce((x, t) => x + t.dur, 0);
    let showPie = pieTotal > 0;
    const pie = [];
    if (showPie) {
      const keys = monthTags.map((t) => t.tag);
      monthTags.forEach((t) => pie.push({ tag: t.tag, color: colorOf(keys, t.tag), dur: t.dur }));
    }
    const pieRows = showPie
      ? monthTags.map((t) => ({
          tag: t.tag,
          color: colorOf(monthTags.map((x) => x.tag), t.tag),
          min: Math.floor(t.dur / 60),
          count: t.count,
          pct: Math.round((t.dur / pieTotal) * 100),
        }))
      : [];

    this.setData(
      {
        allCount,
        allMin: Math.floor(allDur / 60),
        breathAllMin,
        distRows,
        monthCount,
        monthMin: Math.floor(monthDur / 60),
        monthBreathMin,
        heat,
        heatTags,
        heatLegend,
        showPie,
        pie,
        pieRows,
        heatWeek: WEEK,
      },
      () => {
        if (showPie) this._drawPie();
      },
    );
  },

  /* ---------- 饼图 canvas ---------- */
  _drawPie() {
    const data = this.data.pie;
    if (!data || !data.length) return;
    const query = this.createSelectorQuery();
    query
      .select('#pie')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return;
        const { node, size } = res[0];
        let dpr = 2;
        try {
          dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2;
        } catch (e) { /* noop */ }
        node.width = size.width * dpr;
        node.height = size.height * dpr;
        const ctx = node.getContext('2d');
        ctx.scale(dpr, dpr);
        const total = data.reduce((x, d) => x + d.dur, 0);
        if (!total) return;
        const cx = size.width / 2;
        const cy = size.height / 2;
        const r = Math.min(size.width, size.height) / 2 - 8;
        ctx.clearRect(0, 0, size.width, size.height);
        let acc = 0;
        data.forEach((d) => {
          const frac = d.dur / total;
          const a0 = acc * Math.PI * 2 - Math.PI / 2;
          const a1 = (acc + frac) * Math.PI * 2 - Math.PI / 2;
          acc += frac;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, a0, a1);
          ctx.closePath();
          ctx.fillStyle = d.color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.5)';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      });
  },

  /* ---------- 单日明细 ---------- */
  openDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    const logs = store.getLogs().filter((l) => l.date === date);
    if (!logs.length) {
      wx.showToast({ title: '当天暂无记录', icon: 'none' });
      return;
    }
    const affirm = logs.filter((l) => (l.kind || 'affirm') === 'affirm');
    const breath = logs.filter((l) => l.kind === 'breath');
    const count = affirm.reduce((x, l) => x + (l.count || 0), 0);
    const min = Math.floor(affirm.reduce((x, l) => x + (l.durationSec || 0), 0) / 60);
    const breathMin = Math.floor(breath.reduce((x, l) => x + (l.durationSec || 0), 0) / 60);
    const m = {};
    affirm.forEach((l) => {
      m[l.tag] = m[l.tag] || { count: 0, dur: 0 };
      m[l.tag].count += l.count || 0;
      m[l.tag].dur += l.durationSec || 0;
    });
    const rows = Object.keys(m)
      .map((tag) => ({ tag, ...m[tag], color: colorOf(Object.keys(m), tag) }))
      .sort((a, b) => b.count - a.count)
      .map((t) => ({ tag: t.tag, color: t.color, min: Math.floor(t.dur / 60), count: t.count }));
    this.setData({ dayVisible: true, day: { date, count, min, breathMin, rows } });
  },
  closeDay() {
    this.setData({ dayVisible: false });
  },
  noop() {},
});
