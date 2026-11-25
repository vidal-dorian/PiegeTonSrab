/**
 * Co-op level format.
 *
 * A level is written like a race map: one string per row, the same terrain characters
 * ("#" solid, "." empty) and the race's level-object characters ("^" floor spikes, "*" saw,
 * "T" spring). On top of that:
 *
 * - "S" is the leftmost spawn cell: the players spawn side by side to its right, in rope order
 *   (Ruben, always last in the chain, on the right), so the rope never starts crossed. There must
 *   be floor under the 5 cells S..S+4 and room above them.
 * - "K" is Ruben's USB key (at most one), "D" the door (its cells form its box, usually 1 x 2).
 * - "|" is a crate stop: empty for players, a wall for crates.
 * - "%" is glass: solid, drawn as a window (you see the key behind it).
 * - "~" is the bottom of a deadly pit: touching it kills (the level restarts).
 * - Every other character is looked up in the level's `legend`: the cells of one character form
 *   one thing (a plate, a gate, a crate, a seesaw...), whose box is their bounding box.
 * - `cells` gives characters that depend on the team size: { "1": { "2": "#", "3+": "." } } is a
 *   wall with 2 players and empty with 3 or more. A legend thing can also have `players`.
 * - Levels may be taller than one screen (deep catch pits): the group camera scrolls vertically.
 *   A body dies when it falls below the level.
 * - The top row must be solid (catapults and towers must not leave the level).
 */
import { isSolidCell, parseLevel, type Level, type LevelLabel } from "../level";
import { OBJECT_DEFS, prepareObjects, withSolidObjects, type PlacedObject } from "../objects";
import { COOP } from "./coopTuning";

/**
 * A weight: a number of "friends" (a friend weighs 1, Ruben 2), or the team's whole weight W
 * (everyone on it) minus some. With 4 players W is 5: three friends and Ruben.
 */
export type WeightSpec = number | "W" | "W-1" | "W-2";

/** Team sizes a cell or a thing applies to: "2", "3+", "4-5", "2-3"... */
export type PlayersSpec = string;

export type SpikeDir = "up" | "down" | "left" | "right";

export type ThingDef =
  /** A floor plate (its cells replace the floor): active while it carries `need` (exactly, with `exact`). */
  | { kind: "plate"; need: WeightSpec; exact?: boolean; link: string; players?: PlayersSpec }
  /** A gate: solid unless its link is on (inverted: the other way round). Never closes on anyone. */
  | { kind: "gate"; link: string; inverted?: boolean; players?: PlayersSpec }
  /**
   * A crate: needs pushers of total strength `need` in a row (a friend pushes 1, Ruben 2); weighs
   * `weight` (default: its need). Falls, can be stood on, comes back home when it leaves the level.
   */
  | { kind: "crate"; need: WeightSpec; weight?: WeightSpec; label?: string; players?: PlayersSpec }
  /**
   * A seesaw: its cells are the plank at rest (one row, odd width >= 3, the middle cell is the
   * pivot). The heavier side goes down; a fall of COOP_PROPS.catapultFall or more onto the raised
   * side throws whoever is on the other side up.
   */
  | { kind: "seesaw"; travel?: number; players?: PlayersSpec }
  /**
   * One pan of a balance (two pans share a `balance` id, left and right by position): the heavier
   * pan goes down, `step` cells per unit of weight difference, at most `travel`.
   */
  | { kind: "pan"; balance: string; travel?: number; step?: number; players?: PlayersSpec }
  /**
   * A moving platform (one-way: jump through it from below). Moves between its cells and its cells
   * + (dx, dy): on the clock (`period` seconds for a return trip), or while `link` is on / while it
   * carries `need`, at `speed` cells/s. With `arc`, it swings like a lamp from the pivot cell.
   */
  | {
      kind: "mover";
      dx?: number;
      dy?: number;
      period?: number;
      /** Offset in the cycle, 0..1 (two platforms out of step). */
      phase?: number;
      link?: string;
      need?: WeightSpec;
      speed?: number;
      arc?: { px: number; py: number; degrees: number; period: number; phase?: number };
      players?: PlayersSpec;
    }
  /** A switch block: hitting it from below swaps the A and B shelves. */
  | { kind: "switch"; players?: PlayersSpec }
  /** A shelf: solid while its group is the active one (A at the start). A cell turns solid only once free. */
  | { kind: "shelf"; group: "A" | "B"; players?: PlayersSpec }
  /**
   * A "Claude" terminal: ↓ in front of it sets `link` on (or off). Ruben's prompts do the
   * opposite. Terminals with the same `together` act only if all are used within a second.
   */
  | { kind: "terminal"; prompt: string; link: string; set: "on" | "off"; together?: string; players?: PlayersSpec }
  /** A fragile floor: breaks under a weight of 2 or more (Ruben), back at the restart. */
  | { kind: "fragile"; players?: PlayersSpec }
  /** Spikes pointing `dir` (the race's "^" are floor spikes): touching them kills. */
  | { kind: "spikes"; dir: SpikeDir; players?: PlayersSpec }
  /** Solid terrain only with some team sizes (same as `cells`, but drawn as a dashed block). */
  | { kind: "wall"; players?: PlayersSpec };

