import { ADAPTERS } from "@/data-sources/registry";
import { z } from "zod";

const KNOWN = new Set(ADAPTERS.map((a) => a.meta.id));

const sourceList = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(",").map((s) => s.trim()).filter((s) => KNOWN.has(s)) : [...KNOWN]));

const epoch = z.coerce.number().int().nonnegative();

export const eventsQuerySchema = z.object({
  sources: sourceList,
  from: epoch.optional(),
  to: epoch.optional(),
});

export const streamQuerySchema = z.object({
  sources: sourceList,
  since: epoch.optional(),
});

export const noStore = { "Cache-Control": "no-store" } as const;

export function badRequest(error: z.ZodError): Response {
  return Response.json({ error: "Invalid query", issues: error.issues.map((i) => i.message) }, { status: 400, headers: noStore });
}
