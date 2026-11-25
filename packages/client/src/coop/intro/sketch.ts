/**
 * Felt-pen drawing helpers for the intro, on Phaser Graphics objects, in the game's sketchbook
 * style: white surfaces with light diagonal hatching, a black outline, a solid shadow down-right.
 * They only issue drawing commands (no object is created per call), so a shot can redraw every
 * frame. Colours come from the game's palette; nothing here is ever red.
 */
import type Phaser from "phaser";
import { INK, LINE, ORANGE, OUTLINE, PAPER, SHADOW_X, SHADOW_Y, WHITE } from "../../render/levelView";
import { clamp01 } from "./anim";

export type G = Phaser.GameObjects.Graphics;

export { INK, LINE, ORANGE, OUTLINE, PAPER, SHADOW_X, SHADOW_Y, WHITE };
/** A warm light grey for extras and far scenery: the grid's own colour. */
export const GREY = LINE;
export const MONO = '"DejaVu Sans Mono", "Cascadia Mono", Consolas, Menlo, "Liberation Mono", "Courier New", monospace';

const HALF_PI = Math.PI / 2;

/**
 * Spacing and width of the hatching, world pixels. The game uses 9 and 2 at its own scale; a shot
 * filmed closer sets finer values so the strokes keep a similar weight on screen.
 */
const HATCH = { gap: 9, width: 2 };
export function setHatch(gap: number, width: number): void {
  HATCH.gap = gap;
  HATCH.width = width;
}

/** Traces a rounded rectangle as the current path (closed). */
export function roundRectPath(g: G, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  if (k < 0.5) {
    g.moveTo(x, y);
    g.lineTo(x + w, y);
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.closePath();
    return;
  }
  g.moveTo(x + k, y);
  g.lineTo(x + w - k, y);
  g.arc(x + w - k, y + k, k, -HALF_PI, 0);
  g.lineTo(x + w, y + h - k);
  g.arc(x + w - k, y + h - k, k, 0, HALF_PI);
  g.lineTo(x + k, y + h);
  g.arc(x + k, y + h - k, k, HALF_PI, Math.PI);
  g.lineTo(x, y + k);
  g.arc(x + k, y + k, k, Math.PI, Math.PI * 1.5);
  g.closePath();
}

export function fillRR(g: G, x: number, y: number, w: number, h: number, r: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  roundRectPath(g, x, y, w, h, r);
  g.fillPath();
}

export function strokeRR(g: G, x: number, y: number, w: number, h: number, r: number, width = OUTLINE, color = INK, alpha = 1): void {
  g.lineStyle(width, color, alpha);
  roundRectPath(g, x, y, w, h, r);
  g.strokePath();
}

/**
 * Light diagonal hatching inside a rectangle, like the game's platforms. The lines are anchored to
 * the world (not to the rectangle), so two surfaces side by side share the same strokes.
 */
export function hatch(g: G, x: number, y: number, w: number, h: number, gap = HATCH.gap, color = LINE, width = HATCH.width, alpha = 1): void {
  if (w <= 0 || h <= 0) return;
  g.lineStyle(width, color, alpha);
  // Each line is x = d + (yy - y); d is on the world's own lattice so the hatching does not swim.
  const first = Math.ceil((x - h - y) / gap) * gap + y;
  for (let d = first; d < x + w; d += gap) {
    let x0 = d;
    let y0 = y;
    let x1 = d + h;
    let y1 = y + h;
    if (x0 < x) {
      y0 += x - x0;
      x0 = x;
    }
    if (x1 > x + w) {
      y1 -= x1 - (x + w);
      x1 = x + w;
    }
    if (y1 - y0 > 0.5) g.lineBetween(x0, y0, x1, y1);
  }
}

