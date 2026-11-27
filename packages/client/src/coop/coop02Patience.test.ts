/**
 * Le Labo Réseau (coop02), beat 1: the last one into the slot steps off the lip with nobody left
 * to hold him and drops below the one waiting in the slot. An idle anchor slides towards the friend
 * hanging below him, and that friend hangs against the side of the slot's floor, past its end: at 2
 * players the one waiting is alone, so if he did not haul within about 1.1 s he was pulled off the
 * floor's end and both fell out of the level. The fragile tile across the shaft, 4 below the slot's
 * floor, takes the last one's weight (he stands, nobody hangs, nobody slides).
 *
 * The `patience` variants of the bot solution (the ones in the slot stand still for 10 s once the
 * last one has left the lip, however he leaves it) must win at every team size; without the tile,
 * the same variants die at 2 players, which shows the tile is what saves them.
 */
import { describe, expect, it } from "vitest";
import { COOP_LEVELS } from "@game/shared/coop";
import { runSolution } from "@game/shared/coop/bots";
import { patience } from "../../../shared/src/coop/levels/coop02.solution";

const coop02 = COOP_LEVELS.find((l) => l.id === "coop02")!;
const withoutTile = { ...coop02, rows: coop02.rows.map((r) => r.replace(/f/g, ".")) };

describe("coop02 beat 1: a slow hauler never kills the last one", () => {
  it("the level has the fragile tile across shaft A", () => {
    expect(coop02.rows[14]).toBe("#c.a####################ffff##");
    expect(coop02.legend?.f).toEqual({ kind: "fragile" });
  });

  for (const [name, variant] of Object.entries(patience)) {
    it(`${name}: won at 2-5 players`, () => {
      for (const n of [2, 3, 4, 5]) {
        const r = runSolution(coop02, n, variant);
        expect(r.failure, `${name} at ${n} players`).toBeUndefined();
        expect(r.deaths, `${name} at ${n} players`).toBe(0);
      }
    });

    it(`${name}: without the tile, death at 2 players`, () => {
      const r = runSolution(withoutTile, 2, variant);
      expect(r.ok).toBe(false);
      expect(r.failure ?? "").toMatch(/^beat 1: the last one \(F0\) steps off and is hauled in: F0 died \(fall\)/);
    });
  }
});
