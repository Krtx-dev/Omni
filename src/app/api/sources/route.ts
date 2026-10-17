import { noStore } from "@/server/api";
import { ensureScheduler } from "@/server/scheduler";
import { describeSources, getServices } from "@/server/services";

export async function GET(): Promise<Response> {
  const services = getServices();
  ensureScheduler(services);
  try {
    return Response.json(await describeSources(services), { headers: noStore });
  } catch (err) {
    console.error("[omni] /api/sources failed", err);
    return Response.json({ error: "Event store unavailable" }, { status: 503, headers: noStore });
  }
}