/** The same hatching inside a disc (tree crowns, plates, the moon). */
export function hatchDisc(g: G, cx: number, cy: number, r: number, gap = HATCH.gap, color = LINE, width = HATCH.width, alpha = 1): void {
  g.lineStyle(width, color, alpha);
  const mid = cx - cy;
  const reach = r * Math.SQRT2;
  for (let c = Math.ceil((mid - reach) / gap) * gap; c < mid + reach; c += gap) {
    const e = (c - mid) / Math.SQRT2;
    const half = Math.sqrt(Math.max(0, r * r - e * e)) / Math.SQRT2;
    if (half < 1) continue;
    const mx = cx + (c - mid) / 2;
    const my = cy - (c - mid) / 2;
    g.lineBetween(mx - half, my - half, mx + half, my + half);
  }
}

export interface PanelStyle {
  /** Corner radius. */
  r?: number;
  fill?: number;
  /** Diagonal hatching (default: no). */
  hatch?: boolean;
  /** Solid shadow down-right: true for the game's offset, or a scale of it. */
  shadow?: boolean | number;
  /** Outline width; 0 for none. */
  outline?: number;
  alpha?: number;
}

/** A sketchbook surface: shadow, fill, hatching, outline. */
export function panel(g: G, x: number, y: number, w: number, h: number, style: PanelStyle = {}): void {
  const r = style.r ?? 6;
  const alpha = style.alpha ?? 1;
  if (style.shadow) {
    const k = style.shadow === true ? 1 : style.shadow;
    fillRR(g, x + SHADOW_X * k, y + SHADOW_Y * k, w, h, r, INK, alpha);
  }
  fillRR(g, x, y, w, h, r, style.fill ?? WHITE, alpha);
  if (style.hatch) hatch(g, x + 2, y + 2, w - 4, h - 4, HATCH.gap, LINE, HATCH.width, alpha);
  const o = style.outline ?? OUTLINE;
  if (o > 0) strokeRR(g, x, y, w, h, r, o, INK, alpha);
}

/** A straight pen stroke with round ends. */
export function stroke(g: G, x0: number, y0: number, x1: number, y1: number, width = OUTLINE, color = INK, alpha = 1): void {
  g.lineStyle(width, color, alpha);
  g.lineBetween(x0, y0, x1, y1);
  if (width >= 2.4) {
    g.fillStyle(color, alpha);
    g.fillCircle(x0, y0, width / 2);
    g.fillCircle(x1, y1, width / 2);
  }
}

/** A polyline given as a flat [x0, y0, x1, y1, ...] list. */
export function polyline(g: G, pts: readonly number[], width = OUTLINE, color = INK, closed = false, alpha = 1): void {
  if (pts.length < 4) return;
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  if (closed) g.closePath();
  g.strokePath();
}

export function fillPoly(g: G, pts: readonly number[], color: number, alpha = 1): void {
  if (pts.length < 6) return;
  g.fillStyle(color, alpha);
  g.beginPath();
  g.moveTo(pts[0]!, pts[1]!);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
  g.closePath();
  g.fillPath();
}

/** Length of a flat polyline. */
export function pathLength(pts: readonly number[], closed = false): number {
  let len = 0;
  const n = pts.length / 2;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const j = ((i + 1) % n) * 2;
    len += Math.hypot(pts[j]! - pts[i * 2]!, pts[j + 1]! - pts[i * 2 + 1]!);
  }
  return len;
}

/** The first fraction `p` of a polyline, as if a pen were drawing it. */
export function partial(g: G, pts: readonly number[], p: number, width = OUTLINE, color = INK, closed = false): void {
  const q = clamp01(p);
  if (q <= 0 || pts.length < 4) return;
  if (q >= 1) {
    polyline(g, pts, width, color, closed);
    return;
  }
  let left = pathLength(pts, closed) * q;
  const n = pts.length / 2;
  const last = closed ? n : n - 1;
  g.lineStyle(width, color, 1);
  g.beginPath();
  g.moveTo(pts[0]!, pts[1]!);
  let ex = pts[0]!;
  let ey = pts[1]!;
  for (let i = 0; i < last && left > 0; i++) {
    const j = ((i + 1) % n) * 2;
    const ax = pts[i * 2]!;
    const ay = pts[i * 2 + 1]!;
    const bx = pts[j]!;
    const by = pts[j + 1]!;
    const d = Math.hypot(bx - ax, by - ay);
    if (d <= left) {
      ex = bx;
      ey = by;
    } else {
      const k = d > 0 ? left / d : 0;
      ex = ax + (bx - ax) * k;
      ey = ay + (by - ay) * k;
    }
    g.lineTo(ex, ey);
    left -= d;
  }
  g.strokePath();
}

