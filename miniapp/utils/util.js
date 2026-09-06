/** util.js —— 通用格式化工具 */

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** 秒 -> mm:ss 或 hh:mm:ss */
function fmtClock(secs, forceHours) {
  const s = Math.max(0, Math.floor(secs));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const showH = forceHours || hh > 0;
  return showH ? pad(hh) + ':' + pad(mm) + ':' + pad(ss) : pad(mm) + ':' + pad(ss);
}

/** 分钟展示（向下取整） */
function fmtMin(secs) {
  return Math.floor((secs || 0) / 60);
}

/** 本地日期 key YYYY-MM-DD */
function dateKey(d) {
  const x = d || new Date();
  return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}

/** 生成近 N 天热力图网格：返回 {date, day, pad} 数组（pad 为周起始占位） */
function heatCells(nDays) {
  const cells = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(today);
  start.setDate(start.getDate() - (nDays - 1));
  const padStart = start.getDay();
  for (let i = 0; i < padStart; i++) cells.push({ date: '', day: 0, pad: true });
  for (let i = 0; i < nDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push({ date: dateKey(d), day: d.getDate(), pad: false });
  }
  return cells;
}

module.exports = { pad, fmtClock, fmtMin, dateKey, heatCells };