export type ThingKind = ThingDef["kind"];

export interface CoopLevelDef {
  /** Stable id ("coop01"): progress and tests refer to it. */
  id: string;
  /** Name shown on the level card ("La Rentrée"). */
  name: string;
  /** Ruben's line on the level card. */
  quote?: string;
  rows: string[];
  /** What each non-reserved character of `rows` is. */
  legend?: Record<string, ThingDef>;
  /** Characters that depend on the team size: { "1": { "2": "#", "3+": "." } }. */
  cells?: Record<string, Record<PlayersSpec, string>>;
  /** Handwritten signs drawn in the level (centre in cells). */
  signs?: LevelLabel[];
  /** A deadly wall coming from the left (level 9): its front starts at x0 and moves after `delay` s. */
  deadline?: { x0: number; delay: number; speed: Record<PlayersSpec, number> };
}

/** One thing of a level, ready for the world. */
export interface CoopThing {
  /** Index in CoopLevel.things. */
  index: number;
  /** Its character in the rows. */
  char: string;
  def: ThingDef;
  /** Bounding box of its cells. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CoopLevel {
  def: CoopLevelDef;
  /** Team size the level was built for (variants). */
  players: number;
  width: number;
  height: number;
  /** Terrain only: what the paper masses are drawn from (glass included). */
  terrain: Level;
  /** Collision grid of the players: terrain plus the solid race objects (springs). */
  collision: Level;
  /** Collision grid of the crates: the players' grid plus the crate stops. */
  crateGrid: Level;
  /** Race objects (spikes, saws, springs), with negative ids. */
  objects: PlacedObject[];
  things: CoopThing[];
  key: { x: number; y: number } | null;
  door: { x: number; y: number; w: number; h: number } | null;
  /** Glass cells (y * width + x), solid, drawn as windows. */
  glass: Set<number>;
  /** Deadly pit bottom cells (y * width + x). */
  voids: Set<number>;
  /** Spawn cells, left to right (index = place in the rope chain). */
  spawns: Array<{ x: number; y: number }>;
  /** A body whose top goes below this dies (fell out of the level), cells. */
  killY: number;
  /** Deadline wall for this team size, or null. */
  deadline: { x0: number; delay: number; speed: number } | null;
}

/** Characters with a fixed meaning (everything else must be in the legend). */
export const COOP_RESERVED = new Set(["#", ".", "S", "^", "*", "T", "=", "K", "D", "|", "%", "~"]);

/** Whether a team of `n` players matches a spec ("2", "3+", "4-5"). Undefined matches everyone. */
export function playersMatch(spec: PlayersSpec | undefined, n: number): boolean {
  if (spec === undefined) return true;
  const s = spec.trim();
  let m = /^(\d)\+$/.exec(s);
  if (m) return n >= Number(m[1]);
  m = /^(\d)-(\d)$/.exec(s);
  if (m) return n >= Number(m[1]) && n <= Number(m[2]);
  m = /^(\d)$/.exec(s);
  if (m) return n === Number(m[1]);
  throw new Error(`bad players spec "${spec}"`);
}

/** The team's weight: friends weigh 1, Ruben 2 (one of the players is Ruben). */
export function teamWeight(players: number): number {
  return players <= 0 ? 0 : players - 1 + COOP.rubenMass;
}

export function resolveWeight(spec: WeightSpec, players: number): number {
  if (typeof spec === "number") return spec;
  const w = teamWeight(players);
  if (spec === "W") return w;
  if (spec === "W-1") return w - 1;
  return w - 2;
}

