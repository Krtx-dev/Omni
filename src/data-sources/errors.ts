export type SourceErrorKind =
  | "not_configured"
  | "unauthorized"
  | "rate_limited"
  | "upstream"
  | "network"
  | "invalid";

/**
 * Failure of an upstream source. Messages are surfaced in the UI, so they must
 * never contain URLs (FIRMS embeds its key in the path) or credentials.
 */
export class SourceError extends Error {
  readonly kind: SourceErrorKind;
  readonly retryAfterMs?: number;

  constructor(kind: SourceErrorKind, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "SourceError";
    this.kind = kind;
    this.retryAfterMs = retryAfterMs;
  }
}
