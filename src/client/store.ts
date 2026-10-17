import { create } from "zustand";
import { CATEGORY_IDS, type CategoryId } from "@/domain/categories";
import type { WorldEvent } from "@/domain/event";
import { mergeEvents, type IndexedEvent } from "@/domain/indexed";
import type { SourceInfo } from "@/domain/source";
import { RANGE_MS, type RangeId } from "@/domain/time";

export type FeedPhase = "loading" | "ready" | "error";
export type LinkState = "connecting" | "live" | "reconnecting";

export interface FlyRequest {
  latitude: number;
  longitude: number;
  /** Never end farther away than this (Earth radii); closer views are kept. */
  maxDistance?: number;
  /** Multiply the current distance (used to dive into a cluster). */
  zoomFactor?: number;
  nonce: number;
}

const perCategory = <T,>(value: T) => Object.fromEntries(CATEGORY_IDS.map((id) => [id, value])) as Record<CategoryId, T>;

interface OmniState {
  events: IndexedEvent[];
  sources: SourceInfo[];
  phase: FeedPhase;
  error?: string;
  link: LinkState;
  now: number;

  layers: Record<string, boolean>;
  categories: Record<CategoryId, boolean>;
  minSeverity: Record<CategoryId, number>;
  range: RangeId;
  /** Playhead (epoch ms) or null while following live time. */
  cursor: number | null;
  playing: boolean;
  /** Playback multiplier; 1 plays the whole window in 30 seconds. */
  speed: number;

  selectedId: string | null;
  fly: FlyRequest | null;

  setSnapshot(events: readonly WorldEvent[], sources: SourceInfo[], now: number): void;
  mergeLive(events: readonly WorldEvent[]): void;
  setSources(sources: SourceInfo[]): void;
  setFeed(phase: FeedPhase, error?: string): void;
  setLink(link: LinkState): void;
  tick(now: number): void;

  toggleLayer(source: string): void;
  toggleCategory(id: CategoryId): void;
  setMinSeverity(id: CategoryId, value: number): void;
  setRange(range: RangeId): void;
  setCursor(cursor: number | null): void;
  goLive(): void;
  setPlaying(playing: boolean): void;
  setSpeed(speed: number): void;

  select(id: string | null, options?: { fly?: boolean }): void;
  flyTo(request: Omit<FlyRequest, "nonce">): void;
}

let nonce = 0;

function withNewLayers(layers: Record<string, boolean>, sources: SourceInfo[]): Record<string, boolean> {
  const next = { ...layers };
  for (const s of sources) if (!(s.id in next)) next[s.id] = true;
  return next;
}

export const useOmni = create<OmniState>((set, get) => ({
  events: [],
  sources: [],
  phase: "loading",
  link: "connecting",
  now: Date.now(),

  layers: {},
  categories: perCategory(true),
  minSeverity: perCategory(0),
  range: "7d",
  cursor: null,
  playing: false,
  speed: 1,

  selectedId: null,
  fly: null,

  setSnapshot: (events, sources, now) =>
    set((s) => ({
      events: mergeEvents([], events),
      sources,
      layers: withNewLayers(s.layers, sources),
      now,
      phase: "ready",
      error: undefined,
    })),
  mergeLive: (incoming) => set((s) => ({ events: mergeEvents(s.events, incoming) })),
  setSources: (sources) => set((s) => ({ sources, layers: withNewLayers(s.layers, sources) })),
  setFeed: (phase, error) => set({ phase, error }),
  setLink: (link) => set({ link }),
  tick: (now) => set({ now }),

  toggleLayer: (source) => set((s) => ({ layers: { ...s.layers, [source]: !s.layers[source] } })),
  toggleCategory: (id) => set((s) => ({ categories: { ...s.categories, [id]: !s.categories[id] } })),
  setMinSeverity: (id, value) => set((s) => ({ minSeverity: { ...s.minSeverity, [id]: value } })),
  setRange: (range) =>
    set((s) => ({
      range,
      cursor: s.cursor !== null && s.cursor < s.now - RANGE_MS[range] ? s.now - RANGE_MS[range] : s.cursor,
    })),
  setCursor: (cursor) => set({ cursor }),
  goLive: () => set({ cursor: null, playing: false }),
  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),

  select: (id, options = { fly: true }) => {
    set({ selectedId: id });
    const event = id ? get().events.find((e) => e.id === id) : undefined;
    if (event && options.fly) {
      get().flyTo({ latitude: event.latitude, longitude: event.longitude, maxDistance: 2 });
    }
  },
  flyTo: (request) => set({ fly: { ...request, nonce: ++nonce } }),
}));
