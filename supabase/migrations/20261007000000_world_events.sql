-- OMNI core schema: normalized world events + per-source ingestion status.
-- Requires PostGIS (enabled by default on Supabase; this makes it explicit).
create extension if not exists postgis;

create table if not exists public.world_events (
  id           text primary key,                 -- '<source>:<upstream id>'
  source       text not null,
  category     text not null,
  title        text not null,
  description  text not null default '',
  latitude     double precision not null check (latitude  between -90  and 90),
  longitude    double precision not null check (longitude between -180 and 180),
  altitude     double precision,                 -- meters; negative below the surface
  started_at   timestamptz not null,
  updated_at   timestamptz not null,
  severity     double precision check (severity between 0 and 1),
  properties   jsonb not null default '{}'::jsonb,
  source_url   text,
  geometry     jsonb,                            -- optional GeoJSON for non-point events
  ingested_at  timestamptz not null default now(),
  -- Derived from latitude/longitude so the two can never disagree.
  location     geography(Point, 4326)
    generated always as (st_setsrid(st_makepoint(longitude, latitude), 4326)::geography) stored
);

create index if not exists world_events_started_at_idx  on public.world_events (started_at desc);
create index if not exists world_events_source_time_idx on public.world_events (source, started_at desc);
create index if not exists world_events_ingested_at_idx on public.world_events (ingested_at);
create index if not exists world_events_location_idx    on public.world_events using gist (location);

create table if not exists public.source_status (
  source               text primary key,
  state                text not null,
  last_attempt_at      timestamptz,
  last_success_at      timestamptz,
  next_attempt_at      timestamptz,
  consecutive_failures integer not null default 0,
  message              text,
  rejected             integer not null default 0
);

create or replace view public.source_summary as
  select source,
         count(*)::integer as event_count,
         min(started_at)   as first_started_at,
         max(started_at)   as last_started_at
  from public.world_events
  group by source;

-- Everything here is public data: readable by anyone, writable only with the
-- service-role key (which bypasses RLS) used by the ingestion worker.
alter table public.world_events enable row level security;
alter table public.source_status enable row level security;

drop policy if exists "world_events are public" on public.world_events;
create policy "world_events are public" on public.world_events for select using (true);

drop policy if exists "source_status is public" on public.source_status;
create policy "source_status is public" on public.source_status for select using (true);

-- Lets browser clients subscribe to Supabase Realtime later without another migration.
alter publication supabase_realtime add table public.world_events;
