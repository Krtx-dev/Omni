import { useMemo } from "react";
import { selectVisible, type ViewFilter } from "@/domain/filters";
import type { IndexedEvent } from "@/domain/indexed";
import { resolveWindow, type TimeWindow } from "@/domain/time";
import { useOmni } from "./store";

export function useTimeWindow(): TimeWindow {
  const range = useOmni((s) => s.range);
  const cursor = useOmni((s) => s.cursor);
  const now = useOmni((s) => s.now);
  return useMemo(() => resolveWindow(range, cursor, now), [range, cursor, now]);
}

let last: { filter: ViewFilter; events: readonly IndexedEvent[]; result: IndexedEvent[] } | null = null;

/** One-entry cache so every component asking for the visible set shares a single computation. */
function selectVisibleShared(events: readonly IndexedEvent[], filter: ViewFilter): IndexedEvent[] {
  if (
    last &&
    last.events === events &&
    last.filter.layers === filter.layers &&
    last.filter.categories === filter.categories &&
    last.filter.minSeverity === filter.minSeverity &&
    last.filter.window.start === filter.window.start &&
    last.filter.window.end === filter.window.end
  ) {
    return last.result;
  }
  const result = selectVisible(events, filter);
  last = { filter, events, result };
  return result;
}

/** Events passing the layer, category, severity and time filters. */
export function useVisibleEvents(): IndexedEvent[] {
  const events = useOmni((s) => s.events);
  const layers = useOmni((s) => s.layers);
  const categories = useOmni((s) => s.categories);
  const minSeverity = useOmni((s) => s.minSeverity);
  const window = useTimeWindow();
  return useMemo(
    () => selectVisibleShared(events, { layers, categories, minSeverity, window }),
    [events, layers, categories, minSeverity, window],
  );
}

export function useSelectedEvent(): IndexedEvent | undefined {
  const id = useOmni((s) => s.selectedId);
  const events = useOmni((s) => s.events);
  return useMemo(() => (id ? events.find((e) => e.id === id) : undefined), [id, events]);
}
