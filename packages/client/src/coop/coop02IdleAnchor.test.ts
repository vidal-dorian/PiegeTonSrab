/**
 * Le Labo Réseau (coop02), beat 1: the team stands still while the one who stepped off shaft A hangs
 * below the lip without leaning in (a newcomer). An idle anchor slides towards the friend hanging
 * below him; that friend hangs right under the lip's corner, so once the anchor's centre passed the
 * corner the wrap was let go and he crept on over the void until he lost the floor at x 25.40, and
 * both fell out of the level (the skeptic's probe: 8 of 156 runs at 2 players, 4 of 156 at 3, 18 to
 * 34 s after the step; most of the others ended with the anchor's centre past the corner, a hair
 * from falling). The lip's cell is a non-slip floor ("grip"): the slide stops once the anchor's
 * centre is over it, so he never reaches the corner.
 *
 * The sweep: 2-5 players, Ruben first (the order the team stands in) or a friend first (he got past
 * Ruben), three anchor places, three step-off speeds, everyone else standing still for 30 s.
 */
import { describe, expect, it } from "vitest";
import { COOP_LEVELS, type CoopLevelDef, type CoopWorld } from "@game/shared/coop";
import { cond, idle, roleOf, runSolution, walk, type Goal, type Phase } from "@game/shared/coop/bots";
import { stepOff } from "../../../shared/src/coop/levels/coop02.solution";

const coop02 = COOP_LEVELS.find((l) => l.id === "coop02")!;
const withoutGrip: CoopLevelDef = { ...coop02, rows: coop02.rows.map((r) => r.replace(/g/g, "#")) };

/** The lip's corner: the right end of the raised floor (floor top 6). */
const EDGE_A = 25;
const FLOOR = 6;

interface Outcome {
  died: boolean;
  /** Furthest right the anchor's centre got after the step. */
  furthest: number;
}

/** Put body i at centre x on the raised floor at the first step, then stand still. */
function placed(xs: number[]): (i: number) => Goal {
  return (i) => ({
    label: "placed",
    step(c) {
      if (c.t === 0) c.w.placeBody(i, xs[i]! - c.w.bodies[i]!.width / 2, FLOOR - c.w.bodies[i]!.height);
      return 0;
    },
    done: (c) => c.t > 30,
  });
}

function run(def: CoopLevelDef, n: number, anchor: number, setup: Phase, stepper: number, speed: number): Outcome {
  let furthest = 0;
  let stepped = false;
  const r = runSolution(def, n, () => [setup, { name: "ATTEMPT", do: { [roleOf(stepper, n)]: stepOff(EDGE_A, 1, speed), "*": idle() }, until: () => false, timeout: 30 }], {
    every: 1,
    trace: (w: CoopWorld, phase: string) => {
      if (phase !== "ATTEMPT") return;
      stepped = true;
      furthest = Math.max(furthest, w.bodies[anchor]!.cx);
    },
  });
  expect(stepped, r.failure).toBe(true);
  const died = /died/.test(r.failure ?? "");
  if (!died) expect(r.failure ?? "").toMatch(/^ATTEMPT: timed out/);
  return { died, furthest };
}

/**
 * The one stepping off at the lip (centre 24.55), his neighbour (the anchor) at x on the raised
 * floor, the others behind the anchor, a cell apart. Ruben first, or his neighbour first.
 */
function sweepRun(def: CoopLevelDef, n: number, rubenFirst: boolean, x: number, speed: number): Outcome {
  const stepper = rubenFirst ? n - 1 : n - 2;
  const anchor = rubenFirst ? n - 2 : n - 1;
  const xs: number[] = Array(n).fill(0);
  xs[stepper] = 24.55;
  xs[anchor] = x;
  for (let i = n - 3, k = 1; i >= 0; i--, k++) xs[i] = x - k;
  return run(def, n, anchor, { name: "placed", do: { "*": placed(xs) }, timeout: 1 }, stepper, speed);
}

/** The skeptic's setup (2 players): Ruben walks to 24.4, F0 to x. */
function walkedRun(def: CoopLevelDef, x: number, speed: number): Outcome {
  const setup: Phase = {
    name: "line up",
    do: { R: walk(24.4, { tol: 0.08, jump: "never" }), F0: walk(x, { tol: 0.08, jump: "never" }) },
    until: cond.all(cond.near("R", 24.4, 0.12), cond.near("F0", x, 0.12)),
    timeout: 10,
  };
  return run(def, 2, 0, setup, 1, speed);
}

const PLACES = [21.6, 22.0, 23.5];
const SPEEDS = [0.8, 1.5, 99];
/** Runs of the skeptic's probe that died before the grip (anchor x, step-off speed). */
const DEADLY: Array<[number, number]> = [
  [22.0, 1.5],
  [22.0, 0.8],
  [23.5, 1.5],
];

describe("coop02 beat 1: an idle anchor never slides off the lip", () => {
  it("the lip's cell is a non-slip floor", () => {
    expect(coop02.rows[6]).toBe("########################g...##");
    expect(coop02.legend?.g).toEqual({ kind: "grip" });
  });

  for (const n of [2, 3, 4, 5]) {
    it(`${n} players: nobody dies and the anchor never reaches the lip's corner`, () => {
      for (const rubenFirst of [true, false]) {
        for (const x of PLACES) {
          for (const speed of SPEEDS) {
            const label = `${n} players, ${rubenFirst ? "Ruben" : "a friend"} first, anchor at ${x}, step-off speed ${speed}`;
            const o = sweepRun(coop02, n, rubenFirst, x, speed);
            expect(o.died, label).toBe(false);
            expect(o.furthest, label).toBeLessThan(EDGE_A - 0.9);
          }
        }
      }
    });
  }

  it("the skeptic's deadly runs at 2 players: alive with the grip, dead without it", () => {
    for (const [x, speed] of DEADLY) {
      const label = `anchor at ${x}, step-off speed ${speed}`;
      const fixed = walkedRun(coop02, x, speed);
      expect(fixed.died, label).toBe(false);
      expect(fixed.furthest, label).toBeLessThan(EDGE_A - 0.9);
      expect(walkedRun(withoutGrip, x, speed).died, `${label}, without the grip`).toBe(true);
    }
  });

  it("without the grip, the idle anchor slides past the lip's corner at 2 players", () => {
    let past = 0;
    for (const x of PLACES) for (const speed of SPEEDS) if (sweepRun(withoutGrip, 2, true, x, speed).furthest > EDGE_A) past++;
    expect(past).toBeGreaterThan(0);
  });
});
