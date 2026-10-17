# OMNI

An open-source real-time world model built from public data.
*Earth has APIs. OMNI connects them.*

OMNI normalizes open datasets into one event model and shows them on an interactive 3D Earth with a layer system, filters and a rewindable timeline. Nothing on screen is simulated: every marker, count and histogram bar comes from an upstream source, and a source that is unavailable says so instead of being filled in.

## Status: V1 foundation

| Source | State |
| --- | --- |
| USGS earthquakes (M2.5+, 30 days) | Working, no credentials needed |
| NASA FIRMS active fires | Working with a free `FIRMS_MAP_KEY`; without one the layer reports "credentials required" |

Planned connectors (NOAA, CelesTrak, OpenStreetMap, OpenSky, RIPE Atlas / RIPEstat, GDELT) are not built yet. See [Next](#next).

OMNI does not identify, profile or track private individuals. Connectors are limited to environmental, infrastructure and aggregate data under open licences.

## Run it

```bash
npm install
cp .env.example .env.local   # optional; USGS works with no configuration
npm run dev                  # http://localhost:3000
```

| Script | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` / `test` | Quality gates |
| `npm run ingest` | Standalone ingestion worker (see [Persistence](#persistence)) |

## Architecture

```
src/
  domain/         Pure, shared, tested. WorldEvent schema, categories, severity,
                  time windows, filtering, clustering. No I/O, no React.
  data-sources/   One folder per upstream. Server-only.
    types.ts, define-adapter.ts, http.ts, errors.ts, registry.ts
    usgs/  firms/
  server/         Ingestion and storage. Server-only.
    ingestor.ts   Runs adapters, diffs, stores, prunes, records status
    scheduler.ts  Per-source polling loops
    store/        EventStore interface + memory and Supabase/PostGIS implementations
  app/api/        events (snapshot), stream (SSE), sources (status)
  client/         Zustand store, data feed hook, playback hook
  components/     globe/ (R3F scene), panels/, timeline/, shell/, ui/
supabase/migrations/   PostGIS schema
scripts/ingest.ts      Worker entry point
```

Dependency direction is one-way: `components` and `client` may import `domain`, never `server` or `data-sources`. ESLint enforces it, so API keys and upstream-specific logic cannot reach the browser.

### Data flow

```
upstream API
   │  adapter.fetch      raw payload (HTTP, timeouts, 429 / auth / upstream errors -> SourceError)
   │  adapter.validate   Zod per record; bad records are dropped and counted, never fatal
   │  adapter.normalize  -> WorldEvent[]
   ▼
Ingestor ── re-checks every event against worldEventSchema, writes only what changed,
   │         prunes by retention, records SourceStatus (ok / error / rate_limited / not_configured)
   ▼
EventStore (memory | Supabase PostGIS)
   ▼
/api/events (snapshot)   /api/stream (SSE, polls the store)   /api/sources (status + coverage)
   ▼
client store ─> filters ─> clustering ─> GPU points + 2D overlay
```

### The event model

`WorldEvent` (`src/domain/event.ts`) is the only shape the rest of the app knows: `id`, `source`, `category`, `title`, `description`, `latitude`, `longitude`, `altitude?`, `startedAt`, `updatedAt`, `severity?` (normalized 0-1), `properties` (flat, source-specific facts), `sourceUrl?`, `geometry?`. Timestamps are ISO-8601 UTC strings. `severity` is normalized per category through the scale in `src/domain/categories.ts` (magnitude for earthquakes, fire radiative power in MW on a log scale for fires); the native value stays in `properties`.

### Adding a connector

1. Add the category, if new, to `src/domain/categories.ts` (label, colour, severity scale).
2. Create `src/data-sources/<id>/` and build the adapter with `defineAdapter({ meta, isConfigured?, fetch, validate, normalize })`. Use `requestSource` for HTTP and `parseEach` for per-record validation. Never put a URL or credential in a thrown message.
3. Register it in `src/data-sources/registry.ts`.
4. Add `normalize` / adapter tests with a small fixture (see `src/data-sources/usgs/usgs.test.ts`).

The ingestor, storage, API, layer panel, filters, timeline and map pick it up with no UI changes.

### Globe

`src/components/globe/`: a custom react-three-fiber scene, with no OrbitControls, so camera flights are first-class.

- `Earth.tsx`: Natural Earth 1:50m land, coastlines and borders (public domain, `public/geo/`), drawn as a land texture plus great-circle-subdivided line geometry, a 30° graticule and a thin limb glow.
- `rig.ts`: pure camera state (drag inertia, zoom, eased flights that take the short way around the antimeridian). Unit tested.
- `Markers.tsx`: events are grid-clustered for the current zoom (`domain/cluster.ts`, O(n), re-run on zoom steps and as the playhead moves) and drawn as one GPU `Points` draw call.
- `bridge.ts` / `ScreenOverlay.tsx`: a mutable bridge gives hit-testing and a 2D canvas the camera matrices, which keeps cluster counts, the hover tag and the selection callout crisp without React renders per frame.

### Time

The timeline window is `24h`, `7d` or `30d` ending now. Dragging the playhead rewinds: only events that started before the playhead are shown, and newer events dim out of the histogram. `Replay` advances the playhead (1x plays the whole window in 30 s). `Live` returns to following now. The histogram is a real per-bin count of the events currently passing the layer and category filters.

### Persistence

By default events live in process memory and OMNI needs no setup. For persistence:

1. Create a Supabase project and apply `supabase/migrations/*.sql` (PostGIS `geography` column derived from lat/lon, GiST index, RLS with public read).
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Server-side only.
3. Optionally run ingestion separately: set `OMNI_INGEST_IN_PROCESS=false` for the web app and run `npm run ingest` as a worker. The SSE stream polls the store, so it works either way.

The Supabase store has not been exercised against a live project yet; only its row mapping is unit tested.

## Conventions

- Strong types, small files, Zod at every trust boundary (upstream payloads, API query strings, env).
- Keys are read from the server environment only and are never serialized to the client or into error messages.
- Every source reports its own loading, error, rate-limited or not-configured state.

## Next

1. Verify the Supabase store and FIRMS against live credentials.
2. Connectors, in this order: NOAA weather alerts, OpenSky aircraft (needs a short-lived, non-persisted state-vector layer), CelesTrak orbital elements (propagated client-side), RIPEstat, GDELT, OpenStreetMap context tiles.
3. Search over locations and events.
4. History beyond 30 days (USGS FDSN queries, FIRMS archive) behind the existing `from`/`to` parameters.
5. Natural-language queries compiled to the same filter structure the UI uses.
