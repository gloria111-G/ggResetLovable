/* eslint-disable @typescript-eslint/no-explicit-any */
// Inline Blob-based Web Worker for accurate background ticking.
// The worker runs on its own thread — not throttled to 1Hz when the tab is
// backgrounded on desktop, and keeps ticking on iOS as long as the audio
// context/media session keeps the page alive.

const WORKER_SRC = `
let interval = 1000;
let last = 0;
let handle = null;

function step() {
  const now = Date.now();
  const elapsed = now - last;
  const n = Math.floor(elapsed / interval);
  if (n > 0) {
    last += n * interval;
    postMessage({ type: 'tick', n, at: now });
  }
}

self.onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === 'start') {
    interval = Math.max(50, Math.floor(msg.interval * 1000));
    last = msg.startAt || Date.now();
    if (handle) clearInterval(handle);
    // Poll faster than the interval so drift stays sub-100ms
    handle = setInterval(step, Math.min(200, interval));
  } else if (msg.type === 'stop') {
    if (handle) clearInterval(handle);
    handle = null;
  } else if (msg.type === 'update') {
    interval = Math.max(50, Math.floor(msg.interval * 1000));
  } else if (msg.type === 'sync') {
    // Force a catch-up flush based on current wall clock
    step();
  }
};
`;

export type AutoTickHandler = (n: number) => void;

export class AutoCountWorker {
  private worker: Worker | null = null;
  private handler: AutoTickHandler = () => {};
  private url: string | null = null;

  constructor() {
    if (typeof window === "undefined") return;
    try {
      const blob = new Blob([WORKER_SRC], { type: "application/javascript" });
      this.url = URL.createObjectURL(blob);
      this.worker = new Worker(this.url);
      this.worker.onmessage = (e: MessageEvent) => {
        const d = e.data as { type: string; n?: number };
        if (d.type === "tick" && d.n) this.handler(d.n);
      };
    } catch {
      this.worker = null;
    }
  }

  onTick(h: AutoTickHandler) {
    this.handler = h;
  }

  start(intervalSec: number, startAt = Date.now()) {
    this.worker?.postMessage({ type: "start", interval: intervalSec, startAt });
  }
  stop() {
    this.worker?.postMessage({ type: "stop" });
  }
  update(intervalSec: number) {
    this.worker?.postMessage({ type: "update", interval: intervalSec });
  }
  sync() {
    this.worker?.postMessage({ type: "sync" });
  }
  destroy() {
    try {
      this.worker?.terminate();
    } catch {}
    if (this.url) URL.revokeObjectURL(this.url);
    this.worker = null;
    this.url = null;
  }
}
