/**
 * Standalone ingestion worker: `npm run ingest`.
 * Polls every registered source on its own schedule and writes to the store
 * (Supabase when configured). Pair with OMNI_INGEST_IN_PROCESS=false on the web app.
 */
import { ADAPTERS } from "@/data-sources/registry";
import { createServices } from "@/server/services";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    /* file absent */
  }
}

const services = createServices();
const MIN_DELAY_MS = 5_000;
const IDLE_RECHECK_MS = 10 * 60_000;

console.log(`[omni-ingest] store: ${services.store.kind}; sources: ${ADAPTERS.map((a) => a.meta.id).join(", ")}`);
if (services.store.kind === "memory") {
  console.warn("[omni-ingest] No Supabase credentials set. Events live in this process only and the web app cannot see them.");
}

async function loop(adapter: (typeof ADAPTERS)[number]): Promise<void> {
  for (;;) {
    let wait = IDLE_RECHECK_MS;
    try {
      const status = await services.ingestor.ingest(adapter);
      console.log(`[omni-ingest] ${adapter.meta.id}: ${status.state}${status.message ? ` (${status.message})` : ""}`);
      if (status.state !== "not_configured" && status.nextAttemptAt !== undefined) {
        wait = Math.max(status.nextAttemptAt - Date.now(), MIN_DELAY_MS);
      }
    } catch (err) {
      console.error(`[omni-ingest] ${adapter.meta.id}: failed`, err);
    }
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

await Promise.all(ADAPTERS.map((adapter) => loop(adapter)));
