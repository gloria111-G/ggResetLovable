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

// Pre-generated short "tick" WAV data URI — plays through media channel on iOS.
let feedbackAudio: HTMLAudioElement | null = null;
function getFeedbackAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (feedbackAudio) return feedbackAudio;
  try {
    // 880Hz sine, 80ms, exp decay — generated as WAV PCM16 data URL.
    const sr = 22050;
    const len = Math.floor(sr * 0.08);
    const buf = new ArrayBuffer(44 + len * 2);
    const dv = new DataView(buf);
    const writeStr = (off: number, s: string) =>
      [...s].forEach((c, i) => dv.setUint8(off + i, c.charCodeAt(0)));
    writeStr(0, "RIFF");
    dv.setUint32(4, 36 + len * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);
    dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true);
    dv.setUint32(28, sr * 2, true);
    dv.setUint16(32, 2, true);
    dv.setUint16(34, 16, true);
    writeStr(36, "data");
    dv.setUint32(40, len * 2, true);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const env = Math.exp(-t * 28);
      const v = Math.sin(2 * Math.PI * 880 * t) * env * 0.6;
      dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 32767, true);
    }
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const dataUrl = "data:audio/wav;base64," + btoa(bin);
    const a = new Audio(dataUrl);
    a.preload = "auto";
    a.setAttribute("playsinline", "true");
    a.setAttribute("x-webkit-playsinline", "true");
    feedbackAudio = a;
    return a;
  } catch {
    return null;
  }
}

export function playFeedback(settings: Settings) {
  if (!settings.sound) return;
  const a = getFeedbackAudio();
  if (!a) return;
  try {
    a.currentTime = 0;
    const p = a.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch {}
}

