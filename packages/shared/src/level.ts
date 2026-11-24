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
  /** Cells that bounce a character landing on them (springs). Absent means none. */
  bounce?: boolean[];
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

/**
 * Whether the cell at (cx, cy) blocks movement.
 * Outside the level: the left and right edges are walls, above the level is open sky,
 * below the level is an open pit (falling out of the level kills).
 */
/** Whether landing on the cell at (cx, cy) bounces (a spring). */
export function isBouncyCell(level: Level, cx: number, cy: number): boolean {
  if (!level.bounce || cx < 0 || cx >= level.width || cy < 0 || cy >= level.height) return false;
  return level.bounce[cy * level.width + cx] === true;
}

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