/** A circle outline as a path (so it gets proper joins at any width). */
export function ring(g: G, x: number, y: number, r: number, width = OUTLINE, color = INK, alpha = 1): void {
  g.lineStyle(width, color, alpha);
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.closePath();
  g.strokePath();
}

/** A filled, outlined disc with an optional solid shadow. */
export function disc(g: G, x: number, y: number, r: number, fill: number, width = OUTLINE, shadow = 0): void {
  if (shadow > 0) {
    g.fillStyle(INK, 1);
    g.fillCircle(x + SHADOW_X * shadow, y + SHADOW_Y * shadow, r);
  }
  g.fillStyle(fill, 1);
  g.fillCircle(x, y, r);
  if (width > 0) ring(g, x, y, r, width);
}

/**
 * The rope: an ink line that sags when it is slack, like the one that ties the players in the
 * game. `sag` is how far the middle hangs below the straight line, pixels.
 */
export function rope(g: G, ax: number, ay: number, bx: number, by: number, sag: number, width = 3, color = INK, upTo = 1): void {
  const steps = 14;
  const end = Math.max(1, Math.round(steps * clamp01(upTo)));
  g.lineStyle(width, color, 1);
  g.beginPath();
  g.moveTo(ax, ay);
  let x = ax;
  let y = ay;
  for (let i = 1; i <= end; i++) {
    const p = i / steps;
    x = ax + (bx - ax) * p;
    y = ay + (by - ay) * p + sag * 4 * p * (1 - p);
    g.lineTo(x, y);
  }
  g.strokePath();
  g.fillStyle(color, 1);
  g.fillCircle(ax, ay, width / 2);
  g.fillCircle(x, y, width / 2);
}

/** A comic burst: a jagged star, white with an ink edge (or any fill). */
export function burst(g: G, x: number, y: number, rOut: number, rIn: number, spikes: number, rot = 0, fill = WHITE, width = OUTLINE, alpha = 1): void {
  const n = spikes * 2;
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const r = i % 2 === 0 ? rOut : rIn;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * 0.82;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
    if (pass === 0) {
      g.fillStyle(fill, alpha);
      g.fillPath();
    } else if (width > 0) {
      g.lineStyle(width, INK, alpha);
      g.strokePath();
    }
  }
}

/** Short ink dashes radiating from a point: impact, surprise, shine. */
export function rays(g: G, x: number, y: number, r0: number, r1: number, count: number, rot = 0, width = 2, color = INK, alpha = 1, arcSpan = Math.PI * 2): void {
  g.lineStyle(width, color, alpha);
  for (let i = 0; i < count; i++) {
    const a = rot + (i / count) * arcSpan;
    const c = Math.cos(a);
    const s = Math.sin(a);
    g.lineBetween(x + c * r0, y + s * r0, x + c * r1, y + s * r1);
  }
}

/** A four-point sparkle. */
export function sparkle(g: G, x: number, y: number, r: number, fill = WHITE, width = 1.6): void {
  const k = r * 0.28;
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    g.moveTo(x, y - r);
    g.lineTo(x + k, y - k);
    g.lineTo(x + r, y);
    g.lineTo(x + k, y + k);
    g.lineTo(x, y + r);
    g.lineTo(x - k, y + k);
    g.lineTo(x - r, y);
    g.lineTo(x - k, y - k);
    g.closePath();
    if (pass === 0) {
      g.fillStyle(fill, 1);
      g.fillPath();
    } else {
      g.lineStyle(width, INK, 1);
      g.strokePath();
    }
  }
}

/** A drop of sweat (or of anything): white with an ink edge, point up. */
export function drop(g: G, x: number, y: number, s: number, fill = WHITE, alpha = 1): void {
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    g.moveTo(x, y - s * 1.5);
    g.lineTo(x + s * 0.75, y - s * 0.1);
    g.arc(x, y, s * 0.78, -0.2, Math.PI + 0.2);
    g.closePath();
    if (pass === 0) {
      g.fillStyle(fill, alpha);
      g.fillPath();
    } else {
      g.lineStyle(1.5, INK, alpha);
      g.strokePath();
    }
  }
}

