interface SegmentedProps<T extends string> {
  value: T;
  options: readonly T[];
  label: string;
  format?(option: T): string;
  onChange(value: T): void;
}

export function Segmented<T extends string>({ value, options, label, format = (o) => o, onChange }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex border border-line-strong">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          onClick={() => onChange(option)}
          className={`h-5 px-2 text-[10px] uppercase tracking-wider ${
            option === value ? "bg-line-strong text-bright" : "text-dim hover:text-ink"
          }`}
        >
          {format(option)}
        </button>
      ))}
    </div>
  );
}
