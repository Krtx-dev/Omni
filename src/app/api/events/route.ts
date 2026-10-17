import type { EventsResponse } from "@/domain/api";
import { badRequest, eventsQuerySchema, noStore } from "@/server/api";
import { ensureFirstPull, ensureScheduler } from "@/server/scheduler";
import { describeSources, getServices } from "@/server/services";

const THIRTY_DAYS = 30 * 86_400_000;
const FIRST_PULL_WAIT_MS = 25_000;

export async function GET(request: Request): Promise<Response> {
  const parsed = eventsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return badRequest(parsed.error);

  const services = getServices();
  ensureScheduler(services);
  const serverTime = Date.now();
  const { sources, from = serverTime - THIRTY_DAYS, to } = parsed.data;

  try {
    await ensureFirstPull(sources, FIRST_PULL_WAIT_MS, services);
    const [events, sourceInfo] = await Promise.all([services.store.query({ sources, from, to }), describeSources(services)]);
    const body: EventsResponse = { events, sources: sourceInfo, serverTime };
    return Response.json(body, { headers: noStore });
  } catch (err) {
    console.error("[omni] /api/events failed", err);
    return Response.json({ error: "Event store unavailable" }, { status: 503, headers: noStore });
  }
}