/** The variant of `char` for a team of `n` (or the character itself). */
function variantChar(def: CoopLevelDef, char: string, n: number): string {
  const v = def.cells?.[char];
  if (!v) return char;
  for (const [spec, c] of Object.entries(v)) if (playersMatch(spec, n)) return c;
  return ".";
}

export function parseCoopLevel(def: CoopLevelDef, players: number = COOP.maxPlayers): CoopLevel {
  const height = def.rows.length;
  const width = def.rows[0]?.length ?? 0;
  const glass = new Set<number>();
  const voids = new Set<number>();
  const stops = new Set<number>();
  const cellsOf = new Map<string, Array<[number, number]>>();
  let key: CoopLevel["key"] = null;
  const doorCells: Array<[number, number]> = [];
  const extraSolid = new Set<number>();

  // Terrain for the race parser: every co-op character becomes "." or "#".
  const rows = def.rows.map((row, y) => {
    if (row.length !== width) throw new Error(`Level "${def.name}": row ${y} has length ${row.length}, expected ${width}`);
    let out = "";
    for (let x = 0; x < width; x++) {
      const c = variantChar(def, row[x]!, players);
      const at = y * width + x;
      if (c === "K") {
        if (key) throw new Error(`Level "${def.name}": more than one key "K"`);
        key = { x, y };
        out += ".";
      } else if (c === "D") {
        doorCells.push([x, y]);
        out += ".";
      } else if (c === "|") {
        stops.add(at);
        out += ".";
      } else if (c === "%") {
        glass.add(at);
        out += "#";
      } else if (c === "~") {
        voids.add(at);
        out += ".";
      } else if (COOP_RESERVED.has(c)) {
        out += c;
      } else {
        const thing = def.legend?.[c];
        if (!thing) throw new Error(`Level "${def.name}": unknown cell "${c}" at (${x}, ${y})`);
        if (playersMatch(thing.players, players)) {
          if (thing.kind === "wall") extraSolid.add(at);
          else {
            const list = cellsOf.get(c) ?? [];
            list.push([x, y]);
            cellsOf.set(c, list);
          }
        }
        out += thing.kind === "wall" && playersMatch(thing.players, players) ? "#" : ".";
      }
    }
    return out;
  });

  const terrain = parseLevel({ name: def.name, rows, labels: def.signs ?? [] });
  const objects = prepareObjects(terrain, terrain.initialObjects);
  const collision = withSolidObjects(terrain, objects);
  const crateSolid = collision.solid.slice();
  for (const at of stops) crateSolid[at] = true;
  const crateGrid: Level = { ...collision, solid: crateSolid };

  const box = (cells: Array<[number, number]>) => {
    const xs = cells.map((c) => c[0]);
    const ys = cells.map((c) => c[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x + 1, h: Math.max(...ys) - y + 1 };
  };

  // Things in reading order of their first cell (a stable order: collider ids follow it).
  const things: CoopThing[] = [];
  const order = [...cellsOf.entries()].sort((a, b) => {
    const [ax, ay] = a[1][0]!;
    const [bx, by] = b[1][0]!;
    return ay - by || ax - bx;
  });
  for (const [char, cells] of order) {
    const b = box(cells);
    things.push({ index: things.length, char, def: def.legend![char]!, ...b });
  }

  const { x: sx, y: sy } = terrain.start;
  const spawns: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < COOP.maxPlayers; i++) spawns.push({ x: sx + i, y: sy });

  let deadline: CoopLevel["deadline"] = null;
  if (def.deadline) {
    const entry = Object.entries(def.deadline.speed).find(([spec]) => playersMatch(spec, players));
    if (entry) deadline = { x0: def.deadline.x0, delay: def.deadline.delay, speed: entry[1] };
  }

  return {
    def,
    players,
    width,
    height,
    terrain,
    collision,
    crateGrid,
    objects,
    things,
    key,
    door: doorCells.length > 0 ? box(doorCells) : null,
    glass,
    voids,
    spawns,
    killY: height + 1,
    deadline,
  };
}

