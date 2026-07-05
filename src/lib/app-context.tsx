import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_SETTINGS, useLocal, type Settings } from "./storage";
import oceanBg from "@/assets/ocean-bg.jpg";
import oceanBgDark from "@/assets/ocean-bg-dark.jpg";
import {
  setWhiteNoise,
  stopWhiteNoise,
  resumeWhiteNoise,
  unlockWhiteNoise,
} from "./white-noise";

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

  // ------------------------------------------------------------
  // Single source of truth for white-noise playback.
  // Timer start/pause/end MUST NEVER touch white noise.
  // ------------------------------------------------------------
  useEffect(() => {
    if (settings.whiteNoise === "off") {
      stopWhiteNoise();
    } else {
      setWhiteNoise(settings.whiteNoise, settings.whiteNoiseVolume);
    }
  }, [settings.whiteNoise, settings.whiteNoiseVolume]);

  // Global one-shot audio unlock on first user gesture (iOS requirement).
  useEffect(() => {
    let done = false;
    const handler = () => {
      if (done) return;
      done = true;
      unlockAudio();
      unlockWhiteNoise();
      if (settings.whiteNoise !== "off") {
        setWhiteNoise(settings.whiteNoise, settings.whiteNoiseVolume);
      }
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("pointerdown", handler, { once: false });
    window.addEventListener("keydown", handler, { once: false });
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On foreground return, try to resume white noise (iOS may have paused it).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (audioCtx && audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }
      resumeWhiteNoise();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("pageshow", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onVis);
      window.removeEventListener("pageshow", onVis);
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

// ---------- Counter tick sound ----------
// Web Audio API with a pre-built AudioBuffer for zero-latency, non-blocking
// playback. Every tick spawns a fresh BufferSource so rapid calls overlap.
// Self-heals if the AudioContext gets closed by an iOS media interruption.

let audioCtx: AudioContext | null = null;
let tickBuffer: AudioBuffer | null = null;
let tickGain: GainNode | null = null;

function buildCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const gain = ctx.createGain();
    gain.gain.value = 0.55;
    gain.connect(ctx.destination);
    audioCtx = ctx;
    tickGain = gain;
    tickBuffer = buildTickBuffer(ctx);
    return ctx;
  } catch {
    return null;
  }
}

function getCtx(): AudioContext | null {
  if (audioCtx && audioCtx.state !== "closed") return audioCtx;
  audioCtx = null;
  tickGain = null;
  tickBuffer = null;
  return buildCtx();
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

/** Call from a user gesture handler to unlock audio on iOS. Self-heals dead ctx. */
export function unlockAudio() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

export function playFeedback(settings: Settings) {
  if (!settings.sound) return;
  // Never queue ticks while backgrounded — they'd burst on return.
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  const ctx = getCtx();
  if (!ctx || !tickGain || !tickBuffer) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
    // Skip this tick rather than queuing while suspended.
    return;
  }
  if (ctx.state !== "running") return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = tickBuffer;
    src.connect(tickGain);
    src.start(0);
  } catch {
    // Ctx likely died mid-play; drop tick, next call will rebuild.
    audioCtx = null;
    tickGain = null;
    tickBuffer = null;
  }
}
