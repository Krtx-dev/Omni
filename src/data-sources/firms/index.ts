import { parseCsv } from "../csv";
import { defineAdapter, parseEach } from "../define-adapter";
import { SourceError } from "../errors";
import { requestSource } from "../http";
import { FIRMS_SOURCE_ID, normalizeRows } from "./normalize";
import { firmsEnvSchema, firmsRowSchema } from "./schema";
import type { SourceEnv } from "../types";

const API_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const DAY_MS = 86_400_000;

function readEnv(env: SourceEnv) {
  const parsed = firmsEnvSchema.safeParse(env);
  if (!parsed.success) throw new SourceError("not_configured", "FIRMS settings are missing or invalid");
  return parsed.data;
}

/**
 * NASA FIRMS active-fire detections. FIRMS requires a free MAP_KEY; without
 * one the adapter reports `not_configured` and never touches the network.
 */
export const firmsAdapter = defineAdapter({
  meta: {
    id: FIRMS_SOURCE_ID,
    name: "NASA FIRMS Active Fires",
    category: "wildfire",
    description: "Satellite thermal anomaly detections (VIIRS / MODIS), near real time.",
    homepage: "https://firms.modaps.eosdis.nasa.gov/",
    attribution: "NASA FIRMS, LANCE / ESDIS",
    license: "NASA open data; acknowledge FIRMS when redistributing",
    refreshIntervalMs: 15 * 60_000,
    retentionMs: 6 * DAY_MS,
    credentials: { envVar: "FIRMS_MAP_KEY", signupUrl: "https://firms.modaps.eosdis.nasa.gov/api/map_key/" },
  },

  isConfigured: (env) => Boolean(env.FIRMS_MAP_KEY),

  async fetch(ctx) {
    const cfg = readEnv(ctx.env);
    const url = `${API_BASE}/${encodeURIComponent(cfg.FIRMS_MAP_KEY)}/${cfg.FIRMS_SOURCE}/world/${cfg.FIRMS_DAY_RANGE}`;
    const text = await requestSource(ctx.fetch, url, { as: "text", timeoutMs: 90_000 });
    return typeof text === "string" ? text : "";
  },

  validate(raw) {
    const text = typeof raw === "string" ? raw : "";
    // FIRMS reports bad keys and exhausted quotas as plain text, not HTTP errors.
    if (!text.trimStart().toLowerCase().startsWith("latitude")) {
      if (/exceed|limit|too many/i.test(text)) throw new SourceError("rate_limited", "FIRMS transaction limit reached", 10 * 60_000);
      if (/invalid|key/i.test(text)) throw new SourceError("unauthorized", "FIRMS rejected the MAP_KEY");
      throw new SourceError("invalid", "FIRMS returned an unrecognised response");
    }
    return parseEach(firmsRowSchema, parseCsv(text));
  },

  normalize: (rows, ctx) => normalizeRows(rows, readEnv(ctx.env).FIRMS_MAX_DETECTIONS),
});
