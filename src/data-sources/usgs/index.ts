import { defineAdapter, parseEach } from "../define-adapter";
import { SourceError } from "../errors";
import { requestSource } from "../http";
import { normalizeFeatures, USGS_SOURCE_ID } from "./normalize";
import { featureCollectionSchema, usgsFeatureSchema } from "./schema";

const FEED_BASE = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary";
const DAY_MS = 86_400_000;

/**
 * USGS Earthquake Hazards Program, M2.5+ worldwide. The 30-day feed seeds a
 * cold store; afterwards the 1-day feed is enough to pick up new events and
 * revisions, which keeps polling cheap.
 */
export const usgsAdapter = defineAdapter({
  meta: {
    id: USGS_SOURCE_ID,
    name: "USGS Earthquakes",
    category: "earthquake",
    description: "Worldwide earthquakes of magnitude 2.5 and above, updated about every minute.",
    homepage: "https://earthquake.usgs.gov/earthquakes/feed/",
    attribution: "U.S. Geological Survey",
    license: "Public domain (U.S. Government work)",
    refreshIntervalMs: 5 * 60_000,
    retentionMs: 31 * DAY_MS,
  },

  fetch: (ctx) => {
    const feed = ctx.lastSuccessAt === undefined ? "2.5_month" : "2.5_day";
    return requestSource(ctx.fetch, `${FEED_BASE}/${feed}.geojson`, { as: "json" });
  },

  validate(raw) {
    const envelope = featureCollectionSchema.safeParse(raw);
    if (!envelope.success) throw new SourceError("invalid", "USGS response was not a GeoJSON FeatureCollection");
    return parseEach(usgsFeatureSchema, envelope.data.features);
  },

  normalize: (features) => ({ events: normalizeFeatures(features) }),
});
