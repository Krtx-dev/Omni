import { SourceError } from "./errors";

interface RequestOptions {
  as: "json" | "text";
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/** GET with a timeout, translating every failure mode into a {@link SourceError}. */
export async function requestSource(
  doFetch: typeof fetch,
  url: string,
  { as, headers, timeoutMs = 30_000 }: RequestOptions,
): Promise<unknown> {
  let res: Response;
  try {
    res = await doFetch(url, {
      headers: { "user-agent": "OMNI/0.1 (open-source world model)", ...headers },
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new SourceError("network", timedOut ? "Upstream timed out" : "Could not reach upstream");
  }

  if (res.status === 429) {
    throw new SourceError("rate_limited", "Rate limited by upstream", parseRetryAfter(res.headers.get("retry-after")));
  }
  if (res.status === 401 || res.status === 403) {
    throw new SourceError("unauthorized", `Upstream rejected the credentials (HTTP ${res.status})`);
  }
  if (!res.ok) {
    throw new SourceError("upstream", `Upstream returned HTTP ${res.status}`);
  }

  try {
    return as === "json" ? await res.json() : await res.text();
  } catch {
    throw new SourceError("invalid", "Upstream response could not be read");
  }
}
