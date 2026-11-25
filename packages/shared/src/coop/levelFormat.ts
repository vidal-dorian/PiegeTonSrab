/**
 * Co-op level format.
 *
 * A level is written like a race map: one string per row, the same terrain characters
 * ("#" solid, "." empty) and the same level-object characters ("^" spikes, "*" saw, "T" spring...).
 * Differences:
 * - "S" is the leftmost spawn cell: the players spawn side by side to its right, in rope order
 *   (Ruben, always last in the chain, on the right), so the rope never starts crossed. There must be
 *   floor under the 5 cells S..S+4 and room above them.
 * - Levels may be taller than one screen (deep catch pits): the group camera scrolls vertically.
 *   A body dies when it falls below the level.
 * - The top row must be solid (catapults and towers must not leave the level).
 */
import { isSolidCell, parseLevel, type Level, type LevelLabel } from "../level";
import { OBJECT_DEFS, prepareObjects, withSolidObjects, type PlacedObject } from "../objects";
import { COOP } from "./coopTuning";

export interface CoopLevelDef {
  /** Stable id ("coop01"): progress and tests refer to it. */
  id: string;
  /** Name shown on the level card ("La Rentrée"). */
  name: string;
  /** Ruben's line on the level card. */
  quote?: string;
  rows: string[];
  /** Handwritten signs drawn in the level (centre in cells). */
  signs?: LevelLabel[];
}

export interface CoopLevel {
  def: CoopLevelDef;
  width: number;
  height: number;
  /** Terrain only: what the paper masses are drawn from. */
  terrain: Level;
  /** Collision grid: terrain plus the solid level objects (springs). */
  collision: Level;
  /** Level objects (spikes, saws, springs), with negative ids. */
  objects: PlacedObject[];
  /** Spawn cells, left to right (index = place in the rope chain). */
  spawns: Array<{ x: number; y: number }>;
  /** A body whose top goes below this dies (fell out of the level), cells. */
  killY: number;
}

export function parseCoopLevel(def: CoopLevelDef): CoopLevel {
  const terrain = parseLevel({ name: def.name, rows: def.rows, labels: def.signs ?? [] });
  const objects = prepareObjects(terrain, terrain.initialObjects);
  const collision = withSolidObjects(terrain, objects);
  const { x: sx, y: sy } = terrain.start;
  const spawns: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < COOP.maxPlayers; i++) spawns.push({ x: sx + i, y: sy });
  return {
    def,
    width: terrain.width,
    height: terrain.height,
    terrain,
    collision,
    objects,
    spawns,
    killY: terrain.height + 1,
  };
}

/** What is wrong with a co-op level, in English for level designers (empty: fine). */
export function coopLevelProblems(def: CoopLevelDef): string[] {
  const problems: string[] = [];
  let level: CoopLevel;
  try {
    level = parseCoopLevel(def);
  } catch (e) {
    return [e instanceof Error ? e.message : String(e)];
  }
  const { terrain } = level;
  if (terrain.width > 100) problems.push(`width ${terrain.width} is over 100 cells (terrain texture limit)`);
  for (let x = 0; x < terrain.width; x++) {
    if (!isSolidCell(terrain, x, 0)) {
      problems.push(`top row is not solid at x=${x}`);
      break;
    }
  }
  const objectAt = new Set(level.objects.map((o) => o.y * terrain.width + o.x));
  for (const [i, s] of level.spawns.entries()) {
    const occupied = (x: number, y: number) => isSolidCell(terrain, x, y) || objectAt.has(y * terrain.width + x);
    if (occupied(s.x, s.y)) problems.push(`spawn ${i} at (${s.x}, ${s.y}) is not empty`);
    if (occupied(s.x, s.y - 1)) problems.push(`spawn ${i} at (${s.x}, ${s.y}) has no headroom`);
    const below = s.y + 1;
    const ground =
      isSolidCell(terrain, s.x, below) &&
      !level.objects.some((o) => o.x === s.x && o.y === below && OBJECT_DEFS[o.kind].family === "kill");
    if (!ground) problems.push(`spawn ${i} at (${s.x}, ${s.y}) has no floor below`);
  }
  return problems;
}
