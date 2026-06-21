import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import { useApp, playFeedback } from "@/lib/app-context";
import { useLocal, type Affirmation, type FocusLog, DEFAULT_TAGS, uid, todayKey } from "@/lib/storage";
import { Play, Pause, RotateCcw, Shuffle, Target, Plus, Minus } from "lucide-react";

export const Route = createFileRoute("/focus")({
  head: () => ({
    meta: [{ title: "进入专注 · GG RESET" }],
  }),
  component: FocusPage,
});

function FocusPage() {
  const { settings } = useApp();
  const [affirmations] = useLocal<Affirmation[]>("gg_affirmations", []);
  const [, setLogs] = useLocal<FocusLog[]>("gg_focus_logs", []);
  const [, setAffs] = useLocal<Affirmation[]>("gg_affirmations", []);

  const tags = useMemo(() => {
    const set = new Set<string>(DEFAULT_TAGS);
    affirmations.forEach((a) => set.add(a.tag));
    return Array.from(set);
  }, [affirmations]);

  const [mode, setMode] = useState<"random" | "single">("random");
  const [selectedTag, setSelectedTag] = useState<string>(tags[0] ?? "自我概念");
  const [selectedAff, setSelectedAff] = useState<string | null>(null);

  const [count, setCount] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const startedAtRef = useRef<number>(0);

  // timer
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // auto count
  useEffect(() => {
    if (!running || !settings.autoCountInterval) return;
    const id = setInterval(() => {
      doCount();
    }, settings.autoCountInterval * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, settings.autoCountInterval]);

  const filteredAffs = useMemo(
    () => affirmations.filter((a) => a.tag === selectedTag),
    [affirmations, selectedTag],
  );

  const currentAff = useMemo(() => {
    if (mode === "single") return affirmations.find((a) => a.id === selectedAff) || null;
    return null;
  }, [mode, affirmations, selectedAff]);

  function doCount() {
    setCount((c) => c + 1);
    playFeedback(settings);
    // bump affirmation count if single mode
    if (mode === "single" && selectedAff) {
      setAffs((prev) =>
        prev.map((a) => (a.id === selectedAff ? { ...a, count: a.count + 1 } : a)),
      );
    }
  }

  function start() {
    if (!running) startedAtRef.current = Date.now();
    setRunning(true);
  }
  function pause() {
    setRunning(false);
    saveLog();
  }
  function reset() {
    if (running || count > 0 || seconds > 0) saveLog();
    setCount(0);
    setSeconds(0);
    setRunning(false);
  }
  function saveLog() {
    if (count === 0 && seconds === 0) return;
    const log: FocusLog = {
      id: uid(),
      date: todayKey(),
      tag: selectedTag,
      affirmationId: mode === "single" ? selectedAff || undefined : undefined,
      count,
      durationSec: seconds,
      timestamp: Date.now(),
    };
    setLogs((prev) => [log, ...prev]);
  }

  useEffect(() => {
    return () => {
      // on unmount, save
    };
  }, []);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <AppShell title="进入专注">
      <div className="grid gap-6">
        {/* Mode + tag */}
        <GlassCard>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button
              onClick={() => setMode("random")}
              className={`glass-hover rounded-full px-4 py-2 text-sm flex items-center gap-2 ${
                mode === "random" ? "glass-strong" : "glass"
              }`}
            >
              <Shuffle className="size-4" /> 随机模式
            </button>
            <button
              onClick={() => setMode("single")}
              className={`glass-hover rounded-full px-4 py-2 text-sm flex items-center gap-2 ${
                mode === "single" ? "glass-strong" : "glass"
              }`}
            >
              <Target className="size-4" /> 专一模式
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setSelectedTag(t);
                  setSelectedAff(null);
                }}
                className={`rounded-full px-3 py-1.5 text-xs ${
                  selectedTag === t ? "glass-strong" : "glass"
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
          {mode === "single" && (
            <div className="mt-4 space-y-2">
              {filteredAffs.length === 0 && (
                <p className="text-sm opacity-60">
                  此标签下还没有肯定语，先去「显化列表」添加一条吧。
                </p>
              )}
              {filteredAffs.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAff(a.id)}
                  className={`w-full text-left rounded-2xl px-4 py-3 text-sm ${
                    selectedAff === a.id ? "glass-strong" : "glass"
                  }`}
                >
                  {a.text}
                </button>
              ))}
            </div>
          )}
        </GlassCard>

        {/* Affirmation display */}
        <GlassCard className="text-center py-12">
          {mode === "random" ? (
            <>
              <p className="text-xs tracking-widest opacity-50 mb-3">专注于</p>
              <p className="font-display text-4xl md:text-5xl">#{selectedTag}</p>
            </>
          ) : currentAff ? (
            <p className="font-display text-2xl md:text-3xl leading-relaxed">
              "{currentAff.text}"
            </p>
          ) : (
            <p className="opacity-60 text-sm">请选择一条肯定语</p>
          )}
        </GlassCard>

        {/* Timer + breathing */}
        <GlassCard className="flex flex-col items-center py-10">
          <div className="text-5xl font-display tabular-nums mb-6 tracking-wider">
            {mm}:{ss}
          </div>
          {settings.showBreath && settings.breathMode !== "off" && (
            <BreathBall running={running} />
          )}
          <div className="flex gap-3 mt-8">
            {!running ? (
              <button
                onClick={start}
                className="glass glass-hover rounded-full px-6 py-3 text-sm flex items-center gap-2"
              >
                <Play className="size-4" /> 开始
              </button>
            ) : (
              <button
                onClick={pause}
                className="glass glass-hover rounded-full px-6 py-3 text-sm flex items-center gap-2"
              >
                <Pause className="size-4" /> 暂停
              </button>
            )}
            <button
              onClick={reset}
              className="glass glass-hover rounded-full px-6 py-3 text-sm flex items-center gap-2"
            >
              <RotateCcw className="size-4" /> 结束并保存
            </button>
          </div>
        </GlassCard>

        {/* Counter */}
        {settings.showCounter && (
          <GlassCard className="text-center py-10">
            <p className="text-xs tracking-widest opacity-50 mb-3">今日计数</p>
            <button
              onClick={doCount}
              className="glass-strong glass-hover rounded-full size-44 mx-auto flex items-center justify-center"
            >
              <span className="font-display text-6xl tabular-nums">{count}</span>
            </button>
            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={() => setCount((c) => Math.max(0, c - 1))}
                className="glass glass-hover rounded-full size-10 flex items-center justify-center"
              >
                <Minus className="size-4" />
              </button>
              <button
                onClick={doCount}
                className="glass glass-hover rounded-full size-10 flex items-center justify-center"
              >
                <Plus className="size-4" />
              </button>
            </div>
            {settings.autoCountInterval > 0 && running && (
              <p className="text-xs opacity-60 mt-4">
                自动计数中：每 {settings.autoCountInterval} 秒 +1
              </p>
            )}
          </GlassCard>
        )}
      </div>
    </AppShell>
  );
}

function BreathBall({ running }: { running: boolean }) {
  const { settings } = useApp();
  // phases
  const phases =
    settings.breathMode === "box"
      ? [
          { label: "吸气", sec: 4 },
          { label: "屏息", sec: 4 },
          { label: "呼气", sec: 4 },
          { label: "屏息", sec: 4 },
        ]
      : settings.breathMode === "478"
        ? [
            { label: "吸气", sec: 4 },
            { label: "屏息", sec: 7 },
            { label: "呼气", sec: 8 },
          ]
        : [
            { label: "吸气", sec: settings.customBreath.inhale },
            { label: "屏息", sec: settings.customBreath.hold1 },
            { label: "呼气", sec: settings.customBreath.exhale },
            { label: "屏息", sec: settings.customBreath.hold2 },
          ].filter((p) => p.sec > 0);

  const total = phases.reduce((s, p) => s + p.sec, 0);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((x) => (x + 0.1) % total), 100);
    return () => clearInterval(id);
  }, [running, total]);

  // determine current phase + progress
  let acc = 0;
  let current = phases[0];
  let phaseT = 0;
  for (const p of phases) {
    if (t < acc + p.sec) {
      current = p;
      phaseT = t - acc;
      break;
    }
    acc += p.sec;
  }

  let scale = 0.55;
  if (current.label === "吸气") scale = 0.55 + (phaseT / current.sec) * 0.45;
  else if (current.label === "呼气") scale = 1 - (phaseT / current.sec) * 0.45;
  else scale = current.label === "屏息" && phases.indexOf(current) === 1 ? 1 : 0.55;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative size-48 flex items-center justify-center">
        <div
          className="absolute inset-0 rounded-full glass-strong"
          style={{
            transform: `scale(${scale})`,
            transition: "transform 0.1s linear",
            background:
              "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.6), rgba(120,180,220,0.35))",
          }}
        />
        <span className="relative font-display text-lg opacity-80">
          {running ? current.label : "准备"}
        </span>
      </div>
    </div>
  );
}
