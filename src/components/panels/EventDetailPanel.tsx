"use client";

import { useSelectedEvent } from "@/client/selectors";
import { useOmni } from "@/client/store";
import { CATEGORIES } from "@/domain/categories";
import type { IndexedEvent } from "@/domain/indexed";
import { formatAgo, formatUtc } from "@/lib/format";

const UNIT_SUFFIX: Record<string, string> = { km: "km", mw: "MW", k: "K" };

/** `fire_radiative_power_mw` -> `fire radiative power (MW)`. */
function humanize(key: string): string {
  const parts = key.split("_");
  const unit = UNIT_SUFFIX[parts[parts.length - 1]];
  return unit && parts.length > 1 ? `${parts.slice(0, -1).join(" ")} (${unit})` : parts.join(" ");
}

function formatCoordinate(value: number, positive: string, negative: string): string {
  return `${Math.abs(value).toFixed(3)}° ${value >= 0 ? positive : negative}`;
}

function formatAltitude(meters: number): string {
  const km = Math.abs(meters) / 1000;
  const text = km >= 1 ? `${km.toFixed(1)} km` : `${Math.abs(Math.round(meters))} m`;
  return meters < 0 ? `${text} below surface` : `${text} above surface`;
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_1fr] gap-2 py-1">
      <dt className="text-dim">{name}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function Detail({ event }: { event: IndexedEvent }) {
  const now = useOmni((s) => s.now);
  const sourceName = useOmni((s) => s.sources.find((x) => x.id === event.source));
  const close = useOmni((s) => s.select);
  const def = CATEGORIES[event.category];
  const facts = Object.entries(event.properties).filter(([, v]) => v !== null && v !== "");

  return (
    <aside
      aria-label="Event details"
      className="absolute inset-x-0 bottom-28 z-20 max-h-[45vh] overflow-y-auto border border-line bg-panel/95 md:inset-x-auto md:bottom-auto md:right-3 md:top-11 md:max-h-[calc(100dvh-11.5rem)] md:w-[330px]"
    >
      <header className="flex h-7 items-center justify-between border-b border-line px-3">
        <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em]" style={{ color: def.color }}>
          <span className="size-1.5" style={{ background: def.color }} aria-hidden />
          {def.label}
        </span>
        <button type="button" onClick={() => close(null)} aria-label="Close details" className="px-1 text-[13px] leading-none text-dim hover:text-bright">
          &times;
        </button>
      </header>

      <div className="px-3 py-3">
        <h1 className="font-sans text-[14px] font-medium leading-snug text-bright">{event.title}</h1>
        <p className="mt-1.5 font-sans text-[12px] leading-relaxed text-dim">{event.description}</p>
      </div>

      <dl className="border-t border-line px-3 py-2">
        <Row name="Occurred">
          {formatUtc(event.startMs)}
          <span className="text-dim"> &middot; {formatAgo(event.startMs, now)}</span>
        </Row>
        {event.updatedAt !== event.startedAt && <Row name="Revised">{formatUtc(Date.parse(event.updatedAt))}</Row>}
        <Row name="Location">
          {formatCoordinate(event.latitude, "N", "S")}, {formatCoordinate(event.longitude, "E", "W")}
        </Row>
        {event.altitude !== undefined && <Row name="Depth / height">{formatAltitude(event.altitude)}</Row>}
      </dl>

      {facts.length > 0 && (
        <dl className="border-t border-line px-3 py-2">
          {facts.map(([key, value]) => (
            <Row key={key} name={humanize(key)}>
              {typeof value === "boolean" ? (value ? "yes" : "no") : String(value)}
            </Row>
          ))}
        </dl>
      )}

      <footer className="border-t border-line px-3 py-2 text-[10px] leading-snug text-dim">
        <div>{sourceName?.attribution ?? event.source}</div>
        {sourceName && <div className="text-faint">{sourceName.license}</div>}
        {event.sourceUrl && (
          <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-ink underline decoration-line-strong underline-offset-2 hover:text-bright">
            View at source
          </a>
        )}
      </footer>
    </aside>
  );
}

export function EventDetailPanel() {
  const event = useSelectedEvent();
  return event ? <Detail key={event.id} event={event} /> : null;
}
