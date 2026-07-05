import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_SETTINGS, useLocal, type Settings } from "./storage";
import oceanBg from "@/assets/ocean-bg.jpg";
import oceanBgDark from "@/assets/ocean-bg-dark.jpg";

type Ctx = {
  settings: Settings;
  setSettings: (v: Settings | ((p: Settings) => Settings)) => void;
};
const C = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [rawSettings, setRaw] = useLocal<Settings>("gg_settings", DEFAULT_SETTINGS);
  const settings: Settings = { ...DEFAULT_SETTINGS, ...rawSettings };
  const setSettings = setRaw;

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [settings.theme]);

  // Bind a one-shot global unlock on the first user gesture ANYWHERE in the
  // app, so counter-tick audio works the moment the user taps — no need to
  // start a timer or toggle white noise first.
  useEffect(() => {
    if (typeof window === "undefined") return;
    let done = false;
    const handler = () => {
      if (done) return;
      done = true;
      unlockAudio();
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("pointerdown", handler, { passive: true });
    window.addEventListener("touchstart", handler, { passive: true });
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("touchstart", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  const bg = settings.customBg || (settings.theme === "dark" ? oceanBgDark : oceanBg);

  return (
    <C.Provider value={{ settings, setSettings }}>
      <div className="bg-scene" style={{ backgroundImage: `url(${bg})` }} />
      {children}
    </C.Provider>
  );
}

export function useApp() {
  const v = useContext(C);
  if (!v) throw new Error("useApp must be inside AppProvider");
  return v;
}

/* ============================================================
 * Counter tick audio engine
 * ------------------------------------------------------------
 * - Web Audio API fast path: pre-built AudioBuffer + BufferSource per tick.
 * - HTMLAudio fallback pool (6 nodes, all primed on unlock) — used whenever
 *   the AudioContext is suspended / interrupted / closed. Round-robin so
 *   rapid taps never block on a prior element's play() promise.
 * - Auto-heal: on visibility / focus / any user gesture, resume or rebuild
 *   the AudioContext.
 * - Pre-scheduling API: scheduleAutoTicks() queues future BufferSources on
 *   the Web Audio clock so auto-count ticks fire at exact intervals even
 *   when the JS thread is throttled (background tab).
 * ============================================================ */

let audioCtx: AudioContext | null = null;
let tickBuffer: AudioBuffer | null = null;
let tickGain: GainNode | null = null;
let ctxListenersBound = false;

// HTMLAudio fallback pool
let poolReady = false;
const pool: HTMLAudioElement[] = [];
let poolIdx = 0;
const POOL_SIZE = 6;
let tickBlobUrl: string | null = null;

function makeTickWavUrl(): string {
  const sr = 22050;
  const secs = 0.06;
  const len = Math.floor(sr * secs);
  const samples = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 32);
    samples[i] =
      Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * 880 * t) * env)) * 0x7fff;
  }
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Int16Array(buf, 44).set(samples);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function ensurePool() {
  if (poolReady || typeof window === "undefined") return;
  if (!tickBlobUrl) tickBlobUrl = makeTickWavUrl();
  for (let i = 0; i < POOL_SIZE; i++) {
    const a = new Audio(tickBlobUrl);
    a.preload = "auto";
    a.volume = 0.55;
    a.setAttribute("playsinline", "true");
    pool.push(a);
  }
  poolReady = true;
}

function playPoolTick() {
  ensurePool();
  if (!pool.length) return;
  const a = pool[poolIdx];
  poolIdx = (poolIdx + 1) % pool.length;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}

function bindCtxListeners() {
  if (ctxListenersBound || typeof document === "undefined") return;
  ctxListenersBound = true;
  const wake = () => {
    if (
      audioCtx &&
      (audioCtx.state === "suspended" ||
        (audioCtx.state as string) === "interrupted")
    ) {
      audioCtx.resume().catch(() => rebuildCtx());
    } else if (!audioCtx || (audioCtx.state as string) === "closed") {
      rebuildCtx();
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wake();
  });
  window.addEventListener("focus", wake);
  window.addEventListener("pageshow", wake);
  // Any tap is also a chance to reclaim audio.
  window.addEventListener("touchstart", wake, { passive: true });
  window.addEventListener("pointerdown", wake, { passive: true });
}

