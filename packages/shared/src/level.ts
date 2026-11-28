import type { Dir, ObjectKind, PlacedObject } from "./objects";

/**
 * Level format and grid queries.
 *
 * A level is a grid of cells. Coordinates are in cells: x grows to the right,
 * y grows downwards, (0, 0) is the top-left corner of the top-left cell.
 * Levels can be any width; wide levels scroll horizontally.
 */

/** Characters used in `LevelDefinition.rows`. */
export const CellChar = {
  Empty: ".",
  Solid: "#",
  Start: "S",
  Finish: "F",
} as const;

/**
 * Characters for objects that are part of a hand-made level. They are not player objects:
 * nobody owns them, so they never earn kill points. The cell itself is empty terrain.
 */
export const OBJECT_CHARS: Record<string, { kind: ObjectKind; dir?: Dir }> = {
  "*": { kind: "saw" },
  "^": { kind: "spikes" },
  "=": { kind: "platform" },
  T: { kind: "spring" },
  V: { kind: "vine" },
  "<": { kind: "cannon", dir: 2 },
  ">": { kind: "cannon", dir: 0 },
  A: { kind: "cannon", dir: 3 },
  U: { kind: "cannon", dir: 1 },
};

export interface LevelLabel {
  /** Cell coordinates of the label's centre. */
  x: number;
  y: number;
  text: string;
  /** Printed letters (a door plate) instead of the marker, whose capitals make "B12" read "BIZ". */
  print?: boolean;
}

export interface LevelDefinition {
  name: string;
  /** One string per row, top to bottom. All rows must have the same length. */
  rows: string[];
  /** Optional notes drawn in the level, used by test levels. */
  labels?: LevelLabel[];
  /** Objects already in the level before players place anything (mainly for testing). */
  objects?: Array<{ kind: ObjectKind; x: number; y: number; dir?: Dir }>;
}

export interface Level {
  name: string;
  width: number;
  height: number;
  /** Row-major solidity grid: solid[y * width + x]. */
  solid: boolean[];
  /**
   * Springs: for each cell, the direction its bouncy face points (Dir: 0 right, 1 down,
   * 2 left, 3 up), or -1 when the cell is not a spring. Absent means none.
   */
  bounce?: number[];
  /** Top-left cell of the start marker. */
  start: { x: number; y: number };
  finish: { x: number; y: number } | null;
  labels: LevelLabel[];
  /** Objects the level starts with. Their ids are negative so they never clash with placed objects. */
  initialObjects: PlacedObject[];
}

export function parseLevel(def: LevelDefinition): Level {
  const height = def.rows.length;
  const width = def.rows[0]?.length ?? 0;
  if (height === 0 || width === 0) throw new Error(`Level "${def.name}" is empty`);

  const solid: boolean[] = new Array(width * height).fill(false);
  let start: Level["start"] | null = null;
  let finish: Level["finish"] = null;
  const charObjects: Array<{ kind: ObjectKind; x: number; y: number; dir?: Dir }> = [];

  def.rows.forEach((row, y) => {
    if (row.length !== width) {
      throw new Error(`Level "${def.name}": row ${y} has length ${row.length}, expected ${width}`);
    }
    for (let x = 0; x < width; x++) {
      const c = row[x];
      if (c === CellChar.Solid) solid[y * width + x] = true;
      else if (c === CellChar.Start) start = { x, y };
      else if (c === CellChar.Finish) finish = { x, y };
      else if (c !== undefined && OBJECT_CHARS[c]) charObjects.push({ ...OBJECT_CHARS[c]!, x, y });
      else if (c !== CellChar.Empty) {
        throw new Error(`Level "${def.name}": unknown cell "${c}" at (${x}, ${y})`);
      }
    }
  });

  if (!start) throw new Error(`Level "${def.name}" has no start cell "S"`);
  const initialObjects: PlacedObject[] = [...charObjects, ...(def.objects ?? [])].map((o, i) => {
    const obj: PlacedObject = { id: -(i + 1), kind: o.kind, x: o.x, y: o.y };
    if (o.dir !== undefined) obj.dir = o.dir;
    return obj;
  });
  return { name: def.name, width, height, solid, start, finish, labels: def.labels ?? [], initialObjects };
}

