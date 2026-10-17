"use client";

import { useEffect } from "react";
import { RANGE_MS } from "@/domain/time";
import { useOmni } from "./store";

const FRAME_MS = 80;
/** At speed 1 the full window replays in this many seconds. */
const BASE_SECONDS = 30;

/** Advances the playhead while `playing`, handing control back to live time at the end. */
export function usePlayback(): void {
  const playing = useOmni((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const t = performance.now();
      const dt = t - last;
      last = t;
      const s = useOmni.getState();
      const now = Date.now();
      const span = RANGE_MS[s.range];
      const from = s.cursor ?? now - span;
      const next = from + (dt / 1000) * (span / BASE_SECONDS) * s.speed;
      if (next >= now) s.goLive();
      else s.setCursor(next);
    }, FRAME_MS);
    return () => clearInterval(timer);
  }, [playing]);
}
