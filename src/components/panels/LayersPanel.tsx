"use client";

import { useMemo } from "react";
import { useOmni } from "@/client/store";
import { CATEGORIES } from "@/domain/categories";
import type { SourceInfo } from "@/domain/source";
import { formatAgo, formatCount } from "@/lib/format";
import { Check } from "@/components/ui/Check";
import { Section } from "@/components/ui/Section";

function statusLine(source: SourceInfo, now: number): { text: string; tone: string } {
  const { status } = source;
  switch (status.state) {
    case "ok":
      return { text: `Updated ${formatAgo(status.lastSuccessAt ?? now, now)}`, tone: "text-dim" };
    case "pending":
      return { text: "Waiting for first poll", tone: "text-dim" };
    case "not_configured":
      return { text: "Credentials required", tone: "text-warn" };
    case "rate_limited":
      return { text: "Rate limited by upstream", tone: "text-warn" };
    case "error":
      return { text: status.lastSuccessAt ? `Failing since ${formatAgo(status.lastSuccessAt, now)}` : "Unavailable", tone: "text-alert" };
  }
}

function SourceRow({ source, count, now }: { source: SourceInfo; count: number; now: number }) {
  const on = useOmni((s) => s.layers[source.id] ?? false);
  const toggle = useOmni((s) => s.toggleLayer);
  const { text, tone } = statusLine(source, now);
  const usable = source.status.state !== "not_configured";
  const note = source.status.message;

  return (
    <li className="py-1.5">
      <div className="flex items-center gap-2">
        <Check
          checked={on && usable}
          disabled={!usable}
          color={CATEGORIES[source.category].color}
          label={`Show ${source.name}`}
          onChange={() => toggle(source.id)}
        />
        <span className={`min-w-0 flex-1 truncate ${usable ? "text-ink" : "text-dim"}`}>{source.name}</span>
        {usable && <span className="tabular-nums text-dim">{formatCount(count)}</span>}
      </div>
      <p className={`mt-0.5 pl-[22px] text-[10px] leading-snug ${tone}`}>{text}</p>
      {note && <p className="pl-[22px] text-[10px] leading-snug text-dim">{note}</p>}
      {!usable && source.credentials && (
        <p className="pl-[22px] text-[10px] leading-snug text-dim">
          Set <code className="text-ink">{source.credentials.envVar}</code> in <code className="text-ink">.env.local</code>.{" "}
          <a href={source.credentials.signupUrl} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-ink">
            Get a free key
          </a>
        </p>
      )}
      <p className="pl-[22px] text-[10px] leading-snug text-faint">{source.attribution}</p>
    </li>
  );
}

export function LayersPanel() {
  const sources = useOmni((s) => s.sources);
  const events = useOmni((s) => s.events);
  const now = useOmni((s) => s.now);
  const phase = useOmni((s) => s.phase);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of events) out[e.source] = (out[e.source] ?? 0) + 1;
    return out;
  }, [events]);

  return (
    <Section title="Layers" aside={phase === "ready" ? `${sources.length} sources` : undefined}>
      {sources.length === 0 ? (
        <p className="text-dim">{phase === "loading" ? "Loading sources" : "No sources available"}</p>
      ) : (
        <ul className="divide-y divide-line">
          {sources.map((s) => (
            <SourceRow key={s.id} source={s} count={counts[s.id] ?? 0} now={now} />
          ))}
        </ul>
      )}
    </Section>
  );
}
