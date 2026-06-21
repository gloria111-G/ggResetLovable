import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, ListChecks, BarChart3, Settings as SettingsIcon } from "lucide-react";
import { Disclaimer } from "@/components/AppShell";

export const Route = createFileRoute("/")({
  component: Home,
});

const tiles = [
  { to: "/focus", label: "进入专注", sub: "Affirm · Breathe", Icon: Sparkles },
  { to: "/manifest", label: "显化列表", sub: "你会得到", Icon: ListChecks },
  { to: "/data", label: "数据中心", sub: "Insights", Icon: BarChart3 },
  { to: "/settings", label: "设置", sub: "Preferences", Icon: SettingsIcon },
] as const;

function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
        <div className="text-center mb-14">
          <p className="text-xs tracking-[0.4em] opacity-60 mb-3">REST · RESET · RECEIVE</p>
          <h1 className="font-display text-6xl md:text-7xl tracking-tight">GG RESET</h1>
          <p className="mt-4 text-sm opacity-70 max-w-md mx-auto">
            一个安静的角落，用呼吸、肯定语与显化，让神经系统回到松弛的轨道。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:gap-6 w-full max-w-2xl">
          {tiles.map(({ to, label, sub, Icon }) => (
            <Link
              key={to}
              to={to}
              className="glass glass-hover rounded-3xl p-8 md:p-10 flex flex-col items-start justify-between aspect-[4/3] group"
            >
              <Icon className="size-7 opacity-80 group-hover:scale-110 transition-transform" />
              <div>
                <p className="text-xs tracking-widest opacity-50 mb-1">{sub}</p>
                <p className="text-xl md:text-2xl font-display">{label}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <Disclaimer />
    </div>
  );
}
