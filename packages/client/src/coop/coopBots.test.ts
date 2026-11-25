/**
 * The test bots themselves (bots.ts): the practice course (levels/_course.ts) solved at 2 to 5
 * players by walking, a tower and hauling, so level solutions can rely on these goals.
 */
import { describe, expect, it } from "vitest";
import { drawWorld, runSolution } from "@game/shared/coop/bots";
import { courseLevel } from "../../../shared/src/coop/levels/_course";
import { solution } from "../../../shared/src/coop/levels/_course.solution";

describe("test bots", () => {
  for (const n of [2, 3, 4, 5]) {
    it(`solve a wall with a tower and a haul at ${n} players`, () => {
      const r = runSolution(courseLevel, n, solution);
      if (!r.ok) console.log(`${r.failure}\n${drawWorld(r.world)}\n${r.log.join("\n")}`);
      expect(r.failure).toBeUndefined();
      expect(r.ok).toBe(true);
    });
  }
});
