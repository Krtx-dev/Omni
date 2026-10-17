import { describe, expect, it } from "vitest";
import { makeEvent } from "@/test/fixtures";
import { CATEGORIES } from "./categories";
import { cellSizeForView, clusterEvents } from "./cluster";
import { selectVisible } from "./filters";
import { indexEvent, lowerBound, mergeEvents } from "./indexed";
import { formatSeverityValue, fromSeverity, toSeverity } from "./severity";
import { histogram, resolveWindow, RANGE_MS } from "./time";
import { worldEventSchema } from "./event";

const at = (iso: string, extra: Partial<Parameters<typeof makeEvent>[0]> = {}) =>
  indexEvent(makeEvent({ id: `e-${iso}-${Math.random()}`, startedAt: iso, ...extra }));

describe("severity scales", () => {
  it("round-trips linear and log scales", () => {
    const quake = CATEGORIES.earthquake.severity;
    const fire = CATEGORIES.wildfire.severity;
    expect(toSeverity(quake, 2)).toBe(0);
    expect(toSeverity(quake, 8)).toBe(1);
    expect(toSeverity(quake, 11)).toBe(1);
    expect(fromSeverity(quake, toSeverity(quake, 5.5))).toBeCloseTo(5.5);
    expect(toSeverity(fire, 0)).toBe(0);
    expect(fromSeverity(fire, toSeverity(fire, 120))).toBeCloseTo(120);
    expect(formatSeverityValue(fire, 120.4)).toBe("120 MW");
    expect(formatSeverityValue(quake, 5.55)).toBe("5.5");
  });
});

describe("WorldEvent schema", () => {
  it("rejects out-of-range coordinates and non-ISO timestamps", () => {
    expect(worldEventSchema.safeParse(makeEvent({ id: "a" })).success).toBe(true);
    expect(worldEventSchema.safeParse(makeEvent({ id: "a", latitude: 91 })).success).toBe(false);
    expect(worldEventSchema.safeParse(makeEvent({ id: "a", startedAt: "yesterday" })).success).toBe(false);
    expect(worldEventSchema.safeParse(makeEvent({ id: "a", severity: 1.5 })).success).toBe(false);
  });
});

describe("event index", () => {
  it("merges by id, newer revision wins, result stays sorted", () => {
    const a = makeEvent({ id: "a", startedAt: "2026-10-02T00:00:00.000Z", title: "old", updatedAt: "2026-10-02T00:00:00.000Z" });
    const b = makeEvent({ id: "b", startedAt: "2026-10-01T00:00:00.000Z" });
    const first = mergeEvents([], [a, b]);
    expect(first.map((e) => e.id)).toEqual(["b", "a"]);

    const revised = { ...a, title: "new", updatedAt: "2026-10-03T00:00:00.000Z" };
    const stale = { ...a, title: "stale", updatedAt: "2026-10-01T00:00:00.000Z" };
    const merged = mergeEvents(mergeEvents(first, [revised]), [stale]);
    expect(merged).toHaveLength(2);
    expect(merged.find((e) => e.id === "a")?.title).toBe("new");
  });

  it("finds range starts by binary search", () => {
    const sorted = [1, 5, 5, 9].map((n) => ({ ...indexEvent(makeEvent({ id: String(n) })), startMs: n }));
    expect(lowerBound(sorted, 0)).toBe(0);
    expect(lowerBound(sorted, 5)).toBe(1);
    expect(lowerBound(sorted, 6)).toBe(3);
    expect(lowerBound(sorted, 10)).toBe(4);
  });
});

