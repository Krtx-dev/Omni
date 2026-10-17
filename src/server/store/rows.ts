import { worldEventSchema } from "@/domain/event";
import type { WorldEvent } from "@/domain/event";
import type { SourceStatus } from "@/domain/source";

/** Column shapes of `world_events` and `source_status` (see supabase/migrations). */
export interface EventRow {
  id: string;
  source: string;
  category: string;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  started_at: string;
  updated_at: string;
  severity: number | null;
  properties: WorldEvent["properties"];
  source_url: string | null;
  geometry: WorldEvent["geometry"] | null;
  ingested_at: string;
}

export interface StatusRow {
  source: string;
  state: SourceStatus["state"];
  last_attempt_at: string | null;
  last_success_at: string | null;
  next_attempt_at: string | null;
  consecutive_failures: number;
  message: string | null;
  rejected: number;
}

export function eventToRow(e: WorldEvent, ingestedAt: number): EventRow {
  return {
    id: e.id,
    source: e.source,
    category: e.category,
    title: e.title,
    description: e.description,
    latitude: e.latitude,
    longitude: e.longitude,
    altitude: e.altitude ?? null,
    started_at: e.startedAt,
    updated_at: e.updatedAt,
    severity: e.severity ?? null,
    properties: e.properties,
    source_url: e.sourceUrl ?? null,
    geometry: e.geometry ?? null,
    ingested_at: new Date(ingestedAt).toISOString(),
  };
}

/** Rows come from our own table, but are still validated: the schema is the contract. */
export function rowToEvent(row: EventRow): WorldEvent | null {
  const parsed = worldEventSchema.safeParse({
    id: row.id,
    source: row.source,
    category: row.category,
    title: row.title,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    altitude: row.altitude ?? undefined,
    startedAt: new Date(row.started_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    severity: row.severity ?? undefined,
    properties: row.properties,
    sourceUrl: row.source_url ?? undefined,
    geometry: row.geometry ?? undefined,
  });
  return parsed.success ? parsed.data : null;
}

const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());
const ms = (s: string | null) => (s === null ? undefined : Date.parse(s));

export function statusToRow(s: SourceStatus): StatusRow {
  return {
    source: s.id,
    state: s.state,
    last_attempt_at: iso(s.lastAttemptAt),
    last_success_at: iso(s.lastSuccessAt),
    next_attempt_at: iso(s.nextAttemptAt),
    consecutive_failures: s.consecutiveFailures,
    message: s.message ?? null,
    rejected: s.rejected,
  };
}

export function rowToStatus(r: StatusRow): SourceStatus {
  return {
    id: r.source,
    state: r.state,
    lastAttemptAt: ms(r.last_attempt_at),
    lastSuccessAt: ms(r.last_success_at),
    nextAttemptAt: ms(r.next_attempt_at),
    consecutiveFailures: r.consecutive_failures,
    message: r.message ?? undefined,
    rejected: r.rejected,
  };
}
