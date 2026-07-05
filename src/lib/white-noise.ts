// HTML5 Audio-based white noise. Uses the media channel so iOS users
// can mute the ringer and still hear it. Single instance — never overlaps.
// Files are hosted in /public. URL-encode to handle non-ASCII filenames on iOS.
//
// Design invariants:
// - Timer start/pause/end MUST NEVER touch white noise.
// - unlockWhiteNoise() is idempotent + non-destructive: it never pauses or
//   resets currentTime on a stream that is already playing.

import type { WhiteNoise } from "./storage";

const SOURCES: Record<Exclude<WhiteNoise, "off">, string> = {
  waves: encodeURI("/海浪.mp3"),
  rain: encodeURI("/雨声.mp3"),
  fire: encodeURI("/篝火.mp3"),
};

let audio: HTMLAudioElement | null = null;
let currentMode: WhiteNoise = "off";
let currentVolume = 0.5;
let unlocked = false;

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    const el = new Audio();
    el.loop = true;
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    try {
      // @ts-expect-error - non-standard but widely supported
      el.mozAudioChannelType = "content";
    } catch {}
    el.setAttribute("playsinline", "true");
    el.setAttribute("x-webkit-playsinline", "true");
    el.setAttribute("webkit-playsinline", "true");
    audio = el;
  }
  return audio;
}

/** Prime the audio element on a user gesture. Idempotent: only unlocks once,
 * and never interrupts a currently-playing stream. */
export function unlockWhiteNoise() {
  if (unlocked) return;
  const el = ensureAudio();
  if (!el) return;
  unlocked = true;
  if (!el.src) {
    el.src = SOURCES.waves;
    el.load();
  }
  // Only do the silent play/pause dance if the element is not already playing.
  if (!el.paused) return;
  try {
    const v = el.volume;
    el.volume = 0;
    const p = el.play();
    if (p && typeof p.then === "function") {
      p.then(() => {
        el.pause();
        el.currentTime = 0;
        el.volume = v;
      }).catch(() => {
        el.volume = v;
      });
    }
  } catch {}
}

export function setWhiteNoise(mode: WhiteNoise, volume: number) {
  const el = ensureAudio();
  if (!el) return;
  currentVolume = Math.max(0, Math.min(1, volume));
  el.volume = currentVolume;

  if (mode === "off") {
    stopWhiteNoise();
    return;
  }

  if (mode !== currentMode) {
    currentMode = mode;
    try {
      el.pause();
    } catch {}
    el.src = SOURCES[mode];
    el.loop = true;
    el.load();
  }
  // If already playing this mode, don't restart — just ensure volume applied.
  if (!el.paused && el.currentTime > 0) return;
  const p = el.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

/** Attempt to resume a paused white-noise stream without changing mode.
 * Safe to call any time; a no-op if disabled or already playing. */
export function resumeWhiteNoise() {
  if (currentMode === "off") return;
  const el = ensureAudio();
  if (!el) return;
  if (!el.paused) return;
  const p = el.play();
  if (p && typeof p.catch === "function") p.catch(() => {});
}

export function stopWhiteNoise() {
  if (audio) {
    try {
      audio.pause();
    } catch {}
  }
  currentMode = "off";
}

export function setWhiteNoiseVolume(volume: number) {
  currentVolume = Math.max(0, Math.min(1, volume));
  if (audio) audio.volume = currentVolume;
}

export function getCurrentWhiteNoise(): WhiteNoise {
  return currentMode;
}
