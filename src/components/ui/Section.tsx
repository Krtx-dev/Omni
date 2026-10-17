import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}

/** A labelled block inside a panel, separated from its neighbours by a hairline. */
export function Section({ title, aside, children }: SectionProps) {
  return (
    <section className="border-t border-line first:border-t-0">
      <header className="flex h-7 items-center justify-between px-3">
        <h2 className="text-[10px] font-normal uppercase tracking-[0.14em] text-dim">{title}</h2>
        {aside && <div className="text-[10px] text-dim">{aside}</div>}
      </header>
      <div className="px-3 pb-3">{children}</div>
    </section>
  );
}
