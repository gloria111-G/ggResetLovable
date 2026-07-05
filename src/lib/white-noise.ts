// Unified white-noise player.
// - Single HTMLAudioElement (media channel — plays even when phone is silenced)
// - Perfect loop via `loop=true`
// - Desired-state model: components call setWhiteNoise(mode, volume). The
//   manager decides whether to (re)load / play / pause. It NEVER pauses to
//   "unlock" an already-playing stream.
// - Auto-recovery: exponential-backoff retry after interruption, plus
//   listeners on visibilitychange / pageshow / focus / global touchstart /
//   element pause so the stream reclaims the audio channel when other
//   media finishes.
// - Media Session: register lightweight metadata so iOS treats it as a real
//   media session that survives interruptions.

import type { WhiteNoise } from "./storage";

const SOURCES: Record<Exclude<WhiteNoise, "off">, string> = {
  waves: encodeURI("/海浪.mp3"),
  rain: encodeURI("/雨声.mp3"),
  fire: encodeURI("/篝火.mp3"),
};

const LABELS: Record<Exclude<WhiteNoise, "off">, string> = {
  waves: "海浪 · Waves",
  rain: "雨声 · Rain",
  fire: "篝火 · Fire",
};

type Desired = { mode: WhiteNoise; volume: number };

let audio: HTMLAudioElement | null = null;
let currentMode: WhiteNoise = "off";
let desired: Desired = { mode: "off", volume: 0.5 };
let unlocked = false;
let listenersBound = false;

// Exponential-backoff retry state
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 0;
const RETRY_MIN = 1000;
const RETRY_MAX = 8000;

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    const el = new Audio();
    el.loop = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    el.setAttribute("playsinline", "true");
    el.setAttribute("x-webkit-playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    try {
      // @ts-expect-error non-standard, iOS/Firefox
      el.mozAudioChannelType = "content";
    } catch {}
    // Auto-recover when element is paused externally (interruption) but
    // the user still wants noise on.
    el.addEventListener("pause", () => {
      if (desired.mode !== "off") scheduleRetry();
    });
    el.addEventListener("ended", () => {
      if (desired.mode !== "off") scheduleRetry();
    });
    // Success → clear backoff
    el.addEventListener("playing", () => {
      retryDelay = 0;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    });
    audio = el;
  }
  bindGlobalListeners();
  return audio;
}

function scheduleRetry() {
  if (desired.mode === "off") return;
  if (retryTimer) return; // already queued
  retryDelay = retryDelay === 0 ? RETRY_MIN : Math.min(retryDelay * 2, RETRY_MAX);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (desired.mode === "off") return;
    tryPlayDesired();
    // If still paused after attempt, queue the next backoff
    if (audio && audio.paused && desired.mode !== "off") scheduleRetry();
  }, retryDelay);
}

function wakeNow() {
  if (desired.mode === "off") return;
  // Cancel any pending backoff and try immediately on user-visible events.
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryDelay = 0;
  tryPlayDesired();
  // If still not playing after this attempt, resume backoff
  if (audio && audio.paused) scheduleRetry();
}

function bindGlobalListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wakeNow();
  });
  window.addEventListener("focus", wakeNow);
  window.addEventListener("pageshow", wakeNow);
  // Any user tap anywhere is a chance to reclaim audio focus.
  const onTap = () => wakeNow();
  window.addEventListener("touchstart", onTap, { passive: true });
  window.addEventListener("pointerdown", onTap, { passive: true });
}

function updateMediaSession(mode: WhiteNoise) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  try {
    if (mode === "off") {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.playbackState = "paused";
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: LABELS[mode],
      artist: "GG RESET",
      album: "白噪音",
    });
    navigator.mediaSession.playbackState = "playing";
    navigator.mediaSession.setActionHandler?.("play", () => wakeNow());
    navigator.mediaSession.setActionHandler?.("pause", () => {
      desired = { ...desired, mode: "off" };
      stopWhiteNoise();
    });
  } catch {}
}

function tryPlayDesired() {
  const el = ensureAudio();
  if (!el || desired.mode === "off") return;
  const targetSrc = SOURCES[desired.mode];
  const need = currentMode !== desired.mode;
  if (need) {
    currentMode = desired.mode;
    try {
      el.pause();
    } catch {}
    el.src = targetSrc;
    el.loop = true;
    el.load();
  }
  el.volume = Math.max(0, Math.min(1, desired.volume));
  if (el.paused) {
    const p = el.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => {
        // Autoplay blocked — retry with backoff / next user gesture.
        if (desired.mode !== "off") scheduleRetry();
      });
    }
  }
  updateMediaSession(currentMode);
}

/**
 * Prime the white-noise element on a user gesture. iOS Safari requires this
 * before any programmatic play() will actually make sound. Does NOT stop
 * anything already playing.
 */
export function unlockWhiteNoise() {
  const el = ensureAudio();
  if (!el || unlocked) return;
  unlocked = true;
  if (!el.src) {
    try {
      el.src = SOURCES.waves;
      el.load();
      const originalVol = el.volume;
      el.volume = 0;
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          el.pause();
          el.currentTime = 0;
          el.volume = originalVol;
          currentMode = "off";
          if (desired.mode !== "off") tryPlayDesired();
        }).catch(() => {
          el.volume = originalVol;
        });
      } else {
        el.pause();
        el.volume = originalVol;
      }
    } catch {}
  } else if (desired.mode !== "off") {
    tryPlayDesired();
  }
}

export function setWhiteNoise(mode: WhiteNoise, volume: number) {
  const el = ensureAudio();
  if (!el) return;
  desired = { mode, volume: Math.max(0, Math.min(1, volume)) };
  if (mode === "off") {
    stopWhiteNoise();
    return;
  }
  retryDelay = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  tryPlayDesired();
}

export function stopWhiteNoise() {
  desired = { ...desired, mode: "off" };
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  retryDelay = 0;
  if (audio) {
    try {
      audio.pause();
    } catch {}
  }
  currentMode = "off";
  updateMediaSession("off");
}

export function setWhiteNoiseVolume(volume: number) {
  desired.volume = Math.max(0, Math.min(1, volume));
  if (audio) audio.volume = desired.volume;
}

export function getCurrentWhiteNoise(): WhiteNoise {
  return currentMode;
}
