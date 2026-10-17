"use client";

import { useEffect } from "react";
import type { EventsResponse } from "@/domain/api";
import type { WorldEvent } from "@/domain/event";
import type { SourceInfo } from "@/domain/source";
import { useOmni } from "./store";

const RETRY_MS = 10_000;
const CLOCK_MS = 15_000;

/**
 * Loads the initial snapshot from /api/events, then follows /api/stream for
 * incremental updates. Both are served by this app; nothing here talks to an
 * upstream provider or sees an API key.
 */
export function useEventFeed(): void {
  useEffect(() => {
    const store = useOmni.getState();
    const abort = new AbortController();
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = (since: number) => {
      source = new EventSource(`/api/stream?since=${since}`);
      source.onopen = () => store.setLink("live");
      source.onerror = () => store.setLink("reconnecting");
      source.addEventListener("events", (m) => store.mergeLive(JSON.parse((m as MessageEvent<string>).data) as WorldEvent[]));
      source.addEventListener("sources", (m) => store.setSources(JSON.parse((m as MessageEvent<string>).data) as SourceInfo[]));
    };

    const load = async () => {
      store.setFeed(useOmni.getState().events.length > 0 ? "ready" : "loading");
      try {
        const res = await fetch("/api/events", { signal: abort.signal });
        if (!res.ok) throw new Error(res.status === 503 ? "The event store is unavailable." : `Request failed (HTTP ${res.status}).`);
        const body = (await res.json()) as EventsResponse;
        store.setSnapshot(body.events, body.sources, Date.now());
        connect(body.serverTime);
      } catch (err) {
        if (abort.signal.aborted) return;
        store.setFeed("error", err instanceof Error ? err.message : "Could not load events.");
        retry = setTimeout(load, RETRY_MS);
      }
    };

    void load();
    const clock = setInterval(() => store.tick(Date.now()), CLOCK_MS);

    return () => {
      abort.abort();
      source?.close();
      clearTimeout(retry);
      clearInterval(clock);
    };
  }, []);
}
