import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, GlassCard } from "@/components/AppShell";
import { WheelDuration } from "@/components/WheelDuration";
import { useApp, playFeedback, unlockAudio } from "@/lib/app-context";
import {
  useLocal,
  upsertDailyLog,
  type Affirmation,
  type FocusLog,
  DEFAULT_TAGS,
  todayKey,
  ACTIVE_SESSION_KEY_AFFIRM,
  ACTIVE_SESSION_KEY_BREATH,
} from "@/lib/storage";
import { setWhiteNoise, stopWhiteNoise, getCurrentWhiteNoise, unlockWhiteNoise } from "@/lib/white-noise";
import { Play, Pause, RotateCcw, Plus, Sparkles, Wind } from "lucide-react";

export const Route = createFileRoute("/focus")({
  head: () => ({ meta: [{ title: "进入专注 · GG RESET" }] }),
  component: FocusPage,
});

type Tab = "affirm" | "breath";

const AFFIRM_SELECTION_KEY = "gg_affirm_selection";

function FocusPage() {
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "affirm";
    return (localStorage.getItem("gg_focus_tab") as Tab) || "affirm";
  });
  useEffect(() => {
    localStorage.setItem("gg_focus_tab", tab);
  }, [tab]);

  const titleSlot = (
    <div className="glass rounded-full p-0.5 flex">
      <button
        onClick={() => setTab("affirm")}
        className={`rounded-full px-4 py-1.5 text-xs md:text-sm flex items-center gap-1 ${
          tab === "affirm" ? "glass-strong selected-strong" : "opacity-70"
        }`}
      >
        <Sparkles className="size-3.5" /> 肯定语
      </button>
      <button
        onClick={() => setTab("breath")}
        className={`rounded-full px-4 py-1.5 text-xs md:text-sm flex items-center gap-1 ${
          tab === "breath" ? "glass-strong selected-strong" : "opacity-70"
        }`}
      >
        <Wind className="size-3.5" /> 呼吸调整
      </button>
    </div>
  );

  return (
    <AppShell titleSlot={titleSlot}>
      {tab === "affirm" ? <AffirmFocus /> : <BreathFocus />}
    </AppShell>
  );
}


/* ============================================================
 * Shared time-based session core
 * ============================================================ */

type ActiveSession = {
  startedAt: number;
  duration: number;
  elapsedBefore: number;
  count: number;
  running: boolean;
  tag: string;
  affId?: string;
  autoOn?: boolean;
  lastAutoAt?: number;
};

function loadSession(key: string): ActiveSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}
function saveSession(key: string, s: ActiveSession | null) {
  if (typeof window === "undefined") return;
  if (s) localStorage.setItem(key, JSON.stringify(s));
  else localStorage.removeItem(key);
}

function fmt(secs: number, forceHours = false) {
  const s = Math.max(0, Math.floor(secs));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const showH = forceHours || hh > 0;
  const p = (n: number) => String(n).padStart(2, "0");
  return showH ? `${p(hh)}:${p(mm)}:${p(ss)}` : `${p(mm)}:${p(ss)}`;
}

function selCls(active: boolean) {
  return active ? "glass-strong selected-strong" : "glass";
}

/* ============================================================
 * Affirmation Focus
 * ============================================================ */

