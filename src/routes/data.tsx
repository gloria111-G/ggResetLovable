import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import { useLocal, type FocusLog } from "@/lib/storage";
import { X } from "lucide-react";

export const Route = createFileRoute("/data")({
  head: () => ({ meta: [{ title: "数据中心 · GG RESET" }] }),
  component: DataPage,
});

const TAG_COLORS = [
  "#7FB3D5",
  "#A9DFBF",
  "#F9E79F",
  "#D2B4DE",
  "#F5CBA7",
  "#AED6F1",
  "#F1948A",
  "#F5B7B1",
];

function DataPage() {
  const [logs] = useLocal<FocusLog[]>("gg_focus_logs", []);

  const affirmLogs = useMemo(() => logs.filter((l) => (l.kind ?? "affirm") === "affirm"), [logs]);
  const breathLogs = useMemo(() => logs.filter((l) => l.kind === "breath"), [logs]);

  const stats = useMemo(() => {
    const sumAll = () => {
      const count = affirmLogs.reduce((s, l) => s + l.count, 0);
      const dur = affirmLogs.reduce((s, l) => s + l.durationSec, 0);
      const tagMap = new Map<string, { count: number; dur: number }>();
      affirmLogs.forEach((l) => {
        const cur = tagMap.get(l.tag) || { count: 0, dur: 0 };
        tagMap.set(l.tag, { count: cur.count + l.count, dur: cur.dur + l.durationSec });
      });
      const tags = Array.from(tagMap.entries())
        .map(([tag, v]) => ({ tag, ...v }))
        .sort((a, b) => b.dur - a.dur);
      return { count, dur, tags };
    };
    const breathAll = breathLogs.reduce((s, l) => s + l.durationSec, 0);
    // 30-day slice for the pie chart (kept short as before)
    const month = 30 * 86400_000;
    const now = Date.now();
    const monthArr = affirmLogs.filter((l) => now - l.timestamp <= month);
    const monthTagMap = new Map<string, { count: number; dur: number }>();
    monthArr.forEach((l) => {
      const cur = monthTagMap.get(l.tag) || { count: 0, dur: 0 };
      monthTagMap.set(l.tag, { count: cur.count + l.count, dur: cur.dur + l.durationSec });
    });
    const monthTags = Array.from(monthTagMap.entries())
      .map(([tag, v]) => ({ tag, ...v }))
      .sort((a, b) => b.dur - a.dur);
    const breathMonth = breathLogs
      .filter((l) => now - l.timestamp <= month)
      .reduce((s, l) => s + l.durationSec, 0);

    return {
      all: sumAll(),
      breathAll,
      monthTags,
      monthAffirm: {
        count: monthArr.reduce((s, l) => s + l.count, 0),
        dur: monthArr.reduce((s, l) => s + l.durationSec, 0),
      },
      breathMonth,
    };
  }, [affirmLogs, breathLogs]);

  return (
    <AppShell title="数据中心">
      <div className="grid gap-6">
        <TotalCard data={stats.all} breathSec={stats.breathAll} />
        <MonthCard
          data={stats.monthAffirm}
          monthTags={stats.monthTags}
          breathSec={stats.breathMonth}
          logs={logs}
        />
      </div>
    </AppShell>
  );
}


type AggTag = { tag: string; count: number; dur: number };

