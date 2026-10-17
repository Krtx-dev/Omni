import { z } from "zod";

/** CSV cells are strings; an empty cell must fail rather than coerce to 0. */
const numeric = z.string().min(1).transform(Number).pipe(z.number());
const optionalNumeric = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v === "" ? undefined : Number(v)))
  .pipe(z.number().optional());

/**
 * One active-fire detection. VIIRS and MODIS products share these columns; the
 * brightness column is named differently (`bright_ti4` vs `brightness`).
 */
export const firmsRowSchema = z.object({
  latitude: numeric,
  longitude: numeric,
  acq_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acq_time: z.string().regex(/^\d{1,4}$/),
  satellite: z.string().optional(),
  instrument: z.string().optional(),
  confidence: z.string().optional(),
  daynight: z.string().optional(),
  frp: optionalNumeric,
  bright_ti4: optionalNumeric,
  brightness: optionalNumeric,
});

export type FirmsRow = z.infer<typeof firmsRowSchema>;

export const firmsEnvSchema = z.object({
  FIRMS_MAP_KEY: z.string().min(1),
  FIRMS_SOURCE: z
    .string()
    .regex(/^[A-Z0-9_]+$/)
    .default("VIIRS_SNPP_NRT"),
  FIRMS_DAY_RANGE: z.coerce.number().int().min(1).max(5).default(2),
  FIRMS_MAX_DETECTIONS: z.coerce.number().int().min(100).default(20_000),
});

export type FirmsEnv = z.infer<typeof firmsEnvSchema>;