/** What is wrong with a co-op level for a team of `players`, in English for level designers (empty: fine). */
export function coopLevelProblems(def: CoopLevelDef, players: number = COOP.maxPlayers): string[] {
  const problems: string[] = [];
  let level: CoopLevel;
  try {
    level = parseCoopLevel(def, players);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
  const { terrain } = level;
  const at = (x: number, y: number) => y * terrain.width + x;
  if (terrain.width > 100) problems.push(`width ${terrain.width} is over 100 cells (terrain texture limit)`);
  for (let x = 0; x < terrain.width; x++) {
    if (!isSolidCell(terrain, x, 0)) {
      problems.push(`top row is not solid at x=${x}`);
      break;
    }
  }

  // Things: one rectangle per character, sensible sizes and links.
  const thingCell = new Set<number>();
  for (const t of level.things) {
    let count = 0;
    def.rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (variantChar(def, row[x]!, players) === t.char) count++;
    });
    if (count !== t.w * t.h) problems.push(`thing "${t.char}" (${t.def.kind}) is not a filled rectangle`);
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) thingCell.add(at(x, y));
    const d = t.def;
    if (d.kind === "seesaw" && (t.h !== 1 || t.w < 3 || t.w % 2 === 0)) problems.push(`seesaw "${t.char}" must be one row of odd width >= 3`);
    if (d.kind === "pan" && level.things.filter((o) => o.def.kind === "pan" && o.def.balance === d.balance).length !== 2) {
      problems.push(`balance "${d.balance}" must have exactly two pans`);
    }
    if (d.kind === "gate" && !level.things.some((o) => (o.def.kind === "plate" || o.def.kind === "terminal") && o.def.link === d.link)) {
      problems.push(`gate "${t.char}" has no plate or terminal on link "${d.link}"`);
    }
    if (d.kind === "plate" && t.h !== 1) problems.push(`plate "${t.char}" must be one row high`);
    if (d.kind === "mover" && d.arc && (d.arc.period <= 0 || d.arc.degrees <= 0)) problems.push(`mover "${t.char}" has a bad arc`);
    if (d.kind === "mover" && !d.arc && d.link === undefined && d.need === undefined && !(d.period && d.period > 0)) {
      problems.push(`mover "${t.char}" needs a period, a link, a need or an arc`);
    }
  }
  if (level.things.some((t) => t.def.kind === "shelf") && !level.things.some((t) => t.def.kind === "switch")) {
    problems.push("shelves without a switch block");
  }

  // Key and door.
  if (!level.door) problems.push('no door "D"');
  else if (level.door.w * level.door.h !== def.rows.reduce((n, r) => n + [...r].filter((c) => variantChar(def, c, players) === "D").length, 0)) {
    problems.push("the door cells are not one rectangle");
  }

  // Spawns: empty, with headroom and floor.
  const objectAt = new Set(level.objects.map((o) => at(o.x, o.y)));
  for (const [i, s] of level.spawns.entries()) {
    const occupied = (x: number, y: number) => isSolidCell(terrain, x, y) || objectAt.has(at(x, y)) || thingCell.has(at(x, y));
    if (occupied(s.x, s.y)) problems.push(`spawn ${i} at (${s.x}, ${s.y}) is not empty`);
    if (occupied(s.x, s.y - 1)) problems.push(`spawn ${i} at (${s.x}, ${s.y}) has no headroom`);
    const below = s.y + 1;
    const ground =
      isSolidCell(terrain, s.x, below) &&
      !level.objects.some((o) => o.x === s.x && o.y === below && OBJECT_DEFS[o.kind].family === "kill");
    if (!ground) problems.push(`spawn ${i} at (${s.x}, ${s.y}) has no floor below`);
  }

  // Bottomless columns are catch pits: the kill line must be at least 6 cells below their rim
  // (the lower of the two grounds around the pit), so a friend hanging from the rope never dies
  // there. A deadly pit has "~" cells instead.
  const bottom = terrain.height - 1;
  const ground = (x: number): number | null => {
    if (!isSolidCell(terrain, x, bottom)) return null;
    let y = bottom;
    while (y > 0 && isSolidCell(terrain, x, y - 1)) y--;
    return y;
  };
  const deadlyColumn = (x: number) => {
    for (let y = 0; y < terrain.height; y++) if (level.voids.has(at(x, y))) return true;
    return false;
  };
  for (let x = 1; x < terrain.width - 1; x++) {
    if (ground(x) !== null || deadlyColumn(x)) continue;
    let l = x - 1;
    while (l > 0 && ground(l) === null) l--;
    let r = x + 1;
    while (r < terrain.width - 1 && ground(r) === null) r++;
    const rim = Math.max(ground(l) ?? 0, ground(r) ?? 0);
    const depth = level.killY - rim;
    if (depth < 6) {
      problems.push(`catch pit at x=${x} is only ${depth} cells deep (6 needed), or end it with "~"`);
      x = r;
    }
  }
  return problems;
}
