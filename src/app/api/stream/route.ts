import { badRequest, noStore, streamQuerySchema } from "@/server/api";
import { ensureScheduler } from "@/server/scheduler";
import { describeSources, getServices } from "@/server/services";

const POLL_MS = 5_000;
const HEARTBEAT_MS = 25_000;
const OVERLAP_MS = 3_000;

/**
 * Server-sent events. The stream polls the store, not the sources, so it works
 * the same whether ingestion runs in this process or in `npm run ingest`.
 *   event: events  data: WorldEvent[]          (new or revised since last tick)
 *   event: sources data: SourceInfo[]          (only when something changed)
 */
export async function GET(request: Request): Promise<Response> {
  const parsed = streamQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return badRequest(parsed.error);

  const services = getServices();
  ensureScheduler(services);
  const { sources, since = Date.now() } = parsed.data;
  const encoder = new TextEncoder();
  let cursor = since;
  let lastSources = "";
  let timer: ReturnType<typeof setInterval> | undefined;
  let beat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const stop = () => {
        clearInterval(timer);
        clearInterval(beat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      let busy = false;
      const tick = async () => {
        if (busy) return;
        busy = true;
        const tickStart = Date.now();
        try {
          const events = await services.store.changedSince(cursor, sources);
          // Overlap by a few seconds: a writer may stamp an event just before its row becomes visible.
          cursor = tickStart - OVERLAP_MS;
          if (events.length > 0) send("events", events);
          const info = JSON.stringify(await describeSources(services));
          if (info !== lastSources) {
            lastSources = info;
            send("sources", JSON.parse(info));
          }
        } catch (err) {
          console.error("[omni] /api/stream tick failed", err);
        } finally {
          busy = false;
        }
      };

      controller.enqueue(encoder.encode("retry: 5000\n\n"));
      void tick();
      timer = setInterval(() => void tick(), POLL_MS);
      beat = setInterval(() => controller.enqueue(encoder.encode(": keep-alive\n\n")), HEARTBEAT_MS);
      request.signal.addEventListener("abort", stop);
    },
    cancel() {
      clearInterval(timer);
      clearInterval(beat);
    },
  });

  return new Response(stream, {
    headers: { ...noStore, "Content-Type": "text/event-stream; charset=utf-8", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
