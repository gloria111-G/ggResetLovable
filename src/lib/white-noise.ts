// Unified white-noise player.
// - Single HTMLAudioElement (media channel — plays even when phone is silenced)
// - Perfect loop via `loop=true`
// - Desired-state model: components call setWhiteNoise(mode, volume). The
//   manager decides whether to (re)load / play / pause. It NEVER pauses to
//   "unlock" an already-playing stream.
// - Auto-recovery: on visibilitychange / pageshow / focus / element pause,
//   if user wants noise on and it's not playing, resume it.
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
let recoveryScheduled = false;
let recoveryRetry: ReturnType<typeof setTimeout> | null = null;

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
      if (desired.mode !== "off") scheduleRecover();
    });
    el.addEventListener("ended", () => {
      // loop=true means this shouldn't fire, but be defensive.
      if (desired.mode !== "off") scheduleRecover();
    });
    el.addEventListener("stalled", () => {
      if (desired.mode !== "off") scheduleRecover();
    });
    el.addEventListener("waiting", () => {
      if (desired.mode !== "off") scheduleRecover();
    });
    el.addEventListener("error", () => {
      if (desired.mode !== "off") {
        currentMode = "off";
        scheduleRecover();
      }
    });
    audio = el;
  }
  bindGlobalListeners();
  return audio;
}

function scheduleRecover() {
  if (recoveryScheduled) return;
  recoveryScheduled = true;
  // Small delay so we don't fight an in-flight play() that's about to resolve.
  setTimeout(() => {
    recoveryScheduled = false;
    if (desired.mode === "off") return;
    tryPlayDesired();
  }, 120);
}

function scheduleRetry() {
  if (recoveryRetry || desired.mode === "off") return;
  recoveryRetry = setTimeout(() => {
    recoveryRetry = null;
    if (desired.mode === "off") return;
    tryPlayDesired();
  }, 1600);
}

function bindGlobalListeners() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  const onWake = () => {
    if (desired.mode !== "off") scheduleRecover();
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) onWake();
  });
  window.addEventListener("focus", onWake);
  window.addEventListener("pageshow", onWake);
  window.addEventListener("online", onWake);
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
    navigator.mediaSession.setActionHandler?.("play", () => tryPlayDesired());
    navigator.mediaSession.setActionHandler?.("pause", () => {
      // System/media interruptions often arrive as a pause action on mobile.
      // Keep the user's setting intact and recover instead of turning noise off.
      scheduleRecover();
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
        // Media interruption/autoplay guard — keep trying lightly while the
        // desired state is still on, and wake listeners will also retry.
        scheduleRetry();
      });
    }
  } else if (!el.paused && recoveryRetry) {
    clearTimeout(recoveryRetry);
    recoveryRetry = null;
  }
  updateMediaSession(currentMode);
}

/**
 * Prime audio on a user gesture. iOS Safari requires this before any
 * programmatic play() will actually make sound. We do NOT play-then-pause
 * (that killed running audio); instead we mark ourselves unlocked and let
 * the next setWhiteNoise() call actually start playback.
 */
export function unlockWhiteNoise() {
  const el = ensureAudio();
  if (!el || unlocked) return;
  unlocked = true;
  // Bind a silent no-op play to unlock the element for future .play() calls
  // WITHOUT stopping current audio.
  if (!el.src) {
    try {
      // load a valid src at low volume so the priming play() succeeds
      el.src = SOURCES.waves;
      el.load();
      const originalVol = el.volume;
      el.volume = 0;
      const p = el.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          // Immediately stop so we don't spam audio when user didn't ask.
          el.pause();
          el.currentTime = 0;
          el.volume = originalVol;
          currentMode = "off";
          // If user had already asked for noise (e.g. via Settings preview),
          // fulfill it now.
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
  tryPlayDesired();
}

export function stopWhiteNoise() {
  desired = { ...desired, mode: "off" };
  if (recoveryRetry) {
    clearTimeout(recoveryRetry);
    recoveryRetry = null;
  }
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
