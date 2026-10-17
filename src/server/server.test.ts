import { describe, expect, it, vi } from "vitest";
import { defineAdapter } from "@/data-sources/define-adapter";
import { SourceError } from "@/data-sources/errors";
import type { DataSourceAdapter } from "@/data-sources/types";
import type { WorldEvent } from "@/domain/event";
import { makeEvent } from "@/test/fixtures";
import { Ingestor } from "./ingestor";
import { MemoryEventStore } from "./store/memory";
import { eventToRow, rowToEvent, rowToStatus, statusToRow } from "./store/rows";

const META = {
  id: "test",
  name: "Test",
  category: "earthquake" as const,
  description: "",
  homepage: "https://example.org",
  attribution: "t",
  license: "t",
  refreshIntervalMs: 60_000,
  retentionMs: 10 * 86_400_000,
};

function adapterFor(producer: () => WorldEvent[] | Promise<WorldEvent[]>, extra: Partial<DataSourceAdapter> = {}): DataSourceAdapter {
  const base = defineAdapter<WorldEvent>({
    meta: META,
    fetch: async () => producer(),
    validate: (raw) => ({ items: raw as WorldEvent[], rejected: 0 }),
    normalize: (items) => ({ events: items }),
  });
  return { ...base, ...extra };
}

const ev = (id: string, startedAt: string, extra: Partial<WorldEvent> = {}) => makeEvent({ id: `test:${id}`, source: "test", startedAt, ...extra });

describe("defineAdapter", () => {
  it("drops events that violate the WorldEvent contract and counts them", async () => {
    const adapter = adapterFor(() => [ev("ok", "2026-10-01T00:00:00.000Z"), ev("bad", "2026-10-01T00:00:00.000Z", { latitude: 400 })]);
    const result = await adapter.pull({ env: {}, now: 0, fetch });
    expect(result.events.map((e) => e.id)).toEqual(["test:ok"]);
    expect(result.rejected).toBe(1);
  });
});

describe("MemoryEventStore", () => {
  it("queries by source and time, reports changes since a cursor, prunes and summarizes", async () => {
    const store = new MemoryEventStore();
    await store.upsert([ev("a", "2026-10-01T00:00:00.000Z"), ev("b", "2026-10-03T00:00:00.000Z")], 100);
    await store.upsert([ev("c", "2026-10-05T00:00:00.000Z", { source: "other" })], 200);

    expect(await store.query({ sources: ["test"] })).toHaveLength(2);
    expect(await store.query({ from: Date.parse("2026-10-02T00:00:00.000Z") })).toHaveLength(2);
    expect((await store.changedSince(150)).map((e) => e.id)).toEqual(["test:c"]);
    expect(await store.changedSince(150, ["test"])).toHaveLength(0);

    const summary = await store.summarize();
    expect(summary.test).toEqual({ count: 2, from: Date.parse("2026-10-01T00:00:00.000Z"), to: Date.parse("2026-10-03T00:00:00.000Z") });

    await store.prune("test", Date.parse("2026-10-02T00:00:00.000Z"));
    expect((await store.query({ sources: ["test"] })).map((e) => e.id)).toEqual(["test:b"]);
    expect(await store.query({ sources: ["other"] })).toHaveLength(1);
  });
});

