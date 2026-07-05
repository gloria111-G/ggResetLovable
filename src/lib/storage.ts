import { useEffect, useState, useCallback } from "react";

export type Affirmation = {
  id: string;
  text: string;
  tag: string;
  count: number;
  createdAt: number;
};

export type Goal = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
  doneAt?: number;
  order?: number;
};

export type FocusLog = {
  id: string;
  date: string; // YYYY-MM-DD
  tag: string;
  affirmationId?: string;
  count: number;
  durationSec: number;
  timestamp: number;
  kind?: "affirm" | "breath";
};

export type BreathMode = "box" | "478" | "custom" | "off";

export type WhiteNoise = "off" | "waves" | "fire" | "rain";

export type Settings = {
  theme: "light" | "dark";
  customBg?: string;
  showBreath: boolean;
  showCounter: boolean;
  sound: boolean;
  breathMode: BreathMode;
  customBreath: { inhale: number; hold1: number; exhale: number; hold2: number };
  autoCountEnabled: boolean;
  autoCountInterval: number;
  counterMode: "today" | "total";
  keyboardCounter: boolean;
  focusDuration: number;
  breathFocusDuration: number;
  whiteNoiseEnabled: boolean;
  whiteNoise: WhiteNoise;
  whiteNoiseVolume: number; // 0-1
  /** Legacy single mode; kept for backward compat */
  timerMode: "countdown" | "stopwatch";
  affirmTimerMode: "countdown" | "stopwatch";
  breathTimerMode: "countdown" | "stopwatch";
  homeGuideShortcut: boolean;
  resetCounterEnabled: boolean;
};

export function dailyLogId(date: string, tag: string, affId?: string, kind: "affirm" | "breath" = "affirm") {
  return `daily-${kind}-${date}-${tag}-${affId || "none"}`;
}

export function upsertDailyLog(
  logs: FocusLog[],
  patch: {
    tag: string;
    affId?: string;
    addCount?: number;
    addDuration?: number;
    kind?: "affirm" | "breath";
  },
): FocusLog[] {
  const date = todayKey();
  const kind = patch.kind || "affirm";
  const id = dailyLogId(date, patch.tag, patch.affId, kind);
  const idx = logs.findIndex((l) => l.id === id);
  if (idx >= 0) {
    const next = logs.slice();
    next[idx] = {
      ...next[idx],
      count: next[idx].count + (patch.addCount || 0),
      durationSec: next[idx].durationSec + (patch.addDuration || 0),
      timestamp: Date.now(),
    };
    return next;
  }
  return [
    {
      id,
      date,
      tag: patch.tag,
      affirmationId: patch.affId,
      count: patch.addCount || 0,
      durationSec: patch.addDuration || 0,
      timestamp: Date.now(),
      kind,
    },
    ...logs,
  ];
}

const KEYS = {
  affirmations: "gg_affirmations",
  goals: "gg_goals",
  logs: "gg_focus_logs",
  settings: "gg_settings",
  tags: "gg_tags",
};

export const ACTIVE_SESSION_KEY = "gg_active_session";
export const ACTIVE_SESSION_KEY_AFFIRM = "gg_active_session_affirm";
export const ACTIVE_SESSION_KEY_BREATH = "gg_active_session_breath";

export const DEFAULT_TAGS = ["爱情", "财富", "健康", "事业", "自我概念", "人际关系"];

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  showBreath: true,
  showCounter: true,
  sound: false,
  breathMode: "box",
  customBreath: { inhale: 4, hold1: 4, exhale: 4, hold2: 4 },
  autoCountEnabled: false,
  autoCountInterval: 1,
  counterMode: "today",
  keyboardCounter: false,
  focusDuration: 300,
  breathFocusDuration: 300,
  whiteNoiseEnabled: false,
  whiteNoise: "off",
  whiteNoiseVolume: 0.5,
  timerMode: "countdown",
  affirmTimerMode: "countdown",
  breathTimerMode: "countdown",
  homeGuideShortcut: true,
  resetCounterEnabled: false,
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export function useLocal<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [state, setState] = useState<T>(initial);
  useEffect(() => {
    setState(read<T>(key, initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setState((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        write(key, next);
        return next;
      });
    },
    [key],
  );
  return [state, set];
}

export const storage = {
  KEYS,
  exportAll() {
    const data: Record<string, unknown> = {};
    Object.values(KEYS).forEach((k) => {
      const v = localStorage.getItem(k);
      if (v) data[k] = JSON.parse(v);
    });
    return data;
  },
  importAll(data: Record<string, unknown>) {
    Object.entries(data).forEach(([k, v]) => {
      if (Object.values(KEYS).includes(k)) {
        localStorage.setItem(k, JSON.stringify(v));
      }
    });
  },
  clearAll() {
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
