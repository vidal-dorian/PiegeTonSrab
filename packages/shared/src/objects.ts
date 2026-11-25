/**
 * Objects players place in the level.
 *
 * Network rule (see HANDOFF.md): objects are never synchronised. Everything about an
 * object at a given moment must be a pure function of its placement and of the round
 * clock (seconds since the round started), so every client computes the same thing.
 * Never accumulate object state frame by frame.
 *
 * First batch (build steps 2 and 5): saw, spikes, platform, cannon, spring, vine.
 */
import { cellSpan, type Level } from "./level";

export type ObjectKind = "saw" | "spikes" | "platform" | "cannon" | "spring" | "vine";

/** Colour family; the colour tells the player what an object does. */
export type ObjectFamily = "kill" | "help" | "neutral";

/** Direction of a rotatable object: 0 right, 1 down, 2 left, 3 up. */
export type Dir = 0 | 1 | 2 | 3;
export const DIR_VECTORS: Record<Dir, { dx: number; dy: number }> = {
  0: { dx: 1, dy: 0 },
  1: { dx: 0, dy: 1 },
  2: { dx: -1, dy: 0 },
  3: { dx: 0, dy: -1 },
};

export interface ObjectDef {
  kind: ObjectKind;
  family: ObjectFamily;
  /** In-game name, French. */
  name: string;
  /** Short French description, shown on the placement cards. */
  hint: string;
  /** Blocks movement like level terrain. */
  solid: boolean;
  /** Has a direction the player chooses when placing it. */
  rotatable: boolean;
}

export const OBJECT_DEFS: Record<ObjectKind, ObjectDef> = {
  saw: { kind: "saw", family: "kill", name: "Scie", hint: "Tue au contact", solid: false, rotatable: false },
  spikes: { kind: "spikes", family: "kill", name: "Pics", hint: "Tue qui atterrit dessus", solid: false, rotatable: false },
  cannon: { kind: "cannon", family: "kill", name: "Canon", hint: "Tire un boulet toutes les 2 s", solid: true, rotatable: true },
  spring: { kind: "spring", family: "help", name: "Ressort", hint: "Fait rebondir très haut", solid: true, rotatable: false },
  vine: { kind: "vine", family: "help", name: "Liane", hint: "S'y accrocher, Saut pour lâcher", solid: true, rotatable: false },
  platform: { kind: "platform", family: "neutral", name: "Plateforme", hint: "Un bloc solide", solid: true, rotatable: false },
};

export const OBJECT_KINDS = Object.keys(OBJECT_DEFS) as ObjectKind[];

/** An object in the level, occupying the cell (x, y). */
export interface PlacedObject {
  id: number;
  kind: ObjectKind;
  x: number;
  y: number;
  /** Player who placed it; absent for objects that are part of a hand-made level. */
  ownerId?: string;
  /** Rotatable objects only (cannon): where it points. Defaults to left. */
  dir?: Dir;
  /**
   * Computed by `prepareObjects`, never chosen by a player. Cannon: free cells in front of
   * it, which is how far its balls fly. Vine: free cells below the anchor, the rope length.
   */
  range?: number;
}

/** Saw: a disc centred in its cell. Visual radius, in cells. */
export const SAW_RADIUS = 0.45;
/** Saw spin, turns per second (visual only). */
export const SAW_SPIN = 1.5;
/** Spikes fill the bottom part of their cell: this is their height, in cells. */
export const SPIKES_HEIGHT = 0.45;

/** Cannon: seconds between two shots, ball speed (cells/s), ball radius and longest shot (cells). */
export const CANNON_PERIOD = 2;
export const CANNON_BALL_SPEED = 7;
export const CANNON_BALL_RADIUS = 0.28;
export const CANNON_MAX_RANGE = 40;
/** First shot after this long, so the countdown never ends on a ball already in flight. */
const CANNON_FIRST_SHOT = 0.6;

/** Vine: longest rope, in cells below the anchor block. */
export const VINE_MAX_CELLS = 4;
/** Half-width of the zone around the rope where a player grabs it, cells. */
export const VINE_GRAB_HALF_WIDTH = 0.4;

export function dirOf(obj: PlacedObject): Dir {
  return obj.dir ?? 2;
}

/** Shapes that kill, in cells. */
export type Hazard =
  | { shape: "circle"; cx: number; cy: number; r: number }
  /** onlyWhenFalling: kills only a body that is not moving up (spikes kill when you land on them). */
  | { shape: "rect"; x: number; y: number; w: number; h: number; onlyWhenFalling: boolean };

/**
 * When the cannon fires its shots: the first at `firstShot`, then every CANNON_PERIOD.
 * Cannons are out of step with each other (by id) so a row of cannons does not fire as one wall.
 */