describe("Ingestor", () => {
  const T0 = Date.parse("2026-10-07T00:00:00.000Z");

  it("stores events, records status, and only re-writes what changed", async () => {
    const store = new MemoryEventStore();
    let clock = T0;
    let feed = [ev("a", "2026-10-06T00:00:00.000Z"), ev("b", "2026-10-06T01:00:00.000Z")];
    const adapter = adapterFor(() => feed);
    const ingestor = new Ingestor({ store, env: {}, now: () => clock });

    const first = await ingestor.ingest(adapter);
    expect(first).toMatchObject({ state: "ok", consecutiveFailures: 0, lastSuccessAt: T0, nextAttemptAt: T0 + 60_000 });
    expect(await store.query({})).toHaveLength(2);

    clock = T0 + 60_000;
    feed = [feed[0], { ...feed[1], title: "revised", updatedAt: "2026-10-06T02:00:00.000Z" }];
    await ingestor.ingest(adapter);
    const changed = await store.changedSince(T0);
    expect(changed.map((e) => e.id)).toEqual(["test:b"]);
    expect(changed[0].title).toBe("revised");
  });

  it("prunes events older than the retention window", async () => {
    const store = new MemoryEventStore();
    const adapter = adapterFor(() => [ev("old", "2026-09-01T00:00:00.000Z"), ev("new", "2026-10-06T00:00:00.000Z")]);
    await new Ingestor({ store, env: {}, now: () => T0 }).ingest(adapter);
    expect((await store.query({})).map((e) => e.id)).toEqual(["test:new"]);
  });

  it("reports unconfigured sources without calling them", async () => {
    const store = new MemoryEventStore();
    const pull = vi.fn();
    const adapter: DataSourceAdapter = {
      meta: { ...META, credentials: { envVar: "TEST_KEY", signupUrl: "https://example.org" } },
      isConfigured: () => false,
      pull,
    };
    const status = await new Ingestor({ store, env: {}, now: () => T0 }).ingest(adapter);
    expect(status.state).toBe("not_configured");
    expect(status.message).toContain("TEST_KEY");
    expect(pull).not.toHaveBeenCalled();
  });

  it("backs off exponentially on failure, honours Retry-After, and recovers", async () => {
    const store = new MemoryEventStore();
    let clock = T0;
    let mode: "fail" | "limit" | "ok" = "fail";
    const adapter = adapterFor(() => {
      if (mode === "fail") throw new SourceError("upstream", "Upstream returned HTTP 503");
      if (mode === "limit") throw new SourceError("rate_limited", "Rate limited by upstream", 600_000);
      return [ev("a", "2026-10-06T00:00:00.000Z")];
    });
    const ingestor = new Ingestor({ store, env: {}, now: () => clock });

    const one = await ingestor.ingest(adapter);
    expect(one).toMatchObject({ state: "error", consecutiveFailures: 1, nextAttemptAt: T0 + 60_000, message: "Upstream returned HTTP 503" });
    const two = await ingestor.ingest(adapter);
    expect(two).toMatchObject({ consecutiveFailures: 2, nextAttemptAt: T0 + 120_000 });

    mode = "limit";
    const limited = await ingestor.ingest(adapter);
    expect(limited).toMatchObject({ state: "rate_limited", nextAttemptAt: T0 + 600_000 });

    mode = "ok";
    clock = T0 + 700_000;
    const ok = await ingestor.ingest(adapter);
    expect(ok).toMatchObject({ state: "ok", consecutiveFailures: 0 });
  });

  it("does not leak unexpected error details into the status", async () => {
    const store = new MemoryEventStore();
    const adapter = adapterFor(() => {
      throw new Error("connect ECONNREFUSED https://host/path?key=SECRET");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const status = await new Ingestor({ store, env: {}, now: () => T0 }).ingest(adapter);
    spy.mockRestore();
    expect(status.state).toBe("error");
    expect(status.message).not.toContain("SECRET");
  });

  it("shares one pull between concurrent callers", async () => {
    const store = new MemoryEventStore();
    const producer = vi.fn(async () => [ev("a", "2026-10-06T00:00:00.000Z")]);
    const ingestor = new Ingestor({ store, env: {}, now: () => T0 });
    const adapter = adapterFor(producer);
    await Promise.all([ingestor.ingest(adapter), ingestor.ingest(adapter), ingestor.ingest(adapter)]);
    expect(producer).toHaveBeenCalledTimes(1);
  });
});

describe("Supabase row mapping", () => {
  it("round-trips events and statuses", () => {
    const e = makeEvent({
      id: "usgs:1",
      altitude: -10_000,
      severity: 0.4,
      sourceUrl: "https://example.org/e",
      properties: { magnitude: 5.1, flag: true, note: null },
    });
    const row = eventToRow(e, Date.UTC(2026, 9, 7));
    expect(row.ingested_at).toBe("2026-10-07T00:00:00.000Z");
    // Postgres returns timestamptz in its own format; the mapper must normalize it.
    expect(rowToEvent({ ...row, started_at: "2026-10-01T00:00:00+00:00", updated_at: "2026-10-01T00:00:00+00:00" })).toEqual(e);
    expect(rowToEvent({ ...row, latitude: 500 })).toBeNull();

    const status = { id: "firms", state: "error" as const, lastAttemptAt: 5, consecutiveFailures: 2, message: "x", rejected: 3 };
    expect(rowToStatus(statusToRow(status))).toEqual({ ...status, lastSuccessAt: undefined, nextAttemptAt: undefined });
  });
});
