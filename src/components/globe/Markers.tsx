"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BufferGeometry, Color, Float32BufferAttribute, type ShaderMaterial } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { CATEGORIES } from "@/domain/categories";
import { cellSizeForView, clusterEvents, type Marker } from "@/domain/cluster";
import type { IndexedEvent } from "@/domain/indexed";
import type { TimeWindow } from "@/domain/time";
import { markerSizePx, type SceneBridge } from "./bridge";
import { latLonToVec3 } from "./geo";

const RADIUS = 1.003;

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aAlpha;
  attribute float aRing;
  uniform float uPixelRatio;
  uniform float uScale;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vRing = aRing;
    gl_PointSize = aSize * uScale * uPixelRatio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vRing;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float edge = 1.0 - smoothstep(0.82, 1.0, d);
    float a;
    if (vRing > 0.5) {
      a = 0.16 * edge + smoothstep(0.7, 0.8, d) * edge * 0.9;   // hollow disc with a rim: a group
    } else {
      a = 0.5 * edge + (1.0 - smoothstep(0.0, 0.55, d)) * 0.5;  // filled with a hot core: one event
    }
    gl_FragColor = vec4(vColor, clamp(a * vAlpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

/** Newer events read brighter; the oldest in the window fade to 35%. */
function recencyAlpha(newestMs: number, window: TimeWindow): number {
  const span = window.end - window.start || 1;
  const age = Math.min(1, Math.max(0, (window.end - newestMs) / span));
  return 1 - 0.65 * Math.sqrt(age);
}

function buildGeometry(markers: readonly Marker[], window: TimeWindow): BufferGeometry {
  const n = markers.length;
  const position = new Float32Array(n * 3);
  const color = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  const ring = new Float32Array(n);
  const tint = new Color();

  markers.forEach((m, i) => {
    position.set(latLonToVec3(m.latitude, m.longitude, RADIUS), i * 3);
    tint.set(CATEGORIES[m.category].color);
    color.set([tint.r, tint.g, tint.b], i * 3);
    size[i] = markerSizePx(m);
    alpha[i] = recencyAlpha(m.newestMs, window);
    ring[i] = m.count > 1 ? 1 : 0;
  });

  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(position, 3));
  g.setAttribute("aColor", new Float32BufferAttribute(color, 3));
  g.setAttribute("aSize", new Float32BufferAttribute(size, 1));
  g.setAttribute("aAlpha", new Float32BufferAttribute(alpha, 1));
  g.setAttribute("aRing", new Float32BufferAttribute(ring, 1));
  // Positions sit on a unit sphere; skip per-frame bounds work and never cull.
  g.boundingSphere = null;
  return g;
}

interface Props {
  events: readonly IndexedEvent[];
  window: TimeWindow;
  bridge: SceneBridge;
}

/** Renders visible events as GPU points, clustered to the current zoom. */
export function Markers({ events, window, bridge }: Props) {
  const material = useRef<ShaderMaterial>(null);
  const camera = useThree((s) => s.camera);
  const height = useThree((s) => s.size.height);
  const [cell, setCell] = useState(() => cellSizeForView(bridge.rig.view.distance, height, 35));

  useFrame(({ gl }) => {
    const fov = "fov" in camera ? (camera.fov as number) : 35;
    const next = cellSizeForView(bridge.rig.view.distance, height, fov);
    if (next !== cell) setCell(next);
    if (material.current) {
      material.current.uniforms.uPixelRatio.value = gl.getPixelRatio();
      material.current.uniforms.uScale.value = bridge.sizeScale;
    }
  });

  const markers = useMemo(() => clusterEvents(events, cell), [events, cell]);
  const geometry = useMemo(() => buildGeometry(markers, window), [markers, window]);
  const uniforms = useMemo(() => ({ uPixelRatio: { value: 1 }, uScale: { value: 1 } }), []);

  useEffect(() => {
    bridge.setMarkers(markers);
  }, [bridge, markers]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={10}>
      <shaderMaterial
        ref={material}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
      />
    </points>
  );
}
