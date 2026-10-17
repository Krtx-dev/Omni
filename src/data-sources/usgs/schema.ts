import { z } from "zod";

/** Envelope only; features are validated one by one so a bad record is dropped, not fatal. */
export const featureCollectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()),
});

/** One earthquake in the USGS GeoJSON summary feed. Only fields OMNI uses. */
export const usgsFeatureSchema = z.object({
  id: z.string().min(1),
  properties: z.object({
    mag: z.number().nullable(),
    place: z.string().nullish(),
    time: z.number(),
    updated: z.number(),
    url: z.string().nullish(),
    type: z.string().nullish(),
    magType: z.string().nullish(),
    status: z.string().nullish(),
    net: z.string().nullish(),
    felt: z.number().nullish(),
    cdi: z.number().nullish(),
    mmi: z.number().nullish(),
    alert: z.string().nullish(),
    tsunami: z.number().nullish(),
    sig: z.number().nullish(),
  }),
  geometry: z.object({
    type: z.literal("Point"),
    /** [longitude, latitude, depth in km] */
    coordinates: z.array(z.number()).min(2),
  }),
});

export type UsgsFeature = z.infer<typeof usgsFeatureSchema>;
