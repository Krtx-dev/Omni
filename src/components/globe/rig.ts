import { angularDistance } from "./geo";

export const MIN_DISTANCE = 1.06;
export const MAX_DISTANCE = 14;
const MAX_LAT = 85;

export interface View {
  latitude: number;
  longitude: number;
  /** Camera distance from Earth's center, in Earth radii. */
  distance: number;
}

interface Flight {
  from: View;
  to: View;
  elapsed: number;
  duration: number;
  /** Extra pull-back at mid-flight so long hops read as a swoop. */
  lift: number;
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Signed shortest rotation from `from` to `to` in degrees, in (-180, 180]. */
export function shortestDelta(from: number, to: number): number {
  const d = (((to - from) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

export function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Camera state for the globe, independent of React and three.js so the motion
 * can be tested. The component feeds it input and reads `view` each frame.
 */
export class CameraRig {
  view: View = { latitude: 18, longitude: 10, distance: 3.4 };
  private targetDistance = 3.4;
  private velocity = { lat: 0, lon: 0 };
  private flight: Flight | null = null;

  get flying(): boolean {
    return this.flight !== null;
  }

  /** Start `distance` Earth radii out and glide to `target`. */
  beginIntro(distance: number, target: Partial<View>): void {
    this.view = { ...this.view, distance };
    this.flyTo(target);
  }

  /** Rotate by `dLat`/`dLon` degrees (a drag); records velocity for inertia. */
  rotate(dLat: number, dLon: number, dt: number): void {
    this.cancelFlight();
    this.view.latitude = clamp(this.view.latitude + dLat, -MAX_LAT, MAX_LAT);
    this.view.longitude = wrapLongitude(this.view.longitude + dLon);
    if (dt > 0) this.velocity = { lat: dLat / dt, lon: dLon / dt };
  }

  stopInertia(): void {
    this.velocity = { lat: 0, lon: 0 };
  }

  zoomBy(factor: number): void {
    this.cancelFlight();
    this.targetDistance = clamp(this.targetDistance * factor, MIN_DISTANCE, MAX_DISTANCE);
  }

  flyTo(target: Partial<View> & { maxDistance?: number; zoomFactor?: number }): void {
    const from = { ...this.view };
    let distance = target.distance ?? this.targetDistance;
    if (target.zoomFactor) distance = this.targetDistance * target.zoomFactor;
    if (target.maxDistance !== undefined) distance = Math.min(distance, target.maxDistance);
    const to: View = {
      latitude: clamp(target.latitude ?? from.latitude, -MAX_LAT, MAX_LAT),
      longitude: wrapLongitude(target.longitude ?? from.longitude),
      distance: clamp(distance, MIN_DISTANCE, MAX_DISTANCE),
    };
    const angle = angularDistance(from.latitude, from.longitude, to.latitude, to.longitude);
    this.flight = {
      from,
      to,
      elapsed: 0,
      duration: 0.9 + 1.1 * Math.min(1, angle / 100),
      lift: angle > 12 ? Math.min(angle / 180, 1) * 1.1 : 0,
    };
    this.stopInertia();
    this.targetDistance = to.distance;
  }

  update(dt: number): void {
    if (this.flight) {
      const f = this.flight;
      f.elapsed += dt;
      const raw = Math.min(1, f.elapsed / f.duration);
      const t = easeInOutCubic(raw);
      this.view = {
        latitude: f.from.latitude + (f.to.latitude - f.from.latitude) * t,
        longitude: wrapLongitude(f.from.longitude + shortestDelta(f.from.longitude, f.to.longitude) * t),
        distance: f.from.distance + (f.to.distance - f.from.distance) * t + f.lift * Math.sin(Math.PI * raw),
      };
      if (raw >= 1) {
        this.view = { ...f.to };
        this.flight = null;
      }
      return;
    }

    if (Math.abs(this.velocity.lat) > 0.01 || Math.abs(this.velocity.lon) > 0.01) {
      this.view.latitude = clamp(this.view.latitude + this.velocity.lat * dt, -MAX_LAT, MAX_LAT);
      this.view.longitude = wrapLongitude(this.view.longitude + this.velocity.lon * dt);
      const decay = Math.exp(-dt * 4);
      this.velocity = { lat: this.velocity.lat * decay, lon: this.velocity.lon * decay };
    }
    this.view.distance += (this.targetDistance - this.view.distance) * (1 - Math.exp(-dt * 10));
  }

  private cancelFlight(): void {
    if (!this.flight) return;
    this.targetDistance = this.view.distance;
    this.flight = null;
  }
}