function WeekCard({
  data,
  breathSec,
}: {
  data: { count: number; dur: number; tags: AggTag[] };
  breathSec: number;
}) {
  const minutes = Math.floor(data.dur / 60);
  const breathMin = Math.floor(breathSec / 60);
  const max = data.tags[0]?.count || 1;
  return (
    <GlassCard>
      <p className="text-xs tracking-widest opacity-50 mb-3">近 7 天</p>
      <div className="flex flex-wrap items-end gap-6 mb-6">
        <div>
          <p className="font-display text-5xl tabular-nums">{data.count}</p>
          <p className="text-xs opacity-60 mt-1">次肯定语</p>
        </div>
        <div>
          <p className="font-display text-5xl tabular-nums">{minutes}</p>
          <p className="text-xs opacity-60 mt-1">分钟专注</p>
        </div>
        <div>
          <p className="font-display text-5xl tabular-nums">{breathMin}</p>
          <p className="text-xs opacity-60 mt-1">分钟 · 神经系统调节</p>
        </div>
      </div>
      <div>
        <p className="text-xs opacity-60 mb-2">主题分布</p>
        {data.tags.length === 0 && (
          <p className="text-xs opacity-50">还没有数据，去专注一次吧。</p>
        )}
        <div className="space-y-2">
          {data.tags.slice(0, 6).map((t) => (
            <div key={t.tag} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0">#{t.tag}</span>
              <div className="flex-1 h-2 glass rounded-full overflow-hidden">
                <div
                  className="h-full bg-current opacity-40"
                  style={{ width: `${(t.count / max) * 100}%` }}
                />
              </div>
              <span className="tabular-nums w-8 text-right">{t.count}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

function MonthCard({
  data,
  breathSec,
  logs,
}: {
  data: { count: number; dur: number; tags: AggTag[] };
  breathSec: number;
  logs: FocusLog[];
}) {
  const totalMin = Math.floor(data.dur / 60);
  const breathMin = Math.floor(breathSec / 60);
  return (
    <GlassCard>
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <p className="text-xs tracking-widest opacity-50">近 30 天</p>
        <p className="text-xs opacity-60">
          <span className="font-display text-lg tabular-nums mr-1">{data.count}</span>次 ·
          <span className="font-display text-lg tabular-nums mx-1">{totalMin}</span>分钟 ·
          <span className="font-display text-lg tabular-nums mx-1">{breathMin}</span>分钟呼吸
        </p>
      </div>
      <div className="grid md:grid-cols-2 gap-6">
        <CalendarHeat logs={logs} />
        <PieChart tags={data.tags} />
      </div>
    </GlassCard>
  );
}

function CalendarHeat({ logs }: { logs: FocusLog[] }) {
  const days: { date: string; tag?: string; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const map = new Map<string, { tag: string; count: number }>();
  logs.forEach((l) => {
    const cur = map.get(l.date);
    if (!cur || l.count > cur.count) map.set(l.date, { tag: l.tag, count: l.count });
  });
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  const padStart = start.getDay();
  for (let i = 0; i < padStart; i++) days.push({ date: "", count: 0 });
  for (let i = 0; i < 30; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const hit = map.get(key);
    days.push({ date: key, tag: hit?.tag, count: hit?.count || 0 });
  }
  const allTags = Array.from(new Set(logs.map((l) => l.tag)));
  const colorFor = (tag?: string) =>
    tag ? TAG_COLORS[allTags.indexOf(tag) % TAG_COLORS.length] : undefined;

  return (
    <div>
      <p className="text-xs opacity-60 mb-2">打卡日历</p>
      <div className="grid grid-cols-7 gap-1 text-[10px] opacity-50 mb-1">
        {["日", "一", "二", "三", "四", "五", "六"].map((d) => (
          <div key={d} className="text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d, i) => {
          if (!d.date) return <div key={i} className="aspect-square" />;
          const dayNum = Number(d.date.slice(8, 10));
          const c = colorFor(d.tag);
          return (
            <div
              key={i}
              className="aspect-square rounded-lg glass flex items-center justify-center text-[10px] relative"
              style={c ? { background: c + "55", borderColor: c } : undefined}
              title={d.tag ? `${d.date} · #${d.tag} · ${d.count}` : d.date}
            >
              <span className={d.tag ? "font-medium" : "opacity-50"}>{dayNum}</span>
            </div>
          );
        })}
      </div>
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {allTags.map((t) => (
            <span key={t} className="flex items-center gap-1 text-[10px] opacity-70">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: colorFor(t) }}
              />
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PieChart({ tags }: { tags: AggTag[] }) {
  const total = tags.reduce((s, t) => s + t.dur, 0);
  if (total === 0) {
    return (
      <div>
        <p className="text-xs opacity-60 mb-2">时间分配</p>
        <p className="text-xs opacity-50">还没有数据。</p>
      </div>
    );
  }
  const radius = 70;
  const cx = 80;
  const cy = 80;
  let acc = 0;
  const slices = tags.map((t, i) => {
    const frac = t.dur / total;
    const start = acc;
    const end = acc + frac;
    acc = end;
    const a0 = start * Math.PI * 2 - Math.PI / 2;
    const a1 = end * Math.PI * 2 - Math.PI / 2;
    const x0 = cx + radius * Math.cos(a0);
    const y0 = cy + radius * Math.sin(a0);
    const x1 = cx + radius * Math.cos(a1);
    const y1 = cy + radius * Math.sin(a1);
    const large = frac > 0.5 ? 1 : 0;
    const d = `M ${cx} ${cy} L ${x0} ${y0} A ${radius} ${radius} 0 ${large} 1 ${x1} ${y1} Z`;
    return { d, color: TAG_COLORS[i % TAG_COLORS.length], tag: t };
  });
  return (
    <div>
      <p className="text-xs opacity-60 mb-2">时间分配</p>
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 160 160" className="size-40 shrink-0">
          {slices.map((s, i) => (
            <path key={i} d={s.d} fill={s.color} stroke="rgba(255,255,255,0.4)" strokeWidth={1} />
          ))}
        </svg>
        <div className="flex-1 space-y-1.5 text-xs">
          {slices.map((s) => {
            const min = Math.floor(s.tag.dur / 60);
            const pct = Math.round((s.tag.dur / total) * 100);
            return (
              <div key={s.tag.tag} className="flex items-center gap-2">
                <span
                  className="inline-block size-2.5 rounded-sm shrink-0"
                  style={{ background: s.color }}
                />
                <span className="flex-1 truncate">#{s.tag.tag}</span>
                <span className="tabular-nums opacity-70">{min}分</span>
                <span className="tabular-nums opacity-70">×{s.tag.count}</span>
                <span className="tabular-nums opacity-50 w-8 text-right">{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
