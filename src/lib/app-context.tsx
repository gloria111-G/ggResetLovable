import { createContext, useContext, useEffect, type ReactNode } from "react";
import { DEFAULT_SETTINGS, useLocal, type Settings } from "./storage";
import oceanBg from "@/assets/ocean-bg.jpg";
import oceanBgDark from "@/assets/ocean-bg-dark.jpg";
import { audioManager } from "./audio-manager";

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

  // Sync settings → AudioManager. The manager is the only thing that
  // actually starts/stops audio.
  useEffect(() => {
    audioManager.syncSettings({
      soundEnabled: settings.sound,
      whiteNoiseTrack: settings.whiteNoise,
    });
  }, [settings.sound, settings.whiteNoise]);

  // First user gesture unlock (iOS requirement).
  useEffect(() => {
    let done = false;
    const handler = () => {
      if (done) return;
      done = true;
      audioManager.unlock();
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  // Foreground return.
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      audioManager.resume();
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
