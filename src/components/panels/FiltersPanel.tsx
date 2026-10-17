"use client";

import { useMemo } from "react";
import { useOmni } from "@/client/store";
import { CATEGORIES, CATEGORY_IDS, type CategoryId } from "@/domain/categories";
import { formatSeverityValue, fromSeverity } from "@/domain/severity";
import { Check } from "@/components/ui/Check";
import { Section } from "@/components/ui/Section";
import { formatCount } from "@/lib/format";

function CategoryRow({ id, count }: { id: CategoryId; count: number }) {
  const def = CATEGORIES[id];
  const on = useOmni((s) => s.categories[id]);
  const min = useOmni((s) => s.minSeverity[id]);
  const toggle = useOmni((s) => s.toggleCategory);
  const setMin = useOmni((s) => s.setMinSeverity);

  return (
    <li className="py-1.5">
      <div className="flex items-center gap-2">
        <Check checked={on} color={def.color} label={`Show ${def.label}`} onChange={() => toggle(id)} />
        <span className="flex-1 text-ink">{def.label}</span>
        <span className="tabular-nums text-dim">{formatCount(count)}</span>
      </div>
      <div className={`mt-1 flex items-center gap-2 pl-[22px] ${on ? "" : "opacity-40"}`}>
        <label htmlFor={`min-${id}`} className="w-[112px] shrink-0 text-[10px] text-dim">
          {def.severity.label} &ge; {formatSeverityValue(def.severity, fromSeverity(def.severity, min))}
        </label>
        <input
          id={`min-${id}`}
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={min}
          disabled={!on}
          onChange={(e) => setMin(id, Number(e.target.value))}
        />
      </div>
    </li>
  );
}

export function FiltersPanel() {
  const events = useOmni((s) => s.events);

  const counts = useMemo(() => {
    const out = Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0])) as Record<CategoryId, number>;
    for (const e of events) out[e.category] += 1;
    return out;
  }, [events]);

  return (
    <Section title="Categories">
        <ul className="divide-y divide-line">
          {CATEGORY_IDS.map((id) => (
            <CategoryRow key={id} id={id} count={counts[id]} />
          ))}
        </ul>
    </Section>
  );
}
