/**
 * AudioManager — single source of truth for all audio in GG RESET.
 *
 * Rules (iron law):
 *   (1) Counter tick and white noise are independent — neither touches the other.
 *   (2) Every tick plays immediately and never queues while backgrounded
 *       (no burst on foreground return).
 *   (3) White noise plays whenever `whiteNoiseTrack !== "off"`, regardless of
 *       timer state. Timer start / pause / end never touch white noise.
 *
 * Settings only mutate manager state; the manager decides play/pause.
 */

import type { WhiteNoise } from "./storage";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type State = {
  soundEnabled: boolean;
  whiteNoiseTrack: WhiteNoise;
};

let state: State = {
  soundEnabled: false,
  whiteNoiseTrack: "off",
};

// ---------------------------------------------------------------------------
// White-noise player (HTMLAudioElement, media channel)
// ---------------------------------------------------------------------------

const SOURCES: Record<Exclude<WhiteNoise, "off">, string> = {
  waves: encodeURI("/海浪.mp3"),
  fire: encodeURI("/篝火.mp3"),
  rain: encodeURI("/雨声.mp3"),
};

let wnEl: HTMLAudioElement | null = null;
let wnLoadedTrack: WhiteNoise = "off";

function ensureWnEl(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!wnEl) {
    const el = new Audio();
    el.loop = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    el.setAttribute("playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    el.setAttribute("x-webkit-playsinline", "true");
    wnEl = el;
  }
  return wnEl;
}

function shouldPlayWN(): boolean {
  return state.whiteNoiseTrack !== "off";
}

/** Reconcile WN element with desired state. Idempotent, non-destructive:
 *  never resets currentTime on an already-playing stream. */
function reconcileWN() {
  const el = ensureWnEl();
  if (!el) return;
  // Volume stays at the element default (1.0) — users control loudness
  // through their device / system volume.

  if (!shouldPlayWN()) {
    if (!el.paused) {
      try {
        el.pause();
      } catch {}
    }
    return;
  }

  if (wnLoadedTrack !== state.whiteNoiseTrack) {
    try {
      el.pause();
    } catch {}
    el.src = SOURCES[state.whiteNoiseTrack as Exclude<WhiteNoise, "off">];
    el.load();
    wnLoadedTrack = state.whiteNoiseTrack;
  }

  if (el.paused) {
    const p = el.play();
    if (p && typeof p.catch === "function") p.catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Counter tick (Web Audio, self-healing)
// ---------------------------------------------------------------------------

let ctx: AudioContext | null = null;
let tickBuf: AudioBuffer | null = null;
let tickGain: GainNode | null = null;

function buildCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    const c = new AC();
    const g = c.createGain();
    g.gain.value = 0.55;
    g.connect(c.destination);
    ctx = c;
    tickGain = g;
    tickBuf = buildTickBuf(c);
    return c;
  } catch {
    return null;
  }
}

function getCtx(): AudioContext | null {
  if (ctx && ctx.state !== "closed") return ctx;
  ctx = null;
  tickGain = null;
  tickBuf = null;
  return buildCtx();
}

function buildTickBuf(c: AudioContext): AudioBuffer {
  const sr = c.sampleRate;
  const len = Math.floor(sr * 0.06);
  const buf = c.createBuffer(1, len, sr);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    data[i] = Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 32);
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const audioManager = {
  /** Called by AppProvider whenever settings change. */
  syncSettings(patch: Partial<State>) {
    state = { ...state, ...patch };
    reconcileWN();
  },

  /** First user gesture in the session. Unlocks the tick AudioContext
   *  and — if a white-noise track is selected — starts it. */
  unlock() {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    reconcileWN();
  },

  /** Play one counter tick. No stacking, no queueing while backgrounded. */
  playTick(force = false) {
    if (!force && !state.soundEnabled) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const c = getCtx();
    if (!c || !tickGain || !tickBuf) return;
    if (c.state === "suspended") {
      c.resume().catch(() => {});
      return;
    }
    if (c.state !== "running") return;
    try {
      const src = c.createBufferSource();
      src.buffer = tickBuf;
      src.connect(tickGain);
      src.start(0);
    } catch {
      ctx = null;
      tickGain = null;
      tickBuf = null;
    }
  },

  /** Foreground return (visibilitychange/focus/pageshow). */
  resume() {
    const c = getCtx();
    if (c && c.state === "suspended") c.resume().catch(() => {});
    reconcileWN();
  },
};
