import { useEffect, useRef, useState } from "react";

// Apple-style wheel time picker: hours / minutes / seconds.
// Max 16 hours.

const ITEM_H = 36; // px

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
  const timeoutRef = useRef<number | null>(null);

  // sync scroll position to value
  useEffect(() => {
    if (!ref.current) return;
    const idx = values.indexOf(value);
    if (idx < 0) return;
    ref.current.scrollTop = idx * ITEM_H;
  }, [value, values]);

  function onScroll() {
    if (disabled) return;
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      if (!ref.current) return;
      const idx = Math.round(ref.current.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(values.length - 1, idx));
      const v = values[clamped];
      ref.current.scrollTo({ top: clamped * ITEM_H, behavior: "smooth" });
      if (v !== value) onChange(v);
    }, 120);
  }

  return (
    <div className="relative flex-1 select-none">
      <div
        ref={ref}
        onScroll={onScroll}
        className={`h-[108px] overflow-y-scroll scrollbar-hide snap-y snap-mandatory ${
          disabled ? "pointer-events-none opacity-50" : ""
        }`}
        style={{ scrollSnapType: "y mandatory", scrollbarWidth: "none" }}
      >
        <div style={{ height: ITEM_H }} />
        {values.map((v) => (
          <div
            key={v}
            className={`snap-center flex items-center justify-center tabular-nums transition-opacity ${
              v === value ? "opacity-100 font-display text-2xl" : "opacity-40 text-base"
            }`}
            style={{ height: ITEM_H }}
          >
            {String(v).padStart(2, "0")}
            <span className="text-[10px] ml-1 opacity-60">{unit}</span>
          </div>
        ))}
        <div style={{ height: ITEM_H }} />
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
    <div className="relative w-full max-w-xs mx-auto">
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