export function cannonFirstShot(obj: PlacedObject): number {
  const golden = (Math.abs(obj.id) * 0.618034) % 1;
  return CANNON_FIRST_SHOT + golden * CANNON_PERIOD;
}

/** Centres of the cannon balls in flight at round time `t`. */
export function cannonBalls(obj: PlacedObject, t: number): Array<{ x: number; y: number }> {
  if (obj.kind !== "cannon") return [];
  const range = obj.range ?? 0;
  if (range <= 0 || t < 0) return [];
  const { dx, dy } = DIR_VECTORS[dirOf(obj)];
  // The ball leaves from the cannon's mouth (edge of its cell) and breaks on the face of the
  // first solid cell, range cells further.
  const travel = range - CANNON_BALL_RADIUS;
  const flight = travel / CANNON_BALL_SPEED;
  const first = cannonFirstShot(obj);
  const balls: Array<{ x: number; y: number }> = [];
  if (t < first) return balls;
  const lastShot = Math.floor((t - first) / CANNON_PERIOD);
  for (let k = lastShot; k >= 0; k--) {
    const age = t - (first + k * CANNON_PERIOD);
    if (age > flight) break;
    const d = 0.5 + age * CANNON_BALL_SPEED;
    balls.push({ x: obj.x + 0.5 + dx * d, y: obj.y + 0.5 + dy * d });
  }
  return balls;
}

/** Seconds since the cannon last fired at round time `t` (Infinity before the first shot). Visual recoil. */
export function cannonSinceShot(obj: PlacedObject, t: number): number {
  const first = cannonFirstShot(obj);
  if (t < first) return Infinity;
  return (t - first) % CANNON_PERIOD;
}

/** What an object kills with at round time `t` (seconds). Empty for harmless objects. */
export function hazardsOf(obj: PlacedObject, t: number): Hazard[] {
  switch (obj.kind) {
    case "saw":
      return [{ shape: "circle", cx: obj.x + 0.5, cy: obj.y + 0.5, r: SAW_RADIUS }];
    case "spikes":
      return [
        { shape: "rect", x: obj.x, y: obj.y + 1 - SPIKES_HEIGHT, w: 1, h: SPIKES_HEIGHT, onlyWhenFalling: true },
      ];
    case "cannon":
      return cannonBalls(obj, t).map((b) => ({ shape: "circle", cx: b.x, cy: b.y, r: CANNON_BALL_RADIUS }));
    case "platform":
    case "spring":
    case "vine":
      return [];
  }
}

/**
 * Everything an object can ever kill with, whatever the time: used by the "finish still
 * reachable" check, which must not depend on timing. A cannon's whole line of fire counts.
 */
export function staticHazards(obj: PlacedObject): Hazard[] {
  if (obj.kind !== "cannon") return hazardsOf(obj, 0);
  const range = obj.range ?? 0;
  if (range <= 0) return [];
  const r = CANNON_BALL_RADIUS;
  const cx = obj.x + 0.5;
  const cy = obj.y + 0.5;
  switch (dirOf(obj)) {
    case 0:
      return [{ shape: "rect", x: obj.x + 1, y: cy - r, w: range, h: 2 * r, onlyWhenFalling: false }];
    case 2:
      return [{ shape: "rect", x: obj.x - range, y: cy - r, w: range, h: 2 * r, onlyWhenFalling: false }];
    case 1:
      return [{ shape: "rect", x: cx - r, y: obj.y + 1, w: 2 * r, h: range, onlyWhenFalling: false }];
    case 3:
      return [{ shape: "rect", x: cx - r, y: obj.y - range, w: 2 * r, h: range, onlyWhenFalling: false }];
  }
}

/**
 * Cells an object occupies or makes deadly (y * width + x): its own cell, plus a cannon's
 * line of fire. Used to prune paths quickly when the object is placed.
 */
export function footprintCells(obj: PlacedObject, width: number): number[] {
  const cells = [obj.y * width + obj.x];
  if (obj.kind === "cannon") {
    for (const hz of staticHazards(obj)) {
      if (hz.shape !== "rect") continue;
      const [x0, x1] = cellSpan(hz.x, hz.w);
      const [y0, y1] = cellSpan(hz.y, hz.h);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push(y * width + x);
    }
  }
  return cells;
}

