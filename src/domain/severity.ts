import type { SeverityScale } from "./categories";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const warp = (scale: SeverityScale, v: number) => (scale.log ? Math.log1p(Math.max(0, v)) : v);

/** Native value (e.g. magnitude 5.2) to normalized severity in [0, 1]. */
export function toSeverity(scale: SeverityScale, value: number): number {
  const lo = warp(scale, scale.min);
  const hi = warp(scale, scale.max);
  return clamp01((warp(scale, value) - lo) / (hi - lo));
}

/** Inverse of {@link toSeverity}. */
export function fromSeverity(scale: SeverityScale, severity: number): number {
  const lo = warp(scale, scale.min);
  const hi = warp(scale, scale.max);
  const w = lo + clamp01(severity) * (hi - lo);
  return scale.log ? Math.expm1(w) : w;
}

export function formatSeverityValue(scale: SeverityScale, value: number): string {
  const text = value.toFixed(scale.decimals);
  return scale.unit ? `${text} ${scale.unit}` : text;
}