describe("time window", () => {
  const now = Date.UTC(2026, 9, 7);
  it("follows now when live and clamps the playhead into the window", () => {
    expect(resolveWindow("24h", null, now)).toEqual({ start: now - RANGE_MS["24h"], end: now });
    expect(resolveWindow("24h", now - 3_600_000, now).end).toBe(now - 3_600_000);
    expect(resolveWindow("24h", 0, now).end).toBe(now - RANGE_MS["24h"]);
    expect(resolveWindow("24h", now + 99, now).end).toBe(now);
  });

  it("bins real counts by category", () => {
    const events = [
      at("2026-10-01T00:00:00.000Z"),
      at("2026-10-01T01:00:00.000Z"),
      at("2026-10-01T09:00:00.000Z", { category: "wildfire", source: "firms" }),
    ].sort((x, y) => x.startMs - y.startMs);
    const bins = histogram(events, { start: Date.parse("2026-10-01T00:00:00.000Z"), end: Date.parse("2026-10-01T12:00:00.000Z") }, 4);
    expect(bins.map((b) => b.earthquake)).toEqual([2, 0, 0, 0]);
    expect(bins.map((b) => b.wildfire)).toEqual([0, 0, 0, 1]);
  });
});

describe("selectVisible", () => {
  const events = [
    at("2026-10-01T00:00:00.000Z", { severity: 0.1 }),
    at("2026-10-02T00:00:00.000Z", { severity: 0.8 }),
    at("2026-10-03T00:00:00.000Z", { category: "wildfire", source: "firms", severity: 0.5 }),
    at("2026-10-04T00:00:00.000Z", { severity: 0.9 }),
  ];
  const base = {
    layers: { usgs: true, firms: true },
    categories: { earthquake: true, wildfire: true },
    minSeverity: { earthquake: 0, wildfire: 0 },
    window: { start: Date.parse("2026-10-01T00:00:00.000Z"), end: Date.parse("2026-10-04T00:00:00.000Z") },
  };

  it("applies layer, category, severity and time filters together", () => {
    expect(selectVisible(events, base)).toHaveLength(4);
    expect(selectVisible(events, { ...base, layers: { usgs: true, firms: false } })).toHaveLength(3);
    expect(selectVisible(events, { ...base, categories: { earthquake: false, wildfire: true } })).toHaveLength(1);
    expect(selectVisible(events, { ...base, minSeverity: { earthquake: 0.5, wildfire: 0 } })).toHaveLength(3);
    expect(selectVisible(events, { ...base, window: { ...base.window, end: Date.parse("2026-10-02T12:00:00.000Z") } })).toHaveLength(2);
  });

  it("hides sources that have no layer entry", () => {
    expect(selectVisible(events, { ...base, layers: {} })).toHaveLength(0);
  });
});

describe("clustering", () => {
  const near = (i: number) => at("2026-10-01T00:00:00.000Z", { latitude: 10 + i * 0.01, longitude: 20 + i * 0.01, severity: i / 10 });

  it("groups nearby events and keeps distant ones separate", () => {
    const events = [near(0), near(1), near(2), at("2026-10-01T00:00:00.000Z", { latitude: -40, longitude: 100 })];
    const markers = clusterEvents(events, 2);
    expect(markers).toHaveLength(2);
    const group = markers.find((m) => m.count === 3)!;
    expect(group.severity).toBeCloseTo(0.2);
    expect(group.latitude).toBeCloseTo(10.01, 1);
    expect(group.memberIds).toHaveLength(3);
    expect(markers.find((m) => m.count === 1)?.id).toBe(events[3].id);
  });

  it("conserves every event across zoom levels", () => {
    const events = Array.from({ length: 500 }, (_, i) =>
      at("2026-10-01T00:00:00.000Z", { latitude: ((i * 37) % 170) - 85, longitude: ((i * 91) % 358) - 179 }),
    );
    for (const cell of [0.5, 2, 8, 16]) {
      const total = clusterEvents(events, cell).reduce((n, m) => n + m.count, 0);
      expect(total).toBe(500);
    }
  });

  it("does not split a cluster across the antimeridian seam by accident of indexing", () => {
    const events = [at("2026-10-01T00:00:00.000Z", { longitude: 179.99 }), at("2026-10-01T00:00:00.000Z", { longitude: -179.99 })];
    const total = clusterEvents(events, 4).reduce((n, m) => n + m.count, 0);
    expect(total).toBe(2);
  });

  it("uses smaller cells when zoomed in", () => {
    const far = cellSizeForView(4, 900, 35);
    const close = cellSizeForView(1.2, 900, 35);
    expect(close).toBeLessThan(far);
    expect(far).toBeLessThanOrEqual(16);
  });
});
