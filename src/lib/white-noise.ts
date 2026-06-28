// HTML5 Audio-based white noise. Uses the media channel so iOS users
// can mute the ringer and still hear it. Single instance — never overlaps.

import type { WhiteNoise } from "./storage";

const SOURCES: Record<Exclude<WhiteNoise, "off">, string> = {
  waves: "/海浪.mp3",
  rain: "/雨声.mp3",
  fire: "/篝火.mp3",
};

let audio: HTMLAudioElement | null = null;
let currentMode: WhiteNoise = "off";
let currentVolume = 0.5;

function ensureAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!audio) {
    const el = new Audio();
    el.loop = true;
    el.preload = "auto";
    try {
      // @ts-expect-error - non-standard but widely supported
      el.mozAudioChannelType = "content";
    } catch {}
    el.setAttribute("playsinline", "true");
    el.setAttribute("x-webkit-playsinline", "true");
    audio = el;
  }
  return audio;
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
    el.load();
  }
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
