import type { WorldEvent } from "@/domain/event";
import type { SourceStatus, SourceSummary } from "@/domain/source";
import type { EventQuery, EventStore } from "./types";

interface Entry {
  event: WorldEvent;
  startMs: number;
  ingestedAt: number;
}

export class MemoryEventStore implements EventStore {
  readonly kind = "memory" as const;
  private readonly entries = new Map<string, Entry>();
  private readonly statuses = new Map<string, SourceStatus>();

  async upsert(events: readonly WorldEvent[], now: number): Promise<void> {
    for (const event of events) {
      this.entries.set(event.id, { event, startMs: Date.parse(event.startedAt), ingestedAt: now });
    }
  }

  async query({ sources, from = -Infinity, to = Infinity }: EventQuery): Promise<WorldEvent[]> {
    const out: WorldEvent[] = [];
    for (const e of this.entries.values()) {
      if (sources && !sources.includes(e.event.source)) continue;
      if (e.startMs < from || e.startMs > to) continue;
      out.push(e.event);
    }
    return out;
  }

  async changedSince(since: number, sources?: readonly string[]): Promise<WorldEvent[]> {
    const out: WorldEvent[] = [];
    for (const e of this.entries.values()) {
      if (e.ingestedAt <= since) continue;
      if (sources && !sources.includes(e.event.source)) continue;
      out.push(e.event);
    }
    return out;
  }

  async prune(source: string, before: number): Promise<void> {
    for (const [id, e] of this.entries) {
      if (e.event.source === source && e.startMs < before) this.entries.delete(id);
    }
  }

  async summarize(): Promise<Record<string, SourceSummary>> {
    const out: Record<string, SourceSummary> = {};
    for (const { event, startMs } of this.entries.values()) {
      const s = out[event.source] ?? { count: 0, from: Infinity, to: -Infinity };
      s.count += 1;
      s.from = Math.min(s.from, startMs);
      s.to = Math.max(s.to, startMs);
      out[event.source] = s;
    }
    return out;
  }

  async getStatuses(): Promise<Record<string, SourceStatus>> {
    return Object.fromEntries(this.statuses);
  }

  async putStatus(status: SourceStatus): Promise<void> {
    this.statuses.set(status.id, status);
  }
}
