/**
 * Canvas 2D helpers for the co-op things in the sketchbook style: felt-pen outlines, solid offset
 * shadows, hatching, dots, dashes, the link symbols, handwritten and printed text.
 */
import { FONT_MARKER, FONT_TITLE, INK_CSS, OUTLINE, SHADOW_X, SHADOW_Y } from "../../render/levelView";
import type { LinkMark } from "./thingLayout";

export const ORANGE_CSS = "#f07a2e";
export const RED_CSS = "#b3361a";
export const LINE_CSS = "#dcd8cc";
export const WHITE_CSS = "#ffffff";
export const CARD_CSS = "#fffdf7";
export const MONO = '"DejaVu Sans Mono", Menlo, Consolas, "Courier New", monospace';

export function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

export interface PanelStyle {
  fill?: string;
  /** Solid ink shadow down-right (default true). */
  shadow?: boolean;
  /** Outline width (0: none). */
  line?: number;
  dash?: number[];
  alpha?: number;
}

/** A rounded box: its shadow, its fill, its outline. */
export function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, s: PanelStyle = {}): void {
  ctx.save();
  ctx.globalAlpha = s.alpha ?? 1;
  if (s.shadow !== false) {
    rr(ctx, x + SHADOW_X, y + SHADOW_Y, w, h, r);
    ctx.fillStyle = INK_CSS;
    ctx.fill();
  }
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = s.fill ?? WHITE_CSS;
  ctx.fill();
  const line = s.line ?? OUTLINE;
  if (line > 0) {
    ctx.setLineDash(s.dash ?? []);
    ctx.lineWidth = line;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
  }
  ctx.restore();
}

/** Diagonal hatching inside a box. */
export function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, gap: number, color: string, width = 2, alpha = 1): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let d = -h; d < w + gap; d += gap) {
    ctx.moveTo(x + d, y + h);
    ctx.lineTo(x + d + h, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** A grid of dots inside a box. */
export function dots(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, gap: number, r: number, color: string, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  let row = 0;
  for (let cy = y + gap / 2; cy < y + h; cy += gap, row++) {
    for (let cx = x + gap / 2 + (row % 2 ? gap / 2 : 0); cx < x + w; cx += gap) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function text(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  font: string,
  color: string,
  opts: { align?: CanvasTextAlign; stroke?: string; strokeWidth?: number; alpha?: number } = {},
): void {
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.font = font;
  ctx.textAlign = opts.align ?? "center";
  ctx.textBaseline = "middle";
  if (opts.stroke) {
    ctx.lineWidth = opts.strokeWidth ?? 4;
    ctx.strokeStyle = opts.stroke;
    ctx.strokeText(s, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
  ctx.restore();
}

export const titleFont = (px: number, weight = 700) => `${weight} ${px}px ${FONT_TITLE}`;
export const markerFont = (px: number) => `${px}px ${FONT_MARKER}`;
export const monoFont = (px: number) => `${px}px ${MONO}`;

let measurer: CanvasRenderingContext2D | null = null;

export function measure(s: string, font: string): number {
  measurer ??= document.createElement("canvas").getContext("2d");
  if (!measurer) return s.length * 7;
  measurer.font = font;
  return measurer.measureText(s).width;
}

/** Words of `s` in lines no wider than `max` pixels, at most `lines` lines (the last one cut with "…"). */
export function wrap(s: string, font: string, max: number, lines: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const word of s.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (measure(next, font) <= max || !cur) cur = next;
    else {
      out.push(cur);
      cur = word;
    }
  }
  if (cur) out.push(cur);
  if (out.length > lines) {
    const kept = out.slice(0, lines);
    kept[lines - 1] = `${kept[lines - 1]}…`;
    return kept;
  }
  return out;
}

/** The path of a link symbol of radius r around (cx, cy). */
export function symbolPath(ctx: CanvasRenderingContext2D, kind: LinkMark["symbol"], cx: number, cy: number, r: number): void {
  ctx.beginPath();
  const poly = (pts: Array<[number, number]>) => {
    pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(cx + px, cy + py) : ctx.lineTo(cx + px, cy + py)));
    ctx.closePath();
  };
  const ring = (n: number, rad: (i: number) => number, start: number) =>
    poly(Array.from({ length: n }, (_, i) => [Math.cos(start + (i * Math.PI * 2) / n) * rad(i), Math.sin(start + (i * Math.PI * 2) / n) * rad(i)] as [number, number]));
  switch (kind) {
    case "circle":
      ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2);
      break;
    case "triangle":
      poly([
        [0, -r],
        [r * 0.95, r * 0.72],
        [-r * 0.95, r * 0.72],
      ]);
      break;
    case "square":
      ctx.rect(cx - r * 0.78, cy - r * 0.78, r * 1.56, r * 1.56);
      break;
    case "diamond":
      poly([
        [0, -r * 1.05],
        [r * 0.85, 0],
        [0, r * 1.05],
        [-r * 0.85, 0],
      ]);
      break;
    case "star":
      ring(10, (i) => (i % 2 === 0 ? r * 1.08 : r * 0.46), -Math.PI / 2);
      break;
    case "hexagon":
      ring(6, () => r * 0.98, 0);
      break;
    case "cross": {
      const a = r * 0.34;
      poly([
        [-a, -r],
        [a, -r],
        [a, -a],
        [r, -a],
        [r, a],
        [a, a],
        [a, r],
        [-a, r],
        [-a, a],
        [-r, a],
        [-r, -a],
        [-a, -a],
      ]);
      break;
    }
    case "heart":
      ctx.moveTo(cx, cy + r * 0.95);
      ctx.bezierCurveTo(cx - r * 1.5, cy - r * 0.1, cx - r * 0.7, cy - r * 1.25, cx, cy - r * 0.42);
      ctx.bezierCurveTo(cx + r * 0.7, cy - r * 1.25, cx + r * 1.5, cy - r * 0.1, cx, cy + r * 0.95);
      ctx.closePath();
      break;
  }
}

/** A wire end: a white disc with the link's symbol, crossed out for an inverted gate. */
export function badge(ctx: CanvasRenderingContext2D, cx: number, cy: number, mark: LinkMark, crossed: boolean, r = 8.5): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx + 1.5, cy + 2, r, 0, Math.PI * 2);
  ctx.fillStyle = INK_CSS;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = WHITE_CSS;
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
  symbolPath(ctx, mark.symbol, cx, cy, r * 0.55);
  ctx.fillStyle = INK_CSS;
  ctx.fill();
  if (crossed) {
    ctx.lineCap = "round";
    ctx.strokeStyle = WHITE_CSS;
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.72, cy + r * 0.72);
    ctx.lineTo(cx + r * 0.72, cy - r * 0.72);
    ctx.stroke();
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  if (mark.round > 0) text(ctx, String(mark.round + 1), cx + r * 0.95, cy - r * 0.85, titleFont(9), INK_CSS, { stroke: WHITE_CSS, strokeWidth: 3 });
  ctx.restore();
}
