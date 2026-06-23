import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import { WheelDuration } from "@/components/WheelDuration";
import { useApp, playFeedback } from "@/lib/app-context";
import {
  useLocal,
  type Affirmation,
  type FocusLog,
  DEFAULT_TAGS,
  uid,
  todayKey,
  ACTIVE_SESSION_KEY,
} from "@/lib/storage";
import { setWhiteNoise, stopWhiteNoise } from "@/lib/white-noise";
import { Play, Pause, RotateCcw, Shuffle, Target, Plus } from "lucide-react";

export const Route = createFileRoute("/focus")({
  head: () => ({ meta: [{ title: "进入专注 · GG RESET" }] }),
  component: FocusPage,
});

type ActiveSession = {
  startedAt: number; // ms (last resume)
  duration: number; // total seconds
  elapsedBefore: number; // accumulated seconds before this resume
  count: number;
  running: boolean;
  mode: "random" | "single";
  tag: string;
  affId?: string;
  pausedAt?: number;
};

function loadSession(): ActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}
function saveSession(s: ActiveSession | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(s));
  else localStorage.removeItem(ACTIVE_SESSION_KEY);
}

function FocusPage() {
  const { settings, setSettings } = useApp();
  const [affirmations, setAffs] = useLocal<Affirmation[]>("gg_affirmations", []);
  const [logs, setLogs] = useLocal<FocusLog[]>("gg_focus_logs", []);

  const tags = useMemo(() => {
    const set = new Set<string>(DEFAULT_TAGS);
    affirmations.forEach((a) => set.add(a.tag));
    return Array.from(set);
  }, [affirmations]);

  // Restore from active session (if any) on first render
  const restored = useRef(false);
  const initial = useRef<ActiveSession | null>(null);
  if (!restored.current && typeof window !== "undefined") {
    initial.current = loadSession();
    restored.current = true;
  }

  const [mode, setMode] = useState<"random" | "single">(initial.current?.mode ?? "random");
  const [selectedTag, setSelectedTag] = useState<string>(
    initial.current?.tag ?? tags[0] ?? "自我概念",
  );
  const [selectedAff, setSelectedAff] = useState<string | null>(initial.current?.affId ?? null);

  const [duration, setDuration] = useState<number>(
    initial.current?.duration ?? settings.focusDuration ?? 300,
  );
  const [running, setRunning] = useState<boolean>(initial.current?.running ?? false);
  const [count, setCount] = useState<number>(initial.current?.count ?? 0);
  const [autoOn, setAutoOn] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  // Time tracking — Date.now based, persisted
  const startedAtRef = useRef<number>(initial.current?.startedAt ?? Date.now());
  const elapsedBeforeRef = useRef<number>(initial.current?.elapsedBefore ?? 0);

  // Display remaining (updated by interval, not source of truth)
  const computeElapsed = useCallback(() => {
    if (!running) return elapsedBeforeRef.current;
    return elapsedBeforeRef.current + (Date.now() - startedAtRef.current) / 1000;
  }, [running]);

  const [, forceTick] = useState(0);
  const remaining = Math.max(0, Math.ceil(duration - computeElapsed()));

  // Sync duration to settings
  useEffect(() => {
    setSettings((s) => ({ ...s, focusDuration: duration }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  // Persist active session continuously
  const persist = useCallback(
    (over: Partial<ActiveSession> = {}) => {
      const base: ActiveSession = {
        startedAt: startedAtRef.current,
        duration,
        elapsedBefore: elapsedBeforeRef.current,
        count,
        running,
        mode,
        tag: selectedTag,
        affId: selectedAff ?? undefined,
        ...over,
      };
      // Only persist if there is meaningful state
      if (running || count > 0 || elapsedBeforeRef.current > 0) {
        saveSession(base);
      } else {
        saveSession(null);
      }
    },
    [duration, count, running, mode, selectedTag, selectedAff],
  );

  // Persist whenever key state changes
  useEffect(() => {
    persist();
  }, [persist]);

  // Tick loop — updates UI from Date.now, never accumulates drift
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 200) {
        last = t;
        const elapsed = computeElapsed();
        if (elapsed >= duration) {
          finish(true);
          return;
        }
        forceTick((x) => (x + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, duration]);

  // Visibility / focus — recompute on return (no-op since we use Date.now, but force render)
  useEffect(() => {
    function onVis() {
      forceTick((x) => x + 1);
      if (!document.hidden && running) {
        const elapsed = computeElapsed();
        if (elapsed >= duration) finish(true);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, duration]);

  // beforeunload guard
  useEffect(() => {
    if (!running) return;
    function onBefore(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "您当前的神经调节正在进行中，退出将中断本次练习，确定要离开吗？";
      return e.returnValue;
    }
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [running]);

  // White noise lifecycle
  useEffect(() => {
    if (running && settings.whiteNoise !== "off") {
      setWhiteNoise(settings.whiteNoise, settings.whiteNoiseVolume);
    } else {
      stopWhiteNoise();
    }
    return () => stopWhiteNoise();
  }, [running, settings.whiteNoise, settings.whiteNoiseVolume]);

  // Auto-count
  useEffect(() => {
    if (!running || !settings.autoCountEnabled || !autoOn) return;
    const id = window.setInterval(
      () => doCount(),
      Math.max(0.2, settings.autoCountInterval) * 1000,
    );
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, autoOn, settings.autoCountEnabled, settings.autoCountInterval]);

  // Keyboard
  useEffect(() => {
    if (!settings.keyboardCounter) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== " " && e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      doCount();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.keyboardCounter, mode, selectedAff, selectedTag]);

  const filteredAffs = useMemo(
    () => affirmations.filter((a) => a.tag === selectedTag),
    [affirmations, selectedTag],
  );
  const currentAff = useMemo(
    () => (mode === "single" ? affirmations.find((a) => a.id === selectedAff) || null : null),
    [mode, affirmations, selectedAff],
  );

  function doCount() {
    setCount((c) => {
      const next = c + 1;
      // persist immediately on change
      saveSession({
        startedAt: startedAtRef.current,
        duration,
        elapsedBefore: elapsedBeforeRef.current,
        count: next,
        running,
        mode,
        tag: selectedTag,
        affId: selectedAff ?? undefined,
      });
      return next;
    });
    playFeedback(settings);
    if (mode === "single" && selectedAff) {
      setAffs((prev) =>
        prev.map((a) => (a.id === selectedAff ? { ...a, count: a.count + 1 } : a)),
      );
    }
  }

  function start() {
    // If already finished previously, reset elapsed
    if (elapsedBeforeRef.current >= duration) {
      elapsedBeforeRef.current = 0;
      setCount(0);
    }
    startedAtRef.current = Date.now();
    setRunning(true);
    setCelebrated(false);
  }
  function pause() {
    elapsedBeforeRef.current += (Date.now() - startedAtRef.current) / 1000;
    setRunning(false);
  }
  function finish(completed: boolean) {
    // Compute final elapsed
    const finalElapsed = Math.min(duration, computeElapsed());
    elapsedBeforeRef.current = finalElapsed;
    setRunning(false);
    saveLog(finalElapsed);
    if (completed) {
      setCelebrated(true);
      // brief feedback chime
      playFeedback({ ...settings, sound: true });
      setTimeout(() => setCelebrated(false), 3600);
    }
    // reset for next round
    elapsedBeforeRef.current = 0;
    setCount(0);
    saveSession(null);
  }
  function reset() {
    if (computeElapsed() > 0 || count > 0) {
      saveLog(Math.min(duration, computeElapsed()));
    }
    elapsedBeforeRef.current = 0;
    setCount(0);
    setRunning(false);
    saveSession(null);
  }
  function saveLog(elapsedSec: number) {
    const secs = Math.round(elapsedSec);
    if (secs === 0 && count === 0) return;
    const log: FocusLog = {
      id: uid(),
      date: todayKey(),
      tag: selectedTag,
      affirmationId: mode === "single" ? selectedAff || undefined : undefined,
      count,
      durationSec: secs,
      timestamp: Date.now(),
    };
    setLogs((prev) => [log, ...prev]);
  }

  const todayCount = useMemo(() => {
    const td = todayKey();
    if (settings.counterMode === "total") {
      if (mode === "single" && currentAff) return currentAff.count + count;
      return (
        logs.filter((l) => l.tag === selectedTag).reduce((s, l) => s + l.count, 0) + count
      );
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

  const hh = String(Math.floor(remaining / 3600)).padStart(2, "0");
  const mm = String(Math.floor((remaining % 3600) / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const showHours = duration >= 3600;

  return (
    <AppShell title="进入专注">
      <div className="grid gap-5">
        {/* Compact timer card */}
        <GlassCard className="py-5">
          <div className="text-center">
            <div className="font-display tabular-nums tracking-wider text-4xl md:text-5xl mb-3">
              {showHours ? `${hh}:` : ""}
              {mm}:{ss}
            </div>
            <WheelDuration seconds={duration} onChange={setDuration} disabled={running} />
            <div className="flex gap-2 justify-center mt-4">
              {!running ? (
                <button
                  onClick={start}
                  className="glass-strong glass-hover rounded-full px-5 py-2 text-sm flex items-center gap-2"
                >
                  <Play className="size-4" /> 开始
                </button>
              ) : (
                <button
                  onClick={pause}
                  className="glass-strong glass-hover rounded-full px-5 py-2 text-sm flex items-center gap-2"
                >
                  <Pause className="size-4" /> 暂停
                </button>
              )}
              <button
                onClick={reset}
                className="glass glass-hover rounded-full px-5 py-2 text-sm flex items-center gap-2"
              >
                <RotateCcw className="size-4" /> 结束
              </button>
            </div>
          </div>
        </GlassCard>

        {/* Breath text */}
        {settings.showBreath && settings.breathMode !== "off" && (
          <BreathText running={running} />
        )}

        {/* Counter — most prominent */}
        {settings.showCounter && (
          <GlassCard className="text-center py-8">
            <p className="text-xs tracking-widest opacity-50 mb-1">
              {settings.counterMode === "total" ? "累计计数" : "今日计数"}
            </p>
            <p className="text-xs opacity-50 mb-4 truncate">
              {mode === "single" && currentAff ? `“${currentAff.text}”` : `#${selectedTag}`}
            </p>
            <button
              onClick={doCount}
              className="glass-strong glass-hover rounded-full size-60 md:size-72 mx-auto flex flex-col items-center justify-center active:scale-95 transition-transform"
              style={{ willChange: "transform" }}
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
                  className={`rounded-full px-4 py-2 text-xs ${autoOn ? "glass-strong" : "glass"}`}
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

        {/* Mode selector — bottom */}
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
          <div className="flex flex-wrap justify-center gap-2">
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
            <p className="font-display text-2xl text-center mt-4">#{selectedTag}</p>
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
                <p className="font-display text-xl leading-relaxed text-center mt-4">
                  “{currentAff.text}”
                </p>
              )}
            </div>
          )}
        </GlassCard>
      </div>

      {celebrated && <Celebration />}
    </AppShell>
  );
}

function BreathText({ running }: { running: boolean }) {
  const { settings } = useApp();
  const phases = useMemo(() => {
    if (settings.breathMode === "box")
      return [
        { label: "吸气", sec: 4, kind: "in" as const },
        { label: "屏息", sec: 4, kind: "hold" as const },
        { label: "呼气", sec: 4, kind: "out" as const },
        { label: "屏息", sec: 4, kind: "hold" as const },
      ];
    if (settings.breathMode === "478")
      return [
        { label: "吸气", sec: 4, kind: "in" as const },
        { label: "屏息", sec: 7, kind: "hold" as const },
        { label: "呼气", sec: 8, kind: "out" as const },
      ];
    return [
      { label: "吸气", sec: settings.customBreath.inhale, kind: "in" as const },
      { label: "屏息", sec: settings.customBreath.hold1, kind: "hold" as const },
      { label: "呼气", sec: settings.customBreath.exhale, kind: "out" as const },
      { label: "屏息", sec: settings.customBreath.hold2, kind: "hold" as const },
    ].filter((p) => p.sec > 0);
  }, [settings.breathMode, settings.customBreath]);

  const cycleStart = useRef(Date.now());
  const [state, setState] = useState({ label: "准备", scale: 1, glow: 0.3 });

  useEffect(() => {
    if (!running) {
      setState({ label: "准备", scale: 1, glow: 0.3 });
      return;
    }
    cycleStart.current = Date.now();
    const total = phases.reduce((s, p) => s + p.sec, 0) || 1;
    let raf = 0;
    const tick = () => {
      const elapsed = ((Date.now() - cycleStart.current) / 1000) % total;
      let acc = 0;
      let current = phases[0];
      let phaseT = 0;
      for (const p of phases) {
        if (elapsed < acc + p.sec) {
          current = p;
          phaseT = elapsed - acc;
          break;
        }
        acc += p.sec;
      }
      const k = current.sec ? phaseT / current.sec : 0;
      let scale = 1;
      let glow = 0.4;
      if (current.kind === "in") {
        scale = 0.9 + k * 0.35;
        glow = 0.3 + k * 0.6;
      } else if (current.kind === "out") {
        scale = 1.25 - k * 0.35;
        glow = 0.9 - k * 0.6;
      } else {
        scale = 1.2;
        glow = 0.7;
      }
      setState({ label: current.label, scale, glow });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, phases]);

  const label =
    settings.breathMode === "box"
      ? "箱式呼吸 4-4-4-4"
      : settings.breathMode === "478"
        ? "4-7-8 呼吸"
        : `自定义 ${settings.customBreath.inhale}-${settings.customBreath.hold1}-${settings.customBreath.exhale}-${settings.customBreath.hold2}`;

  // Find current phase seconds for the label
  const phase = phases.find((p) => p.label === state.label);
  const secText = phase ? `${phase.label} ${phase.sec} 秒` : state.label;

  return (
    <div className="flex flex-col items-center justify-center py-4 select-none">
      <div
        className="font-display tracking-wider"
        style={{
          fontSize: "2.25rem",
          transform: `scale3d(${state.scale}, ${state.scale}, 1)`,
          textShadow: `0 0 ${state.glow * 28}px rgba(160, 210, 255, ${state.glow}), 0 0 ${
            state.glow * 60
          }px rgba(180, 220, 255, ${state.glow * 0.6})`,
          transition: "transform 60ms linear, text-shadow 60ms linear",
          willChange: "transform",
        }}
      >
        {secText}
      </div>
      <p className="text-xs opacity-55 mt-3">{label}</p>
    </div>
  );
}

function Celebration() {
  const colors = ["#7FB3D5", "#F5B7B1", "#A9DFBF", "#F9E79F", "#D2B4DE", "#F5CBA7"];
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 0.6,
    dur: 2 + Math.random() * 2,
    color: colors[i % colors.length],
  }));
  return (
    <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center">
      <div className="absolute inset-0 overflow-hidden">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti-piece"
            style={{
              left: `${p.left}%`,
              background: p.color,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>
      <div className="glass-strong rounded-3xl px-10 py-8 text-center animate-celebrate">
        <p className="text-5xl mb-3">🎉</p>
        <p className="font-display text-3xl mb-1">恭喜完成专注！</p>
        <p className="text-xs opacity-70">为自己鼓个掌，你刚刚送给神经系统一段温柔的时光。</p>
      </div>
    </div>
  );
}
