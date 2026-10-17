import type { CategoryId } from "./categories";

export type SourceState = "pending" | "ok" | "error" | "rate_limited" | "not_configured";

/** Result of the latest ingestion attempt for one source. Persisted by the store. */
export interface SourceStatus {
  id: string;
  state: SourceState;
  lastAttemptAt?: number;
  lastSuccessAt?: number;
  nextAttemptAt?: number;
  consecutiveFailures: number;
  /** Human-readable detail: error reason, truncation notice, etc. Never contains secrets. */
  message?: string;
  /** Items the upstream returned that failed validation on the last success. */
  rejected: number;
}

export interface SourceSummary {
  count: number;
  /** Earliest / latest event start time held in the store (ms). */
  from: number;
  to: number;
}

/** What the client may know about a source. Contains no secrets. */
export interface SourceInfo {
  id: string;
  name: string;
  category: CategoryId;
  description: string;
  homepage: string;
  attribution: string;
  license: string;
  refreshIntervalMs: number;
  configured: boolean;
  credentials?: { envVar: string; signupUrl: string };
  status: SourceStatus;
  summary?: SourceSummary;
}
