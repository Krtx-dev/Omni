import { worldEventSchema } from "@/domain/event";
import type { WorldEvent } from "@/domain/event";
import type { z } from "zod";
import type { AdapterDefinition, DataSourceAdapter, PullResult, ValidationResult } from "./types";

/** Validate each record independently so one bad record never discards a feed. */
export function parseEach<S extends z.ZodType>(schema: S, records: readonly unknown[]): ValidationResult<z.output<S>> {
  const items: z.output<S>[] = [];
  let rejected = 0;
  for (const record of records) {
    const parsed = schema.safeParse(record);
    if (parsed.success) items.push(parsed.data);
    else rejected += 1;
  }
  return { items, rejected };
}

/**
 * Compose the fetch -> validate -> normalize stages into an adapter. Output is
 * checked against the WorldEvent schema as a last line of defense, so no
 * adapter can emit an event that violates the shared contract.
 */
export function defineAdapter<T>(def: AdapterDefinition<T>): DataSourceAdapter {
  return {
    meta: def.meta,
    isConfigured: (env) => def.isConfigured?.(env) ?? true,
    async pull(ctx): Promise<PullResult> {
      const raw = await def.fetch(ctx);
      const validated = def.validate(raw);
      const { events: candidates, notice } = def.normalize(validated.items, ctx);

      const events: WorldEvent[] = [];
      let rejected = validated.rejected;
      for (const candidate of candidates) {
        const checked = worldEventSchema.safeParse(candidate);
        if (checked.success) events.push(checked.data);
        else rejected += 1;
      }
      return { events, rejected, notice };
    },
  };
}
