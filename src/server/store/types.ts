import type { WorldEvent } from "@/domain/event";
import type { SourceStatus, SourceSummary } from "@/domain/source";

export interface EventQuery {
  sources?: readonly string[];
  /** Inclusive bounds on startedAt, epoch ms. */
  from?: number;
  to?: number;
}

/** Persistence boundary. Implementations: in-memory (default) and Supabase/PostGIS. */
export interface EventStore {
  readonly kind: "memory" | "supabase";
  /** Insert or replace events, stamping them as ingested at `now`. */
  upsert(events: readonly WorldEvent[], now: number): Promise<void>;
  query(q: EventQuery): Promise<WorldEvent[]>;
  /** Events written after `since` (epoch ms), for the live stream. */
  changedSince(since: number, sources?: readonly string[]): Promise<WorldEvent[]>;
  /** Remove a source's events that started before `before`. */
  prune(source: string, before: number): Promise<void>;
  summarize(): Promise<Record<string, SourceSummary>>;
  getStatuses(): Promise<Record<string, SourceStatus>>;
  putStatus(status: SourceStatus): Promise<void>;
}
