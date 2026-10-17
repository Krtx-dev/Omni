import type { WorldEvent } from "./event";
import type { SourceInfo } from "./source";

/** Wire format of GET /api/events, shared by server and client. */
export interface EventsResponse {
  events: WorldEvent[];
  sources: SourceInfo[];
  /** Server clock before the query ran; pass as `since` to /api/stream to avoid gaps. */
  serverTime: number;
}
