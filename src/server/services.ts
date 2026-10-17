import { ADAPTERS } from "@/data-sources/registry";
import type { SourceInfo } from "@/domain/source";
import { readServerEnv, type ServerEnv } from "./env";
import { Ingestor } from "./ingestor";
import { MemoryEventStore } from "./store/memory";
import { SupabaseEventStore } from "./store/supabase";
import type { EventStore } from "./store/types";

export interface Services {
  env: ServerEnv;
  store: EventStore;
  ingestor: Ingestor;
}

export function createServices(processEnv: NodeJS.ProcessEnv = process.env): Services {
  const env = readServerEnv(processEnv);
  const store =
    env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? new SupabaseEventStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
      : new MemoryEventStore();
  return { env, store, ingestor: new Ingestor({ store, env: processEnv }) };
}

/** One container per server process; survives dev-mode module reloads. */
const globalKey = Symbol.for("omni.services");
type Holder = { [globalKey]?: Services };

export function getServices(): Services {
  const holder = globalThis as Holder;
  return (holder[globalKey] ??= createServices());
}

/** Everything the client may know about each source: metadata, status and coverage. No secrets. */
export async function describeSources({ store }: Services = getServices()): Promise<SourceInfo[]> {
  const [statuses, summaries] = await Promise.all([store.getStatuses(), store.summarize()]);
  return ADAPTERS.map(({ meta, isConfigured }) => ({
    id: meta.id,
    name: meta.name,
    category: meta.category,
    description: meta.description,
    homepage: meta.homepage,
    attribution: meta.attribution,
    license: meta.license,
    refreshIntervalMs: meta.refreshIntervalMs,
    configured: isConfigured(process.env),
    credentials: meta.credentials,
    status: statuses[meta.id] ?? { id: meta.id, state: "pending", consecutiveFailures: 0, rejected: 0 },
    summary: summaries[meta.id],
  }));
}
