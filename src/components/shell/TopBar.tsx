"use client";

import { useVisibleEvents } from "@/client/selectors";
import { useOmni, type LinkState } from "@/client/store";
import { formatCount } from "@/lib/format";
import { Clock } from "./Clock";

const LINK_LABEL: Record<LinkState, string> = { connecting: "Connecting", live: "Live", reconnecting: "Reconnecting" };
const LINK_COLOR: Record<LinkState, string> = { connecting: "bg-warn", live: "bg-ok", reconnecting: "bg-warn" };

interface TopBarProps {
  panelOpen: boolean;
  onTogglePanel(): void;
}

export function TopBar({ panelOpen, onTogglePanel }: TopBarProps) {
  const link = useOmni((s) => s.link);
  const phase = useOmni((s) => s.phase);
  const inView = useVisibleEvents().length;

  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-8 items-center justify-between border-b border-line bg-void/90 px-3">
      <div className="pointer-events-auto flex items-center gap-4">
        <span className="text-[12px] font-semibold tracking-[0.32em] text-bright">OMNI</span>
        <button
          type="button"
          onClick={onTogglePanel}
          aria-pressed={panelOpen}
          className="text-[10px] uppercase tracking-[0.14em] text-dim hover:text-ink md:hidden"
        >
          Layers
        </button>
      </div>
      <div className="pointer-events-auto flex items-center gap-4 text-[10px] uppercase tracking-[0.12em] text-dim">
        {phase === "ready" && <span className="tabular-nums">{formatCount(inView)} in view</span>}
        <span className="flex items-center gap-1.5">
          <span className={`size-1.5 ${LINK_COLOR[link]}`} aria-hidden />
          {LINK_LABEL[link]}
        </span>
        <Clock />
      </div>
    </header>
  );
}
