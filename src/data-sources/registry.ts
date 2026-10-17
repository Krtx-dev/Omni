import { firmsAdapter } from "./firms";
import type { DataSourceAdapter } from "./types";
import { usgsAdapter } from "./usgs";

/**
 * Every connector OMNI knows about. To add a source: create
 * `src/data-sources/<id>/`, build it with `defineAdapter`, and list it here.
 */
export const ADAPTERS: readonly DataSourceAdapter[] = [usgsAdapter, firmsAdapter];

export function getAdapter(id: string): DataSourceAdapter | undefined {
  return ADAPTERS.find((a) => a.meta.id === id);
}
