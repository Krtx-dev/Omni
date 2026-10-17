import { describe, expect, it } from "vitest";
import { SceneBridge } from "./bridge";
import { angularDistance, graticule, latLonToVec3, polylinesToSegments, vec3ToLatLon } from "./geo";
import { CameraRig, easeInOutCubic, shortestDelta, wrapLongitude } from "./rig";

describe("geo", () => {
  it("places lon 0 on +X, east toward -Z, north on +Y", () => {
    const [x, y, z] = latLonToVec3(0, 0);
    expect(x).toBeCloseTo(1);
    expect(y).toBeCloseTo(0);
    expect(z).toBeCloseTo(0);
    expect(latLonToVec3(0, 90)[2]).toBeCloseTo(-1);
    expect(latLonToVec3(90, 0)[1]).toBeCloseTo(1);
  });

  it("round-trips lat/lon", () => {
    for (const [lat, lon] of [[10, 20], [-45.5, 170], [60, -120.25]]) {
      const back = vec3ToLatLon(latLonToVec3(lat, lon, 1.7));
      expect(back.latitude).toBeCloseTo(lat);
      expect(back.longitude).toBeCloseTo(lon);
    }
  });

  it("measures great-circle distance", () => {
    expect(angularDistance(0, 0, 0, 90)).toBeCloseTo(90);
    expect(angularDistance(0, 179, 0, -179)).toBeCloseTo(2);
  });

  it("subdivides long segments onto the sphere and drops antimeridian cuts", () => {
    const segments = polylinesToSegments([[[0, 0], [40, 0]]], 1, 10);
    expect(segments.length / 6).toBe(4);
    for (let i = 0; i < segments.length; i += 3) {
      expect(Math.hypot(segments[i], segments[i + 1], segments[i + 2])).toBeCloseTo(1);
    }
    expect(polylinesToSegments([[[180, 10], [180, 20]]], 1)).toHaveLength(0);
  });

  it("builds a graticule", () => {
    expect(graticule(30).length).toBe(5 + 12);
  });
});

describe("camera rig", () => {
  it("wraps longitude along the shortest path", () => {
    expect(shortestDelta(170, -170)).toBe(20);
    expect(shortestDelta(-170, 170)).toBe(-20);
    expect(wrapLongitude(190)).toBe(-170);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("flies to the target, crossing the antimeridian the short way, and lands exactly", () => {
    const rig = new CameraRig();
    rig.view = { latitude: 0, longitude: 170, distance: 3 };
    rig.flyTo({ latitude: 10, longitude: -170, maxDistance: 2 });
    let maxLonStep = 0;
    let prev = rig.view.longitude;
    for (let i = 0; i < 300 && rig.flying; i++) {
      rig.update(1 / 60);
      maxLonStep = Math.max(maxLonStep, Math.abs(shortestDelta(prev, rig.view.longitude)));
      prev = rig.view.longitude;
    }
    expect(rig.flying).toBe(false);
    expect(rig.view.latitude).toBeCloseTo(10);
    expect(rig.view.longitude).toBeCloseTo(-170);
    expect(rig.view.distance).toBeCloseTo(2);
    expect(maxLonStep).toBeLessThan(3);
  });

  it("never lets maxDistance push the camera farther out", () => {
    const rig = new CameraRig();
    rig.view = { latitude: 0, longitude: 0, distance: 1.4 };
    rig.zoomBy(1);
    rig.flyTo({ latitude: 5, longitude: 5, maxDistance: 2 });
    for (let i = 0; i < 400; i++) rig.update(1 / 60);
    expect(rig.view.distance).toBeLessThanOrEqual(2);
  });

  it("clamps latitude and zoom, and lets a drag cancel a flight", () => {
    const rig = new CameraRig();
    rig.rotate(500, 0, 0);
    expect(rig.view.latitude).toBe(85);
    rig.zoomBy(1e-6);
    for (let i = 0; i < 300; i++) rig.update(1 / 60);
    expect(rig.view.distance).toBeGreaterThanOrEqual(1.06);
    rig.flyTo({ latitude: 0, longitude: 0 });
    rig.rotate(1, 1, 0.016);
    expect(rig.flying).toBe(false);
  });
});

describe("scene bridge picking", () => {
  it("picks the marker under the pointer and ignores the far side of the globe", () => {
    const bridge = new SceneBridge();
    bridge.width = 1000;
    bridge.height = 1000;
    // Orthographic-ish view-projection looking down -Z from +X is awkward to hand-build;
    // use a simple projection that maps x,y in [-1,1] to NDC and uses w=1.
    bridge.viewProjection.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    bridge.cameraPosition = [0, 0, 4];
    const near = { id: "near", latitude: 0, longitude: -90, count: 1, category: "earthquake" as const, severity: 0.5, newestMs: 0, memberIds: ["near"] };
    const far = { id: "far", latitude: 0, longitude: 90, count: 1, category: "earthquake" as const, severity: 0.5, newestMs: 0, memberIds: ["far"] };
    // lon -90 -> (0,0,+1) faces a camera at +Z; lon 90 -> (0,0,-1) faces away.
    bridge.setMarkers([near, far]);
    expect(bridge.pick(500, 500)?.id).toBe("near");
    expect(bridge.pick(100, 100)).toBeNull();
  });
});
