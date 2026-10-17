import { SourceError } from "@/data-sources/errors";
import type { DataSourceAdapter, SourceEnv } from "@/data-sources/types";
import type { WorldEvent } from "@/domain/event";
import type { SourceState, SourceStatus } from "@/domain/source";
import type { EventStore } from "./store/types";

const MAX_BACKOFF_MS = 30 * 60_000;

export interface IngestorDeps {
  store: EventStore;
  env: SourceEnv;
  fetch?: typeof fetch;
  now?: () => number;
}

interface Seen {
  hash: string;
  startMs: number;
}

/**
 * Runs adapters and persists their output. For each source it: pulls, validates
 * and normalizes (adapter), writes only events that changed since the last pull
 * (so the live stream carries real updates, not re-sends), prunes by retention,
 * and records a status that the UI can show.
 */
export class Ingestor {
  private readonly store: EventStore;
  private readonly env: SourceEnv;
  private readonly doFetch: typeof fetch;
  private readonly now: () => number;
  private readonly seen = new Map<string, Map<string, Seen>>();
  private readonly inflight = new Map<string, Promise<SourceStatus>>();

  constructor(deps: IngestorDeps) {
    this.store = deps.store;
    this.env = deps.env;
    this.doFetch = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
  }

  /** Concurrent callers for the same source share one pull. */
  ingest(adapter: DataSourceAdapter): Promise<SourceStatus> {
    const existing = this.inflight.get(adapter.meta.id);
    if (existing) return existing;
    const run = this.run(adapter).finally(() => this.inflight.delete(adapter.meta.id));
    this.inflight.set(adapter.meta.id, run);
    return run;
  }

  private async run(adapter: DataSourceAdapter): Promise<SourceStatus> {
    const { meta } = adapter;
    const startedAt = this.now();
    const prev = (await this.store.getStatuses())[meta.id];
    const failures = prev?.consecutiveFailures ?? 0;
    const base = { id: meta.id, lastAttemptAt: startedAt, lastSuccessAt: prev?.lastSuccessAt };

    if (!adapter.isConfigured(this.env)) {
      return this.save({
        ...base,
        state: "not_configured",
        consecutiveFailures: 0,
        rejected: 0,
        message: meta.credentials ? `Set ${meta.credentials.envVar} to enable this layer.` : "Not configured.",
      });
    }

    try {
      const result = await adapter.pull({
        env: this.env,
        now: startedAt,
        lastSuccessAt: prev?.lastSuccessAt,
        fetch: this.doFetch,
      });
      const changed = this.diff(meta.id, result.events);
      if (changed.length > 0) await this.store.upsert(changed, this.now());
      await this.store.prune(meta.id, startedAt - meta.retentionMs);
      this.forgetOlderThan(meta.id, startedAt - meta.retentionMs);

      return this.save({
        ...base,
        state: "ok",
        lastSuccessAt: this.now(),
        nextAttemptAt: this.now() + meta.refreshIntervalMs,
        consecutiveFailures: 0,
        rejected: result.rejected,
        message: result.notice,
      });
    } catch (err) {
      const kind = err instanceof SourceError ? err.kind : "upstream";
      if (!(err instanceof SourceError)) console.error(`[omni] ${meta.id}: unexpected ingestion error`, err);

      const state: SourceState = kind === "rate_limited" ? "rate_limited" : kind === "not_configured" ? "not_configured" : "error";
      const n = failures + 1;
      const backoff = Math.min(meta.refreshIntervalMs * 2 ** (n - 1), MAX_BACKOFF_MS);
      const delay = err instanceof SourceError && err.retryAfterMs !== undefined ? Math.max(err.retryAfterMs, meta.refreshIntervalMs) : backoff;

      return this.save({
        ...base,
        state,
        nextAttemptAt: this.now() + delay,
        consecutiveFailures: n,
        rejected: prev?.rejected ?? 0,
        message: err instanceof SourceError ? err.message : "Unexpected ingestion error",
      });
    }
  }

  private async save(status: SourceStatus): Promise<SourceStatus> {
    await this.store.putStatus(status);
    return status;
  }

  private diff(source: string, events: readonly WorldEvent[]): WorldEvent[] {
    const known = this.seen.get(source) ?? new Map<string, Seen>();
    this.seen.set(source, known);
    const changed: WorldEvent[] = [];
    for (const e of events) {
      const hash = JSON.stringify(e);
      if (known.get(e.id)?.hash === hash) continue;
      known.set(e.id, { hash, startMs: Date.parse(e.startedAt) });
      changed.push(e);
    }
    return changed;
  }

  private forgetOlderThan(source: string, before: number) {
    const known = this.seen.get(source);
    if (!known) return;
    for (const [id, s] of known) if (s.startMs < before) known.delete(id);
  }
}
