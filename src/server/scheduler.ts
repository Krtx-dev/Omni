import { ADAPTERS } from "@/data-sources/registry";
import type { DataSourceAdapter } from "@/data-sources/types";
import { getServices, type Services } from "./services";

const MIN_DELAY_MS = 5_000;
const IDLE_RECHECK_MS = 10 * 60_000;
const START_STAGGER_MS = 750;

const globalKey = Symbol.for("omni.scheduler");
type Holder = { [globalKey]?: boolean };

/**
 * Starts one polling loop per adapter. Idempotent per process. Disabled with
 * OMNI_INGEST_IN_PROCESS=false, in which case `npm run ingest` must be running.
 */
export function ensureScheduler(services: Services = getServices()): void {
  const holder = globalThis as Holder;
  if (holder[globalKey] || services.env.OMNI_INGEST_IN_PROCESS === "false") return;
  holder[globalKey] = true;
  ADAPTERS.forEach((adapter, i) => schedule(adapter, services, i * START_STAGGER_MS));
}

function schedule(adapter: DataSourceAdapter, services: Services, delay: number): void {
  const timer = setTimeout(async () => {
    let next = IDLE_RECHECK_MS;
    try {
      const status = await services.ingestor.ingest(adapter);
      if (status.state !== "not_configured" && status.nextAttemptAt !== undefined) {
        next = Math.max(status.nextAttemptAt - Date.now(), MIN_DELAY_MS);
      }
    } catch (err) {
      console.error(`[omni] ${adapter.meta.id}: scheduler error`, err);
    }
    schedule(adapter, services, next);
  }, delay);
  timer.unref?.();
}

/**
 * Block briefly for sources that have never been attempted, so the very first
 * page load returns data instead of an empty globe. Later loads never wait.
 */
export async function ensureFirstPull(sourceIds: readonly string[], waitMs: number, services: Services = getServices()): Promise<void> {
  if (services.env.OMNI_INGEST_IN_PROCESS === "false") return;
  const statuses = await services.store.getStatuses();
  const pending = ADAPTERS.filter((a) => sourceIds.includes(a.meta.id) && !statuses[a.meta.id]);
  if (pending.length === 0) return;
  const pulls = Promise.allSettled(pending.map((a) => services.ingestor.ingest(a)));
  await Promise.race([pulls, new Promise((resolve) => setTimeout(resolve, waitMs))]);
}
