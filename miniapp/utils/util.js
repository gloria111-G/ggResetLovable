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

/**
 * 宽松修复 Web 端导出 / 复制粘贴过程中损坏的 JSON 字符串。
 * 处理场景：
 *   1. 前后空格、BOM、零宽字符；
 *   2. 缺失最外层 {}；
 *   3. 字符串内出现未转义的换行/回车/制表符（复制大文本时常见）；
 *   4. 对象/数组尾逗号；
 *   5. 中文引号、智能引号替换成标准英文引号。
 * 注意：本函数只做「机械修复」，无法处理结构性缺损（如缺半边引号）。
 */
function repairJsonString(str) {
  if (!str || typeof str !== 'string') return '{}';
  let s = str.replace(/^\uFEFF/, '').trim();
  if (!s) return '{}';

  // 补齐外层花括号
  if (!s.startsWith('{')) s = '{' + s;
  if (!s.endsWith('}')) s = s + '}';

  // 中文/智能引号 → 英文引号
  s = s
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");

  // 去掉对象/数组尾逗号
  s = s.replace(/,\s*([\]\}])/g, '$1');

  // 修复字符串内未转义的换行/回车/制表符（仅处理双引号字符串内部）
  // 匹配规则：从 " 开始，到下一个未转义的 " 结束；中间允许 \" 或 \\
  s = s.replace(/"(?:[^"\\]|\\.)*"/g, (match) => {
    return match
      .replace(/\r\n/g, '\\n')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t');
  });

  return s;
}

module.exports = { pad, fmtClock, fmtMin, dateKey, heatCells, repairJsonString };
