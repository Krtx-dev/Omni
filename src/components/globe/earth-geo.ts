import { feature, mesh } from "topojson-client";
import type { GeometryCollection, MultiPolygon, Polygon, Topology } from "topojson-specification";

export type LonLat = readonly [number, number];

export interface EarthGeo {
  /** Land polygons, each an array of rings (outer first, then holes). */
  land: LonLat[][][];
  coastlines: LonLat[][];
  borders: LonLat[][];
}

async function loadTopology(url: string): Promise<Topology> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: HTTP ${res.status}`);
  return (await res.json()) as Topology;
}

const lineCoordinates = (multiLine: unknown) => (multiLine as { coordinates: LonLat[][] }).coordinates;

/** Natural Earth 1:50m (public domain) via the world-atlas package, served from /public/geo. */
export async function loadEarthGeo(): Promise<EarthGeo> {
  const [landTopo, countryTopo] = await Promise.all([loadTopology("/geo/land-50m.json"), loadTopology("/geo/countries-50m.json")]);
  const landObject = landTopo.objects.land as GeometryCollection<Polygon | MultiPolygon>;
  const countries = countryTopo.objects.countries as GeometryCollection;

  const land: LonLat[][][] = [];
  for (const f of feature(landTopo, landObject).features) {
    if (f.geometry.type === "Polygon") land.push(f.geometry.coordinates as unknown as LonLat[][]);
    else if (f.geometry.type === "MultiPolygon") land.push(...(f.geometry.coordinates as unknown as LonLat[][][]));
  }

  return {
    land,
    coastlines: lineCoordinates(mesh(landTopo, landObject)),
    borders: lineCoordinates(mesh(countryTopo, countries, (a, b) => a !== b)),
  };
}

/** Paint land onto an equirectangular canvas (x: -180..180, y: 90..-90). */
export function paintLandTexture(land: LonLat[][][], width = 4096, height = 2048): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");

  ctx.fillStyle = "#04070b";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#0e141b";
  for (const polygon of land) {
    ctx.beginPath();
    for (const ring of polygon) {
      ring.forEach(([lon, lat], i) => {
        const x = ((lon + 180) / 360) * width;
        const y = ((90 - lat) / 180) * height;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
    }
    ctx.fill("evenodd");
  }
  return canvas;
}
