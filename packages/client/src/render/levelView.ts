/**
 * Drawing of the level terrain in the sketchbook style ("Vidal Street"): paper with a faint
 * grid, white masses with light diagonal hatching, a black felt-pen outline on every exposed
 * edge and a solid offset shadow. Start pad, orange finish flag, handwritten labels.
 *
 * Everything static is drawn once, with the Canvas 2D API, into a single texture shown as one
 * image: big maps and thick masses cost nothing per frame. Only the grid stays a Graphics
 * object, because the debug panel can hide it.
 */
import Phaser from "phaser";
import { SPAWN_SEAT_OFFSETS, spawnCell, type Level } from "@game/shared";
import { CELL_PX } from "../config";

/**
 * Sketchbook palette and fonts, shared by every view (see "Art direction" in HANDOFF.md).
 * Red means it kills and nothing else is red; orange means it helps, and is the interface accent.
 */
export const INK = 0x161616;
export const PAPER = 0xf5f2ea;
export const LINE = 0xdcd8cc;
export const WHITE = 0xffffff;
export const ORANGE = 0xf07a2e;
export const RED = 0xb3361a;
export const INK_CSS = "#161616";
export const PAPER_CSS = "#f5f2ea";
export const ORANGE_CSS = "#f07a2e";
/** Felt-pen outline width and solid shadow offset, pixels. */
export const OUTLINE = 2.5;
export const SHADOW_X = 3;
export const SHADOW_Y = 5;
/** Font stacks; the fallbacks keep the game readable when Google Fonts is unreachable. */
export const FONT_MARKER = '"Permanent Marker", "Marker Felt", "Comic Sans MS", "Chalkboard SE", cursive';
export const FONT_TITLE = 'Fredoka, "Baloo 2", Nunito, "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
export const FONT_TEXT = 'Rubik, "Segoe UI", Roboto, "Helvetica Neue", Arial, system-ui, sans-serif';

export const LEVEL_COLORS = {
  grid: 0xdcd8cc,
  solid: 0x161616,
  start: 0x161616,
  finish: 0xf07a2e,
  label: INK_CSS,
};

export interface LevelView {
  /** The grid lines, which the debug panel can hide. */
  grid: Phaser.GameObjects.Graphics;
}

const CORNER = 5;
const HATCH_GAP = 9;
const HATCH_COLOR = "#dcd8cc";
/** Room around the level in the terrain texture: the flag can stick out above, shadows to the right. */
const MARGIN_TOP = CELL_PX * 2;
const MARGIN_SIDE = 8;

let textureCounter = 0;

export function drawLevel(scene: Phaser.Scene, level: Level): LevelView {
  const { width, height } = level;

  const grid = scene.add.graphics();
  grid.lineStyle(1, LEVEL_COLORS.grid, 1);
  for (let x = 0; x <= width; x++) grid.lineBetween(x * CELL_PX, 0, x * CELL_PX, height * CELL_PX);
  for (let y = 0; y <= height; y++) grid.lineBetween(0, y * CELL_PX, width * CELL_PX, y * CELL_PX);

  const canvas = document.createElement("canvas");
  canvas.width = width * CELL_PX + MARGIN_SIDE * 2;
  canvas.height = height * CELL_PX + MARGIN_TOP + MARGIN_SIDE;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.translate(MARGIN_SIDE, MARGIN_TOP);
    drawTerrain(ctx, level);
    drawStart(ctx, level);
    if (level.finish) drawFinish(ctx, level.finish.x, level.finish.y);
  }
  const key = `terrain-${++textureCounter}`;
  scene.textures.addCanvas(key, canvas);
  scene.add.image(-MARGIN_SIDE, -MARGIN_TOP, key).setOrigin(0, 0);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    if (scene.textures.exists(key)) scene.textures.remove(key);
  });

  for (const l of level.labels) {
    scene.add
      .text(l.x * CELL_PX, l.y * CELL_PX, l.text, { fontFamily: FONT_MARKER, fontSize: "20px", color: INK_CSS })
      .setOrigin(0.5, 0.5)
      .setRotation(-0.04);
  }
  return { grid };
}

// --- Terrain ---------------------------------------------------------------------------

interface Pt {
  x: number;
  y: number;
}

