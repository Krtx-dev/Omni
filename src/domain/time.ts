import type { CategoryId } from "./categories";
import { CATEGORY_IDS } from "./categories";
import type { IndexedEvent } from "./indexed";
import { lowerBound } from "./indexed";

export const RANGE_IDS = ["24h", "7d", "30d"] as const;
export type RangeId = (typeof RANGE_IDS)[number];

const HOUR = 3_600_000;
export const RANGE_MS: Readonly<Record<RangeId, number>> = {
  "24h": 24 * HOUR,
  "7d": 7 * 24 * HOUR,
  "30d": 30 * 24 * HOUR,
};

export interface TimeWindow {
  start: number;
  end: number;
}

/**
 * The visible window always spans `range` ending at `now`; the playhead
 * (`cursor`) cuts it off earlier when the user is rewound. `null` means live.
 */
export function resolveWindow(range: RangeId, cursor: number | null, now: number): TimeWindow {
  const start = now - RANGE_MS[range];
  const end = cursor === null ? now : Math.min(Math.max(cursor, start), now);
  return { start, end };
}

export type CategoryCounts = Record<CategoryId, number>;

export function emptyCounts(): CategoryCounts {
  return Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0])) as CategoryCounts;
}

/** Event counts per equal-width time bin, split by category. Real counts only. */
export function histogram(sorted: readonly IndexedEvent[], window: TimeWindow, bins: number): CategoryCounts[] {
  const out = Array.from({ length: bins }, emptyCounts);
  const span = window.end - window.start;
  if (span <= 0 || bins <= 0) return out;
  const from = lowerBound(sorted, window.start);
  for (let i = from; i < sorted.length; i++) {
    const e = sorted[i];
    if (e.startMs > window.end) break;
    const bin = Math.min(bins - 1, Math.floor(((e.startMs - window.start) / span) * bins));
    out[bin][e.category] += 1;
  }
  return out;
}
