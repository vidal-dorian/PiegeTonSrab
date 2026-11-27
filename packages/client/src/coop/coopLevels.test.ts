/**
 * Every campaign level is solved by the test bots at 2, 3, 4 and 5 players on the real physics,
 * in at most 90 s at 2 players, with no problem reported by coopLevelProblems; every documented
 * shortcut fails; and every documented recovery (a mistake, then the way back) finishes. Levels
 * are designed with packages/shared/scripts/check-coop-level.ts (see docs/coop-levels.md).
 */
import { describe, expect, it } from "vitest";
import { COOP_LEVELS, coopLevelProblems } from "@game/shared/coop";
import { drawWorld, runSolution } from "@game/shared/coop/bots";
import { COOP_SOLUTIONS } from "../../../shared/src/coop/levels/solutions";

const campaign = COOP_LEVELS.filter((l) => l.id !== "sandbox");

describe("co-op campaign levels", () => {
  it("every campaign level has a bot solution", () => {
    for (const def of campaign) expect(COOP_SOLUTIONS[def.id], def.id).toBeDefined();
  });

  for (const def of campaign) {
    const entry = COOP_SOLUTIONS[def.id];
    if (!entry) continue;
    for (const n of [2, 3, 4, 5]) {
      it(`${def.id} ${def.name}: no problems and solved by the bots at ${n} players`, () => {
        expect(coopLevelProblems(def, n)).toEqual([]);
        const r = runSolution(def, n, entry.solution);
        if (!r.ok) console.log(`${def.id} at ${n}: ${r.failure}\n${drawWorld(r.world)}`);
        expect(r.failure).toBeUndefined();
        if (n === 2) expect(r.seconds).toBeLessThanOrEqual(90);
      });
    }
    for (const [name, shortcut] of Object.entries(entry.shortcuts ?? {})) {
      it(`${def.id}: the shortcut "${name}" fails at its attempt`, () => {
        for (const n of [2, 3, 4, 5]) {
          const r = runSolution(def, n, shortcut);
          expect(r.ok, `${name} at ${n} players`).toBe(false);
          expect(r.failure ?? "", `${name} at ${n} players fails in its ATTEMPT phase`).toMatch(/^ATTEMPT/);
        }
      });
    }
    for (const [name, recovery] of Object.entries(entry.recoveries ?? {})) {
      it(`${def.id}: the recovery "${name}" finishes`, () => {
        for (const n of [2, 3, 4, 5]) {
          const r = runSolution(def, n, recovery);
          if (!r.ok) console.log(`${def.id} recovery "${name}" at ${n}: ${r.failure}\n${drawWorld(r.world)}`);
          expect(r.failure, `${name} at ${n} players`).toBeUndefined();
        }
      });
    }
  }
});
