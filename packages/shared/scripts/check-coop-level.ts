/**
 * Co-op level checker for level designers.
 *
 *   npx tsx packages/shared/scripts/check-coop-level.ts coop01 [coop02 ...] [--players 2,3] [--map] [--trace]
 *   npx tsx packages/shared/scripts/check-coop-level.ts --all
 *
 * A level is a file packages/shared/src/coop/levels/<id>.ts exporting a CoopLevelDef; its bot
 * solution is packages/shared/src/coop/levels/<id>.solution.ts exporting `solution` (bots.ts).
 * For each level and each team size (2 to 5 by default):
 * - lists what coopLevelProblems finds (format, door, spawns, catch pits...);
 * - plays the bot solution on the real physics and prints the time of each phase, or where and
 *   why it failed with the world drawn at that moment (friends 0-3, Ruben R, crates C, open gates :);
 * - with --map, prints the level as the 5-player team sees it; with --trace, the world every second.
 *
 * Exits non-zero if a level has problems or its solution fails for any team size.
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { coopLevelProblems, type CoopLevelDef } from "../src/coop/index";
import { drawWorld, runSolution, type CoopSolution } from "../src/coop/bots";

const here = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(here, "../src/coop/levels");

async function loadLevel(id: string): Promise<{ def: CoopLevelDef; solution: CoopSolution | null }> {
  const mod = (await import(pathToFileURL(join(levelsDir, `${id}.ts`)).href)) as Record<string, unknown>;
  const def = Object.values(mod).find((v): v is CoopLevelDef => !!v && typeof v === "object" && "rows" in v && "id" in v);
  if (!def) throw new Error(`${id}: no CoopLevelDef exported`);
  let solution: CoopSolution | null = null;
  try {
    const sol = (await import(pathToFileURL(join(levelsDir, `${id}.solution.ts`)).href)) as { solution?: CoopSolution };
    solution = sol.solution ?? null;
  } catch {
    solution = null;
  }
  return { def, solution };
}

function check(id: string, def: CoopLevelDef, solution: CoopSolution | null, teams: number[], showMap: boolean, trace: boolean): boolean {
  let ok = true;
  console.log(`\n=== ${def.id} · ${def.name}  (${def.rows[0]?.length ?? 0} x ${def.rows.length})${def.quote ? `  « ${def.quote} »` : ""}`);
  if (showMap) console.log(def.rows.join("\n"));
  for (const n of teams) {
    const problems = coopLevelProblems(def, n);
    if (problems.length > 0) {
      ok = false;
      console.log(`  ${n} players: PROBLEMS`);
      for (const p of problems) console.log(`    - ${p}`);
      continue;
    }
    if (!solution) {
      ok = false;
      console.log(`  ${n} players: no solution file (${id}.solution.ts)`);
      continue;
    }
    const t0 = performance.now();
    const r = runSolution(def, n, solution, {
      trace: trace
        ? (w, phase) => console.log(`    t=${(w.tick / 120).toFixed(0)} s, ${phase}\n${drawWorld(w).split("\n").map((l) => `      ${l}`).join("\n")}`)
        : undefined,
    });
    const ms = performance.now() - t0;
    if (r.ok) {
      console.log(`  ${n} players: OK in ${r.seconds.toFixed(1)} s of play (${ms.toFixed(0)} ms to run)`);
      for (const line of r.log) console.log(`      ${line}`);
    } else {
      ok = false;
      console.log(`  ${n} players: FAILED after ${r.seconds.toFixed(1)} s: ${r.failure}`);
      for (const line of r.log) console.log(`      ${line}`);
      console.log(drawWorld(r.world).split("\n").map((l) => `      ${l}`).join("\n"));
    }
  }
  return ok;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const playersArg = args.indexOf("--players");
  const teams = playersArg >= 0 ? args[playersArg + 1]!.split(",").map(Number) : [2, 3, 4, 5];
  const showMap = args.includes("--map");
  const trace = args.includes("--trace");
  let ids = args.filter((a, k) => !a.startsWith("--") && args[k - 1] !== "--players");
  if (args.includes("--all")) {
    ids = readdirSync(levelsDir)
      // Campaign levels only: not the solutions, their registry, the sandbox or "_" practice files.
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".solution.ts") && !f.startsWith("_") && f !== "sandbox.ts" && f !== "solutions.ts")
      .map((f) => f.slice(0, -3))
      .sort();
  }
  if (ids.length === 0) {
    console.log("usage: check-coop-level.ts <id> [...] [--players 2,3] [--map] | --all");
    process.exit(2);
  }
  let allOk = true;
  for (const id of ids) {
    const { def, solution } = await loadLevel(id);
    if (!check(id, def, solution, teams, showMap, trace)) allOk = false;
  }
  console.log(allOk ? "\nall good" : "\nSOME CHECKS FAILED");
  process.exit(allOk ? 0 : 1);
}

void main();
