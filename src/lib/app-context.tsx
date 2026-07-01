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

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
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
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  if (!tickBuffer) tickBuffer = buildTickBuffer(ctx);
}

export function playFeedback(settings: Settings) {
  if (!settings.sound) return;
  const ctx = getCtx();
  if (!ctx || !tickGain) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  if (!tickBuffer) tickBuffer = buildTickBuffer(ctx);
  try {
    const src = ctx.createBufferSource();
    src.buffer = tickBuffer;
    src.connect(tickGain);
    src.start(0);
  } catch {}
}