/** Saw rotation at round time `t`, radians. Deterministic so every client draws the same angle. */
export function sawAngle(t: number): number {
  return t * SAW_SPIN * Math.PI * 2;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whether a body box touches a hazard. `vy` is the body's vertical speed (negative = up). */
export function boxHitsHazard(box: Box, hz: Hazard, vy: number): boolean {
  if (hz.shape === "circle") {
    const nx = Math.max(box.x, Math.min(hz.cx, box.x + box.w));
    const ny = Math.max(box.y, Math.min(hz.cy, box.y + box.h));
    const dx = hz.cx - nx;
    const dy = hz.cy - ny;
    return dx * dx + dy * dy < hz.r * hz.r;
  }
  if (hz.onlyWhenFalling && vy < 0) return false;
  return box.x < hz.x + hz.w && box.x + box.w > hz.x && box.y < hz.y + hz.h && box.y + box.h > hz.y;
}

/** The first object whose hazards touch the box at round time `t`, or null. */
export function findKiller(objects: readonly PlacedObject[], box: Box, vy: number, t: number): PlacedObject | null {
  for (const obj of objects) {
    for (const hz of hazardsOf(obj, t)) {
      if (boxHitsHazard(box, hz, vy)) return obj;
    }
  }
  return null;
}

/**
 * A copy of the level where solid objects (platforms, cannons, springs, vine anchors) are
 * part of the terrain. Spring cells are also marked bouncy.
 */
export function withSolidObjects(level: Level, objects: readonly PlacedObject[]): Level {
  const solid = level.solid.slice();
  const bounce = level.bounce ? level.bounce.slice() : new Array<boolean>(solid.length).fill(false);
  for (const obj of objects) {
    if (!OBJECT_DEFS[obj.kind].solid) continue;
    if (obj.x < 0 || obj.x >= level.width || obj.y < 0 || obj.y >= level.height) continue;
    solid[obj.y * level.width + obj.x] = true;
    if (obj.kind === "spring") bounce[obj.y * level.width + obj.x] = true;
  }
  return { ...level, solid, bounce };
}

/** Number of free cells from (x, y) going (dx, dy), stopping at the first solid cell or after `max`. */
function freeRun(collision: Level, x: number, y: number, dx: number, dy: number, max: number): number {
  let n = 0;
  for (let cx = x + dx, cy = y + dy; n < max; cx += dx, cy += dy) {
    // The left and right edges are walls; above and below the level, shots fly on to the cap.
    if (cx < 0 || cx >= collision.width) break;
    if (cy >= 0 && cy < collision.height && collision.solid[cy * collision.width + cx]) break;
    n++;
  }
  return n;
}

/**
 * Copies of `objects` with their computed fields filled in (cannon range, vine length),
 * measured against the level with every solid object in it. Call it whenever the list of
 * objects changes; it is cheap.
 */
export function prepareObjects(level: Level, objects: readonly PlacedObject[]): PlacedObject[] {
  const collision = withSolidObjects(level, objects);
  return objects.map((o) => {
    if (o.kind === "cannon") {
      const { dx, dy } = DIR_VECTORS[dirOf(o)];
      return { ...o, dir: dirOf(o), range: freeRun(collision, o.x, o.y, dx, dy, CANNON_MAX_RANGE) };
    }
    if (o.kind === "vine") return { ...o, range: freeRun(collision, o.x, o.y, 0, 1, VINE_MAX_CELLS) };
    return o;
  });
}

/**
 * Longest rope a body can hang from: the body's centre is at the end of the rope, so the rope
 * stops half a cell (a body half-height plus a margin) above the first solid cell below.
 * A vine with a single free cell below has no usable rope.
 */
export function vineRopeLength(range: number): number {
  return range - 0.5;
}
const VINE_MIN_ROPE = 0.8;

/** A vine as the character sees it: the rope hangs from (ax, ay) and is `length` cells long. */
export interface Vine {
  id: number;
  ax: number;
  ay: number;
  length: number;
}

/** The vines among `objects` that have a rope (a vine with no free cell below has none). */
export function vinesOf(objects: readonly PlacedObject[]): Vine[] {
  const vines: Vine[] = [];
  for (const o of objects) {
    if (o.kind !== "vine" || !o.range) continue;
    const length = vineRopeLength(o.range);
    if (length < VINE_MIN_ROPE) continue;
    vines.push({ id: o.id, ax: o.x + 0.5, ay: o.y + 1, length });
  }
  return vines;
}

/**
 * Basic placement rule: inside the level, on an empty cell, not on the start or the finish,
 * not on another object. The "finish must stay reachable" check is in reachability.ts.
 */
export function canPlaceAt(level: Level, objects: readonly PlacedObject[], x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
  if (level.solid[y * level.width + x]) return false;
  if (x === level.start.x && y === level.start.y) return false;
  if (level.finish && x === level.finish.x && y === level.finish.y) return false;
  return !objects.some((o) => o.x === x && o.y === y);
}
