import { describe, expect, it } from "vitest";
import { parseCsv } from "../csv";
import { firmsCsv } from "@/test/fixtures";
import { worldEventSchema } from "@/domain/event";
import { firmsAdapter } from ".";
import { acquisitionTime, parseConfidence } from "./normalize";

const env = { FIRMS_MAP_KEY: "SECRETKEY123" };
const textFetch = (body: string, status = 200) => (async () => new Response(body, { status })) as unknown as typeof fetch;
const ctx = (fetchImpl: typeof fetch, e: Record<string, string | undefined> = env) => ({ env: e, now: 0, fetch: fetchImpl });

describe("csv parser", () => {
  it("handles quotes, escaped quotes, CRLF and ragged rows", () => {
    const rows = parseCsv('a,b,c\r\n1,"x, y",3\r\n"he said ""hi""",,\r\n4,5\r\n');
    expect(rows).toEqual([
      { a: "1", b: "x, y", c: "3" },
      { a: 'he said "hi"', b: "", c: "" },
      { a: "4", b: "5", c: "" },
    ]);
  });
  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("FIRMS helpers", () => {
  it("pads HHMM acquisition times", () => {
    expect(acquisitionTime("2026-10-06", "342")).toBe("2026-10-06T03:42:00.000Z");
    expect(acquisitionTime("2026-10-06", "2105")).toBe("2026-10-06T21:05:00.000Z");
  });
  it("maps VIIRS letters and MODIS percentages onto three levels", () => {
    expect(parseConfidence("l")).toBe("low");
    expect(parseConfidence("n")).toBe("nominal");
    expect(parseConfidence("h")).toBe("high");
    expect(parseConfidence("12")).toBe("low");
    expect(parseConfidence("55")).toBe("nominal");
    expect(parseConfidence("93")).toBe("high");
    expect(parseConfidence(undefined)).toBeUndefined();
  });
});

describe("FIRMS adapter", () => {
  it("is not configured without a MAP_KEY and never fetches", () => {
    expect(firmsAdapter.isConfigured({})).toBe(false);
    expect(firmsAdapter.isConfigured(env)).toBe(true);
  });

  it("normalizes detections, drops low confidence and malformed rows", async () => {
    const result = await firmsAdapter.pull(ctx(textFetch(firmsCsv)));
    // 5 data rows: 1 low-confidence (dropped by normalize), 2 malformed (rejected by validation).
    expect(result.rejected).toBe(2);
    expect(result.events).toHaveLength(2);
    for (const e of result.events) expect(worldEventSchema.safeParse(e).success).toBe(true);

    const night = result.events.find((e) => e.longitude === 131.2)!;
    expect(night.category).toBe("wildfire");
    expect(night.startedAt).toBe("2026-10-06T03:42:00.000Z");
    expect(night.properties).toMatchObject({ satellite: "Suomi NPP", confidence: "nominal", fire_radiative_power_mw: 12.3, day_night: "night" });
    expect(night.description).toMatch(/not a confirmed wildfire/);
    expect(night.id).toBe("firms:N:-12.3457,131.2000:2026-10-06T0342");

    const strong = result.events.find((e) => e.longitude === -118.25)!;
    expect(strong.severity).toBeGreaterThan(night.severity ?? 1);
    expect(strong.properties.satellite).toBe("NOAA-20");
  });

  it("keeps the highest-power detections when truncating, and says so", async () => {
    const result = await firmsAdapter.pull(ctx(textFetch(firmsCsv), { ...env, FIRMS_MAX_DETECTIONS: "100" }));
    expect(result.notice).toBeUndefined();

    const rows = ["latitude,longitude,acq_date,acq_time,satellite,instrument,confidence,frp,daynight"];
    for (let i = 0; i < 150; i++) rows.push(`${i % 80},${i},2026-10-06,1200,N,VIIRS,n,${i},D`);
    const big = await firmsAdapter.pull(ctx(textFetch(rows.join("\n")), { ...env, FIRMS_MAX_DETECTIONS: "100" }));
    expect(big.events).toHaveLength(100);
    expect(big.notice).toMatch(/100.*150/);
    expect(Math.min(...big.events.map((e) => Number(e.properties.fire_radiative_power_mw)))).toBe(50);
  });

  it("reports plain-text key and quota failures as typed errors without leaking the key", async () => {
    const bad = await firmsAdapter.pull(ctx(textFetch("Invalid MAP_KEY."))).catch((e) => e);
    expect(bad.kind).toBe("unauthorized");
    expect(bad.message).not.toContain("SECRETKEY123");

    const limited = await firmsAdapter.pull(ctx(textFetch("Exceeded transaction limit"))).catch((e) => e);
    expect(limited.kind).toBe("rate_limited");
    expect(limited.retryAfterMs).toBeGreaterThan(0);

    const http = await firmsAdapter.pull(ctx(textFetch("", 403))).catch((e) => e);
    expect(http.kind).toBe("unauthorized");
    expect(http.message).not.toContain("SECRETKEY123");
  });
});