function rebuildCtx() {
  try {
    if (audioCtx) audioCtx.close().catch(() => {});
  } catch {}
  audioCtx = null;
  tickBuffer = null;
  tickGain = null;
  getCtx();
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx && (audioCtx.state as string) !== "closed") return audioCtx;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC({ latencyHint: "interactive" } as AudioContextOptions);
    tickGain = audioCtx.createGain();
    tickGain.gain.value = 0.55;
    tickGain.connect(audioCtx.destination);
    tickBuffer = buildTickBuffer(audioCtx);
    bindCtxListeners();
  } catch {
    return null;
  }
  return audioCtx;
}

function buildTickBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.06);
  const buf = ctx.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const env = Math.exp(-t * 32);
    data[i] = Math.sin(2 * Math.PI * 880 * t) * env;
  }
  return buf;
}

function primeOnePoolElement(a: HTMLAudioElement) {
  const originalVol = a.volume;
  try {
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {}
        a.volume = originalVol;
      }).catch(() => {
        a.volume = originalVol;
      });
    }
  } catch {
    a.volume = originalVol;
  }
}

/** Call from a user-gesture handler to unlock audio on iOS. Primes ALL pool
 *  elements so every round-robin slot works. */
export function unlockAudio() {
  ensurePool();
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  // Prime EVERY element in the pool so all round-robin slots are usable.
  for (const a of pool) primeOnePoolElement(a);
}

export function playFeedback(settings: Settings) {
  if (!settings.sound) return;
  const ctx = getCtx();
  if (ctx && tickBuffer && tickGain && ctx.state === "running") {
    try {
      const src = ctx.createBufferSource();
      src.buffer = tickBuffer;
      src.connect(tickGain);
      src.start(0);
      return;
    } catch {
      // fall through
    }
  }
  if (ctx && ctx.state !== "running") {
    ctx.resume().catch(() => rebuildCtx());
  }
  playPoolTick();
}

/* ---------- Auto-count tick pre-scheduler ----------
 * Queues future BufferSources on the Web Audio timeline so ticks fire on
 * the audio clock, not the (throttled) JS event loop. Refreshes the queue
 * every 500ms to keep the next ~3s of ticks scheduled.
 */

type ScheduledTick = { when: number; src: AudioBufferSourceNode };
let scheduled: ScheduledTick[] = [];
let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let schedulerIntervalSec = 1;
let schedulerAnchor = 0; // audio-clock time of "tick #0"
let schedulerNextIndex = 0;
const LOOKAHEAD_SEC = 3;

function pruneScheduled(now: number) {
  scheduled = scheduled.filter((t) => t.when > now - 0.05);
}

function scheduleUpcoming() {
  const ctx = getCtx();
  if (!ctx || !tickBuffer || !tickGain) return;
  if (ctx.state !== "running") {
    ctx.resume().catch(() => rebuildCtx());
    return;
  }
  const now = ctx.currentTime;
  pruneScheduled(now);
  const horizon = now + LOOKAHEAD_SEC;
  while (true) {
    const when = schedulerAnchor + schedulerNextIndex * schedulerIntervalSec;
    if (when > horizon) break;
    if (when >= now - 0.02) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = tickBuffer;
        src.connect(tickGain);
        src.start(Math.max(when, now));
        scheduled.push({ when, src });
      } catch {
        break;
      }
    }
    schedulerNextIndex++;
  }
}

/** Begin scheduling auto-count tick sounds every `intervalSec`.
 *  First tick fires at `firstAtEpochMs` (wall-clock ms). */
export function startAutoTickSchedule(intervalSec: number, firstAtEpochMs: number) {
  const ctx = getCtx();
  if (!ctx) return;
  stopAutoTickSchedule();
  schedulerIntervalSec = Math.max(0.1, intervalSec);
  // Convert wall-clock start into audio-clock time.
  const nowMs = Date.now();
  const deltaSec = (firstAtEpochMs - nowMs) / 1000;
  schedulerAnchor = ctx.currentTime + deltaSec;
  schedulerNextIndex = 0;
  scheduleUpcoming();
  schedulerTimer = setInterval(scheduleUpcoming, 500);
}

export function stopAutoTickSchedule() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
  for (const t of scheduled) {
    try {
      t.src.stop();
    } catch {}
  }
  scheduled = [];
  schedulerNextIndex = 0;
}
