/**
 * Objects players place in the level.
 *
 * Network rule (see HANDOFF.md): objects are never synchronised. Everything about an
 * object at a given moment must be a pure function of its placement and of the round
 * clock (seconds since the round started), so every client computes the same thing.
 * Never accumulate object state frame by frame.
 *
 * First batch (build steps 2 and 5): saw, spikes, platform, cannon, spring, vine.
 *
 * Decided 2026-11-26, by Dorian: spikes and springs can be turned (R) and placed on walls and
 * ceilings. Spikes are a solid block that only kills through its pointed face, and must be
 * placed against a block (terrain or a solid object).
 */
import { cellSpan, isProtectedCell, isSolidCell, type Level } from "./level";

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
  /** Has a direction the player chooses when placing it (R or right click). */
  rotatable: boolean;
  /** Must be placed against a block: the cell behind it (opposite its direction) must be solid. */
  needsSupport: boolean;
}

export const OBJECT_DEFS: Record<ObjectKind, ObjectDef> = {
  saw: { kind: "saw", family: "kill", name: "Scie", hint: "Tue au contact", solid: false, rotatable: false, needsSupport: false },
  spikes: {
    kind: "spikes",
    family: "kill",
    name: "Pics",
    hint: "Tue qui touche les pointes · contre un bloc",
    solid: true,
    rotatable: true,
    needsSupport: true,
  },
  cannon: { kind: "cannon", family: "kill", name: "Canon", hint: "Tire un boulet toutes les 2 s", solid: true, rotatable: true, needsSupport: false },
  spring: { kind: "spring", family: "help", name: "Ressort", hint: "Fait rebondir très loin", solid: true, rotatable: true, needsSupport: false },
  vine: {
    kind: "vine",
    family: "help",
    name: "Liane",
    hint: "S'y accrocher · Saut pour sauter, S ou ↓ pour lâcher",
    solid: true,
    rotatable: false,
    needsSupport: false,
  },
  platform: { kind: "platform", family: "neutral", name: "Plateforme", hint: "Un bloc solide", solid: true, rotatable: false, needsSupport: false },
};

export const OBJECT_KINDS = Object.keys(OBJECT_DEFS) as ObjectKind[];

/**
 * What a player can be dealt in the draw: an object to place, or the eraser, which removes
 * an object another player placed in an earlier round. Rare (see GameConfig.eraserChance).
 */
export type CardKind = ObjectKind | "eraser";

export const ERASER_DEF = { name: "Gomme", family: "neutral", hint: "Enlève un objet d'un autre joueur" } as const;

/** Name, colour family and description shown on a card. */
export function cardInfo(kind: CardKind): { name: string; family: ObjectFamily; hint: string } {
  return kind === "eraser" ? ERASER_DEF : OBJECT_DEFS[kind];
}

/** An object in the level, occupying the cell (x, y). */
export interface PlacedObject {
  id: number;
  kind: ObjectKind;
  x: number;
  y: number;
  /** Player who placed it; absent for objects that are part of a hand-made level. */
  ownerId?: string;
  /**
   * Rotatable objects only: where it points (see defaultDir when absent). Cannon: where it
   * fires. Spikes: where the points face. Spring: where it throws the player.
   */
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
/**
 * Spikes are a solid block that kills through its pointed face only: the deadly zone is a
 * strip this deep outside that face, cells. A body touching the face (the trap test body is
 * HAZARD_INSET smaller than the real one) is in it; a body touching another face is not.
 */
export const SPIKES_REACH = 0.13;
/** Visual height of the teeth, as a share of the cell (the base fills the rest). */
export const SPIKES_HEIGHT = 0.62;

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

/** Direction a rotatable object gets when none is given: cannons face left, spikes and springs up. */
export function defaultDir(kind: ObjectKind): Dir {
  return kind === "cannon" ? 2 : 3;
}

export function dirOf(obj: PlacedObject): Dir {
  return obj.dir ?? defaultDir(obj.kind);
}

/** Shapes that kill, in cells. */
export type Hazard =
  | { shape: "circle"; cx: number; cy: number; r: number }
  /**
   * face: the rect is the deadly strip outside a spikes face pointing that way; it kills only
   * a body that is not moving away from the face (landing on upward spikes, running or
   * jumping into sideways ones). Absent: kills whatever the body does.
   */
  | { shape: "rect"; x: number; y: number; w: number; h: number; face?: Dir };

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
      return [spikesStrip(obj)];
    case "cannon":
      return cannonBalls(obj, t).map((b) => ({ shape: "circle", cx: b.x, cy: b.y, r: CANNON_BALL_RADIUS }));
    case "platform":
    case "spring":
    case "vine":
      return [];
  }
}

