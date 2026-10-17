import type { WorldEvent } from "./event";

/** A WorldEvent with its start time pre-parsed, kept sorted for range queries. */
export type IndexedEvent = WorldEvent & { startMs: number };

export function indexEvent(event: WorldEvent): IndexedEvent {
  return { ...event, startMs: Date.parse(event.startedAt) };
}

/** Merge incoming events into a sorted index. Newer `updatedAt` wins per id. */
export function mergeEvents(existing: readonly IndexedEvent[], incoming: readonly WorldEvent[]): IndexedEvent[] {
  if (incoming.length === 0) return existing as IndexedEvent[];
  const byId = new Map<string, IndexedEvent>();
  for (const e of existing) byId.set(e.id, e);
  for (const e of incoming) {
    const prev = byId.get(e.id);
    if (!prev || e.updatedAt >= prev.updatedAt) byId.set(e.id, indexEvent(e));
  }
  return [...byId.values()].sort((a, b) => a.startMs - b.startMs);
}

/** First index whose startMs >= t, for a startMs-sorted array. */
export function lowerBound(sorted: readonly IndexedEvent[], t: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid].startMs < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
