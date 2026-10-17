"use client";

import { useCallback, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useSelectedEvent, useTimeWindow, useVisibleEvents } from "@/client/selectors";
import { useOmni } from "@/client/store";
import type { Marker } from "@/domain/cluster";
import { SceneBridge } from "./bridge";
import { Earth } from "./Earth";
import { GlobeControls } from "./GlobeControls";
import { Markers } from "./Markers";
import { ScreenOverlay } from "./ScreenOverlay";

/** The full-screen globe: WebGL scene, 2D overlay, and the glue between them and the store. */
export default function GlobeView() {
  const [bridge] = useState(() => new SceneBridge());

  const events = useVisibleEvents();
  const window = useTimeWindow();
  const selected = useSelectedEvent();
  const now = useOmni((s) => s.now);
  const eventById = useMemo(() => new Map(events.map((e) => [e.id, e])), [events]);

  const onPick = useCallback((marker: Marker | null) => {
    const { select, flyTo } = useOmni.getState();
    if (!marker) select(null);
    else if (marker.count > 1) flyTo({ latitude: marker.latitude, longitude: marker.longitude, zoomFactor: 0.4 });
    else select(marker.id);
  }, []);

  return (
    <div className="absolute inset-0 bg-void">
      <Canvas
        flat
        dpr={[1, 2]}
        camera={{ fov: 35, near: 0.02, far: 40, position: [0, 0, 5] }}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <color attach="background" args={["#030508"]} />
        <Earth />
        <Markers events={events} window={window} bridge={bridge} />
        <GlobeControls bridge={bridge} onPick={onPick} />
      </Canvas>
      <ScreenOverlay bridge={bridge} selected={selected} eventById={eventById} now={now} />
    </div>
  );
}
