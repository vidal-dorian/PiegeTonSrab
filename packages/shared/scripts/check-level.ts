/**
 * Level checker for map designers.
 *
 *   npx tsx packages/shared/scripts/check-level.ts level4 [level5 ...]
 *   npx tsx packages/shared/scripts/check-level.ts --all
 *
 * For each level (a file in packages/shared/src/levels, exporting a LevelDefinition):
 * - parses it (row lengths, start, finish, object characters);
 * - checks the finish is reachable with the level's own objects, using the same check as
 *   the game (real controller, DEFAULT_MOVEMENT) and times it;
 * - counts "critical cells": empty cells where a single saw would be refused because it
 *   would cut the last path. Many critical cells mean a single-lane level where placement
 *   is mostly forbidden; a good level has alternatives, so few cells are critical;
 * - checks the spawn pad (level.ts, spawnPadProblems): the 5 cells of the S row centred on
 *   S must be empty floor on solid ground, with 2 empty rows above them, so 5 players can
 *   start side by side;
 * - checks the map's own objects follow the placement rules a player's would: spikes must
 *   lean on a block (objectPlacementProblem, reason "support"). A map object inside a
 *   protected zone (start or finish) is only a warning: the zones forbid player placement,
 *   and a designer may want a hand-made object there, but it usually means a trap next to
 *   the start;
 * - counts the cells spikes could still be placed on (some direction has a support), since
 *   spikes are the one object that cannot go anywhere canPlaceAt allows;
 * - prints the map with reachable standing cells (·), critical cells (!) and the protected
 *   zones (_: the start zone, which holds the pad, and the finish zone), and each spikes or
 *   spring with a glyph for its direction (legend under the map).
 *
 * Exits non-zero if any level fails to parse, has no path to the finish, a broken pad or a
 * map object that breaks the placement rules.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildReachGraph,
  canPlaceAt,
  canPlaceObject,
  DEFAULT_MOVEMENT,
  isProtectedCell,
  objectPlacementProblem,
  OBJECT_DEFS,
  parseLevel,
  placementKeepsPath,
  prepareObjects,
  spawnPadProblems,
  type Dir,
  type LevelDefinition,
  type PlacedObject,
} from "../src/index";

const DIRS: readonly Dir[] = [0, 1, 2, 3];

/**
 * Map glyph of an object. Map characters where one exists (`^` spikes up, `T` spring up, the
 * four cannons); the other directions of spikes and springs have no map character (levels
 * only write upward ones), so they get a glyph of their own, indexed by Dir (right, down,
 * left, up). Kept in step with the copy in stress-level.ts.
 */
