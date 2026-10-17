export type Vec3 = readonly [number, number, number];

const RAD = Math.PI / 180;

/**
 * Latitude/longitude (degrees) to a point on a sphere of radius `r`.
 * Matches three.js SphereGeometry's UV layout: longitude 0 on +X, east toward -Z,
 * so an equirectangular texture drawn left-to-right from -180 lines up.
 */
export function latLonToVec3(latitude: number, longitude: number, r = 1): Vec3 {
  const lat = latitude * RAD;
  const lon = longitude * RAD;
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.sin(lat), -r * Math.cos(lat) * Math.sin(lon)];
}

export function vec3ToLatLon([x, y, z]: Vec3): { latitude: number; longitude: number } {
  const r = Math.hypot(x, y, z) || 1;
  return { latitude: Math.asin(y / r) / RAD, longitude: Math.atan2(-z, x) / RAD };
}

/** Great-circle angle between two lat/lon points, in degrees. */
export function angularDistance(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const [ax, ay, az] = latLonToVec3(aLat, aLon);
  const [bx, by, bz] = latLonToVec3(bLat, bLon);
  return Math.acos(Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz))) / RAD;
}

type LonLat = readonly [number, number];

/**
 * Turn lon/lat polylines into a flat list of line-segment endpoints on the
 * sphere. Long segments are subdivided along the great circle so they hug the
 * surface, and segments lying on the antimeridian cut are dropped.
 */
export function polylinesToSegments(lines: readonly (readonly LonLat[])[], radius: number, maxStepDeg = 1.5): number[] {
  const out: number[] = [];
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const [lon0, lat0] = line[i - 1];
      const [lon1, lat1] = line[i];
      if (Math.abs(lon0) >= 179.999 && Math.abs(lon1) >= 179.999 && Math.sign(lon0) === Math.sign(lon1)) continue;

      const a = latLonToVec3(lat0, lon0);
      const b = latLonToVec3(lat1, lon1);
      const dot = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const angle = Math.acos(dot) / RAD;
      const steps = Math.max(1, Math.ceil(angle / maxStepDeg - 1e-9));
      const sin = Math.sin(angle * RAD);

      let prev: Vec3 = a;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const next: Vec3 =
          sin < 1e-9
            ? b
            : [0, 1, 2].map(
                (k) => (Math.sin((1 - t) * angle * RAD) * a[k] + Math.sin(t * angle * RAD) * b[k]) / sin,
              ) as unknown as Vec3;
        out.push(prev[0] * radius, prev[1] * radius, prev[2] * radius, next[0] * radius, next[1] * radius, next[2] * radius);
        prev = next;
      }
    }
  }
  return out;
}

/** Parallels and meridians every `stepDeg` degrees as lon/lat polylines. */
export function graticule(stepDeg = 30): LonLat[][] {
  const lines: LonLat[][] = [];
  for (let lat = -90 + stepDeg; lat < 90; lat += stepDeg) {
    lines.push(Array.from({ length: 361 }, (_, i): LonLat => [-180 + i, lat]));
  }
  for (let lon = -180; lon < 180; lon += stepDeg) {
    lines.push(Array.from({ length: 181 }, (_, i): LonLat => [lon, -90 + i]));
  }
  return lines;
}
