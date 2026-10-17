"use client";

import { useEffect, useRef } from "react";
import { CATEGORIES } from "@/domain/categories";
import type { IndexedEvent } from "@/domain/indexed";
import { formatAgo, formatCount, truncate } from "@/lib/format";
import { markerSizePx, type SceneBridge } from "./bridge";

const FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const INK = "#dde4ec";
/** Width the docked detail panel covers on wide screens; callouts avoid it. */
const DETAIL_PANEL_RESERVE = 350;

interface Props {
  bridge: SceneBridge;
  selected: IndexedEvent | undefined;
  eventById: ReadonlyMap<string, IndexedEvent>;
  now: number;
}

/**
 * A 2D canvas laid over the WebGL scene. It draws everything that must stay
 * crisp and attached to a place on Earth: cluster counts, the hover label, and
 * the selection reticle with its leader line and callout.
 */
export function ScreenOverlay({ bridge, selected, eventById, now }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const live = useRef({ selected, eventById, now });
  useEffect(() => {
    live.current = { selected, eventById, now };
  }, [selected, eventById, now]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = el;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);

    bridge.setFrameListener(() => {
      const { selected: sel, eventById: byId, now: clock } = live.current;
      ctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
      ctx.font = FONT;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.fillStyle = INK;
      for (const m of bridge.markers) {
        if (m.count < 2) continue;
        const p = bridge.project(m.latitude, m.longitude);
        if (!p?.facing) continue;
        ctx.fillText(formatCount(m.count), p.x, p.y + 0.5);
      }

      const hover = bridge.hover;
      if (hover && hover.id !== sel?.id) {
        const p = bridge.project(hover.latitude, hover.longitude);
        if (p?.facing) {
          const r = (markerSizePx(hover) * bridge.sizeScale) / 2 + 3;
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
          const label = hover.count > 1 ? `${hover.count} events — click to zoom` : truncate(byId.get(hover.id)?.title ?? "", 56);
          if (label) drawTag(ctx, label, p.x + r + 6, p.y, "left");
        }
      }

      if (sel) {
        const p = bridge.project(sel.latitude, sel.longitude);
        if (p?.facing) drawSelection(ctx, p.x, p.y, sel, clock, el.clientWidth);
      }
    });

    return () => {
      bridge.setFrameListener(null);
      observer.disconnect();
    };
  }, [bridge]);

  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}

function drawTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: "left" | "right") {
  const w = ctx.measureText(text).width + 12;
  const left = align === "left" ? x : x - w;
  ctx.fillStyle = "rgba(5,7,10,0.88)";
  ctx.fillRect(left, y - 9, w, 18);
  ctx.strokeStyle = "#232d3a";
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, y - 8.5, w - 1, 17);
  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.fillText(text, left + 6, y + 0.5);
  ctx.textAlign = "center";
}

function drawSelection(ctx: CanvasRenderingContext2D, x: number, y: number, e: IndexedEvent, now: number, canvasWidth: number) {
  const color = CATEGORIES[e.category].color;
  const r = 12;

  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  // Registration ticks in the four cardinal directions.
  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(x + dx * (r + 2), y + dy * (r + 2));
    ctx.lineTo(x + dx * (r + 7), y + dy * (r + 7));
  }
  ctx.stroke();

  // Leader line to a two-line callout, flipped when it would leave the viewport.
  const flip = x + 300 > canvasWidth - DETAIL_PANEL_RESERVE;
  const ex = x + (flip ? -1 : 1) * 46;
  const ey = y - 34;
  ctx.beginPath();
  ctx.moveTo(x + (flip ? -1 : 1) * r * 0.7, y - r * 0.7);
  ctx.lineTo(ex, ey);
  ctx.lineTo(ex + (flip ? -1 : 1) * 10, ey);
  ctx.stroke();

  const title = truncate(e.title, 44);
  const meta = `${CATEGORIES[e.category].label.toUpperCase()}  ${formatAgo(e.startMs, now)}`;
  const w = Math.max(ctx.measureText(title).width, ctx.measureText(meta).width) + 14;
  const left = flip ? ex - 10 - w : ex + 10;
  ctx.fillStyle = "rgba(5,7,10,0.9)";
  ctx.fillRect(left, ey - 17, w, 34);
  ctx.strokeStyle = "#232d3a";
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 0.5, ey - 16.5, w - 1, 33);
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.fillText(title, left + 7, ey - 5);
  ctx.fillStyle = color;
  ctx.fillText(meta, left + 7, ey + 8);
  ctx.textAlign = "center";
}