/** The deadly strip outside the pointed face of spikes. */
function spikesStrip(obj: PlacedObject): Hazard {
  const face = dirOf(obj);
  const r = SPIKES_REACH;
  switch (face) {
    case 0:
      return { shape: "rect", x: obj.x + 1, y: obj.y, w: r, h: 1, face };
    case 1:
      return { shape: "rect", x: obj.x, y: obj.y + 1, w: 1, h: r, face };
    case 2:
      return { shape: "rect", x: obj.x - r, y: obj.y, w: r, h: 1, face };
    case 3:
      return { shape: "rect", x: obj.x, y: obj.y - r, w: 1, h: r, face };
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
      return [{ shape: "rect", x: obj.x + 1, y: cy - r, w: range, h: 2 * r, }];
    case 2:
      return [{ shape: "rect", x: obj.x - range, y: cy - r, w: range, h: 2 * r, }];
    case 1:
      return [{ shape: "rect", x: cx - r, y: obj.y + 1, w: 2 * r, h: range, }];
    case 3:
      return [{ shape: "rect", x: cx - r, y: obj.y - range, w: 2 * r, h: range, }];
  }
}

/**
 * Cells an object occupies or makes deadly (y * width + x): its own cell, plus a cannon's
 * line of fire, plus the cell in front of spikes (their deadly strip lies there). Used to
 * prune paths quickly when the object is placed, so it must cover every deadly zone.
 */