/** A hand-drawn underline: a slightly wavy thick stroke, drawn up to fraction `p`. */
export function swoosh(g: G, x0: number, y: number, x1: number, p: number, width = 5, color = ORANGE, wave = 3): void {
  const q = clamp01(p);
  if (q <= 0) return;
  const steps = 16;
  const end = Math.max(1, Math.round(steps * q));
  g.lineStyle(width, color, 1);
  g.beginPath();
  g.moveTo(x0, y);
  let lx = x0;
  let ly = y;
  for (let i = 1; i <= end; i++) {
    const k = i / steps;
    lx = x0 + (x1 - x0) * k;
    ly = y + Math.sin(k * Math.PI * 2.2) * wave - k * wave;
    g.lineTo(lx, ly);
  }
  g.strokePath();
  g.fillStyle(color, 1);
  g.fillCircle(x0, y, width / 2);
  g.fillCircle(lx, ly, width / 2);
}

/** A cross (an "x" in pen): for errors and wrong answers, never red. */
export function cross(g: G, x: number, y: number, r: number, width = 3, color = INK): void {
  stroke(g, x - r, y - r, x + r, y + r, width, color);
  stroke(g, x - r, y + r, x + r, y - r, width, color);
}

/** A check mark in pen. */
export function check(g: G, x: number, y: number, r: number, width = 3, color = INK, p = 1): void {
  partial(g, [x - r, y, x - r * 0.3, y + r * 0.7, x + r, y - r * 0.8], p, width, color);
}

/** A puffy cloud (also thought bubbles): overlapping discs with one outline. */
export function cloud(g: G, x: number, y: number, w: number, h: number, fill = WHITE, shadow = true): void {
  const lobes: Array<[number, number, number]> = [
    [-0.3, 0.12, 0.3],
    [0.02, -0.14, 0.36],
    [0.32, 0.1, 0.28],
    [-0.02, 0.2, 0.3],
  ];
  if (shadow) {
    g.fillStyle(INK, 1);
    for (const [lx, ly, lr] of lobes) g.fillEllipse(x + lx * w + SHADOW_X, y + ly * h + SHADOW_Y, lr * w * 2, lr * h * 2.6);
  }
  g.lineStyle(OUTLINE * 2, INK, 1);
  for (const [lx, ly, lr] of lobes) g.strokeEllipse(x + lx * w, y + ly * h, lr * w * 2, lr * h * 2.6);
  g.fillStyle(fill, 1);
  for (const [lx, ly, lr] of lobes) g.fillEllipse(x + lx * w, y + ly * h, lr * w * 2, lr * h * 2.6);
}

/** The first fraction `p` of a rectangle's outline, drawn clockwise from its top-left corner. */
export function partialRect(g: G, x: number, y: number, w: number, h: number, p: number, width = OUTLINE, color = INK): void {
  const q = clamp01(p);
  if (q <= 0) return;
  let left = (w + h) * 2 * q;
  g.lineStyle(width, color, 1);
  g.beginPath();
  g.moveTo(x, y);
  let px = x;
  let py = y;
  for (let side = 0; side < 4 && left > 0; side++) {
    const len = side % 2 === 0 ? w : h;
    const d = Math.min(len, left);
    if (side === 0) px += d;
    else if (side === 1) py += d;
    else if (side === 2) px -= d;
    else py -= d;
    g.lineTo(px, py);
    left -= d;
  }
  if (q >= 1) g.closePath();
  g.strokePath();
}

/** The first fraction `p` of a circle's outline, starting at angle `from`. */
export function partialRing(g: G, x: number, y: number, r: number, p: number, width = OUTLINE, color = INK, from = -Math.PI / 2): void {
  const q = clamp01(p);
  if (q <= 0) return;
  g.lineStyle(width, color, 1);
  g.beginPath();
  g.arc(x, y, r, from, from + Math.PI * 2 * q);
  if (q >= 1) g.closePath();
  g.strokePath();
}

