interface CheckProps {
  checked: boolean;
  color: string;
  disabled?: boolean;
  label: string;
  onChange(): void;
}

/** Square toggle filled with a category colour. */
export function Check({ checked, color, disabled, label, onChange }: CheckProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="grid size-3.5 shrink-0 place-items-center border border-line-strong disabled:cursor-not-allowed disabled:opacity-40"
    >
      {checked && <span className="size-2" style={{ background: color }} />}
    </button>
  );
}