/**
 * Closed outlines (in cells) of the solid masses. The grid is extended two cells past the
 * left, right and bottom edges by repeating the border cells, so a floor or a wall that
 * touches an edge runs on beyond it instead of getting an outline along the border; above
 * the level is open sky. Loops go clockwise around solids, so holes come out reversed.
 */
function solidOutlines(level: Level): Pt[][] {
  const { width: W, height: H } = level;
  const PAD = 2;
  const solidAt = (x: number, y: number): boolean => {
    if (x < -PAD || x >= W + PAD || y < -PAD || y >= H + PAD) return false;
    if (y < 0) return false;
    const cx = Math.min(Math.max(x, 0), W - 1);
    const cy = Math.min(Math.max(y, 0), H - 1);
    return level.solid[cy * W + cx] === true;
  };

  // Directed boundary edges, keyed by their start vertex.
  const key = (x: number, y: number) => (x + 8) * 4096 + (y + 8);
  const out = new Map<number, Array<{ x: number; y: number; dx: number; dy: number; used: boolean }>>();
  const add = (x: number, y: number, dx: number, dy: number) => {
    const k = key(x, y);
    let list = out.get(k);
    if (!list) out.set(k, (list = []));
    list.push({ x, y, dx, dy, used: false });
  };
  for (let y = -PAD; y < H + PAD; y++) {
    for (let x = -PAD; x < W + PAD; x++) {
      if (!solidAt(x, y)) continue;
      if (!solidAt(x, y - 1)) add(x, y, 1, 0);
      if (!solidAt(x + 1, y)) add(x + 1, y, 0, 1);
      if (!solidAt(x, y + 1)) add(x + 1, y + 1, -1, 0);
      if (!solidAt(x - 1, y)) add(x, y + 1, 0, -1);
    }
  }

  const loops: Pt[][] = [];
  for (const list of out.values()) {
    for (const first of list) {
      if (first.used) continue;
      const pts: Pt[] = [];
      let e = first;
      for (let guard = 0; guard < 100000; guard++) {
        e.used = true;
        pts.push({ x: e.x, y: e.y });
        const nx = e.x + e.dx;
        const ny = e.y + e.dy;
        const candidates = (out.get(key(nx, ny)) ?? []).filter((c) => !c.used || c === first);
        if (candidates.length === 0) break;
        // Where two cells touch by a corner, keep turning right so they stay separate shapes.
        const turn = (c: { dx: number; dy: number }) => e.dx * c.dy - e.dy * c.dx;
        candidates.sort((a, b) => turn(b) - turn(a));
        const next = candidates[0]!;
        if (next === first) break;
        e = next;
      }
      loops.push(simplify(pts));
    }
  }
  return loops;
}

/** Drop vertices in the middle of straight runs. */
function simplify(pts: Pt[]): Pt[] {
  const n = pts.length;
  const res: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n]!;
    const b = pts[i]!;
    const c = pts[(i + 1) % n]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) res.push(b);
  }
  return res.length >= 3 ? res : pts;
}

/** Add a closed polygon with rounded corners to the current path (points in pixels). */
function roundedPolygon(ctx: CanvasRenderingContext2D, pts: Pt[], radius: number): void {
  const n = pts.length;
  if (n < 3) return;
  const last = pts[n - 1]!;
  const first = pts[0]!;
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]!;
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    const r = Math.min(radius, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 2);
    ctx.arcTo(p1.x, p1.y, p2.x, p2.y, r);
  }
  ctx.closePath();
}

function drawTerrain(ctx: CanvasRenderingContext2D, level: Level): void {
  const loops = solidOutlines(level).map((l) => l.map((p) => ({ x: p.x * CELL_PX, y: p.y * CELL_PX })));
  if (loops.length === 0) return;
  const W = level.width * CELL_PX;
  const H = level.height * CELL_PX;
  const path = (dx = 0, dy = 0) => {
    ctx.beginPath();
    for (const l of loops) roundedPolygon(ctx, dx || dy ? l.map((p) => ({ x: p.x + dx, y: p.y + dy })) : l, CORNER);
  };

  ctx.save();
  // Left, right and bottom edges cut the masses; above the level is open sky.
  ctx.beginPath();
  ctx.rect(0, -MARGIN_TOP, W, H + MARGIN_TOP);
  ctx.clip();

  // Solid offset shadow, then the white mass over it.
  path(SHADOW_X, SHADOW_Y);
  ctx.fillStyle = INK_CSS;
  ctx.fill("evenodd");
  path();
  ctx.fillStyle = "#ffffff";
  ctx.fill("evenodd");

  // Light diagonal hatching inside the masses.
  ctx.save();
  path();
  ctx.clip("evenodd");
  ctx.strokeStyle = HATCH_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let d = -H - MARGIN_TOP; d < W + HATCH_GAP; d += HATCH_GAP) {
    ctx.moveTo(d, -MARGIN_TOP);
    ctx.lineTo(d + H + MARGIN_TOP, H);
  }
  ctx.stroke();
  ctx.restore();

  // Felt-pen outline on every exposed edge.
  path();
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = OUTLINE;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

