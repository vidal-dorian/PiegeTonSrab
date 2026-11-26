/**
 * Where the co-op level things are drawn: pure geometry in cells, no Phaser, so it is tested.
 *
 * Plates and terminals are tied to what they drive by a dotted wire with the same symbol at both
 * ends (one symbol per link), so a level reads without colour. Seesaws, balances and lamps get
 * their rigs here; cells of glass and deadly pits are grouped into windows and pits.
 */
import { isSolidCell, type Level } from "@game/shared";
import { playersMatch, PROPS, type CoopLevel, type CoopThing, type ThingDef } from "@game/shared/coop";

export interface Point {
  x: number;
  y: number;
}

// --- Links -------------------------------------------------------------------------------------

/** The shapes drawn at both ends of a wire, one per link, in this order. */
export const LINK_SYMBOLS = ["circle", "triangle", "square", "diamond", "star", "hexagon", "cross", "heart"] as const;
export type LinkSymbol = (typeof LINK_SYMBOLS)[number];

export interface LinkMark {
  symbol: LinkSymbol;
  /** 0 for the first eight links; past that the shapes come back with a small number (2, 3...). */
  round: number;
}

/** The link a thing drives (plate, terminal) or follows (gate, linked platform), if any. */
export function thingLink(def: ThingDef): string | null {
  switch (def.kind) {
    case "plate":
    case "gate":
    case "terminal":
      return def.link;
    case "mover":
      return def.link ?? null;
    default:
      return null;
  }
}

/** One symbol per link, in reading order of the first thing that uses it. */
export function linkMarks(things: readonly CoopThing[]): Map<string, LinkMark> {
  const out = new Map<string, LinkMark>();
  for (const t of things) {
    const link = thingLink(t.def);
    if (link === null || out.has(link)) continue;
    const i = out.size;
    out.set(link, { symbol: LINK_SYMBOLS[i % LINK_SYMBOLS.length]!, round: Math.floor(i / LINK_SYMBOLS.length) });
  }
  return out;
}

export interface Wire {
  link: string;
  /** Thing indices: the plate or terminal, and the gate or platform it drives. */
  source: number;
  target: number;
  from: Point;
  to: Point;
}

/** Whether any cell of the row just under a box (x .. x + w) is solid. */
function solidUnder(level: Level, x: number, w: number, row: number): boolean {
  for (let cx = x; cx < x + w; cx++) if (isSolidCell(level, cx, row)) return true;
  return false;
}

/**
 * Where a wire meets a thing, cells: inside a plate's housing, on a platform's start position,
 * in the floor under a gate or a terminal (inside its box when nothing is under it).
 */
export function wireAnchor(level: CoopLevel, t: CoopThing): Point {
  const cx = t.x + t.w / 2;
  switch (t.def.kind) {
    case "plate":
      return { x: cx, y: t.y + 0.85 };
    case "mover":
      return { x: cx, y: t.y + PROPS.moverThickness / 2 };
    default:
      return solidUnder(level.terrain, t.x, t.w, t.y + t.h) ? { x: cx, y: t.y + t.h + 0.3 } : { x: cx, y: t.y + t.h - 0.25 };
  }
}

/** A wire from every plate or terminal to every gate or platform on its link, in reading order. */
export function levelWires(level: CoopLevel): Wire[] {
  const wires: Wire[] = [];
  const sources = level.things.filter((t) => t.def.kind === "plate" || t.def.kind === "terminal");
  const targets = level.things.filter((t) => t.def.kind === "gate" || (t.def.kind === "mover" && t.def.link !== undefined));
  for (const s of sources) {
    const link = thingLink(s.def);
    for (const t of targets) {
      if (thingLink(t.def) !== link || link === null) continue;
      wires.push({ link, source: s.index, target: t.index, from: wireAnchor(level, s), to: wireAnchor(level, t) });
    }
  }
  return wires;
}

/**
 * A wire's path: a cable lying between its two ends, sagging a little (n + 1 points, cells).
 * Between two ends in the same floor it stays in the floor.
 */
export function wireCurve(a: Point, b: Point, n = 24): Point[] {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = Math.min(2.5, 0.25 + 0.12 * dist);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2 + sag;
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * b.x, y: u * u * a.y + 2 * u * t * cy + t * t * b.y });
  }
  return pts;
}

/** Points every `step` along a polyline, starting `offset` in (dots of a dotted line, marching dashes). */
export function alongPath(pts: readonly Point[], step: number, offset = 0): Point[] {
  const out: Point[] = [];
  let next = ((offset % step) + step) % step;
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    while (len > 0 && next <= walked + len) {
      const k = (next - walked) / len;
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
      next += step;
    }
    walked += len;
  }
  return out;
}

// --- Counters ------------------------------------------------------------------------------------

/**
 * What a plate says: its load over what it needs ("1/2"); an exact plate says "= 1" when empty,
 * then whether the load matches ("1 = 1", "2 ≠ 1").
 */
export function plateLabel(load: number, need: number, exact: boolean): string {
  const l = Math.round(load);
  if (!exact) return `${l}/${need}`;
  if (l === 0) return `= ${need}`;
  return l === need ? `${l} = ${need}` : `${l} ≠ ${need}`;
}

// --- Seesaws, balances, lamps --------------------------------------------------------------------

export interface SeesawPose {
  /** Top-left of the two pads, cells, and their width. */
  left: Point;
  right: Point;
  padW: number;
  /** Centre of the cap on the fulcrum. */
  pivot: Point;
  /** The plank under the pads: from the left pad's middle to the right pad's, through the pivot. */
  beam: [Point, Point];
}

