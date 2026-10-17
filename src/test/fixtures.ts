import type { WorldEvent } from "@/domain/event";

export const usgsPayload = {
  type: "FeatureCollection",
  features: [
    {
      id: "us7000abcd",
      properties: {
        mag: 5.24,
        place: "42 km SW of Somewhere, Chile",
        time: Date.UTC(2026, 9, 6, 12, 30, 0),
        updated: Date.UTC(2026, 9, 6, 13, 10, 0),
        url: "https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd",
        type: "earthquake",
        magType: "mww",
        status: "reviewed",
        net: "us",
        felt: 12,
        cdi: 4.1,
        mmi: null,
        alert: "green",
        tsunami: 0,
        sig: 410,
      },
      geometry: { type: "Point", coordinates: [-71.5, -33.25, 35.4] },
    },
    {
      id: "ci99",
      properties: { mag: 2.6, place: null, time: 1_700_000_000_000, updated: 1_700_000_100_000, type: "earthquake" },
      geometry: { type: "Point", coordinates: [-117.1, 34.0, 8] },
    },
    // Not a natural earthquake.
    {
      id: "nn1",
      properties: { mag: 2.9, place: "Quarry", time: 1_700_000_000_000, updated: 1_700_000_000_000, type: "quarry blast" },
      geometry: { type: "Point", coordinates: [-110, 40, 0] },
    },
    // Malformed: no geometry.
    { id: "bad", properties: { mag: 3, time: 1, updated: 1 } },
    // Malformed: time is not a number.
    { id: "bad2", properties: { mag: 3, time: "yesterday", updated: 1 }, geometry: { type: "Point", coordinates: [0, 0, 0] } },
  ],
};

export const firmsCsv = [
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight",
  "-12.34567,131.2,340.5,0.4,0.4,2026-10-06,342,N,VIIRS,n,2.0NRT,290.1,12.3,N",
  "34.0,-118.25,367.0,0.5,0.5,2026-10-06,2105,N20,VIIRS,h,2.0NRT,301.0,88.9,D",
  "10.0,10.0,300.0,0.4,0.4,2026-10-06,1200,N,VIIRS,l,2.0NRT,280.0,0.8,D",
  "bad,10.0,300.0,0.4,0.4,2026-10-06,1200,N,VIIRS,n,2.0NRT,280.0,1.0,D",
  "5.0,5.0,300.0,0.4,0.4,2026-10-06,,N,VIIRS,n,2.0NRT,280.0,1.0,D",
].join("\n");

export function makeEvent(overrides: Partial<WorldEvent> & { id: string }): WorldEvent {
  return {
    source: "usgs",
    category: "earthquake",
    title: "Test event",
    description: "",
    latitude: 0,
    longitude: 0,
    startedAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-01T00:00:00.000Z",
    properties: {},
    ...overrides,
  };
}