function AffirmFocus() {
  const { settings, setSettings } = useApp();
  const isStopwatch = settings.affirmTimerMode === "stopwatch";

  const [affirmations, setAffs] = useLocal<Affirmation[]>("gg_affirmations", []);
  const [logs, setLogs] = useLocal<FocusLog[]>("gg_focus_logs", []);
  const [customTags] = useLocal<string[]>("gg_tags", []);

  const tags = useMemo(() => {
    const set = new Set<string>(DEFAULT_TAGS);
    customTags.forEach((t) => set.add(t));
    affirmations.forEach((a) => set.add(a.tag));
    return Array.from(set);
  }, [affirmations, customTags]);

  const restored = useRef(false);
  const initial = useRef<ActiveSession | null>(null);
  const initialSel = useRef<{ tag?: string; affId?: string | null } | null>(null);
  if (!restored.current && typeof window !== "undefined") {
    initial.current = loadSession(ACTIVE_SESSION_KEY_AFFIRM);
    try {
      const raw = localStorage.getItem(AFFIRM_SELECTION_KEY);
      if (raw) initialSel.current = JSON.parse(raw);
    } catch {}
    restored.current = true;
  }

  const [selectedTag, setSelectedTag] = useState<string>(
    initial.current?.tag ?? initialSel.current?.tag ?? tags[0] ?? "自我概念",
  );
  // null = no specific affirmation selected (theme-level focus)
  const [selectedAff, setSelectedAff] = useState<string | null>(
    initial.current?.affId ?? initialSel.current?.affId ?? null,
  );

  // Persist selection separately so navigating away and back keeps the choice
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(
      AFFIRM_SELECTION_KEY,
      JSON.stringify({ tag: selectedTag, affId: selectedAff }),
    );
  }, [selectedTag, selectedAff]);


  const [duration, setDuration] = useState<number>(
    initial.current?.duration ?? settings.focusDuration ?? 300,
  );
  const [running, setRunning] = useState<boolean>(initial.current?.running ?? false);
  const [count, setCount] = useState<number>(initial.current?.count ?? 0);
  const [autoOn, setAutoOn] = useState<boolean>(initial.current?.autoOn ?? false);
  const [celebrated, setCelebrated] = useState(false);

  const startedAtRef = useRef<number>(initial.current?.startedAt ?? Date.now());
  const elapsedBeforeRef = useRef<number>(initial.current?.elapsedBefore ?? 0);
  const lastAutoAtRef = useRef<number>(initial.current?.lastAutoAt ?? Date.now());

  const computeElapsed = useCallback(() => {
    if (!running) return elapsedBeforeRef.current;
    return elapsedBeforeRef.current + (Date.now() - startedAtRef.current) / 1000;
  }, [running]);

  const [, forceTick] = useState(0);
  const elapsedNow = computeElapsed();
  const remaining = Math.max(0, Math.ceil(duration - elapsedNow));
  const dispSec = isStopwatch ? Math.floor(elapsedNow) : remaining;

  // Sync duration → settings
  useEffect(() => {
    setSettings((s) => ({ ...s, focusDuration: duration }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  // Persist session
  useEffect(() => {
    const base: ActiveSession = {
      startedAt: startedAtRef.current,
      duration,
      elapsedBefore: elapsedBeforeRef.current,
      count,
      running,
      tag: selectedTag,
      affId: selectedAff ?? undefined,
      autoOn,
      lastAutoAt: lastAutoAtRef.current,
    };
    if (running || count > 0 || elapsedBeforeRef.current > 0)
      saveSession(ACTIVE_SESSION_KEY_AFFIRM, base);
    else saveSession(ACTIVE_SESSION_KEY_AFFIRM, null);
  }, [duration, count, running, selectedTag, selectedAff, autoOn]);

  // Auto-count: time-delta catchup (correct even after backgrounding)
  const flushAutoCount = useCallback(() => {
    if (!running || !settings.autoCountEnabled || !autoOn) return;
    const intervalMs = Math.max(0.1, settings.autoCountInterval) * 1000;
    const now = Date.now();
    // Cap by allowed elapsed (don't count past countdown end)
    const e = computeElapsed();
    const limitMs = isStopwatch ? Infinity : Math.max(0, duration - e) * 1000;
    const elapsedSinceLast = Math.min(now - lastAutoAtRef.current, limitMs + intervalMs);
    const n = Math.floor(elapsedSinceLast / intervalMs);
    if (n > 0) {
      lastAutoAtRef.current += n * intervalMs;
      addCount(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, autoOn, settings.autoCountEnabled, settings.autoCountInterval, duration, isStopwatch]);

  // Main tick loop
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 120) {
        last = t;
        const e = computeElapsed();
        if (!isStopwatch && e >= duration) {
          finish(true);
          return;
        }
        flushAutoCount();
        forceTick((x) => (x + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, duration, isStopwatch, flushAutoCount]);

  // Visibility recompute (handles background tabs / screen lock)
  useEffect(() => {
    function onVis() {
      flushAutoCount();
      forceTick((x) => x + 1);
      if (!document.hidden && running && !isStopwatch) {
        if (computeElapsed() >= duration) finish(true);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, duration, isStopwatch, flushAutoCount]);

  // beforeunload guard
  useEffect(() => {
    if (!running) return;
    function onBefore(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "您当前的练习正在进行中，确定要离开吗？";
      return e.returnValue;
    }
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [running]);

  // White noise reflects latest settings, sync with running state
  useEffect(() => {
    if (settings.whiteNoise !== "off") {
      // play whenever user picked a noise (Settings preview or focus)
      setWhiteNoise(settings.whiteNoise, settings.whiteNoiseVolume);
    } else {
      if (getCurrentWhiteNoise() !== "off") stopWhiteNoise();
    }
  }, [settings.whiteNoise, settings.whiteNoiseVolume]);

  // Keyboard shortcut
  useEffect(() => {
    if (!settings.keyboardCounter) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== " " && e.key !== "Enter") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      e.preventDefault();
      addCount(1, true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.keyboardCounter, selectedAff, selectedTag]);

  const filteredAffs = useMemo(
    () => affirmations.filter((a) => a.tag === selectedTag),
    [affirmations, selectedTag],
  );
  const currentAff = useMemo(
    () => affirmations.find((a) => a.id === selectedAff) || null,
    [affirmations, selectedAff],
  );

  function addCount(n: number, feedback = false) {
    if (n <= 0) return;
    const affId = selectedAff || undefined;
    setCount((c) => c + n);
    setLogs((prev) =>
      upsertDailyLog(prev, { tag: selectedTag, affId, addCount: n, kind: "affirm" }),
    );
    if (selectedAff) {
      setAffs((prev) =>
        prev.map((a) => (a.id === selectedAff ? { ...a, count: a.count + n } : a)),
      );
    }
    if (settings.sound) playFeedback(settings);
    void feedback;
  }

  function start() {
    // Unlock audio pipelines on the user gesture (iOS Safari requirement)
    unlockAudio();
    unlockWhiteNoise();
    if (settings.whiteNoise !== "off") {
      setWhiteNoise(settings.whiteNoise, settings.whiteNoiseVolume);
    }
    if (!isStopwatch && elapsedBeforeRef.current >= duration) {
      elapsedBeforeRef.current = 0;
    }
    startedAtRef.current = Date.now();
    lastAutoAtRef.current = Date.now();
    setRunning(true);
    setCelebrated(false);
    // Auto-enable auto-count when timer starts (per spec)
    if (settings.autoCountEnabled) setAutoOn(true);
  }
  function pause() {
    flushAutoCount();
    elapsedBeforeRef.current += (Date.now() - startedAtRef.current) / 1000;
    setRunning(false);
  }
  function finish(completed: boolean) {
    flushAutoCount();
    const finalElapsed = isStopwatch
      ? computeElapsed()
      : Math.min(duration, computeElapsed());
    setRunning(false);
    const secs = Math.round(finalElapsed);
    if (secs > 0) {
      const affId = selectedAff || undefined;
      setLogs((prev) =>
        upsertDailyLog(prev, {
          tag: selectedTag,
          affId,
          addDuration: secs,
          kind: "affirm",
        }),
      );
    }
    // Always celebrate when user explicitly ends or naturally completes
    setCelebrated(true);
    playFeedback({ ...settings, sound: true });
    setTimeout(() => setCelebrated(false), 3600);
    elapsedBeforeRef.current = 0;
    setCount(0);
    saveSession(ACTIVE_SESSION_KEY_AFFIRM, null);
  }

  const todayCount = useMemo(() => {
    if (settings.counterMode === "total") {
      if (selectedAff && currentAff) return currentAff.count;
      return logs.filter((l) => l.tag === selectedTag).reduce((s, l) => s + l.count, 0);
    }
    const td = todayKey();
    if (selectedAff) {
      return logs
        .filter((l) => l.date === td && l.affirmationId === selectedAff)
        .reduce((s, l) => s + l.count, 0);
    }
    return logs
      .filter((l) => l.date === td && l.tag === selectedTag)
      .reduce((s, l) => s + l.count, 0);
  }, [logs, settings.counterMode, currentAff, selectedAff, selectedTag]);

  return (
    <div className="grid gap-5">
      {/* Timer at top — wheel only when fully idle; paused shows frozen time */}
      <GlassCard className="py-6">
        <p className="text-center text-[11px] tracking-widest opacity-50 mb-2">
          {isStopwatch ? "正计时 · 秒表" : running ? "倒计时" : elapsedBeforeRef.current > 0 ? "已暂停" : "倒计时"}
        </p>
        {running || isStopwatch || elapsedBeforeRef.current > 0 ? (
          <div className="text-center">
            <div className="font-num tabular-nums tracking-wider text-5xl md:text-6xl">
              {fmt(dispSec, !isStopwatch && duration >= 3600)}
            </div>
          </div>
        ) : (
          <WheelDuration seconds={duration} onChange={setDuration} disabled={running} />
        )}
        <div className="flex gap-2 justify-center mt-5">
          {!running ? (
            <button
              onClick={start}
              className="glass-strong selected-strong glass-hover rounded-full px-6 py-2.5 text-sm flex items-center gap-2"
            >
              <Play className="size-4" /> {elapsedBeforeRef.current > 0 ? "恢复" : "开始"}
            </button>
          ) : (
            <button
              onClick={pause}
              className="glass-strong selected-strong glass-hover rounded-full px-6 py-2.5 text-sm flex items-center gap-2"
            >
              <Pause className="size-4" /> 暂停
            </button>
          )}
          <button
            onClick={() => finish(false)}
            className="glass glass-hover rounded-full px-6 py-2.5 text-sm flex items-center gap-2"
          >
            <RotateCcw className="size-4" /> 结束
          </button>
        </div>
      </GlassCard>


      {/* Big counter */}
      <GlassCard className="text-center py-8">
        <p className="text-xs tracking-widest opacity-50 mb-1">
          {settings.counterMode === "total" ? "累计计数" : "今日计数"}
        </p>
        <p className="text-xs opacity-50 mb-4 truncate">
          {currentAff ? `"${currentAff.text}"` : `#${selectedTag}`}
        </p>
        <button
          onClick={() => addCount(1, true)}
          className="glass-strong selected-strong glass-hover rounded-full size-60 md:size-72 mx-auto flex flex-col items-center justify-center active:scale-95 transition-transform"
          style={{ willChange: "transform" }}
        >
          <span className="font-num text-7xl md:text-8xl tabular-nums">{todayCount}</span>
          <span className="flex items-center gap-1 text-sm opacity-70 mt-2">
            <Plus className="size-4" /> 点击 +1
          </span>
        </button>

        {settings.autoCountEnabled && (
          <div className="mt-6 flex flex-col items-center gap-1">
            <button
              onClick={() => {
                if (!autoOn) lastAutoAtRef.current = Date.now();
                setAutoOn((v) => !v);
              }}
              className={`rounded-full px-4 py-2 text-xs ${selCls(autoOn)}`}
            >
              自动计数：{autoOn ? "开启" : "暂停"}
            </button>
            <p className="text-[11px] opacity-50">
              间隔 {settings.autoCountInterval} 秒（可在设置中调整）
            </p>
          </div>
        )}
      </GlassCard>

      {/* Theme / affirmation selector */}
      <GlassCard>
        <p className="text-xs tracking-widest opacity-50 text-center mb-3">专注于</p>
        <div className="flex flex-wrap justify-center gap-2">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => {
                setSelectedTag(t);
                setSelectedAff(null);
              }}
              className={`rounded-full px-3 py-1.5 text-xs ${selCls(selectedTag === t)}`}
            >
              #{t}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {filteredAffs.length === 0 ? (
            <p className="font-display text-2xl text-center">#{selectedTag}</p>
          ) : (
            <>
              <p className="text-[11px] opacity-60 text-center">
                可选择具体肯定语，未选择时默认专注整个主题
              </p>
              {filteredAffs.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAff(selectedAff === a.id ? null : a.id)}
                  className={`w-full text-left rounded-2xl px-4 py-3 text-sm ${selCls(
                    selectedAff === a.id,
                  )}`}
                >
                  {a.text}
                </button>
              ))}
              {currentAff && (
                <p className="font-display text-xl leading-relaxed text-center mt-4">
                  "{currentAff.text}"
                </p>
              )}
            </>
          )}
        </div>
      </GlassCard>

      {celebrated && <Celebration />}
    </div>
  );
}

/* ============================================================
 * Breath Focus
 * ============================================================ */

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
  {
    title: "EFT 敲击",
    body: "用指尖依次轻敲眉头、眼角、颧骨、人中、下巴、锁骨与腋下，每个点位轻敲 5-7 下并配合深呼吸，能快速释放紧张与焦虑情绪。",
  },
];

const NEURAL_INTRO =
  "神经系统调节是帮助身体从紧张、焦虑或压力状态，回到平静、安全和稳定状态的过程。当你更稳定时，你会更容易专注保持积极思考，并减少被外界或旧想法影响，让日常生活和保持积极想法变得更轻松、更自然。";

function BreathFocus() {
  const { settings, setSettings } = useApp();
  const isStopwatch = settings.breathTimerMode === "stopwatch";

  const [logs, setLogs] = useLocal<FocusLog[]>("gg_focus_logs", []);

  const restored = useRef(false);
  const initial = useRef<ActiveSession | null>(null);
  if (!restored.current && typeof window !== "undefined") {
    initial.current = loadSession(ACTIVE_SESSION_KEY_BREATH);
    restored.current = true;
  }

  const [duration, setDuration] = useState<number>(
    initial.current?.duration ?? settings.breathFocusDuration ?? 300,
  );
  const [running, setRunning] = useState<boolean>(initial.current?.running ?? false);
  const [celebrated, setCelebrated] = useState(false);

  const startedAtRef = useRef<number>(initial.current?.startedAt ?? Date.now());
  const elapsedBeforeRef = useRef<number>(initial.current?.elapsedBefore ?? 0);

  const computeElapsed = useCallback(() => {
    if (!running) return elapsedBeforeRef.current;
    return elapsedBeforeRef.current + (Date.now() - startedAtRef.current) / 1000;
  }, [running]);

  const [, forceTick] = useState(0);
  const elapsedNow = computeElapsed();
  const remaining = Math.max(0, Math.ceil(duration - elapsedNow));
  const dispSec = isStopwatch ? Math.floor(elapsedNow) : remaining;

  useEffect(() => {
    setSettings((s) => ({ ...s, breathFocusDuration: duration }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration]);

  useEffect(() => {
    const base: ActiveSession = {
      startedAt: startedAtRef.current,
      duration,
      elapsedBefore: elapsedBeforeRef.current,
      count: 0,
      running,
      tag: "呼吸法",
    };
    if (running || elapsedBeforeRef.current > 0)
      saveSession(ACTIVE_SESSION_KEY_BREATH, base);
    else saveSession(ACTIVE_SESSION_KEY_BREATH, null);
  }, [duration, running]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = 0;
    const loop = (t: number) => {
      if (t - last > 120) {
        last = t;
        const e = computeElapsed();
        if (!isStopwatch && e >= duration) {
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
  }, [running, duration, isStopwatch]);

  useEffect(() => {
    function onVis() {
      forceTick((x) => x + 1);
      if (!document.hidden && running && !isStopwatch) {
        if (computeElapsed() >= duration) finish(true);
      }
    }
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, duration, isStopwatch]);

  useEffect(() => {
    if (!running) return;
    function onBefore(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "您当前的呼吸调节正在进行中，确定要离开吗？";
      return e.returnValue;
    }
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [running]);

  useEffect(() => {
    if (settings.whiteNoise !== "off") {
      setWhiteNoise(settings.whiteNoise, settings.whiteNoiseVolume);
    } else {
      if (getCurrentWhiteNoise() !== "off") stopWhiteNoise();
    }
  }, [settings.whiteNoise, settings.whiteNoiseVolume]);

  function start() {
    unlockAudio();
    unlockWhiteNoise();
    if (settings.whiteNoise !== "off") {
      setWhiteNoise(settings.whiteNoise, settings.whiteNoiseVolume);
    }
    if (!isStopwatch && elapsedBeforeRef.current >= duration) {
      elapsedBeforeRef.current = 0;
    }
    startedAtRef.current = Date.now();
    setRunning(true);
    setCelebrated(false);
  }
  function pause() {
    elapsedBeforeRef.current += (Date.now() - startedAtRef.current) / 1000;
    setRunning(false);
  }
  function finish(_completed: boolean) {
    const finalElapsed = isStopwatch
      ? computeElapsed()
      : Math.min(duration, computeElapsed());
    setRunning(false);
    const secs = Math.round(finalElapsed);
    if (secs > 0) {
      setLogs((prev) =>
        upsertDailyLog(prev, {
          tag: "呼吸调整",
          addDuration: secs,
          kind: "breath",
        }),
      );
    }
    setCelebrated(true);
    playFeedback({ ...settings, sound: true });
    setTimeout(() => setCelebrated(false), 3600);
    elapsedBeforeRef.current = 0;
    saveSession(ACTIVE_SESSION_KEY_BREATH, null);
  }

  return (
    <div className="grid gap-5">
      {/* Timer */}
      <GlassCard className="py-6">
        <p className="text-center text-[11px] tracking-widest opacity-50 mb-2">
          {isStopwatch ? "正计时 · 秒表" : running ? "倒计时" : elapsedBeforeRef.current > 0 ? "已暂停" : "倒计时"}
        </p>
        {running || isStopwatch || elapsedBeforeRef.current > 0 ? (
          <div className="text-center">
            <div className="font-num tabular-nums tracking-wider text-5xl md:text-6xl">
              {fmt(dispSec, !isStopwatch && duration >= 3600)}
            </div>
          </div>
        ) : (
          <WheelDuration seconds={duration} onChange={setDuration} disabled={running} />
        )}
        <div className="flex gap-2 justify-center mt-5">
          {!running ? (
            <button
              onClick={start}
              className="glass-strong selected-strong glass-hover rounded-full px-6 py-2.5 text-sm flex items-center gap-2"
            >
              <Play className="size-4" /> {elapsedBeforeRef.current > 0 ? "恢复" : "开始"}
            </button>
          ) : (
            <button
              onClick={pause}
              className="glass-strong selected-strong glass-hover rounded-full px-6 py-2.5 text-sm flex items-center gap-2"
            >
              <Pause className="size-4" /> 暂停
            </button>
          )}
          <button
            onClick={() => finish(false)}
            className="glass glass-hover rounded-full px-6 py-2.5 text-sm flex items-center gap-2"
          >
            <RotateCcw className="size-4" /> 结束
          </button>
        </div>
      </GlassCard>


      {/* Breath ball */}
      <GlassCard className="py-10">
        <BreathBall running={running} />
        <p className="text-center text-xs opacity-70 mt-6">
          当前呼吸模式：<span className="font-medium">{breathLabel(settings)}</span>
          <span className="opacity-50">（可在设置中调整）</span>
        </p>
      </GlassCard>

      {/* Neural regulation intro + Tips */}
      <GlassCard>
        <h2 className="font-display text-xl mb-3">神经系统调节</h2>
        <p className="text-sm leading-relaxed opacity-85 mb-5">{NEURAL_INTRO}</p>
        <div className="grid md:grid-cols-2 gap-3">
          {TIPS.map((t) => (
            <div key={t.title} className="glass rounded-2xl p-4">
              <p className="font-display text-lg mb-1">{t.title}</p>
              <p className="text-xs opacity-75 leading-relaxed">{t.body}</p>
            </div>
          ))}
        </div>
      </GlassCard>


      {celebrated && <Celebration />}
    </div>
  );
}

function breathLabel(settings: ReturnType<typeof useApp>["settings"]) {
  if (settings.breathMode === "box") return "箱式呼吸 4-4-4-4";
  if (settings.breathMode === "478") return "4-7-8 呼吸";
  if (settings.breathMode === "off") return "未开启";
  const c = settings.customBreath;
  return `自定义 ${c.inhale}-${c.hold1}-${c.exhale}-${c.hold2}`;
}

function BreathBall({ running }: { running: boolean }) {
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
    if (settings.breathMode === "off")
      return [{ label: "未开启", sec: 1, kind: "hold" as const }];
    return [
      { label: "吸气", sec: settings.customBreath.inhale, kind: "in" as const },
      { label: "屏息", sec: settings.customBreath.hold1, kind: "hold" as const },
      { label: "呼气", sec: settings.customBreath.exhale, kind: "out" as const },
      { label: "屏息", sec: settings.customBreath.hold2, kind: "hold" as const },
    ].filter((p) => p.sec > 0);
  }, [settings.breathMode, settings.customBreath]);

  const [phaseIdx, setPhaseIdx] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const phaseStartRef = useRef(Date.now());

  // Advance phases on real wall-clock time so the CSS transform transition
  // duration matches phase.sec exactly — smooth, GPU-accelerated scale().
  useEffect(() => {
    if (!running) {
      setPhaseIdx(0);
      setCountdown(0);
      return;
    }
    setPhaseIdx(0);
    phaseStartRef.current = Date.now();
    let idx = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      const cur = phases[idx];
      timer = setTimeout(() => {
        idx = (idx + 1) % phases.length;
        setPhaseIdx(idx);
        phaseStartRef.current = Date.now();
        schedule();
      }, cur.sec * 1000);
    };
    schedule();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [running, phases]);

  // Lightweight countdown text (rAF) — only mutates a small text node.
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      const cur = phases[phaseIdx];
      const t = (Date.now() - phaseStartRef.current) / 1000;
      setCountdown(Math.max(1, Math.ceil(cur.sec - t)));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, phaseIdx, phases]);

  const cur = phases[phaseIdx] ?? phases[0];
  // Target scale of *this* phase; transition length = phase.sec.
  let targetScale = 1;
  if (running) {
    if (cur.kind === "in") targetScale = 1.35;
    else if (cur.kind === "out") targetScale = 0.7;
    else {
      // hold: keep whatever the previous phase ended at
      const prev = phases[(phaseIdx - 1 + phases.length) % phases.length];
      targetScale = prev?.kind === "in" ? 1.35 : prev?.kind === "out" ? 0.7 : 1;
    }
  }
  const transitionDur = running ? cur.sec : 0.4;
  const easing =
    cur.kind === "hold"
      ? "linear"
      : "cubic-bezier(0.42, 0, 0.58, 1)"; // smooth ease-in-out for inhale/exhale

  const isDark = settings.theme === "dark";
  const ballBg = isDark
    ? "radial-gradient(circle at 35% 30%, rgba(60,90,150,0.95) 0%, rgba(30,55,110,0.92) 60%, rgba(20,35,80,0.9) 100%)"
    : "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.98) 0%, rgba(235,245,255,0.95) 60%, rgba(210,225,245,0.9) 100%)";
  const ballShadow = isDark
    ? "0 20px 60px rgba(0,0,0,0.55), inset 0 0 40px rgba(255,255,255,0.08)"
    : "0 20px 60px rgba(60,110,170,0.35), inset 0 0 40px rgba(255,255,255,0.4)";
  const textColor = isDark ? "text-white" : "text-slate-900";

  return (
    <div className="flex flex-col items-center justify-center select-none py-6">
      <div className="relative" style={{ width: 260, height: 260 }}>
        <div
          className="absolute inset-0 rounded-full flex items-center justify-center"
          style={{
            background: ballBg,
            boxShadow: ballShadow,
            transform: `scale3d(${targetScale}, ${targetScale}, 1)`,
            transition: `transform ${transitionDur}s ${easing}`,
            willChange: "transform",
            backfaceVisibility: "hidden",
          }}
        >
          <div className="text-center">
            <p className={`font-display text-2xl mb-1 ${textColor}`}>
              {running ? cur.label : "准备"}
            </p>
            {running && cur.sec > 0 && (
              <p className={`font-num tabular-nums text-3xl ${textColor}`}>
                {countdown}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



/* ============================================================
 * Celebration
 * ============================================================ */
function Celebration() {
  const colors = ["#7FB3D5", "#A9DFBF", "#AED6F1", "#D6EAF8", "#F9E79F", "#D2B4DE"];
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
        <p className="text-xs opacity-70">给自己鼓个掌</p>

      </div>
    </div>
  );
}
