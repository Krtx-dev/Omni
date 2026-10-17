import { z } from "zod";

/** Treat `KEY=` lines copied from .env.example as unset. */
const optional = z.string().optional().transform((v) => (v ? v : undefined));

const serverEnvSchema = z.object({
  SUPABASE_URL: optional.pipe(z.url().optional()),
  SUPABASE_SERVICE_ROLE_KEY: optional,
  OMNI_INGEST_IN_PROCESS: z.enum(["true", "false"]).default("true"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Validated infrastructure settings. Source-specific variables are validated by their adapters. */
export function readServerEnv(raw: NodeJS.ProcessEnv = process.env): ServerEnv {
  return serverEnvSchema.parse({
    SUPABASE_URL: raw.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: raw.SUPABASE_SERVICE_ROLE_KEY,
    OMNI_INGEST_IN_PROCESS: raw.OMNI_INGEST_IN_PROCESS || undefined,
  });
}
