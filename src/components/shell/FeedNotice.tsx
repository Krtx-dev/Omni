"use client";

import { useVisibleEvents } from "@/client/selectors";
import { useOmni } from "@/client/store";

/** Centered status for the states where the globe would otherwise look broken or empty. */
export function FeedNotice() {
  const phase = useOmni((s) => s.phase);
  const error = useOmni((s) => s.error);
  const stored = useOmni((s) => s.events.length);
  const visible = useVisibleEvents().length;

  let text: string | null = null;
  if (phase === "loading") text = "Loading events";
  else if (phase === "error") text = `${error ?? "Could not load events."} Retrying.`;
  else if (stored === 0) text = "No events yet. Sources are still being polled.";
  else if (visible === 0) text = "No events match the current filters and time window.";
  if (!text) return null;

  return (
    <div role="status" className="pointer-events-none absolute left-1/2 top-14 z-10 -translate-x-1/2 border border-line bg-panel/95 px-3 py-1.5 text-[11px] text-dim">
      {text}
    </div>
  );
}
