import { CATEGORIES } from "@/domain/categories";
import type { EventProperties, WorldEvent } from "@/domain/event";
import { toSeverity } from "@/domain/severity";
import type { UsgsFeature } from "./schema";

export const USGS_SOURCE_ID = "usgs";

/** Returns null for records that are not natural earthquakes (quarry blasts, etc.) or lack a magnitude. */
export function normalizeFeature(feature: UsgsFeature): WorldEvent | null {
  const p = feature.properties;
  if ((p.type ?? "earthquake") !== "earthquake" || p.mag === null) return null;

  const [longitude, latitude, depthKm] = feature.geometry.coordinates;
  const place = p.place?.trim() || "Unlabelled location";
  const magnitude = Math.round(p.mag * 10) / 10;
  const magType = p.magType ? ` ${p.magType}` : "";
  const depth = depthKm === undefined ? "" : ` at ${depthKm.toFixed(1)} km depth`;

  const properties: EventProperties = {
    magnitude,
    magnitude_type: p.magType ?? null,
    review_status: p.status ?? null,
    network: p.net ?? null,
    felt_reports: p.felt ?? null,
    community_intensity: p.cdi ?? null,
    instrumental_intensity: p.mmi ?? null,
    pager_alert: p.alert ?? null,
    tsunami_flag: p.tsunami === undefined || p.tsunami === null ? null : p.tsunami === 1,
    significance: p.sig ?? null,
  };

  return {
    id: `${USGS_SOURCE_ID}:${feature.id}`,
    source: USGS_SOURCE_ID,
    category: "earthquake",
    title: `M ${magnitude.toFixed(1)} — ${place}`,
    description: `Magnitude ${magnitude.toFixed(1)}${magType} earthquake${depth}.`,
    latitude,
    longitude,
    altitude: depthKm === undefined ? undefined : -depthKm * 1000,
    startedAt: new Date(p.time).toISOString(),
    updatedAt: new Date(p.updated).toISOString(),
    severity: toSeverity(CATEGORIES.earthquake.severity, magnitude),
    properties,
    sourceUrl: p.url ?? undefined,
  };
}

export function normalizeFeatures(features: UsgsFeature[]): WorldEvent[] {
  const events: WorldEvent[] = [];
  for (const f of features) {
    const e = normalizeFeature(f);
    if (e) events.push(e);
  }
  return events;
}
