import type { Marker } from "@/domain/cluster";
import { latLonToVec3 } from "./geo";
import { CameraRig } from "./rig";

const FOV_RAD = (35 * Math.PI) / 180;
/** Globe radius on screen at which markers render at their nominal size. */
const REFERENCE_GLOBE_RADIUS_PX = 300;

export interface ScreenPoint {
  x: number;
  y: number;
  /** True when the point is on the hemisphere facing the camera. */
  facing: boolean;
}

/** On-screen diameter in CSS pixels. Clusters grow with log(count). */
export function markerSizePx(m: Marker): number {
  if (m.count > 1) return Math.min(46, 16 + 6 * Math.log2(m.count));
  return 5 + 9 * m.severity;
}

/**
 * Mutable meeting point between the WebGL scene (which knows the camera) and
 * the 2D overlay / pointer handlers (which need screen coordinates). Kept
 * outside React state because it changes every frame.
 */
export class SceneBridge {
  readonly rig = new CameraRig();
  markers: Marker[] = [];
  /** Unit-sphere position per marker, xyz interleaved. */
  positions = new Float32Array(0);
  hover: Marker | null = null;

  width = 1;
  height = 1;
  /** Column-major view-projection matrix, copied from the camera each frame. */
  viewProjection = new Float32Array(16);
  cameraPosition: [number, number, number] = [0, 0, 5];
  /** Shrinks markers when the globe is small on screen (phones, zoomed out). */
  sizeScale = 1;
  /** Called by the scene after each rendered frame. */
  onFrame: (() => void) | null = null;

  setHover(marker: Marker | null): void {
    this.hover = marker;
  }

  setFrameListener(listener: (() => void) | null): void {
    this.onFrame = listener;
  }

  /** Called once per frame by the camera controller after it positions the camera. */
  syncCamera(viewProjection: ArrayLike<number>, position: [number, number, number], width: number, height: number): void {
    this.viewProjection.set(viewProjection);
    this.cameraPosition = position;
    this.width = width;
    this.height = height;
    const distance = Math.hypot(...position);
    const globeRadiusPx = height / 2 / Math.tan(FOV_RAD / 2) / Math.sqrt(Math.max(distance * distance - 1, 0.01));
    this.sizeScale = Math.min(1, Math.max(0.5, globeRadiusPx / REFERENCE_GLOBE_RADIUS_PX));
    this.onFrame?.();
  }

  setMarkers(markers: Marker[]): void {
    this.markers = markers;
    this.positions = new Float32Array(markers.length * 3);
    markers.forEach((m, i) => {
      const [x, y, z] = latLonToVec3(m.latitude, m.longitude);
      this.positions.set([x, y, z], i * 3);
    });
  }

  private projectUnit(x: number, y: number, z: number): ScreenPoint | null {
    const e = this.viewProjection;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    if (w <= 0) return null;
    const ndcX = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w;
    const ndcY = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
    const [cx, cy, cz] = this.cameraPosition;
    return {
      x: (ndcX * 0.5 + 0.5) * this.width,
      y: (1 - (ndcY * 0.5 + 0.5)) * this.height,
      facing: x * cx + y * cy + z * cz > 1,
    };
  }

  project(latitude: number, longitude: number): ScreenPoint | null {
    const [x, y, z] = latLonToVec3(latitude, longitude);
    return this.projectUnit(x, y, z);
  }

  /** Nearest visible marker to a canvas-relative pixel, within its own radius plus a small grace. */
  pick(px: number, py: number): Marker | null {
    let best: Marker | null = null;
    let bestScore = Infinity;
    for (let i = 0; i < this.markers.length; i++) {
      const p = this.projectUnit(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
      if (!p || !p.facing) continue;
      const m = this.markers[i];
      const reach = Math.max(9, (markerSizePx(m) * this.sizeScale) / 2 + 4);
      const d = Math.hypot(p.x - px, p.y - py);
      if (d > reach) continue;
      // Prefer the closest centre; break ties toward the more severe marker.
      const score = d - m.severity;
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }
}
