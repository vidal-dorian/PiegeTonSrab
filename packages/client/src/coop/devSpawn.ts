/**
 * Dev tool: move a level's spawn ("S") so the team starts somewhere else, for "?coopLocal=2&spawn=63"
 * (the sandbox's pulley is far from its start). Pure: a copy of the level with the S moved.
 */
import type { CoopLevelDef } from "@game/shared/coop";

/** Cells the team spawns on, from S rightwards. */
const SPAWN_CELLS = 5;

/**
 * The level with its spawn at column x, on the highest floor there: the first row from the top
 * whose cells x to x + 4 are empty with solid ground ("#") right below all of them. Null when
 * there is none (the level is then used as it is).
 */
export function withSpawnAt(def: CoopLevelDef, x: number): CoopLevelDef | null {
  const rows = def.rows.map((r) => r.replace("S", "."));
  const free = (r: string | undefined) => r !== undefined && x >= 1 && x + SPAWN_CELLS <= r.length && [...r.slice(x, x + SPAWN_CELLS)].every((c) => c === ".");
  const ground = (r: string | undefined) => r !== undefined && [...r.slice(x, x + SPAWN_CELLS)].every((c) => c === "#");
  for (let y = 1; y + 1 < rows.length; y++) {
    if (!free(rows[y]) || !ground(rows[y + 1])) continue;
    rows[y] = rows[y]!.slice(0, x) + "S" + rows[y]!.slice(x + 1);
    return { ...def, rows };
  }
  return null;
}
