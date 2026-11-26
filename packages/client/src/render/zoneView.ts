/**
 * Protected zones (around the start and the finish, see protectedZones in shared/level.ts),
 * shown while players place objects or blocks so they see where nothing can go before they
 * try. Ink at low alpha, never red: red means "it kills", this only means "not here".
 */
import Phaser from "phaser";
import { protectedZones, type Level } from "@game/shared";
import { INK } from "./levelView";

const FILL_ALPHA = 0.05;
const HATCH_ALPHA = 0.16;
const HATCH_GAP = 10;
const EDGE_ALPHA = 0.45;
const DASH = 7;
const DASH_GAP = 5;

/**
 * Draw the protected zones into `g` (the caller clears it). Only empty cells are marked: terrain
 * inside a zone already reads as "cannot place", and hatching it would hide the terrain's art.
 */
export function drawProtectedZones(g: Phaser.GameObjects.Graphics, level: Level, cellPx: number): void {
  const { width: W, height: H } = level;
  // Union of the zones' empty cells, so overlapping zones are drawn once with one outline.
  const mask = new Array<boolean>(W * H).fill(false);
  for (const z of protectedZones(level)) {
    for (let y = z.y; y < z.y + z.h; y++) {
      for (let x = z.x; x < z.x + z.w; x++) {
        if (!level.solid[y * W + x]) mask[y * W + x] = true;
      }
    }
  }
  const marked = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && mask[y * W + x] === true;
  const terrain = (x: number, y: number) => x >= 0 && x < W && y >= 0 && y < H && level.solid[y * W + x] === true;

  g.fillStyle(INK, FILL_ALPHA);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (marked(x, y)) g.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);

  // Diagonal hatching ("/"): lines x + y = k * gap in pixels, cut per cell. The phase is
  // global, so the lines run on unbroken from one cell to the next.
  g.lineStyle(1.5, INK, HATCH_ALPHA);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!marked(x, y)) continue;
      const x0 = x * cellPx;
      const y0 = y * cellPx;
      const first = Math.ceil((x0 + y0) / HATCH_GAP) * HATCH_GAP;
      for (let s = first; s < x0 + y0 + 2 * cellPx; s += HATCH_GAP) {
        const xa = Math.max(x0, s - (y0 + cellPx));
        const xb = Math.min(x0 + cellPx, s - y0);
        if (xb > xa) g.lineBetween(xa, s - xa, xb, s - xb);
      }
    }
  }

  // Dashed outline where a marked cell meets a free cell outside the zone. Edges against
  // terrain are skipped (the terrain has its own outline). Edges are merged into runs so the
  // dashes keep one rhythm along a whole side.
  g.lineStyle(2, INK, EDGE_ALPHA);
  const edge = (a: boolean, bx: number, by: number) => a && !marked(bx, by) && !terrain(bx, by);
  // Horizontal edges: the top side of row y (neighbour above) and the bottom side (below).
  for (let y = 0; y <= H; y++) {
    let start = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && (edge(marked(x, y), x, y - 1) || edge(marked(x, y - 1), x, y));
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        dashed(g, start * cellPx, y * cellPx, x * cellPx, y * cellPx);
        start = -1;
      }
    }
  }
  // Vertical edges: the left side of column x and the right side of column x - 1.
  for (let x = 0; x <= W; x++) {
    let start = -1;
    for (let y = 0; y <= H; y++) {
      const on = y < H && (edge(marked(x, y), x - 1, y) || edge(marked(x - 1, y), x, y));
      if (on && start < 0) start = y;
      if (!on && start >= 0) {
        dashed(g, x * cellPx, start * cellPx, x * cellPx, y * cellPx);
        start = -1;
      }
    }
  }
}

/** A dashed straight line from (x0, y0) to (x1, y1), with the current line style. */
function dashed(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len <= 0) return;
  const ux = (x1 - x0) / len;
  const uy = (y1 - y0) / len;
  for (let d = 0; d < len; d += DASH + DASH_GAP) {
    const e = Math.min(d + DASH, len);
    g.lineBetween(x0 + ux * d, y0 + uy * d, x0 + ux * e, y0 + uy * e);
  }
}
