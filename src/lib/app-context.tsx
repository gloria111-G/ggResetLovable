import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_SETTINGS, useLocal, type Settings } from "./storage";
import { setWhiteNoise, stopWhiteNoise } from "./white-noise";
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

  useEffect(() => {
    if (settings.whiteNoise === "off") stopWhiteNoise();
    else setWhiteNoise(settings.whiteNoise, settings.whiteNoiseVolume);
  }, [settings.whiteNoise, settings.whiteNoiseVolume]);

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

let autoTickAudio: HTMLAudioElement | null = null;
let autoTickUrl: string | null = null;
let autoTickKey = "";

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

function makeAutoTickWavUrl(intervalSec: number, maxDurationSec?: number): string {
  const sr = 11025;
  const interval = Math.max(0.1, intervalSec);
  const finiteDuration = maxDurationSec && Number.isFinite(maxDurationSec)
    ? Math.max(0.1, maxDurationSec)
    : interval;
  const totalSecs = maxDurationSec ? finiteDuration : interval;
  const len = Math.max(1, Math.floor(sr * totalSecs));
  const samples = new Int16Array(len);
  const tickLen = Math.min(Math.floor(sr * 0.055), Math.max(1, Math.floor(sr * interval * 0.8)));
  const step = Math.max(1, Math.floor(sr * interval));
  for (let start = 0; start < len; start += step) {
    const end = Math.min(len, start + tickLen);
    for (let i = start; i < end; i++) {
      const t = (i - start) / sr;
      const env = Math.exp(-t * 34);
      samples[i] =
        Math.max(-1, Math.min(1, Math.sin(2 * Math.PI * 880 * t) * env)) * 0x7fff;
    }
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

function ensureAutoTickElement(intervalSec = 1, maxDurationSec?: number) {
  if (typeof window === "undefined") return null;
  if (!autoTickAudio) {
    autoTickAudio = new Audio();
    autoTickAudio.preload = "auto";
    autoTickAudio.volume = 0.55;
    autoTickAudio.setAttribute("playsinline", "true");
    autoTickAudio.setAttribute("x-webkit-playsinline", "true");
    autoTickAudio.setAttribute("webkit-playsinline", "true");
  }
  const finite = Boolean(maxDurationSec && Number.isFinite(maxDurationSec));
  const key = `${Math.max(0.1, intervalSec).toFixed(3)}:${finite ? Math.max(0.1, maxDurationSec || 0).toFixed(1) : "loop"}`;
  if (autoTickKey !== key) {
    if (autoTickUrl) URL.revokeObjectURL(autoTickUrl);
    autoTickUrl = makeAutoTickWavUrl(intervalSec, maxDurationSec);
    autoTickAudio.src = autoTickUrl;
    autoTickAudio.loop = !finite;
    autoTickAudio.load();
    autoTickKey = key;
  }
  return autoTickAudio;
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
    } else if (audioCtx && (audioCtx.state as string) === "closed") {
      rebuildCtx();
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
    audioCtx.onstatechange = () => {
      if (audioCtx && (audioCtx.state as string) === "closed") {
        audioCtx = null;
        tickBuffer = null;
        tickGain = null;
      }
    };
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
export function unlockAudio(autoIntervalSec = 1) {
  ensurePool();
  const ctx = getCtx();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => rebuildCtx());
  // Prime the pool silently so iOS accepts later .play() calls.
  pool.forEach((a) => {
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
  });
  const auto = ensureAutoTickElement(autoIntervalSec);
  if (auto) {
    const v = auto.volume;
    auto.volume = 0;
    const p = auto.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        auto.pause();
        auto.currentTime = 0;
        auto.volume = v;
      }).catch(() => {
        auto.volume = v;
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
    ctx.resume()
      .then(() => {
        if (tickBuffer && tickGain && ctx.state === "running") {
          const src = ctx.createBufferSource();
          src.buffer = tickBuffer;
          src.connect(tickGain);
          src.start(ctx.currentTime);
        }
      })
      .catch(() => rebuildCtx());
  }
  playPoolTick();
}

export function startAutoTickSound(intervalSec: number, remainingSec?: number) {
  const finiteRemaining =
    remainingSec && Number.isFinite(remainingSec) && remainingSec > 0 && remainingSec <= 30 * 60
      ? remainingSec
      : undefined;
  const el = ensureAutoTickElement(intervalSec, finiteRemaining);
  if (!el) return;
  try {
    el.currentTime = 0;
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}

export function stopAutoTickSound() {
  if (!autoTickAudio) return;
  try {
    autoTickAudio.pause();
    autoTickAudio.currentTime = 0;
  } catch {}
}