// --- Start and finish ------------------------------------------------------------------

/**
 * The start mat runs under every seat's spawn cell (spawnCell, level.ts), so the whole spawn
 * pad reads as the start; on a map with a broken pad it shrinks back to the S cell.
 */
function drawStart(ctx: CanvasRenderingContext2D, level: Level): void {
  const { x: cx, y: cy } = level.start;
  const seatXs = SPAWN_SEAT_OFFSETS.map((_, seat) => spawnCell(level, seat).x);
  const x0 = Math.min(...seatXs);
  const cells = Math.max(...seatXs) - x0 + 1;
  const x = cx * CELL_PX;
  const bottom = (cy + 1) * CELL_PX;
  // A mat on the ground, then a handwritten note above it.
  const w = CELL_PX * (cells + 0.1);
  const mx = x0 * CELL_PX + (CELL_PX * cells - w) / 2;
  const my = bottom - 7;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.fillStyle = INK_CSS;
  ctx.beginPath();
  ctx.roundRect(mx + SHADOW_X, my + 2, w, 7, 3);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = OUTLINE;
  ctx.beginPath();
  ctx.roundRect(mx, my, w, 7, 3);
  ctx.fill();
  ctx.stroke();
  // Dashes across the mat.
  ctx.lineWidth = 2;
  ctx.beginPath();
  const dashes = 3 * cells + 1;
  for (let i = 1; i < dashes; i++) {
    const sx = mx + (w * i) / dashes;
    ctx.moveTo(sx - 2, my + 5);
    ctx.lineTo(sx + 2, my + 2);
  }
  ctx.stroke();

  ctx.translate(x + CELL_PX / 2, bottom - CELL_PX - 8);
  ctx.rotate(-0.08);
  ctx.font = `17px ${FONT_MARKER}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.lineWidth = 5;
  ctx.strokeStyle = PAPER_CSS;
  ctx.strokeText("départ", 0, 0);
  ctx.fillStyle = INK_CSS;
  ctx.fillText("départ", 0, 0);
  ctx.restore();
}

function drawFinish(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const poleX = cx * CELL_PX + 11;
  const bottom = (cy + 1) * CELL_PX;
  const top = bottom - CELL_PX * 1.9;
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  const pennant = (dx: number, dy: number) => {
    const x = poleX + 2 + dx;
    const y = top + 2 + dy;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 14, y - 5, x + 30, y + 3);
    ctx.lineTo(x + 24, y + 12);
    ctx.lineTo(x + 31, y + 22);
    ctx.quadraticCurveTo(x + 14, y + 17, x, y + 24);
    ctx.closePath();
  };
  // Shadows of the pole and the pennant.
  ctx.fillStyle = INK_CSS;
  ctx.fillRect(poleX - 2 + SHADOW_X, top + SHADOW_Y, 4, bottom - top - SHADOW_Y);
  pennant(SHADOW_X, SHADOW_Y);
  ctx.fill();
  // Pole.
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = OUTLINE;
  ctx.beginPath();
  ctx.roundRect(poleX - 2.5, top - 4, 5, bottom - top + 2, 2.5);
  ctx.fill();
  ctx.stroke();
  // Orange pennant.
  pennant(0, 0);
  ctx.fillStyle = ORANGE_CSS;
  ctx.fill();
  ctx.stroke();
  // Knob on top.
  ctx.beginPath();
  ctx.arc(poleX, top - 6, 4, 0, Math.PI * 2);
  ctx.fillStyle = INK_CSS;
  ctx.fill();
  // Foot.
  ctx.beginPath();
  ctx.ellipse(poleX, bottom - 1, 9, 3.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = INK_CSS;
  ctx.fill();
  ctx.restore();
}
