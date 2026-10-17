import { CATEGORIES } from "@/domain/categories";
import type { EventProperties, WorldEvent } from "@/domain/event";
import { toSeverity } from "@/domain/severity";
import type { FirmsRow } from "./schema";

export const FIRMS_SOURCE_ID = "firms";

export type Confidence = "low" | "nominal" | "high";

const SATELLITES: Record<string, string> = {
  N: "Suomi NPP",
  N20: "NOAA-20",
  N21: "NOAA-21",
  Terra: "Terra",
  Aqua: "Aqua",
};

/** VIIRS reports l/n/h, MODIS reports 0-100. */
export function parseConfidence(raw: string | undefined): Confidence | undefined {
  if (!raw) return undefined;
  const text = raw.toLowerCase();
  if (text === "l" || text === "low") return "low";
  if (text === "n" || text === "nominal") return "nominal";
  if (text === "h" || text === "high") return "high";
  const n = Number(text);
  if (!Number.isFinite(n)) return undefined;
  return n < 30 ? "low" : n < 80 ? "nominal" : "high";
}

/** acq_date `2026-10-07` + acq_time `342` (HHMM, UTC) -> ISO timestamp. */
export function acquisitionTime(date: string, time: string): string {
  const hhmm = time.padStart(4, "0");
  return `${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00.000Z`;
}

export function normalizeRow(row: FirmsRow): WorldEvent | null {
  const confidence = parseConfidence(row.confidence);
  if (confidence === "low") return null;

  const startedAt = acquisitionTime(row.acq_date, row.acq_time);
  if (Number.isNaN(Date.parse(startedAt))) return null;

  const satellite = row.satellite ? (SATELLITES[row.satellite] ?? row.satellite) : "unknown satellite";
  const frp = row.frp;
  const brightness = row.bright_ti4 ?? row.brightness;
  const lat = row.latitude.toFixed(4);
  const lon = row.longitude.toFixed(4);

  const properties: EventProperties = {
    fire_radiative_power_mw: frp ?? null,
    brightness_k: brightness ?? null,
    confidence: confidence ?? null,
    satellite,
    instrument: row.instrument ?? null,
    day_night: row.daynight === "D" ? "day" : row.daynight === "N" ? "night" : null,
  };

  return {
    id: `${FIRMS_SOURCE_ID}:${row.satellite ?? "x"}:${lat},${lon}:${row.acq_date}T${row.acq_time.padStart(4, "0")}`,
    source: FIRMS_SOURCE_ID,
    category: "wildfire",
    title: frp === undefined ? "Thermal anomaly" : `Thermal anomaly — ${frp.toFixed(1)} MW`,
    description:
      `Satellite thermal detection by ${row.instrument ?? "FIRMS"} on ${satellite}` +
      `${confidence ? `, ${confidence} confidence` : ""}. ` +
      "A thermal anomaly is not a confirmed wildfire: industrial heat sources and volcanoes can also trigger it.",
    latitude: row.latitude,
    longitude: row.longitude,
    startedAt,
    updatedAt: startedAt,
    severity: toSeverity(CATEGORIES.wildfire.severity, frp ?? 0),
    properties,
    sourceUrl: `https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${lon},${lat},10z`,
  };
}

/**
 * Normalize detections, dropping low confidence and, when the feed is larger
 * than `max`, keeping the highest fire radiative power. Truncation is reported
 * so the UI never implies the layer is exhaustive when it is not.
 */
export function normalizeRows(rows: FirmsRow[], max: number): { events: WorldEvent[]; notice?: string } {
  const events: WorldEvent[] = [];
  for (const row of rows) {
    const e = normalizeRow(row);
    if (e) events.push(e);
  }
  if (events.length <= max) return { events };

  const power = (e: WorldEvent) => (typeof e.properties.fire_radiative_power_mw === "number" ? e.properties.fire_radiative_power_mw : 0);
  events.sort((a, b) => power(b) - power(a));
  return {
    events: events.slice(0, max),
    notice: `Showing the ${max.toLocaleString("en-US")} highest-power of ${events.length.toLocaleString("en-US")} detections.`,
  };
}
