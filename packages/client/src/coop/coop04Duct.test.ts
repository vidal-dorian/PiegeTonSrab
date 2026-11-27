/**
 * La Salle de TP (coop04), beat 1: the duct cannot be skipped, and someone must wait in it. From 3
 * players the trap over the shaft J is open only while someone stands on plate g in the duct's
 * floor (reached with a leg-up); the first one up then locks it open at the terminal beside the
 * lip. Without it, the climber's other neighbour used to give the climber enough rope from outside
 * the duct: standing on M's floor and jumping with the climber (a body in the air is a weak
 * anchor), or riding a friend's head at the corridor's mouth (4-5 players). With a latch in the
 * duct instead of the plate, the climber itself could run there from Ruben's head, open it and
 * come back down. Every such attempt must fail in its ATTEMPT phase, over a sweep of where the
 * neighbour waits and when it jumps (and, for the errand, how the climber leaps into the duct);
 * with the trap locked open the same attempts get up, which shows that the trap, not the rope, is
 * what closes them.
 *
 * At 2 players there is no other neighbour (and no trap): the sweep plays the degenerate case,
 * Ruben off the PC tower as the base and F0 on his head jumping for the upper floor.
 */
import { describe, expect, it } from "vitest";
import { COOP_LEVELS } from "@game/shared/coop";
import { runSolution } from "@game/shared/coop/bots";
import { emptyDuct, skipDuct, type DuctErrand, type DuctSkip } from "../../../shared/src/coop/levels/coop04.solution";

const coop04 = COOP_LEVELS.find((l) => l.id === "coop04")!;

const SYNCS = [null, -10, -5, 0, 5, 10, 20];

/** The attempts at n players: where the climber's other neighbour waits, and when it jumps. */
function sweep(n: number): DuctSkip[] {
  const out: DuctSkip[] = [];
  if (n === 2) {
    for (const x of [12.3, 12.75, 13.45]) for (const lean of [0, 0.35, 0.7]) out.push({ mode: "head", x, lean, sync: null });
    return out;
  }
  // On the floor: the corridor's end (x 12-12.75, under its ceiling) and M (x 13-14.45).
  for (const x of [12.0, 12.4, 12.75, 13.1, 13.45, 13.8, 14.45]) for (const sync of [...SYNCS, 3, 8, 15]) out.push({ mode: "floor", x, sync });
  // On a friend's head (from 4 players): the base in the corridor, at its mouth, or in M.
  if (n >= 4) for (const x of [11.95, 12.3, 12.75, 13.0, 13.45]) for (const lean of [0, 0.35, 0.7]) for (const sync of SYNCS) out.push({ mode: "head", x, lean, sync });
  return out;
}

/** The errands at 3-5 players: how the climber leaps into the duct, where its neighbour waits and when it jumps. */
function errands(): DuctErrand[] {
  const out: DuctErrand[] = [];
  for (const lean of [14.6, 14.8, 15.0]) for (const hold of [30, 50]) for (const steer of [0, 3]) for (const sync of [null, 0, 5]) for (const nbX of [13.45, 14.0]) out.push({ lean, hold, steer, sync, nbX });
  return out;
}

describe("coop04 beat 1: the duct (and its leg-up) is needed from 3 players", () => {
  it("the level has the plate in the duct, the trap over J and its lock up beside the lip from 3 players", () => {
    expect(coop04.legend?.g).toEqual({ kind: "plate", need: 1, link: "trappe" });
    expect(coop04.legend?.y).toEqual({ kind: "terminal", prompt: "Bloque la trappe", link: "trappe", set: "on" });
    expect(coop04.legend?.h).toEqual({ kind: "gate", link: "trappe" });
    expect(coop04.cells?.["4"]).toEqual({ "2": "#", "3-5": "g" });
    expect(coop04.cells?.["5"]).toEqual({ "2": ".", "3-5": "y" });
    expect(coop04.cells?.["6"]).toEqual({ "2": ".", "3-5": "h" });
    // The plate is the duct's floor short of its mouth (x 10-11 row 11), the lock on the upper floor
    // (x 17 row 8), the trap over J (x 15 row 8).
    expect(coop04.rows[11]!.slice(9, 13)).toBe("#44#");
    expect(coop04.rows[8]!.slice(15, 18)).toBe("6.5");
  });

  for (const n of [2, 3, 4, 5]) {
    it(`every attempt to skip the duct fails in its ATTEMPT phase at ${n} players`, () => {
      const attempts = sweep(n);
      for (const p of attempts) {
        const r = runSolution(coop04, n, skipDuct(p));
        expect(r.ok, `${JSON.stringify(p)} at ${n} players`).toBe(false);
        expect(r.failure ?? "", `${JSON.stringify(p)} at ${n} players fails in its ATTEMPT phase`).toMatch(/^ATTEMPT/);
      }
      expect(attempts.length).toBeGreaterThan(8);
    }, 120_000);
  }

  for (const n of [3, 4, 5]) {
    it(`the climber cannot open the trap itself and come back down at ${n} players (someone must stay on the plate)`, () => {
      let reached = 0;
      for (const p of errands()) {
        const r = runSolution(coop04, n, emptyDuct(p));
        expect(r.ok, `${JSON.stringify(p)} at ${n} players`).toBe(false);
        const f = r.failure ?? "";
        // A leap that misses the duct is no attempt; every other run must fail in its ATTEMPT.
        if (/leaps from Ruben's head into the duct/.test(f)) continue;
        expect(f, `${JSON.stringify(p)} at ${n} players fails in its ATTEMPT phase`).toMatch(/^ATTEMPT/);
        reached++;
      }
      expect(reached).toBeGreaterThan(20);
    }, 120_000);
  }

  it("with the trap forced open, the rope alone does not stop them (3-5 players)", () => {
    const floor: DuctSkip = { mode: "floor", x: 13.45, sync: 0 };
    const head: DuctSkip = { mode: "head", x: 12.75, lean: 0.7, sync: 0 };
    for (const n of [3, 4, 5]) expect(runSolution(coop04, n, skipDuct({ ...floor, trapOpen: true })).failure, `floor at ${n}`).toBeUndefined();
    for (const n of [4, 5]) expect(runSolution(coop04, n, skipDuct({ ...head, trapOpen: true })).failure, `head at ${n}`).toBeUndefined();
    const errand: DuctErrand = { lean: 14.6, hold: 30, steer: 0, sync: 0 };
    for (const n of [3, 4, 5]) expect(runSolution(coop04, n, emptyDuct({ ...errand, trapOpen: true })).failure, `errand at ${n}`).toBeUndefined();
  }, 60_000);
});