// --- Spawn pad -----------------------------------------------------------------------------
//
// Up to five players start each race together. Stacked on the single "S" cell they would all
// overlap (and a trap placed next to S would kill everyone at once), so the start is a pad:
// the S cell, SPAWN_PAD_HALF_WIDTH cells on each side on the same row, and SPAWN_PAD_HEADROOM
// rows above those cells. Each seat (the player's colour index) gets its own cell on the pad.
// The pad sits inside the wider protected start zone (see "Protected zones" below): nothing
// may be placed there (objects.ts, canPlaceAt) and cannon balls break at its edge
// (objects.ts, prepareObjects), so no cannon can fire into it.
//
// Reachability (reachability.ts) stays rooted at S alone: the pad row is flat, empty floor
// with headroom that no object can ever occupy, so every seat can walk to S and S's reach
// is everyone's reach. spawnPadProblems is what guarantees that floor exists.

/** Pad cells on each side of S, on the S row. 2 gives five cells: one per seat. */
export const SPAWN_PAD_HALF_WIDTH = 2;
/** Empty rows required above the pad floor, so a player can stand and jump off any seat. */
export const SPAWN_PAD_HEADROOM = 2;
/**
 * Horizontal offset, in cells from S, of each seat's spawn. Seat 0 keeps S itself (solo,
 * practice and the tutorial use seat 0, so they spawn exactly where they always did); the
 * next seats alternate left and right so a small room stays bunched around S.
 * The body is 0.8 cells wide and centred in its cell, so neighbours stand 0.2 cells apart.
 */
export const SPAWN_SEAT_OFFSETS: readonly number[] = [0, -1, 1, -2, 2];

/** Whether (x, y) is on the spawn pad (floor row or headroom). Cells outside the level never are. */
export function isSpawnPadCell(level: Level, x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
  const { x: sx, y: sy } = level.start;
  return Math.abs(x - sx) <= SPAWN_PAD_HALF_WIDTH && y <= sy && y >= sy - SPAWN_PAD_HEADROOM;
}

/** Every cell of the spawn pad inside the level, as y * width + x. */
export function spawnPadCells(level: Level): number[] {
  const cells: number[] = [];
  const { x: sx, y: sy } = level.start;
  for (let y = sy - SPAWN_PAD_HEADROOM; y <= sy; y++) {
    for (let x = sx - SPAWN_PAD_HALF_WIDTH; x <= sx + SPAWN_PAD_HALF_WIDTH; x++) {
      if (isSpawnPadCell(level, x, y)) cells.push(y * level.width + x);
    }
  }
  return cells;
}

/**
 * Ground a pad cell may stand on: terrain or a map platform. Not a spring (it would bounce
 * players off the pad) nor spikes (a deadly top) or a saw (not solid, and deadly).
 */
function isPadGround(level: Level, x: number, y: number): boolean {
  return isSolidCell(level, x, y) || level.initialObjects.some((o) => o.kind === "platform" && o.x === x && o.y === y);
}

/** Whether a body can spawn in (x, y): inside the level, no terrain or map object there, ground below. */
function isStandingCell(level: Level, x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
  if (isSolidCell(level, x, y) || level.initialObjects.some((o) => o.x === x && o.y === y)) return false;
  return isPadGround(level, x, y + 1);
}

/**
 * The cell a seat (player colour index, 0..4) spawns in. On a level whose pad is broken the
 * seat falls back to S, so a bad map stacks players as before instead of spawning one in a
 * wall or over a pit.
 */
