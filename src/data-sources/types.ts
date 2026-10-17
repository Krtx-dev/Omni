import type { CategoryId } from "@/domain/categories";
import type { WorldEvent } from "@/domain/event";

export type SourceEnv = Readonly<Record<string, string | undefined>>;

export interface SourceMeta {
  /** Stable id; also the `source` field and id prefix of every event it emits. */
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  homepage: string;
  attribution: string;
  license: string;
  refreshIntervalMs: number;
  /** Events older than this are pruned from the store. */
  retentionMs: number;
  credentials?: { envVar: string; signupUrl: string };
}

export interface PullContext {
  env: SourceEnv;
  now: number;
  /** Time of the last successful pull in this store; absent on a cold start. */
  lastSuccessAt?: number;
  fetch: typeof fetch;
}

export interface PullResult {
  events: WorldEvent[];
  /** Upstream records dropped by validation. */
  rejected: number;
  notice?: string;
}

/** What the ingestion service sees. Adapters are built with {@link defineAdapter}. */
export interface DataSourceAdapter {
  meta: SourceMeta;
  isConfigured(env: SourceEnv): boolean;
  pull(ctx: PullContext): Promise<PullResult>;
}

export interface ValidationResult<T> {
  items: T[];
  rejected: number;
}

/** The four pipeline stages an adapter implements. `store` and `expose` are shared. */
export interface AdapterDefinition<T> {
  meta: SourceMeta;
  isConfigured?(env: SourceEnv): boolean;
  /** Stage 1: fetch the raw upstream payload. */
  fetch(ctx: PullContext): Promise<unknown>;
  /** Stage 2: validate the payload; drop (and count) malformed records. */
  validate(raw: unknown): ValidationResult<T>;
  /** Stage 3: map validated records onto WorldEvent. */
  normalize(items: T[], ctx: PullContext): { events: WorldEvent[]; notice?: string };
}
