"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { useEventFeed } from "@/client/use-event-feed";
import { usePlayback } from "@/client/use-playback";
import { EventDetailPanel } from "@/components/panels/EventDetailPanel";
import { FiltersPanel } from "@/components/panels/FiltersPanel";
import { LayersPanel } from "@/components/panels/LayersPanel";
import { Timeline } from "@/components/timeline/Timeline";
import { FeedNotice } from "./FeedNotice";
import { TopBar } from "./TopBar";

// WebGL cannot render on the server; load the globe on the client only.
const GlobeView = dynamic(() => import("@/components/globe/GlobeView"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-void" />,
});

export function OmniApp() {
  useEventFeed();
  usePlayback();
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-void">
      <GlobeView />
      <TopBar panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((v) => !v)} />
      <nav
        aria-label="Layers and filters"
        className={`absolute left-3 top-11 z-20 max-h-[calc(100dvh-11.5rem)] w-[264px] overflow-y-auto border border-line bg-panel/95 md:block ${
          panelOpen ? "block" : "hidden"
        }`}
      >
        <LayersPanel />
        <FiltersPanel />
      </nav>
      <EventDetailPanel />
      <FeedNotice />
      <Timeline />
    </main>
  );
}
