import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import { useLocal, type FocusLog } from "@/lib/storage";

export const Route = createFileRoute("/data")({
  head: () => ({ meta: [{ title: "数据中心 · GG RESET" }] }),
  component: DataPage,
});

const TIPS = [
  {
    title: "迷走神经的温柔启动",
    body: "用冰水轻拍面颊或含一口冰水，能快速激活迷走神经，帮助身体从紧绷切回松弛模式。",
  },
  {
    title: "4-7-8 呼吸",
    body: "吸气 4 秒、屏息 7 秒、呼气 8 秒。重复 4 组，副交感神经会接管，焦虑感会自然下降。",
  },
  {
    title: "哼鸣 (Humming)",
    body: "闭上嘴轻轻哼一段 30 秒，喉部震动会刺激迷走神经，舒缓焦虑与心率。",
  },
  {
    title: "20 秒拥抱",
    body: "一个超过 20 秒的拥抱（或自我拥抱）会释放催产素，让神经系统感觉「我是安全的」。",
  },
  {
    title: "Grounding 5-4-3-2-1",
    body: "说出 5 个看到、4 个听到、3 个触到、2 个闻到、1 个尝到的东西，把自己带回当下。",
  },
];

const TAG_COLORS = [
  "#7FB3D5",
  "#F5B7B1",
  "#A9DFBF",
  "#F9E79F",
  "#D2B4DE",
  "#F5CBA7",
  "#AED6F1",
  "#F1948A",
];

function DataPage() {
  const [logs] = useLocal<FocusLog[]>("gg_focus_logs", []);

  const stats = useMemo(() => {
    const now = Date.now();
    const week = 7 * 86400_000;
    const month = 30 * 86400_000;

    const sum = (range: number) => {
      const arr = logs.filter((l) => now - l.timestamp <= range);
      const count = arr.reduce((s, l) => s + l.count, 0);
      const dur = arr.reduce((s, l) => s + l.durationSec, 0);
      const tagMap = new Map<string, { count: number; dur: number }>();
      arr.forEach((l) => {
        const cur = tagMap.get(l.tag) || { count: 0, dur: 0 };
        tagMap.set(l.tag, { count: cur.count + l.count, dur: cur.dur + l.durationSec });
      });
      const tags = Array.from(tagMap.entries())
        .map(([tag, v]) => ({ tag, ...v }))
        .sort((a, b) => b.dur - a.dur);
      return { count, dur, tags };
    };

    return { week: sum(week), month: sum(month) };
  }, [logs]);

  return (
    <AppShell title="数据中心">
      <div className="grid gap-6">
        <WeekCard data={stats.week} />
        <MonthCard data={stats.month} logs={logs} />

        <GlassCard>
          <h2 className="font-display text-2xl mb-4">神经系统调节 · Tips</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {TIPS.map((t) => (
              <div key={t.title} className="glass rounded-2xl p-4">
                <p className="font-display text-lg mb-1">{t.title}</p>
                <p className="text-xs opacity-75 leading-relaxed">{t.body}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </AppShell>
  );
}

type AggTag = { tag: string; count: number; dur: number };

function WeekCard({ data }: { data: { count: number; dur: number; tags: AggTag[] } }) {
  const minutes = Math.floor(data.dur / 60);
  const max = data.tags[0]?.count || 1;
  return (
    <GlassCard>
      <p className="text-xs tracking-widest opacity-50 mb-3">近 7 天</p>
      <div className="flex items-end gap-6 mb-6">
        <div>
          <p className="font-display text-5xl tabular-nums">{data.count}</p>
          <p className="text-xs opacity-60 mt-1">次肯定语</p>
        </div>
        <div>
          <p className="font-display text-5xl tabular-nums">{minutes}</p>
          <p className="text-xs opacity-60 mt-1">分钟专注</p>
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
  logs,
}: {
  data: { count: number; dur: number; tags: AggTag[] };
  logs: FocusLog[];
}) {
  const totalMin = Math.floor(data.dur / 60);
  return (
    <GlassCard>
      <div className="flex items-baseline justify-between mb-4">
        <p className="text-xs tracking-widest opacity-50">近 30 天</p>
        <p className="text-xs opacity-60">
          <span className="font-display text-lg tabular-nums mr-1">{data.count}</span>次 ·
          <span className="font-display text-lg tabular-nums mx-1">{totalMin}</span>分钟
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
  // build 30-day grid ending today
  const days: { date: string; tag?: string; count: number }[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const map = new Map<string, { tag: string; count: number }>();
  logs.forEach((l) => {
    const cur = map.get(l.date);
    if (!cur || l.count > cur.count) map.set(l.date, { tag: l.tag, count: l.count });
  });
  // calendar grid for the current month + previous to fill 30
  const start = new Date(today);
  start.setDate(start.getDate() - 29);
  // pad to start on Sunday
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
          <div key={d} className="text-center">{d}</div>
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
