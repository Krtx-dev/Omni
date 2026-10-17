import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { WorldEvent } from "@/domain/event";
import type { SourceStatus, SourceSummary } from "@/domain/source";
import { eventToRow, rowToEvent, rowToStatus, statusToRow, type EventRow, type StatusRow } from "./rows";
import type { EventQuery, EventStore } from "./types";

const PAGE = 1000; // PostgREST's default max rows per response
const WRITE_CHUNK = 500;

interface SummaryRow {
  source: string;
  event_count: number;
  first_started_at: string;
  last_started_at: string;
}

/** PostgreSQL + PostGIS persistence through Supabase. Schema: supabase/migrations. */
export class SupabaseEventStore implements EventStore {
  readonly kind = "supabase" as const;
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async upsert(events: readonly WorldEvent[], now: number): Promise<void> {
    for (let i = 0; i < events.length; i += WRITE_CHUNK) {
      const rows = events.slice(i, i + WRITE_CHUNK).map((e) => eventToRow(e, now));
      const { error } = await this.db.from("world_events").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
    }
  }

  query({ sources, from, to }: EventQuery): Promise<WorldEvent[]> {
    return this.pageAll((q) => {
      let query = q;
      if (sources) query = query.in("source", [...sources]);
      if (from !== undefined) query = query.gte("started_at", new Date(from).toISOString());
      if (to !== undefined) query = query.lte("started_at", new Date(to).toISOString());
      return query;
    });
  }

  changedSince(since: number, sources?: readonly string[]): Promise<WorldEvent[]> {
    return this.pageAll((q) => {
      let query = q.gt("ingested_at", new Date(since).toISOString());
      if (sources) query = query.in("source", [...sources]);
      return query;
    });
  }

  async prune(source: string, before: number): Promise<void> {
    const { error } = await this.db
      .from("world_events")
      .delete()
      .eq("source", source)
      .lt("started_at", new Date(before).toISOString());
    if (error) throw new Error(`Supabase prune failed: ${error.message}`);
  }

  async summarize(): Promise<Record<string, SourceSummary>> {
    const { data, error } = await this.db.from("source_summary").select("*");
    if (error) throw new Error(`Supabase summary failed: ${error.message}`);
    return Object.fromEntries(
      (data as SummaryRow[]).map((r) => [
        r.source,
        { count: r.event_count, from: Date.parse(r.first_started_at), to: Date.parse(r.last_started_at) },
      ]),
    );
  }

  async getStatuses(): Promise<Record<string, SourceStatus>> {
    const { data, error } = await this.db.from("source_status").select("*");
    if (error) throw new Error(`Supabase status read failed: ${error.message}`);
    return Object.fromEntries((data as StatusRow[]).map((r) => [r.source, rowToStatus(r)]));
  }

  async putStatus(status: SourceStatus): Promise<void> {
    const { error } = await this.db.from("source_status").upsert(statusToRow(status), { onConflict: "source" });
    if (error) throw new Error(`Supabase status write failed: ${error.message}`);
  }

  /** PostgREST caps every response, so read in stable-ordered pages until a short page arrives. */
  private async pageAll(
    filter: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => ReturnType<ReturnType<SupabaseClient["from"]>["select"]>,
  ): Promise<WorldEvent[]> {
    const out: WorldEvent[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const base = this.db.from("world_events").select("*");
      const { data, error } = await filter(base)
        .order("started_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`Supabase query failed: ${error.message}`);
      const rows = data as EventRow[];
      for (const row of rows) {
        const event = rowToEvent(row);
        if (event) out.push(event);
      }
      if (rows.length < PAGE) return out;
    }
  }
}
