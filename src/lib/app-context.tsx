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
  // Merge stored settings with defaults so newly-added fields always have values
  const settings: Settings = { ...DEFAULT_SETTINGS, ...rawSettings };
  const setSettings = setRaw;

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, [settings.theme]);

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

// ---------- Counter tick sound ----------
// Uses Web Audio API with a pre-built AudioBuffer for zero-latency,
// non-blocking playback. Every tick spawns a fresh BufferSource so
// rapid calls overlap instead of queueing.

let audioCtx: AudioContext | null = null;
let tickBuffer: AudioBuffer | null = null;
let tickGain: GainNode | null = null;
let ctxListenersBound = false;

// HTMLAudio fallback pool (when Web Audio is unavailable / interrupted).
// Small round-robin of 6 identical <audio> nodes → overlapping playback
// without waiting on a single element's `play()` promise.
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
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wake();
  });
  window.addEventListener("focus", wake);
  window.addEventListener("pageshow", wake);
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
    audioCtx = new AC();
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

/** Call from a user-gesture handler (e.g. Start button) to unlock audio on iOS. */
export function unlockAudio() {
  ensurePool();
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  // Prime the pool silently so iOS accepts later .play() calls.
  if (pool.length) {
    const a = pool[0];
    const v = a.volume;
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        a.pause();
        a.currentTime = 0;
        a.volume = v;
      }).catch(() => {
        a.volume = v;
      });
    }
  }
}

export function playFeedback(settings: Settings) {
  if (!settings.sound) return;
  const ctx = getCtx();
  // Web Audio fast-path — non-blocking, overlaps freely.
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
  // Web Audio is suspended/interrupted/closed — kick a resume AND play a
  // pool tick immediately so the user hears feedback right now.
  if (ctx && ctx.state !== "running") {
    ctx.resume().catch(() => rebuildCtx());
  }
  playPoolTick();
}




