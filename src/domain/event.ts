import { z } from "zod";
import { CATEGORY_IDS } from "./categories";

export const categoryIdSchema = z.enum(CATEGORY_IDS);

const geometrySchema = z.object({
  type: z.enum(["Point", "LineString", "Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"]),
  coordinates: z.array(z.unknown()),
});

/**
 * The single shape every data source is normalized into. Timestamps are ISO-8601
 * UTC strings so events survive JSON transport and database round trips unchanged.
 */
export const worldEventSchema = z.object({
  /** Globally unique and stable across refreshes: `<source>:<upstream id>`. */
  id: z.string().min(1),
  source: z.string().min(1),
  category: categoryIdSchema,
  title: z.string().min(1),
  description: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Meters relative to the surface; negative below ground (earthquake depth). */
  altitude: z.number().optional(),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  /** Normalized 0..1 within the category; see CATEGORIES[...].severity. */
  severity: z.number().min(0).max(1).optional(),
  /** Flat, source-specific facts shown verbatim in the detail panel. */
  properties: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  sourceUrl: z.url().optional(),
  geometry: geometrySchema.optional(),
});

export type WorldEvent = z.infer<typeof worldEventSchema>;
export type EventProperties = WorldEvent["properties"];
