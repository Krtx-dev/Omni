"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATEGORIES, CATEGORY_IDS } from "@/domain/categories";
import type { CategoryCounts } from "@/domain/time";

const PLOT_HEIGHT = 52;
const BAR_STEP = 5;

interface HistogramProps {
  bins: CategoryCounts[];
  /** Playhead position as a 0..1 fraction of the width, or null when live. */
  playhead: number | null;
  onScrub(fraction: number): void;
}

/** Stacked bars of real event counts per time bin with a draggable playhead. */
export function Histogram({ bins, playhead, onScrub }: HistogramProps) {
  const peak = useMemo(() => Math.max(1, ...bins.map((b) => CATEGORY_IDS.reduce((n, id) => n + b[id], 0))), [bins]);
  const dragging = useRef(false);
  const box = useRef<HTMLDivElement>(null);

  const fractionAt = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    return r && r.width > 0 ? Math.min(1, Math.max(0, (clientX - r.left) / r.width)) : 1;
  };

  return (
    <div
      ref={box}
      role="slider"
      tabIndex={0}
      aria-label="Playhead"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round((playhead ?? 1) * 100)}
      className="relative h-[52px] cursor-ew-resize touch-none select-none border-b border-line-strong"
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        onScrub(fractionAt(e.clientX));
      }}
      onPointerMove={(e) => dragging.current && onScrub(fractionAt(e.clientX))}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 0.1 : 0.02;
        const at = playhead ?? 1;
        if (e.key === "ArrowLeft") onScrub(Math.max(0, at - step));
        else if (e.key === "ArrowRight") onScrub(Math.min(1, at + step));
        else return;
        e.preventDefault();
      }}
    >
      <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden>
        {bins.map((bin, i) => {
          let stacked = 0;
          const total = CATEGORY_IDS.reduce((n, id) => n + bin[id], 0);
          // Bar height is sqrt-scaled so quiet hours stay visible next to a burst; categories split it proportionally.
          const barHeight = total > 0 ? Math.sqrt(total / peak) * (PLOT_HEIGHT - 4) : 0;
          return CATEGORY_IDS.map((id) => {
            const h = total > 0 ? (bin[id] / total) * barHeight : 0;
            if (h <= 0) return null;
            stacked += h;
            return (
              <rect
                key={`${i}-${id}`}
                x={`${(i / bins.length) * 100}%`}
                y={PLOT_HEIGHT - stacked}
                width={`${(100 / bins.length) * 0.78}%`}
                height={h}
                fill={CATEGORIES[id].color}
                opacity={0.75}
              />
            );
          });
        })}
      </svg>
      {playhead !== null && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 bg-void/65" style={{ left: `${playhead * 100}%` }} />
          <div className="pointer-events-none absolute inset-y-0 w-px bg-bright" style={{ left: `${playhead * 100}%` }} />
        </>
      )}
    </div>
  );
}

/** Number of bins that fit the available width, so bars stay roughly BAR_STEP px apart. */
export function useBinCount(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(120);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCount(Math.max(24, Math.min(240, Math.floor(el.clientWidth / BAR_STEP))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, count];
}
