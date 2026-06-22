import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import { useApp, playFeedback } from "@/lib/app-context";
import {
  useLocal,
  type Affirmation,
  type FocusLog,
  DEFAULT_TAGS,
  uid,
  todayKey,
} from "@/lib/storage";
import { Play, Pause, RotateCcw, Shuffle, Target, Plus } from "lucide-react";

export const Route = createFileRoute("/focus")({
  head: () => ({
    meta: [{ title: "进入专注 · GG RESET" }],
  }),
  component: FocusPage,
});

const DURATION_OPTIONS = [60, 180, 300, 600, 900, 1200, 1800, 2700, 3600];

function FocusPage() {
  const { settings, setSettings } = useApp();
  const [affirmations] = useLocal<Affirmation[]>("gg_affirmations", []);
  const [logs, setLogs] = useLocal<FocusLog[]>("gg_focus_logs", []);
  const [, setAffs] = useLocal<Affirmation[]>("gg_affirmations", []);

  const tags = useMemo(() => {
    const set = new Set<string>(DEFAULT_TAGS);
    affirmations.forEach((a) => set.add(a.tag));
    return Array.from(set);
  }, [affirmations]);

  const [mode, setMode] = useState<"random" | "single">("random");
  const [selectedTag, setSelectedTag] = useState<string>(tags[0] ?? "自我概念");
  const [selectedAff, setSelectedAff] = useState<string | null>(null);

  // countdown
  const [duration, setDuration] = useState<number>(settings.focusDuration || 300);
  const [remaining, setRemaining] = useState<number>(duration);
  const [running, setRunning] = useState(false);
  const elapsedRef = useRef(0);
  const countRef = useRef(0);

  const [count, setCount] = useState(0);
  const [autoOn, setAutoOn] = useState(false);

  useEffect(() => {
    setRemaining(duration);
    setSettings((s) => ({ ...s, focusDuration: duration }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  // countdown ticker
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          finish();
          return 0;
        }
        return r - 1;
      });
      elapsedRef.current += 1;
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  // auto count
  useEffect(() => {
    if (!running || !settings.autoCountEnabled || !autoOn) return;
    const id = setInterval(
      () => doCount(),
      Math.max(0.2, settings.autoCountInterval) * 1000,
    );
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, autoOn, settings.autoCountEnabled, settings.autoCountInterval]);

  // keyboard counter
  useEffect(() => {
    if (!settings.keyboardCounter) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === " " || e.key === "Enter") {
        if (
          (e.target as HTMLElement)?.tagName === "INPUT" ||
          (e.target as HTMLElement)?.tagName === "TEXTAREA"
        )
          return;
        e.preventDefault();
        doCount();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.keyboardCounter, mode, selectedAff, selectedTag]);

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
    countRef.current += 1;
    playFeedback(settings);
    if (mode === "single" && selectedAff) {
      setAffs((prev) =>
        prev.map((a) => (a.id === selectedAff ? { ...a, count: a.count + 1 } : a)),
      );
    }
  }

  function start() {
    if (remaining === 0) setRemaining(duration);
    setRunning(true);
  }
  function pause() {
    setRunning(false);
  }
  function finish() {
    setRunning(false);
    saveLog();
    elapsedRef.current = 0;
    countRef.current = 0;
    setCount(0);
    setRemaining(duration);
  }
  function reset() {
    if (elapsedRef.current > 0 || countRef.current > 0) saveLog();
    elapsedRef.current = 0;
    countRef.current = 0;
    setCount(0);
    setRemaining(duration);
    setRunning(false);
  }
  function saveLog() {
    if (elapsedRef.current === 0 && countRef.current === 0) return;
    const log: FocusLog = {
      id: uid(),
      date: todayKey(),
      tag: selectedTag,
      affirmationId: mode === "single" ? selectedAff || undefined : undefined,
      count: countRef.current,
      durationSec: elapsedRef.current,
      timestamp: Date.now(),
    };
    setLogs([log, ...logs]);
  }

  // today's count for display
  const todayCount = useMemo(() => {
    const td = todayKey();
    if (settings.counterMode === "total") {
      if (mode === "single" && currentAff) return currentAff.count + count;
      return logs.filter((l) => l.tag === selectedTag).reduce((s, l) => s + l.count, 0) + count;
    }
    if (mode === "single" && selectedAff) {
      return (
        logs
          .filter((l) => l.date === td && l.affirmationId === selectedAff)
          .reduce((s, l) => s + l.count, 0) + count
      );
    }
    return (
      logs
        .filter((l) => l.date === td && l.tag === selectedTag)
        .reduce((s, l) => s + l.count, 0) + count
    );
  }, [logs, count, settings.counterMode, mode, currentAff, selectedAff, selectedTag]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <AppShell title="进入专注">
      <div className="grid gap-6">
        {/* Timer + breath ball */}
        <GlassCard className="flex flex-col items-center py-8">
          <div className="text-6xl font-display tabular-nums mb-2 tracking-wider">
            {mm}:{ss}
          </div>
          <DurationPicker value={duration} onChange={setDuration} disabled={running} />

          {settings.showBreath && settings.breathMode !== "off" && (
            <div className="mt-6">
              <BreathBall running={running} />
            </div>
          )}

          <div className="flex gap-3 mt-6">
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

        {/* Mode + tag + (single) affirmation list — merged */}
        <GlassCard>
          <div className="flex flex-wrap items-center justify-center gap-3 mb-4">
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

          <p className="text-xs tracking-widest opacity-50 text-center mb-3">专注于</p>
          <div className="flex flex-wrap justify-center gap-2 mb-2">
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

          {mode === "random" ? (
            <p className="font-display text-3xl text-center mt-4">#{selectedTag}</p>
          ) : (
            <div className="mt-4 space-y-2">
              {filteredAffs.length === 0 && (
                <p className="text-sm opacity-60 text-center">
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
              {currentAff && (
                <p className="font-display text-xl md:text-2xl leading-relaxed text-center mt-4">
                  “{currentAff.text}”
                </p>
              )}
            </div>
          )}
        </GlassCard>

        {/* Counter */}
        {settings.showCounter && (
          <GlassCard className="text-center py-10">
            <p className="text-xs tracking-widest opacity-50 mb-1">
              {settings.counterMode === "total" ? "累计计数" : "今日计数"}
            </p>
            <p className="text-xs opacity-50 mb-4">
              {mode === "single" && currentAff ? `“${currentAff.text}”` : `#${selectedTag}`}
            </p>
            <button
              onClick={doCount}
              className="glass-strong glass-hover rounded-full size-56 md:size-64 mx-auto flex flex-col items-center justify-center active:scale-95 transition-transform"
            >
              <span className="font-display text-7xl md:text-8xl tabular-nums">{todayCount}</span>
              <span className="flex items-center gap-1 text-sm opacity-70 mt-2">
                <Plus className="size-4" /> 点击 +1
              </span>
            </button>

            {settings.autoCountEnabled && (
              <div className="mt-6 flex flex-col items-center gap-2">
                <button
                  onClick={() => setAutoOn((v) => !v)}
                  className={`rounded-full px-4 py-2 text-xs ${
                    autoOn ? "glass-strong" : "glass"
                  }`}
                >
                  自动计数：{autoOn ? "进行中" : "关闭"}
                </button>
                <div className="flex items-center gap-2 text-xs opacity-70">
                  <span>间隔</span>
                  <input
                    type="number"
                    step={0.5}
                    min={0.5}
                    max={60}
                    value={settings.autoCountInterval}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        autoCountInterval: Math.max(0.5, Number(e.target.value) || 1),
                      }))
                    }
                    className="glass rounded-xl px-2 py-1 w-16 text-center outline-none"
                  />
                  <span>秒 / 次</span>
                </div>
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </AppShell>
  );
}

function DurationPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="w-full max-w-md mt-1">
      <div className="flex gap-2 overflow-x-auto pb-2 snap-x scrollbar-hide justify-center flex-wrap">
        {DURATION_OPTIONS.map((d) => {
          const m = d / 60;
          return (
            <button
              key={d}
              disabled={disabled}
              onClick={() => onChange(d)}
              className={`shrink-0 snap-center rounded-full px-3 py-1.5 text-xs ${
                value === d ? "glass-strong" : "glass"
              } ${disabled ? "opacity-50" : ""}`}
            >
              {m < 60 ? `${m} 分钟` : `${m / 60} 小时`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BreathBall({ running }: { running: boolean }) {
  const { settings } = useApp();
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

  const total = phases.reduce((s, p) => s + p.sec, 0) || 1;
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((x) => (x + 0.1) % total), 100);
    return () => clearInterval(id);
  }, [running, total]);

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
  else scale = phases.indexOf(current) === 1 ? 1 : 0.55;

  const label =
    settings.breathMode === "box"
      ? "箱式呼吸 4-4-4-4"
      : settings.breathMode === "478"
        ? "4-7-8 呼吸"
        : `自定义 ${settings.customBreath.inhale}-${settings.customBreath.hold1}-${settings.customBreath.exhale}-${settings.customBreath.hold2}`;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative size-44 flex items-center justify-center">
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
      <p className="text-xs opacity-60">{label}</p>
    </div>
  );
}