/**
 * A surface that is being sketched: its outline is drawn from `t0` to `t1`, then it is coloured
 * in (shadow, white, hatching) in a blink. After that it is a plain panel with square corners.
 */
export function sketchBox(
  g: G,
  u: number,
  t0: number,
  t1: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: number | null = WHITE,
  hatched = false,
  shadow = 0,
  width = OUTLINE,
): void {
  if (u <= t0) return;
  const inked = clamp01((u - (t1 - 0.08)) / 0.22);
  if (inked > 0 && fill !== null) {
    if (shadow > 0) {
      g.fillStyle(INK, inked);
      g.fillRect(x + SHADOW_X * shadow, y + SHADOW_Y * shadow, w, h);
    }
    g.fillStyle(fill, inked);
    g.fillRect(x, y, w, h);
    if (hatched) hatch(g, x + 1, y + 1, w - 2, h - 2, HATCH.gap, LINE, HATCH.width, inked);
  }
  partialRect(g, x, y, w, h, (u - t0) / (t1 - t0), width);
}

/** The paper's faint grid over a screen rectangle, for a camera at (cx, cy) with a zoom. */
export function paperGrid(g: G, cx: number, cy: number, zoom: number, screenW: number, screenH: number, cell = 40): void {
  g.lineStyle(Math.max(1, zoom * 0.75), LINE, 1);
  const left = cx - screenW / 2 / zoom;
  const top = cy - screenH / 2 / zoom;
  const right = cx + screenW / 2 / zoom;
  const bottom = cy + screenH / 2 / zoom;
  for (let x = Math.ceil(left / cell) * cell; x <= right; x += cell) {
    const sx = (x - cx) * zoom + screenW / 2;
    g.lineBetween(sx, 0, sx, screenH);
  }
  for (let y = Math.ceil(top / cell) * cell; y <= bottom; y += cell) {
    const sy = (y - cy) * zoom + screenH / 2;
    g.lineBetween(0, sy, screenW, sy);
  }
}

/**
 * Night: thin ink hatching over everything the camera sees, except a disc of light (the screen's).
 * World coordinates; the lines are anchored to the world so they do not swim when the camera moves.
 */
export function darkness(g: G, camX: number, camY: number, zoom: number, screenW: number, screenH: number, lx: number, ly: number, r: number): void {
  const halfW = screenW / 2 / zoom + 8;
  const halfH = screenH / 2 / zoom + 8;
  const x0 = camX - halfW;
  const x1 = camX + halfW;
  const y0 = camY - halfH;
  const y1 = camY + halfH;
  const gap = 5;
  g.lineStyle(0.9, INK, 0.3);
  // Lines x - y = c, clipped to the view, with the lit chord taken out.
  const mid = lx - ly;
  for (let c = Math.ceil((x0 - y1) / gap) * gap; c < x1 - y0; c += gap) {
    const ax = Math.max(x0, c + y0);
    const bx = Math.min(x1, c + y1);
    if (bx <= ax) continue;
    const e = (c - mid) / Math.SQRT2;
    if (Math.abs(e) >= r) {
      g.lineBetween(ax, ax - c, bx, bx - c);
      continue;
    }
    const half = Math.sqrt(r * r - e * e) / Math.SQRT2;
    const mx = lx + (c - mid) / 2;
    if (mx - half > ax) g.lineBetween(ax, ax - c, mx - half, mx - half - c);
    if (mx + half < bx) g.lineBetween(mx + half, mx + half - c, bx, bx - c);
  }
}

/** A dashed pen line: the call-out lines between a small screen and its enlarged copy. */
export function dashed(g: G, x0: number, y0: number, x1: number, y1: number, alpha = 1, width = 2.5): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.floor(len / 18));
  g.lineStyle(width, INK, alpha);
  for (let i = 0; i < n; i++) {
    const a = i / n;
    const b = (i + 0.55) / n;
    g.lineBetween(x0 + (x1 - x0) * a, y0 + (y1 - y0) * a, x0 + (x1 - x0) * b, y0 + (y1 - y0) * b);
  }
}