function objectGlyph(o: PlacedObject): string {
  const dir = o.dir ?? (o.kind === "cannon" ? 2 : 3);
  switch (o.kind) {
    case "cannon":
      return [">", "U", "<", "A"][dir]!;
    case "spikes":
      return ["}", "v", "{", "^"][dir]!;
    case "spring":
      return ["]", "Y", "[", "T"][dir]!;
    default:
      return { saw: "*", platform: "=", vine: "V" }[o.kind];
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(here, "../src/levels");

async function load(name: string): Promise<LevelDefinition> {
  const file = join(levelsDir, name.endsWith(".ts") ? name : `${name}.ts`);
  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>;
  const def = Object.values(mod).find((v): v is LevelDefinition => !!v && typeof v === "object" && "rows" in v);
  if (!def) throw new Error(`${name}: no LevelDefinition exported`);
  return def;
}

function check(def: LevelDefinition): boolean {
  const level = parseLevel(def);
  const objects = prepareObjects(level, level.initialObjects);
  const t0 = performance.now();
  const graph = buildReachGraph(level, objects, DEFAULT_MOVEMENT);
  const ms = performance.now() - t0;
  const nodes = graph.edges.size;
  console.log(`\n=== ${def.name}  (${level.width} x ${level.height}, ${objects.length} map objects)`);
  console.log(`reachable: ${graph.reachable ? "YES" : "NO"}   graph: ${nodes} standing cells, built in ${ms.toFixed(0)} ms`);

  const padProblems = spawnPadProblems(level);
  console.log(`spawn pad: ${padProblems.length === 0 ? "OK" : `BROKEN (${padProblems.length} problems)`}`);
  for (const p of padProblems) console.log(`  - ${p}`);

  // Map objects against the rules a player's object follows. Each is checked against the
  // others only (not itself), so spikes on a map platform are fine, like in a hand.
  const objectProblems: string[] = [];
  const zoneWarnings: string[] = [];
  for (const o of level.initialObjects) {
    const others = level.initialObjects.filter((q) => q !== o);
    if (OBJECT_DEFS[o.kind].needsSupport && objectPlacementProblem(level, others, o) === "support") {
      objectProblems.push(`${o.kind} at (${o.x}, ${o.y}) facing ${o.dir ?? 3} lean on nothing`);
    }
    if (isProtectedCell(level, o.x, o.y)) zoneWarnings.push(`${o.kind} at (${o.x}, ${o.y}) is inside a protected zone`);
  }
  console.log(`map objects: ${objectProblems.length === 0 ? "OK" : `BROKEN (${objectProblems.length} problems)`}`);
  for (const p of objectProblems) console.log(`  - ${p}`);
  for (const p of zoneWarnings) console.log(`  - warning: ${p}`);

  const critical = new Set<number>();
  let free = 0;
  if (graph.reachable) {
    const t1 = performance.now();
    for (let y = 0; y < level.height; y++) {
      for (let x = 0; x < level.width; x++) {
        if (!canPlaceAt(level, objects, x, y)) continue;
        free++;
        const saw: PlacedObject = { id: 99999, kind: "saw", x, y };
        if (!placementKeepsPath(level, objects, saw, DEFAULT_MOVEMENT, graph)) critical.add(y * level.width + x);
      }
    }
    const pct = free > 0 ? ((100 * critical.size) / free).toFixed(1) : "0";
    console.log(`critical cells: ${critical.size} of ${free} free cells (${pct} %), checked in ${(performance.now() - t1).toFixed(0)} ms`);
  }
  // Free cells already leave out both protected zones (canPlaceAt); spikes also need a block
  // behind them in at least one direction.
  let spikeCells = 0;
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (DIRS.some((dir) => canPlaceObject(level, objects, { kind: "spikes", x, y, dir }))) spikeCells++;
    }
  }
  console.log(`spikes can lean on something in ${spikeCells} of the free cells`);

  const objAt = new Map(objects.map((o) => [o.y * level.width + o.x, o]));
  const lines: string[] = [];
  for (let y = 0; y < level.height; y++) {
    let line = "";
    for (let x = 0; x < level.width; x++) {
      const k = y * level.width + x;
      const o = objAt.get(k);
      if (level.solid[k]) line += "#";
      else if (x === level.start.x && y === level.start.y) line += "S";
      else if (level.finish && x === level.finish.x && y === level.finish.y) line += "F";
      else if (o) line += objectGlyph(o);
      else if (critical.has(k)) line += "!";
      else if (isProtectedCell(level, x, y)) line += "_";
      else if (graph.edges.has(k)) line += "·";
      else line += " ";
    }
    lines.push(line);
  }
  console.log(lines.join("\n"));
  console.log("legend: _ protected zone · spikes } v { ^ and springs ] Y [ T face right, down, left, up · cannons > U < A");
  return graph.reachable && padProblems.length === 0 && objectProblems.length === 0;
}

const args = process.argv.slice(2);
const names =
  args.length === 0 || args.includes("--all")
    ? readdirSync(levelsDir).filter((f) => f.endsWith(".ts") && f !== "testLevel.ts")
    : args;
let ok = true;
for (const n of names) {
  try {
    ok = check(await load(n)) && ok;
  } catch (e) {
    ok = false;
    console.log(`\n=== ${n}: ERROR ${(e as Error).message}`);
  }
}
process.exit(ok ? 0 : 1);
