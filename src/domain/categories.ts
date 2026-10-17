/**
 * Category registry. Adding a category means adding one entry here; the UI,
 * filters and severity handling all derive from this table.
 */
export const CATEGORY_IDS = ["earthquake", "wildfire"] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

/** Maps a native measurement (magnitude, MW...) onto the shared 0..1 severity. */
export interface SeverityScale {
  label: string;
  unit: string;
  min: number;
  max: number;
  log?: boolean;
  decimals: number;
}

export interface CategoryDef {
  id: CategoryId;
  label: string;
  color: string;
  severity: SeverityScale;
}

export const CATEGORIES: Readonly<Record<CategoryId, CategoryDef>> = {
  earthquake: {
    id: "earthquake",
    label: "Earthquake",
    color: "#4cc9f0",
    severity: { label: "Magnitude", unit: "", min: 2, max: 8, decimals: 1 },
  },
  wildfire: {
    id: "wildfire",
    label: "Wildfire",
    color: "#ff7a1a",
    severity: { label: "Radiative power", unit: "MW", min: 0, max: 1000, log: true, decimals: 0 },
  },
};

export function isCategoryId(value: string): value is CategoryId {
  return (CATEGORY_IDS as readonly string[]).includes(value);
}