export function spawnCell(level: Level, seat: number): { x: number; y: number } {
  const offset = SPAWN_SEAT_OFFSETS[seat] ?? 0;
  const x = level.start.x + offset;
  const y = level.start.y;
  return isStandingCell(level, x, y) ? { x, y } : { x: level.start.x, y };
}

/**
 * What is wrong with a level's spawn pad, in English for map designers (empty: the pad is
 * good). Checked against the level's terrain and its own objects ("*", "^", ...): every pad
 * floor cell must be empty with solid ground below, and every headroom cell empty.
 */
export function spawnPadProblems(level: Level): string[] {
  const problems: string[] = [];
  const { x: sx, y: sy } = level.start;
  const objectAt = new Set(level.initialObjects.map((o) => o.y * level.width + o.x));
  const what = (x: number, y: number): string | null => {
    if (x < 0 || x >= level.width) return "outside the level";
    if (y < 0) return null; // open sky above the level is fine headroom
    if (isSolidCell(level, x, y)) return "solid";
    if (objectAt.has(y * level.width + x)) return "has a map object";
    if (level.finish && level.finish.x === x && level.finish.y === y) return "is the finish";
    return null;
  };
  for (let x = sx - SPAWN_PAD_HALF_WIDTH; x <= sx + SPAWN_PAD_HALF_WIDTH; x++) {
    const floor = what(x, sy);
    if (floor) {
      problems.push(`pad cell (${x}, ${sy}) ${floor}`);
      continue;
    }
    if (!isPadGround(level, x, sy + 1)) {
      problems.push(`pad cell (${x}, ${sy}) has no solid ground below at (${x}, ${sy + 1})`);
    }
    for (let y = sy - SPAWN_PAD_HEADROOM; y < sy; y++) {
      const head = what(x, y);
      if (head) problems.push(`headroom cell (${x}, ${y}) ${head}`);
    }
  }
  return problems;
}

// --- Protected zones -------------------------------------------------------------------------
//
// Decided 2026-11-26, by Dorian: nobody may place anything (round objects, dead players'
// blocks, practice objects) in a box 7 cells wide and 4 tall around the start, nor near the
// finish. Players also do not touch each other (no stomp, no bump) inside the start zone.
// Cannon balls break at the edge of both zones (objects.ts, prepareObjects), so a cannon
// outside cannot fire into them either.

/** Start zone: cells on each side of S (7 wide in all), and rows from the S row up (4 tall). */
export const SPAWN_ZONE_HALF_WIDTH = 3;
export const SPAWN_ZONE_HEIGHT = 4;
/** Finish zone: cells around F on every side (a 5 by 5 box centred on the flag). */
export const FINISH_ZONE_RADIUS = 2;

/** Whether (x, y) is in the protected start zone. Cells outside the level never are. */
export function isSpawnZoneCell(level: Level, x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
  const { x: sx, y: sy } = level.start;
  return Math.abs(x - sx) <= SPAWN_ZONE_HALF_WIDTH && y <= sy && y > sy - SPAWN_ZONE_HEIGHT;
}

/** Whether (x, y) is in the protected finish zone. Cells outside the level never are. */
export function isFinishZoneCell(level: Level, x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height || !level.finish) return false;
  const { x: fx, y: fy } = level.finish;
  return Math.abs(x - fx) <= FINISH_ZONE_RADIUS && Math.abs(y - fy) <= FINISH_ZONE_RADIUS;
}

/** Whether nothing may ever be placed on (x, y): the start zone (which holds the pad) or the finish zone. */
export function isProtectedCell(level: Level, x: number, y: number): boolean {
  return isSpawnZoneCell(level, x, y) || isFinishZoneCell(level, x, y);
}

