"use client";

import { useMemo } from "react";
import { useTimeWindow } from "@/client/selectors";
import { useOmni } from "@/client/store";
import { selectVisible } from "@/domain/filters";
import { histogram, RANGE_IDS, RANGE_MS } from "@/domain/time";
import { Segmented } from "@/components/ui/Segmented";
import { formatUtc } from "@/lib/format";
import { Histogram, useBinCount } from "./Histogram";

const SPEEDS = ["1x", "4x", "16x"] as const;

function tickLabel(ms: number, spanMs: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return spanMs <= 36 * 3_600_000 ? `${pad(d.getUTCHours())}:00` : `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function Timeline() {
  const range = useOmni((s) => s.range);
  const cursor = useOmni((s) => s.cursor);
  const playing = useOmni((s) => s.playing);
  const speed = useOmni((s) => s.speed);
  const now = useOmni((s) => s.now);
  const events = useOmni((s) => s.events);
  const layers = useOmni((s) => s.layers);
  const categories = useOmni((s) => s.categories);
  const minSeverity = useOmni((s) => s.minSeverity);
  const { setRange, setCursor, goLive, setPlaying, setSpeed } = useOmni.getState();
  const { start, end } = useTimeWindow();
  const [measureRef, binCount] = useBinCount();

  // The histogram always shows the full window, whatever the playhead is doing.
  const bins = useMemo(() => {
    const full = { start: now - RANGE_MS[range], end: now };
    return histogram(selectVisible(events, { layers, categories, minSeverity, window: full }), full, binCount);
  }, [events, layers, categories, minSeverity, now, range, binCount]);

  const spanMs = RANGE_MS[range];
  const playhead = cursor === null ? null : (end - start) / spanMs;
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const scrub = (fraction: number) => {
    setPlaying(false);
    if (fraction >= 0.995) goLive();
    else setCursor(start + fraction * spanMs);
  };

  return (
    <footer className="absolute inset-x-0 bottom-0 z-20 border-t border-line bg-panel/95">
      <div className="flex h-8 items-center justify-between gap-3 px-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            aria-pressed={playing}
            className="h-5 w-[52px] border border-line-strong text-[10px] uppercase tracking-wider text-ink hover:text-bright"
          >
            {playing ? "Pause" : "Replay"}
          </button>
          <Segmented
            value={`${speed}x` as (typeof SPEEDS)[number]}
            options={SPEEDS}
            label="Playback speed"
            onChange={(v) => setSpeed(Number.parseInt(v, 10))}
          />
          <button
            type="button"
            onClick={goLive}
            disabled={cursor === null}
            className={`h-5 border px-2 text-[10px] uppercase tracking-wider ${
              cursor === null ? "border-ok/50 text-ok" : "border-line-strong text-ink hover:text-bright"
            }`}
          >
            Live
          </button>
        </div>

        <div className="hidden min-w-0 flex-1 text-center text-[10px] uppercase tracking-[0.12em] tabular-nums text-dim sm:block">
          {cursor === null ? "Following live" : `Rewound to ${formatUtc(end)}`}
        </div>

        <Segmented value={range} options={RANGE_IDS} label="Time window" format={(r) => r.toUpperCase()} onChange={setRange} />
      </div>

      <div className="px-3">
        <div ref={measureRef}>
          <Histogram bins={bins} playhead={playhead} onScrub={scrub} />
        </div>
        <div className="relative h-5 text-[10px] tabular-nums text-dim" aria-hidden>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute top-1 -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
              style={{ left: `${t * 100}%` }}
            >
              {t === 1 ? "now" : tickLabel(start + t * spanMs, spanMs)}
            </span>
          ))}
        </div>
      </div>
    </footer>
  );
}
