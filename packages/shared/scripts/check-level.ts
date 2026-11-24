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
 * - prints the map with reachable standing cells (·) and critical cells (!).
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildReachGraph,
  canPlaceAt,
  DEFAULT_MOVEMENT,
  parseLevel,
  placementKeepsPath,
  prepareObjects,
  type LevelDefinition,
  type PlacedObject,
} from "../src/index";

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

  const objAt = new Map(objects.map((o) => [o.y * level.width + o.x, o]));
  const charOf: Record<string, string> = { saw: "*", spikes: "^", platform: "=", spring: "T", vine: "V" };
  const lines: string[] = [];
  for (let y = 0; y < level.height; y++) {
    let line = "";
    for (let x = 0; x < level.width; x++) {
      const k = y * level.width + x;
      const o = objAt.get(k);
      if (level.solid[k]) line += "#";
      else if (x === level.start.x && y === level.start.y) line += "S";
      else if (level.finish && x === level.finish.x && y === level.finish.y) line += "F";
      else if (o) line += o.kind === "cannon" ? [">", "U", "<", "A"][o.dir ?? 2]! : charOf[o.kind]!;
      else if (critical.has(k)) line += "!";
      else if (graph.edges.has(k)) line += "·";
      else line += " ";
    }
    lines.push(line);
  }
  console.log(lines.join("\n"));
  return graph.reachable;
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