/** The start and finish zones as cell rectangles clipped to the level, for drawing them. */
export function protectedZones(level: Level): Array<{ kind: "start" | "finish"; x: number; y: number; w: number; h: number }> {
  const clip = (kind: "start" | "finish", x0: number, y0: number, x1: number, y1: number) => {
    const ax = Math.max(0, x0);
    const ay = Math.max(0, y0);
    const bx = Math.min(level.width - 1, x1);
    const by = Math.min(level.height - 1, y1);
    return { kind, x: ax, y: ay, w: bx - ax + 1, h: by - ay + 1 };
  };
  const { x: sx, y: sy } = level.start;
  const zones = [clip("start", sx - SPAWN_ZONE_HALF_WIDTH, sy - SPAWN_ZONE_HEIGHT + 1, sx + SPAWN_ZONE_HALF_WIDTH, sy)];
  if (level.finish) {
    const { x: fx, y: fy } = level.finish;
    const r = FINISH_ZONE_RADIUS;
    zones.push(clip("finish", fx - r, fy - r, fx + r, fy + r));
  }
  return zones.filter((z) => z.w > 0 && z.h > 0);
}

/**
 * Lag allowance, cells, for the no-contact rule of the start zone. A client sees the others
 * about 100 ms late and the server sees poses up to 50 ms old, so near the edge they could
 * disagree on who is inside. Clients test with the body grown by this much (they stay out of
 * contacts a little longer), the server with the body shrunk by it (it refuses a stomp only
 * when the body is clearly inside): a stomp a client sends is never one the server drops.
 */
export const SPAWN_CONTACT_MARGIN = 0.5;

/**
 * Whether a body box (cells, top-left corner) overlaps the start zone: players don't touch
 * each other there. `margin` grows the box on every side (negative shrinks it, down to its
 * centre).
 */
export function bodyInSpawnZone(level: Level, x: number, y: number, w: number, h: number, margin = 0): boolean {
  const bw = Math.max(0.01, w + 2 * margin);
  const bh = Math.max(0.01, h + 2 * margin);
  const [x0, x1] = cellSpan(x + (w - bw) / 2, bw);
  const [y0, y1] = cellSpan(y + (h - bh) / 2, bh);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) if (isSpawnZoneCell(level, cx, cy)) return true;
  }
  return false;
}

/** Direction the spring at (cx, cy) bounces towards, or null when the cell is not a spring. */
export function bounceDirAt(level: Level, cx: number, cy: number): 0 | 1 | 2 | 3 | null {
  if (!level.bounce || cx < 0 || cx >= level.width || cy < 0 || cy >= level.height) return null;
  const d = level.bounce[cy * level.width + cx];
  return d === 0 || d === 1 || d === 2 || d === 3 ? d : null;
}

/** Whether landing on the cell at (cx, cy) bounces (a spring facing up). */
export function isBouncyCell(level: Level, cx: number, cy: number): boolean {
  return bounceDirAt(level, cx, cy) === 3;
}

/**
 * Whether the cell at (cx, cy) blocks movement.
 * Outside the level: the left and right edges are walls, above the level is open sky,
 * below the level is an open pit (falling out of the level kills).
 */

export function isSolidCell(level: Level, cx: number, cy: number): boolean {
  if (cx < 0 || cx >= level.width) return true;
  if (cy < 0 || cy >= level.height) return false;
  return level.solid[cy * level.width + cx] === true;
}

/** Tolerance used so that a box exactly touching a cell edge does not count as overlapping it. */
const EDGE_EPSILON = 1e-6;

/** First and last cell index covered by the span [min, min + size). */
export function cellSpan(min: number, size: number): [number, number] {
  return [Math.floor(min + EDGE_EPSILON), Math.ceil(min + size - EDGE_EPSILON) - 1];
}

/** Whether an axis-aligned box (in cells) overlaps any solid cell. */
export function boxOverlapsSolid(level: Level, x: number, y: number, w: number, h: number): boolean {
  const [x0, x1] = cellSpan(x, w);
  const [y0, y1] = cellSpan(y, h);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (isSolidCell(level, cx, cy)) return true;
    }
  }
  return false;
}