export function footprintCells(obj: PlacedObject, width: number): number[] {
  const cells = [obj.y * width + obj.x];
  if (obj.kind === "spikes") {
    const { dx, dy } = DIR_VECTORS[dirOf(obj)];
    const fx = obj.x + dx;
    const fy = obj.y + dy;
    if (fx >= 0 && fx < width && fy >= 0) cells.push(fy * width + fx);
  }
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

/**
 * Whether a body box touches a hazard. `vy` and `vx` are the body's speed (negative = up,
 * left); spikes only kill a body that is not moving away from their pointed face.
 */
export function boxHitsHazard(box: Box, hz: Hazard, vy: number, vx = 0): boolean {
  if (hz.shape === "circle") {
    const nx = Math.max(box.x, Math.min(hz.cx, box.x + box.w));
    const ny = Math.max(box.y, Math.min(hz.cy, box.y + box.h));
    const dx = hz.cx - nx;
    const dy = hz.cy - ny;
    return dx * dx + dy * dy < hz.r * hz.r;
  }
  if (hz.face !== undefined) {
    const { dx, dy } = DIR_VECTORS[hz.face];
    // Moving away from the face (the speed has a component along where the points face).
    if (dx * vx + dy * vy > 0) return false;
  }
  return box.x < hz.x + hz.w && box.x + box.w > hz.x && box.y < hz.y + hz.h && box.y + box.h > hz.y;
}

/** Who is dying and who pushed them, so findKiller can credit the right trap when several touch. */
export interface KillerPrefs {
  victimId?: string | null;
  /** Players who recently pushed the victim (see TIMING.pushCredit). */
  pusherIds?: readonly string[];
}

/**
 * The object that kills a body touching hazards at round time `t`, or null. When several
 * touch in the same step: a trap of a recent pusher, then a trap of any other player, then
 * map objects and the victim's own traps; within a rank the hazard whose centre is closest
 * to the body's centre, then the newest object (highest id).
 */
export function findKiller(
  objects: readonly PlacedObject[],
  box: Box,
  vy: number,
  t: number,
  prefs: KillerPrefs = {},
  /** Horizontal speed of the body: sideways spikes spare a body moving away from them. */
  vx = 0,
): PlacedObject | null {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let best: PlacedObject | null = null;
  let bestRank = Infinity;
  let bestDist = Infinity;
  for (const obj of objects) {
    for (const hz of hazardsOf(obj, t)) {
      if (!boxHitsHazard(box, hz, vy, vx)) continue;
      const o = obj.ownerId;
      const rank = o && o !== prefs.victimId ? (prefs.pusherIds?.includes(o) ? 0 : 1) : 2;
      const hx = hz.shape === "circle" ? hz.cx : hz.x + hz.w / 2;
      const hy = hz.shape === "circle" ? hz.cy : hz.y + hz.h / 2;
      const d = (hx - cx) ** 2 + (hy - cy) ** 2;
      const better =
        rank < bestRank || (rank === bestRank && (d < bestDist || (d === bestDist && obj.id > best!.id)));
      if (better) {
        best = obj;
        bestRank = rank;
        bestDist = d;
      }
    }
  }
  return best;
}

/**
 * A copy of the level where solid objects (platforms, cannons, spikes, springs, vine anchors)
 * are part of the terrain. Spring cells also record which way they bounce.
 */
export function withSolidObjects(level: Level, objects: readonly PlacedObject[]): Level {
  const solid = level.solid.slice();
  const bounce = level.bounce ? level.bounce.slice() : new Array<number>(solid.length).fill(-1);
  for (const obj of objects) {
    if (!OBJECT_DEFS[obj.kind].solid) continue;
    if (obj.x < 0 || obj.x >= level.width || obj.y < 0 || obj.y >= level.height) continue;
    solid[obj.y * level.width + obj.x] = true;
    if (obj.kind === "spring") bounce[obj.y * level.width + obj.x] = dirOf(obj);
  }
  return { ...level, solid, bounce };
}

/**
 * Number of free cells from (x, y) going (dx, dy), stopping at the first solid cell or after
 * `max`. With `stopAtZones`, the protected start and finish zones stop it too.
 */
function freeRun(collision: Level, x: number, y: number, dx: number, dy: number, max: number, stopAtZones = false): number {
  let n = 0;
  for (let cx = x + dx, cy = y + dy; n < max; cx += dx, cy += dy) {
    // The left and right edges are walls; above and below the level, shots fly on to the cap.
    if (cx < 0 || cx >= collision.width) break;
    if (cy >= 0 && cy < collision.height && collision.solid[cy * collision.width + cx]) break;
    if (stopAtZones && isProtectedCell(collision, cx, cy)) break;
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
      // Balls break on the edge of the protected zones. The start zone is where the players
      // start: a cannon aimed into it would shell a seat from the very start of every race,
      // for the rest of the game. The finish zone is kept free so the flag can't be walled
      // off by a line of fire either (decided 2026-11-26).
      return { ...o, dir: dirOf(o), range: freeRun(collision, o.x, o.y, dx, dy, CANNON_MAX_RANGE, true) };
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
 * Basic placement rule: inside the level, on an empty cell, outside the protected start and
 * finish zones (see level.ts), not on another object. The "finish must stay reachable" check
 * is in reachability.ts; objects that must lean on a block are checked by canPlaceObject.
 * Every placement goes through here (round placement, its preview, dead players' blocks,
 * practice mode), which is what keeps both zones free for the whole game.
 */
export function canPlaceAt(level: Level, objects: readonly PlacedObject[], x: number, y: number): boolean {
  return placementProblem(level, objects, x, y) === null;
}

/** Why nothing can go on (x, y) (see canPlaceAt), or null when the cell is free. */
export type PlacementProblem = "outside" | "terrain" | "protected" | "taken" | "support";

export function placementProblem(
  level: Level,
  objects: readonly PlacedObject[],
  x: number,
  y: number,
): Exclude<PlacementProblem, "support"> | null {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return "outside";
  if (level.solid[y * level.width + x]) return "terrain";
  if (isProtectedCell(level, x, y)) return "protected";
  if (level.finish && x === level.finish.x && y === level.finish.y) return "protected";
  return objects.some((o) => o.x === x && o.y === y) ? "taken" : null;
}

/** The cell an object of this kind and direction leans on: the one behind it, opposite its direction. */
export function supportCell(x: number, y: number, dir: Dir): { x: number; y: number } {
  const { dx, dy } = DIR_VECTORS[dir];
  return { x: x - dx, y: y - dy };
}

/** Whether (x, y) is a block something can lean on: terrain (the level's sides count) or a solid object. */
export function isSupportCell(level: Level, objects: readonly PlacedObject[], x: number, y: number): boolean {
  if (y < 0 || y >= level.height) return false; // open sky above, the pit below
  if (isSolidCell(level, x, y)) return true;
  return objects.some((o) => o.x === x && o.y === y && OBJECT_DEFS[o.kind].solid);
}

/**
 * The full placement rule for one object: canPlaceAt, plus a block behind objects that need
 * one (spikes can't float in mid-air, decided 2026-11-26). `candidate.dir` absent means its
 * kind's default direction.
 */
export function objectPlacementProblem(
  level: Level,
  objects: readonly PlacedObject[],
  candidate: Pick<PlacedObject, "kind" | "x" | "y" | "dir">,
): PlacementProblem | null {
  const problem = placementProblem(level, objects, candidate.x, candidate.y);
  if (problem) return problem;
  if (!OBJECT_DEFS[candidate.kind].needsSupport) return null;
  const s = supportCell(candidate.x, candidate.y, candidate.dir ?? defaultDir(candidate.kind));
  return isSupportCell(level, objects, s.x, s.y) ? null : "support";
}

export function canPlaceObject(
  level: Level,
  objects: readonly PlacedObject[],
  candidate: Pick<PlacedObject, "kind" | "x" | "y" | "dir">,
): boolean {
  return objectPlacementProblem(level, objects, candidate) === null;
}

/**
 * The order a hand is applied in: objects that need a block behind them go last, so they can
 * lean on another object of the same hand. Stable otherwise. The session and the client's
 * preview both use it, so they agree on what is accepted.
 */
export function supportFirst<T extends { kind: CardKind }>(hand: readonly T[]): T[] {
  const leans = (k: CardKind) => k !== "eraser" && OBJECT_DEFS[k].needsSupport;
  return [...hand.filter((c) => !leans(c.kind)), ...hand.filter((c) => leans(c.kind))];
}

/** Objects that lean on the object `target` (spikes placed against it). */
export function objectsLeaningOn(objects: readonly PlacedObject[], target: PlacedObject): PlacedObject[] {
  return objects.filter((o) => {
    if (o === target || !OBJECT_DEFS[o.kind].needsSupport) return false;
    const s = supportCell(o.x, o.y, dirOf(o));
    return s.x === target.x && s.y === target.y;
  });
}

/**
 * The object `playerId` may erase at (x, y), or null with the reason (in French, shown to
 * the player). Only objects placed by other players: not the level's own, not your own.
 * Whether erasing keeps a path to the finish is checked separately (erasureKeepsPath).
 */
export function erasableAt(
  objects: readonly PlacedObject[],
  x: number,
  y: number,
  playerId: string,
): { target: PlacedObject; reason: null } | { target: null; reason: string } {
  const target = objects.find((o) => o.x === x && o.y === y);
  if (!target) return { target: null, reason: "Rien à gommer ici" };
  if (target.ownerId === undefined) return { target: null, reason: "Fait partie du niveau" };
  if (target.ownerId === playerId) return { target: null, reason: "C'est ton objet" };
  // Spikes lean on it: they would be left floating in mid-air.
  if (objectsLeaningOn(objects, target).length > 0) return { target: null, reason: "Des pics sont posés dessus" };
  return { target, reason: null };
}

/** Whether a player has anything to erase, so the eraser is only dealt when it is useful. */
export function hasErasable(objects: readonly PlacedObject[], playerId: string): boolean {
  return objects.some((o) => o.ownerId !== undefined && o.ownerId !== playerId && erasableAt(objects, o.x, o.y, playerId).target);
}
