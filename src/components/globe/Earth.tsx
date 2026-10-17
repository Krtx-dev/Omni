"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Float32BufferAttribute,
  LinearMipmapLinearFilter,
  SRGBColorSpace,
} from "three";
import { useThree } from "@react-three/fiber";
import { loadEarthGeo, paintLandTexture, type EarthGeo, type LonLat } from "./earth-geo";
import { graticule, polylinesToSegments } from "./geo";

const atmosphereVertex = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** A thin rim of light at the limb; the only gradient in the scene. */
const atmosphereFragment = /* glsl */ `
  varying vec3 vNormal;
  void main() {
    float rim = pow(max(0.0, 0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
    gl_FragColor = vec4(0.30, 0.52, 0.78, 1.0) * rim * 0.9;
    #include <colorspace_fragment>
  }
`;

function segmentGeometry(lines: readonly (readonly LonLat[])[], radius: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(polylinesToSegments(lines, radius), 3));
  return g;
}

export function Earth() {
  const [geo, setGeo] = useState<EarthGeo | null>(null);
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy());

  useEffect(() => {
    let alive = true;
    loadEarthGeo()
      .then((g) => alive && setGeo(g))
      .catch((err) => console.error("[omni] earth geometry failed to load", err));
    return () => {
      alive = false;
    };
  }, []);

  const texture = useMemo(() => {
    if (!geo) return null;
    const t = new CanvasTexture(paintLandTexture(geo.land));
    t.colorSpace = SRGBColorSpace;
    t.minFilter = LinearMipmapLinearFilter;
    t.anisotropy = maxAnisotropy;
    return t;
  }, [geo, maxAnisotropy]);

  const grid = useMemo(() => segmentGeometry(graticule(30), 1.0006), []);
  const coast = useMemo(() => (geo ? segmentGeometry(geo.coastlines, 1.001) : null), [geo]);
  const borders = useMemo(() => (geo ? segmentGeometry(geo.borders, 1.0009) : null), [geo]);

  useEffect(() => () => texture?.dispose(), [texture]);
  useEffect(() => () => grid.dispose(), [grid]);
  useEffect(() => () => coast?.dispose(), [coast]);
  useEffect(() => () => borders?.dispose(), [borders]);

  return (
    <group>
      <mesh>
        <sphereGeometry args={[1, 128, 64]} />
        {/* Keyed so three.js recompiles the program when the map appears; adding a map to a live material does not. */}
        <meshBasicMaterial key={texture ? "textured" : "flat"} map={texture} color={texture ? "#ffffff" : "#04070b"} />
      </mesh>

      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#1a2430" transparent opacity={0.55} depthWrite={false} />
      </lineSegments>
      {borders && (
        <lineSegments geometry={borders}>
          <lineBasicMaterial color="#27323f" transparent opacity={0.8} depthWrite={false} />
        </lineSegments>
      )}
      {coast && (
        <lineSegments geometry={coast}>
          <lineBasicMaterial color="#44556a" transparent opacity={0.9} depthWrite={false} />
        </lineSegments>
      )}

      <mesh scale={1.07}>
        <sphereGeometry args={[1, 64, 32]} />
        <shaderMaterial
          vertexShader={atmosphereVertex}
          fragmentShader={atmosphereFragment}
          side={BackSide}
          blending={AdditiveBlending}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
