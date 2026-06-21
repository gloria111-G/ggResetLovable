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
      const tagMap = new Map<string, number>();
      arr.forEach((l) => tagMap.set(l.tag, (tagMap.get(l.tag) || 0) + l.count));
      const tags = Array.from(tagMap.entries()).sort((a, b) => b[1] - a[1]);
      return { count, dur, tags };
    };

    return { week: sum(week), month: sum(month) };
  }, [logs]);

  return (
    <AppShell title="数据中心">
      <div className="grid gap-6">
        <div className="grid md:grid-cols-2 gap-6">
          <StatCard title="近 7 天" data={stats.week} />
          <StatCard title="近 30 天" data={stats.month} />
        </div>

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

function StatCard({
  title,
  data,
}: {
  title: string;
  data: { count: number; dur: number; tags: [string, number][] };
}) {
  const minutes = Math.floor(data.dur / 60);
  const max = data.tags[0]?.[1] || 1;
  return (
    <GlassCard>
      <p className="text-xs tracking-widest opacity-50 mb-3">{title}</p>
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
          {data.tags.slice(0, 6).map(([tag, n]) => (
            <div key={tag} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0">#{tag}</span>
              <div className="flex-1 h-2 glass rounded-full overflow-hidden">
                <div
                  className="h-full bg-current opacity-40"
                  style={{ width: `${(n / max) * 100}%` }}
                />
              </div>
              <span className="tabular-nums w-8 text-right">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
