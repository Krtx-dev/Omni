import { describe, expect, it, vi } from "vitest";
import { usgsPayload } from "@/test/fixtures";
import { worldEventSchema } from "@/domain/event";
import { usgsAdapter } from ".";
import { SourceError } from "../errors";

const jsonResponse = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init);
const ctx = (fetchImpl: typeof fetch, lastSuccessAt?: number) => ({ env: {}, now: 0, lastSuccessAt, fetch: fetchImpl });

describe("USGS adapter", () => {
  it("normalizes earthquakes, drops non-earthquakes, counts malformed records", async () => {
    const result = await usgsAdapter.pull(ctx(vi.fn(async () => jsonResponse(usgsPayload)) as unknown as typeof fetch));

    expect(result.rejected).toBe(2);
    expect(result.events.map((e) => e.id)).toEqual(["usgs:us7000abcd", "usgs:ci99"]);
    for (const e of result.events) expect(worldEventSchema.safeParse(e).success).toBe(true);

    const [big, small] = result.events;
    expect(big.title).toBe("M 5.2 — 42 km SW of Somewhere, Chile");
    expect(big.category).toBe("earthquake");
    expect(big.latitude).toBe(-33.25);
    expect(big.longitude).toBe(-71.5);
    expect(big.altitude).toBeCloseTo(-35_400);
    expect(big.startedAt).toBe("2026-10-06T12:30:00.000Z");
    expect(big.updatedAt).toBe("2026-10-06T13:10:00.000Z");
    expect(big.properties).toMatchObject({ magnitude: 5.2, tsunami_flag: false, pager_alert: "green" });
    expect(big.sourceUrl).toContain("us7000abcd");
    expect(big.severity).toBeGreaterThan(small.severity ?? 1);
    expect(small.title).toContain("Unlabelled location");
  });

  it("seeds from the monthly feed, then polls the daily feed", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return jsonResponse({ type: "FeatureCollection", features: [] });
    }) as unknown as typeof fetch;
    await usgsAdapter.pull(ctx(fetchImpl));
    await usgsAdapter.pull(ctx(fetchImpl, 123));
    expect(calls[0]).toMatch(/2\.5_month\.geojson$/);
    expect(calls[1]).toMatch(/2\.5_day\.geojson$/);
  });

  it("rejects a payload that is not a FeatureCollection", async () => {
    const fetchImpl = (async () => jsonResponse({ hello: "world" })) as unknown as typeof fetch;
    await expect(usgsAdapter.pull(ctx(fetchImpl))).rejects.toMatchObject({ kind: "invalid" });
  });

  it("maps HTTP failures to typed errors", async () => {
    const respond = (status: number, headers?: Record<string, string>) =>
      (async () => new Response("", { status, headers })) as unknown as typeof fetch;

    await expect(usgsAdapter.pull(ctx(respond(429, { "retry-after": "120" })))).rejects.toMatchObject({
      kind: "rate_limited",
      retryAfterMs: 120_000,
    });
    await expect(usgsAdapter.pull(ctx(respond(503)))).rejects.toMatchObject({ kind: "upstream" });
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    const err = await usgsAdapter.pull(ctx(down)).catch((e) => e);
    expect(err).toBeInstanceOf(SourceError);
    expect(err.kind).toBe("network");
  });
});
