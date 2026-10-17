"use client";

import { useEffect, useRef } from "react";
import { Matrix4, PerspectiveCamera } from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useOmni } from "@/client/store";
import type { Marker } from "@/domain/cluster";
import type { SceneBridge } from "./bridge";
import { latLonToVec3 } from "./geo";
import { MAX_DISTANCE } from "./rig";

const DRAG_THRESHOLD_PX = 4;
const INTRO = { latitude: 20, longitude: 12 };
/** Fraction of the limiting screen dimension the globe should fill on arrival. */
const FILL = 0.74;

/** Camera distance at which the whole globe fits the viewport with some margin. */
function fitDistance(fovDeg: number, aspect: number): number {
  const halfV = (fovDeg * Math.PI) / 360;
  const halfH = Math.atan(Math.tan(halfV) * aspect);
  return 1 / Math.sin(Math.min(halfV, halfH) * FILL);
}

interface Props {
  bridge: SceneBridge;
  onPick(marker: Marker | null): void;
}

const viewProjection = new Matrix4();

/**
 * Pointer/wheel/pinch input, the camera flight system, and the per-frame sync
 * of camera matrices into the bridge for overlay drawing and hit-testing.
 */
export function GlobeControls({ bridge, onPick }: Props) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const fly = useOmni((s) => s.fly);

  // Cinematic arrival: start far out and glide in.
  const size = useThree((s) => s.size);
  const introduced = useRef(false);
  useEffect(() => {
    if (introduced.current || size.width === 0 || size.height === 0) return;
    introduced.current = true;
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 35;
    const target = fitDistance(fov, size.width / size.height);
    bridge.rig.beginIntro(Math.min(target * 1.5, MAX_DISTANCE), { ...INTRO, distance: target });
  }, [bridge, camera, size]);

  useEffect(() => {
    if (fly) bridge.rig.flyTo({ latitude: fly.latitude, longitude: fly.longitude, maxDistance: fly.maxDistance, zoomFactor: fly.zoomFactor });
  }, [bridge, fly]);

  useEffect(() => {
    const el = gl.domElement;
    const { rig } = bridge;
    const pointers = new Map<number, { x: number; y: number }>();
    let travelled = 0;
    let lastMove = 0;
    let pinchStart = 0;

    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const degPerPixel = () => {
      const fov = camera instanceof PerspectiveCamera ? camera.fov : 35;
      const surface = Math.max(rig.view.distance - 1, 0.03);
      return ((2 * Math.tan((fov * Math.PI) / 360) * surface) / bridge.height) * (180 / Math.PI);
    };
    const pinchDistance = () => {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };

    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, local(e));
      rig.stopInertia();
      if (pointers.size === 1) travelled = 0;
      if (pointers.size === 2) pinchStart = pinchDistance();
    };

    const move = (e: PointerEvent) => {
      const p = local(e);
      const prev = pointers.get(e.pointerId);
      if (!prev) {
        const hit = e.pointerType === "mouse" ? bridge.pick(p.x, p.y) : null;
        bridge.setHover(hit);
        el.style.cursor = hit ? "pointer" : "grab";
        return;
      }
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      pointers.set(e.pointerId, p);

      if (pointers.size === 2) {
        const d = pinchDistance();
        if (pinchStart > 0 && d > 0) rig.zoomBy(pinchStart / d);
        pinchStart = d;
        travelled = Infinity;
        return;
      }
      travelled += Math.abs(dx) + Math.abs(dy);
      if (travelled < DRAG_THRESHOLD_PX) return;
      const now = performance.now();
      const dt = Math.max((now - lastMove) / 1000, 0.001);
      lastMove = now;
      const k = degPerPixel();
      rig.rotate(dy * k, -dx * k, Math.min(dt, 0.1));
      bridge.setHover(null);
      el.style.cursor = "grabbing";
    };

    const up = (e: PointerEvent) => {
      const wasTap = pointers.size === 1 && travelled < DRAG_THRESHOLD_PX && e.type === "pointerup";
      const p = local(e);
      pointers.delete(e.pointerId);
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      if (performance.now() - lastMove > 80) rig.stopInertia();
      el.style.cursor = "grab";
      if (wasTap) onPick(bridge.pick(p.x, p.y));
    };

    const leave = () => bridge.setHover(null);

    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
      rig.zoomBy(Math.exp(Math.max(-200, Math.min(200, e.deltaY * unit)) * 0.0014));
    };

    el.style.setProperty("cursor", "grab");
    el.style.setProperty("touch-action", "none");
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", leave);
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerleave", leave);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, camera, bridge, onPick]);

  useFrame((state, delta) => {
    const { rig } = bridge;
    rig.update(Math.min(delta, 0.05));
    const { latitude, longitude, distance } = rig.view;
    const [x, y, z] = latLonToVec3(latitude, longitude, distance);
    camera.position.set(x, y, z);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    bridge.syncCamera(viewProjection.elements, [x, y, z], state.size.width, state.size.height);
  });

  return null;
}
