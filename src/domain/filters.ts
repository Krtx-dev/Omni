import type { CategoryId } from "./categories";
import type { IndexedEvent } from "./indexed";
import { lowerBound } from "./indexed";
import type { TimeWindow } from "./time";

export interface ViewFilter {
  /** Layer (data source) visibility; unknown sources default to hidden. */
  layers: Readonly<Record<string, boolean>>;
  categories: Readonly<Record<CategoryId, boolean>>;
  /** Per-category minimum normalized severity. */
  minSeverity: Readonly<Record<CategoryId, number>>;
  window: TimeWindow;
}

/** Events that pass every filter, in start-time order. `sorted` must be sorted by startMs. */
export function selectVisible(sorted: readonly IndexedEvent[], f: ViewFilter): IndexedEvent[] {
  const out: IndexedEvent[] = [];
  for (let i = lowerBound(sorted, f.window.start); i < sorted.length; i++) {
    const e = sorted[i];
    if (e.startMs > f.window.end) break;
    if (!f.layers[e.source] || !f.categories[e.category]) continue;
    if ((e.severity ?? 0) < f.minSeverity[e.category]) continue;
    out.push(e);
  }
  return out;
}
