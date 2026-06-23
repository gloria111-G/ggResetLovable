// Procedural white noise generator using Web Audio API.
// No audio assets needed; works fully offline.

import type { WhiteNoise } from "./storage";

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeNodes: AudioNode[] = [];
let currentMode: WhiteNoise = "off";

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

function makeNoiseBuffer(c: AudioContext, seconds = 4): AudioBuffer {
  const len = c.sampleRate * seconds;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function stopAll() {
  activeNodes.forEach((n) => {
    try {
      (n as AudioScheduledSourceNode).stop?.();
    } catch {}
    try {
      n.disconnect();
    } catch {}
  });
  activeNodes = [];
}

export function setWhiteNoise(mode: WhiteNoise, volume: number) {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  if (mode === currentMode && masterGain) {
    masterGain.gain.value = volume;
    return;
  }

  stopAll();
  currentMode = mode;

  if (mode === "off") {
    if (masterGain) {
      masterGain.gain.value = 0;
    }
    return;
  }

  if (!masterGain) {
    masterGain = c.createGain();
    masterGain.connect(c.destination);
  }
  masterGain.gain.value = volume;

  const noise = c.createBufferSource();
  noise.buffer = makeNoiseBuffer(c, 4);
  noise.loop = true;
  activeNodes.push(noise);

  if (mode === "rain") {
    // bright pink-ish noise + slight high-pass
    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 800;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 6000;
    noise.connect(hp).connect(lp).connect(masterGain);
    activeNodes.push(hp, lp);
  } else if (mode === "waves") {
    // low-passed brown-ish noise with slow LFO amplitude
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 500;
    const lp2 = c.createBiquadFilter();
    lp2.type = "lowpass";
    lp2.frequency.value = 250;
    const wave = c.createGain();
    wave.gain.value = 0.6;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.12; // ~8s cycle
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.4;
    lfo.connect(lfoGain).connect(wave.gain);
    lfo.start();
    noise.connect(lp).connect(lp2).connect(wave).connect(masterGain);
    activeNodes.push(lp, lp2, wave, lfo, lfoGain);
  } else if (mode === "fire") {
    // crackly: low rumble + random pops
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 400;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 0.6;
    const mix = c.createGain();
    mix.gain.value = 0.9;
    noise.connect(lp).connect(mix);
    // separate crackle channel
    const crackle = c.createBufferSource();
    crackle.buffer = makeNoiseBuffer(c, 4);
    crackle.loop = true;
    const crackleGain = c.createGain();
    crackleGain.gain.value = 0.25;
    crackle.connect(bp).connect(crackleGain).connect(mix);
    mix.connect(masterGain);
    crackle.start();
    activeNodes.push(lp, bp, mix, crackle, crackleGain);
  }

  noise.start();
}

export function stopWhiteNoise() {
  stopAll();
  currentMode = "off";
}

export function setWhiteNoiseVolume(volume: number) {
  if (masterGain) masterGain.gain.value = volume;
}