/** The seesaw at tilt `t` (+1 left side down): pads where the world puts them, a plank through them. */
export function seesawPose(thing: CoopThing, travel: number, t: number): SeesawPose {
  const half = (thing.w - 1) / 2;
  const k = PROPS.plankThickness;
  const leftY = thing.y + travel * t;
  const rightY = thing.y - travel * t;
  return {
    left: { x: thing.x, y: leftY },
    right: { x: thing.x + half + 1, y: rightY },
    padW: half,
    pivot: { x: thing.x + half + 0.5, y: thing.y + k / 2 },
    beam: [
      { x: thing.x + half / 2, y: leftY + k },
      { x: thing.x + thing.w - half / 2, y: rightY + k },
    ],
  };
}

/** Top of the first solid cell of column `x` at or below `y`, within `max` cells, or null. */
export function groundBelow(level: Level, x: number, y: number, max = 6): number | null {
  for (let row = Math.ceil(y - 1e-6); row < Math.ceil(y) + max && row < level.height; row++) {
    if (isSolidCell(level, x, row)) return row;
  }
  return null;
}

/** Bottom of the first solid cell of column `x` above `y` (0 when only the sky is above). */
export function ceilingAbove(level: Level, x: number, y: number): number {
  for (let row = Math.floor(y - 1e-6); row >= 0; row--) {
    if (isSolidCell(level, x, row)) return row + 1;
  }
  return 0;
}

export interface BalanceRig {
  /** The beam the pans hang from: its height and the two wheels' x (above the pans' middles). */
  beamY: number;
  leftX: number;
  rightX: number;
  /** Where the beam is hung from (the ceiling above its middle). */
  hangX: number;
  hangTop: number;
}

/** Rope from each wheel down to the ring above its pan, cells under the pan's top. */
export const PAN_BRIDLE = 0.75;

/**
 * A balance is drawn as two pans on a rope over two wheels on a beam: room for a friend standing
 * on the higher pan at its highest, and never inside the ceiling.
 */
export function balanceRig(level: Level, left: CoopThing, right: CoopThing, travel: number): BalanceRig {
  const leftX = left.x + left.w / 2;
  const rightX = right.x + right.w / 2;
  const highest = Math.min(left.y, right.y) - travel;
  let ceiling = 0;
  for (let x = Math.floor(leftX); x <= Math.floor(rightX); x++) ceiling = Math.max(ceiling, ceilingAbove(level, x, highest));
  const beamY = Math.max(ceiling + 0.45, Math.min(highest - 2.1, highest - PAN_BRIDLE - 0.4));
  const hangX = (leftX + rightX) / 2;
  return { beamY, leftX, rightX, hangX, hangTop: ceilingAbove(level, Math.floor(hangX), beamY) };
}

// --- Cells ----------------------------------------------------------------------------------------

export interface CellGroup {
  /** Cells (y * width + x) of the group, in reading order. */
  cells: number[];
  /** Bounding box, cells. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Connected groups (side by side) of the given cells, in reading order of their first cell. */
export function cellGroups(cells: ReadonlySet<number>, width: number): CellGroup[] {
  const seen = new Set<number>();
  const groups: CellGroup[] = [];
  for (const start of [...cells].sort((a, b) => a - b)) {
    if (seen.has(start)) continue;
    const list: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const c = stack.pop()!;
      list.push(c);
      const x = c % width;
      const near = [c - width, c + width];
      if (x > 0) near.push(c - 1);
      if (x < width - 1) near.push(c + 1);
      for (const n of near) {
        if (cells.has(n) && !seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    list.sort((a, b) => a - b);
    const xs = list.map((c) => c % width);
    const ys = list.map((c) => Math.floor(c / width));
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    groups.push({ cells: list, x: x0, y: y0, w: Math.max(...xs) - x0 + 1, h: Math.max(...ys) - y0 + 1 });
  }
  return groups;
}

/** The variant's character of a cell (the level's `cells` table), as the level parser reads it. */
function variantChar(level: CoopLevel, char: string): string {
  const v = level.def.cells?.[char];
  if (!v) return char;
  for (const [spec, c] of Object.entries(v)) if (playersMatch(spec, level.players)) return c;
  return ".";
}

/** Cells of the "wall" things that exist for this team size (solid, drawn as dashed blocks). */
export function variantWallCells(level: CoopLevel): Set<number> {
  const out = new Set<number>();
  level.def.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const def = level.def.legend?.[variantChar(level, row[x]!)];
      if (def?.kind === "wall" && playersMatch(def.players, level.players)) out.add(y * level.width + x);
    }
  });
  return out;
}

/** Cells of crate stops ("|"): crates cannot go through them, players can. */
export function crateStopCells(level: CoopLevel): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < level.crateGrid.solid.length; i++) if (level.crateGrid.solid[i] && !level.collision.solid[i]) out.add(i);
  return out;
}

// --- Door -----------------------------------------------------------------------------------------

/** Small pebbles in the doorway for whoever is inside: centres in cells, two per row from the bottom. */
export function doorPebbles(door: { x: number; y: number; w: number; h: number }, count: number): Point[] {
  const out: Point[] = [];
  const perRow = door.w >= 2 ? 3 : 2;
  const dx = door.w / (perRow + 1);
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    out.push({ x: door.x + dx * (col + 1), y: door.y + door.h - 0.3 - row * 0.42 });
  }
  return out;
}
