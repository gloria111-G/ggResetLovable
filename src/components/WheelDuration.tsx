import { useEffect, useRef, useState } from "react";

// Apple-style wheel time picker: hours / minutes / seconds.
// Max 16 hours. Supports wheel-scroll, touch, AND mouse click-drag on desktop.

const ITEM_H = 36; // px
const VISIBLE = 5; // odd, total visible rows
const VIEW_H = ITEM_H * VISIBLE; // 180

function Column({
  values,
  value,
  onChange,
  unit,
  disabled,
}: {
  values: number[];
  value: number;
  onChange: (v: number) => void;
  unit: string;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settleRef = useRef<number | null>(null);

  // Sync scroll position when value changes externally
  useEffect(() => {
    if (!ref.current) return;
    const idx = Math.max(0, values.indexOf(value));
    const target = idx * ITEM_H;
    if (Math.abs(ref.current.scrollTop - target) > 1) {
      ref.current.scrollTop = target;
    }
  }, [value, values]);

  function settle() {
    if (settleRef.current) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      const v = values[clamped];
      ref.current.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      if (v !== value) onChange(v);
    }, 120);
  }

  // Mouse click-drag support (vertical)
  const drag = useRef<{ y: number; startTop: number; active: boolean } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    if (disabled || !ref.current) return;
    drag.current = { y: e.clientY, startTop: ref.current.scrollTop, active: true };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    (e.currentTarget as HTMLElement).style.cursor = "grabbing";
  }
  function onMouseMove(e: MouseEvent) {
    if (!drag.current || !ref.current) return;
    const dy = e.clientY - drag.current.y;
    ref.current.scrollTop = drag.current.startTop - dy;
  }
  function onMouseUp() {
    if (drag.current && ref.current) ref.current.style.cursor = "grab";
    drag.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    settle();
  }

  // Click on a row to select
  function clickValue(v: number) {
    if (disabled) return;
    onChange(v);
  }

  return (
    <div className="relative flex-1 select-none">
      <div
        ref={ref}
        onScroll={settle}
        onMouseDown={onMouseDown}
        onWheel={() => settle()}
        className={`overflow-y-scroll scrollbar-hide snap-y snap-mandatory ${
          disabled ? "pointer-events-none opacity-50" : "cursor-grab"
        }`}
        style={{
          height: VIEW_H,
          scrollSnapType: "y mandatory",
          scrollbarWidth: "none",
        }}
      >
        <div style={{ height: ITEM_H * Math.floor(VISIBLE / 2) }} />
        {values.map((v) => (
          <div
            key={v}
            onClick={() => clickValue(v)}
            className={`snap-center flex items-center justify-center font-num tabular-nums transition-opacity ${
              v === value
                ? "opacity-100 text-3xl"
                : "opacity-40 text-base hover:opacity-70"
            }`}
            style={{ height: ITEM_H }}
          >
            {String(v).padStart(2, "0")}
            <span className="text-[10px] ml-1 opacity-60">{unit}</span>
          </div>
        ))}
        <div style={{ height: ITEM_H * Math.floor(VISIBLE / 2) }} />
      </div>
      {/* center highlight */}
      <div
        className="pointer-events-none absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-xl glass-strong"
        style={{ height: ITEM_H }}
      />
    </div>
  );
}

export function WheelDuration({
  seconds,
  onChange,
  disabled,
}: {
  seconds: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const [vh, setH] = useState(h);
  const [vm, setM] = useState(m);
  const [vs, setS] = useState(s);

  useEffect(() => {
    setH(h);
    setM(m);
    setS(s);
  }, [h, m, s]);

  function emit(nh: number, nm: number, ns: number) {
    const total = Math.max(1, nh * 3600 + nm * 60 + ns);
    onChange(total);
  }

  const hours = Array.from({ length: 17 }, (_, i) => i); // 0..16
  const mins = Array.from({ length: 60 }, (_, i) => i);
  const secs = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div className="relative w-full max-w-sm mx-auto">
      <div className="flex items-center gap-1 px-2">
        <Column
          values={hours}
          value={vh}
          onChange={(v) => {
            setH(v);
            emit(v, vm, vs);
          }}
          unit="时"
          disabled={disabled}
        />
        <Column
          values={mins}
          value={vm}
          onChange={(v) => {
            setM(v);
            emit(vh, v, vs);
          }}
          unit="分"
          disabled={disabled}
        />
        <Column
          values={secs}
          value={vs}
          onChange={(v) => {
            setS(v);
            emit(vh, vm, v);
          }}
          unit="秒"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
