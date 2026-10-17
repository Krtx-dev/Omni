import type { CategoryId } from "./categories";
import type { IndexedEvent } from "./indexed";

export interface Marker {
  /** Event id for singletons; `cluster:<cell>` for groups. */
  id: string;
  latitude: number;
  longitude: number;
  count: number;
  category: CategoryId;
  /** Highest severity among members. */
  severity: number;
  /** Newest member start time. */
  newestMs: number;
  /** Member ids (singletons have exactly one). */
  memberIds: string[];
}

const RAD = Math.PI / 180;

/**
 * Equal-area-ish grid clustering on the sphere: latitude rows of `cellDeg`,
 * with longitude columns narrowed by cos(lat) so cells stay roughly square.
 * O(n), so it can be re-run whenever the time cursor or zoom changes.
 */
export function clusterEvents(events: readonly IndexedEvent[], cellDeg: number): Marker[] {
  if (cellDeg <= 0) return events.map(toSingleton);

  interface Acc {
    x: number;
    y: number;
    z: number;
    members: IndexedEvent[];
  }
  const cells = new Map<number, Acc>();

  for (const e of events) {
    const row = Math.floor((e.latitude + 90) / cellDeg);
    const rowCenter = -90 + (row + 0.5) * cellDeg;
    const cols = Math.max(1, Math.round((360 * Math.cos(rowCenter * RAD)) / cellDeg));
    const col = Math.min(cols - 1, Math.floor(((e.longitude + 180) / 360) * cols));
    const key = row * 1_000_000 + col;
    const lat = e.latitude * RAD;
    const lon = e.longitude * RAD;
    const acc = cells.get(key) ?? { x: 0, y: 0, z: 0, members: [] };
    acc.x += Math.cos(lat) * Math.cos(lon);
    acc.y += Math.cos(lat) * Math.sin(lon);
    acc.z += Math.sin(lat);
    acc.members.push(e);
    cells.set(key, acc);
  }

  const markers: Marker[] = [];
  for (const [key, acc] of cells) {
    if (acc.members.length === 1) {
      markers.push(toSingleton(acc.members[0]));
      continue;
    }
    const len = Math.hypot(acc.x, acc.y, acc.z) || 1;
    const tally = new Map<CategoryId, number>();
    let severity = 0;
    let newestMs = 0;
    for (const m of acc.members) {
      tally.set(m.category, (tally.get(m.category) ?? 0) + 1);
      severity = Math.max(severity, m.severity ?? 0);
      newestMs = Math.max(newestMs, m.startMs);
    }
    const category = [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
    markers.push({
      id: `cluster:${key}`,
      latitude: Math.asin(acc.z / len) / RAD,
      longitude: Math.atan2(acc.y, acc.x) / RAD,
      count: acc.members.length,
      category,
      severity,
      newestMs,
      memberIds: acc.members.map((m) => m.id),
    });
  }
  return markers;
}

function toSingleton(e: IndexedEvent): Marker {
  return {
    id: e.id,
    latitude: e.latitude,
    longitude: e.longitude,
    count: 1,
    category: e.category,
    severity: e.severity ?? 0,
    newestMs: e.startMs,
    memberIds: [e.id],
  };
}

/**
 * Cell size (degrees) that keeps markers roughly `pixels` apart on screen for a
 * camera `distance` Earth-radii from the center. Quantized to powers of two so
 * the grid only changes at discrete zoom steps.
 */
export function cellSizeForView(distance: number, viewportHeightPx: number, fovDeg: number, pixels = 26): number {
  const surface = Math.max(distance - 1, 0.02);
  const pxPerRad = viewportHeightPx / (2 * Math.tan((fovDeg * RAD) / 2) * surface);
  const deg = (pixels / pxPerRad) / RAD;
  const stepped = 2 ** Math.round(Math.log2(Math.max(deg, 0.05)));
  return Math.min(stepped, 16);
}
