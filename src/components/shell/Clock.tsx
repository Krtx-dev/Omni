"use client";

import { useEffect, useState } from "react";
import { formatClock } from "@/lib/format";

/** UTC wall clock. Renders blank until mounted so server and client markup match. */
export function Clock() {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="tabular-nums">{ms === null ? "--:--:--" : formatClock(ms)} UTC</span>;
}
