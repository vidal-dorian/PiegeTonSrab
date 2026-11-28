/**
 * Le Labo Réseau (coop02), beat 1: the team stands still while the one who stepped off shaft A hangs
 * below the lip. An idle anchor slides towards the friend hanging below him.
 *
 * - Not leaning in (a newcomer), that friend hangs right under the lip's corner, so once the anchor's
 *   centre passed the corner the wrap was let go and he crept on over the void until he lost the
 *   floor at x 25.40, and both fell out of the level (the skeptic's probe: 8 of 156 runs at 2
 *   players, 4 of 156 at 3, 18 to 34 s after the step). The lip's cell is a non-slip floor's end
 *   ("grip"): an idle anchor's slide never takes him off it (it stops with 0.1 of his feet on it,
 *   centre 25.30), so he never falls.
 * - Leaning in, the anchor's slide is what sets the friend down on the slot's floor: the anchor must
 *   be free to slide up to the lip (a first version of the grip stopped him with his centre over the
 *   lip's cell, x 24.0, and a friend leaning in hung 0.1 above the slot's floor for ever).
 * - The slide past the corner and back is also what calms a friend left swinging in the slot's
 *   mouth: held at 24.0, he swung for 30 s and more (r 0.02-0.04 cell at 28-30 s).
 *
 * The sweeps: 2-5 players, Ruben first (the order the team stands in) or a friend first (he got past
 * Ruben), anchor places, step-off speeds, everyone else standing still.
 */
import { describe, expect, it } from "vitest";
import { BIT_LEFT, COOP_DT, COOP_LEVELS, CoopWorld, parseCoopLevel, type CoopLevelDef } from "@game/shared/coop";
import { cond, idle, roleOf, runSolution, walk, type BotCtx, type Goal, type Phase } from "@game/shared/coop/bots";
import { solution, stepOff } from "../../../shared/src/coop/levels/coop02.solution";

const coop02 = COOP_LEVELS.find((l) => l.id === "coop02")!;
const withoutGrip: CoopLevelDef = { ...coop02, rows: coop02.rows.map((r) => r.replace(/g/g, "#")) };

/** The lip's corner: the right end of the raised floor (floor top 6). */
const EDGE_A = 25;
const FLOOR = 6;
/** The slot's floor top (the server room's floor). */
const SLOT = 10;
/** Furthest an idle anchor's centre may slide on the lip: 0.1 of his 0.8 feet left on it. */
const SLIDE_STOP = EDGE_A + 0.3;

interface Outcome {
  died: boolean;
  /** Furthest right the anchor's centre got after the step. */
  furthest: number;
  /** The stepper stood on the slot's floor. */
  landed: boolean;
}

/** Put body i at centre xs[i] on floor top floors[i] at the first step, then stand still. */
function placed(xs: number[], floors: number[]): (i: number) => Goal {
  return (i) => ({
    label: "placed",
    step(c) {
      if (c.t === 0) c.w.placeBody(i, xs[i]! - c.w.bodies[i]!.width / 2, floors[i]! - c.w.bodies[i]!.height);
      return 0;
    },
    done: (c) => c.t > 30,
  });
}

/** Step off the lip, then lean in for good (hold towards the slot), as the sign says. */
function stepOffLeaning(speed: number): Goal {
  const off = stepOff(EDGE_A, 1, speed);
  let flew = false;
  return {
    label: "step off and lean in",
    step(c: BotCtx) {
      const b = c.w.bodies[c.i]!;
      if (!b.grounded && b.cx > EDGE_A - 0.4) flew = true;
      return flew ? BIT_LEFT : off.step(c);
    },
  };
}

function onSlot(w: CoopWorld, i: number): boolean {
  const b = w.bodies[i]!;
  return b.grounded && Math.abs(b.y + b.height - SLOT) < 0.05 && b.cx < EDGE_A;
}

function run(def: CoopLevelDef, n: number, anchor: number, setup: Phase, stepper: number, goal: Goal, seconds: number, untilLanded = false): Outcome {
  let furthest = 0;
  let stepped = false;
  let landed = false;
  const r = runSolution(
    def,
    n,
    () => [setup, { name: "ATTEMPT", do: { [roleOf(stepper, n)]: goal, "*": idle() }, until: (w) => untilLanded && onSlot(w, stepper), timeout: seconds }],
    {
      every: 1,
      trace: (w: CoopWorld, phase: string) => {
        if (phase !== "ATTEMPT") return;
        stepped = true;
        furthest = Math.max(furthest, w.bodies[anchor]!.cx);
        if (onSlot(w, stepper)) landed = true;
      },
    },
  );
  expect(stepped, r.failure).toBe(true);
  const died = /died/.test(r.failure ?? "");
  if (!died) expect(r.failure ?? "").toMatch(untilLanded && landed ? /^every phase ended/ : /^ATTEMPT: timed out/);
  return { died, furthest, landed };
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
  const setup: Phase = { name: "placed", do: { "*": placed(xs, Array(n).fill(FLOOR)) }, timeout: 1 };
  return run(def, n, anchor, setup, stepper, stepOff(EDGE_A, 1, speed), 30);
}

/** The skeptic's setup (2 players): Ruben walks to 24.4, F0 to x. */
function walkedRun(def: CoopLevelDef, x: number, speed: number): Outcome {
  const setup: Phase = {
    name: "line up",
    do: { R: walk(24.4, { tol: 0.08, jump: "never" }), F0: walk(x, { tol: 0.08, jump: "never" }) },
    until: cond.all(cond.near("R", 24.4, 0.12), cond.near("F0", x, 0.12)),
    timeout: 10,
  };
  return run(def, 2, 0, setup, 1, stepOff(EDGE_A, 1, speed), 30);
}

/**
 * A friend leaning in, his anchor idle at x. 2 players: F0 steps off, Ruben holds him (the other
 * order). 3 players: Ruben is already in the slot (at 22.0), F1 steps off, F0 holds him.
 */
function leanRun(n: 2 | 3, x: number, speed: number): Outcome {
  const xs = n === 2 ? [24.55, x] : [x, 24.55, 22.0];
  const floors = n === 2 ? [FLOOR, FLOOR] : [FLOOR, FLOOR, SLOT];
  const setup: Phase = { name: "placed", do: { "*": placed(xs, floors) }, timeout: 1 };
  return run(coop02, n, n === 2 ? 1 : 0, setup, n === 2 ? 0 : 1, stepOffLeaning(speed), 40, true);
}

const PLACES = [21.6, 22.0, 23.5];
const SPEEDS = [0.8, 1.5, 99];
/** Runs of the skeptic's probe that died before the grip (anchor x, step-off speed). */
const DEADLY: Array<[number, number]> = [
  [22.0, 1.5],
  [22.0, 0.8],
  [23.5, 1.5],
];

/** Range of every body's centre (x and y) over the last 2 s of `seconds` idle, from a bot run's pose. */
function settleRange(n: number, phaseName: string, at: number, seconds: number): number {
  const w = new CoopWorld(
    parseCoopLevel(coop02, n),
    Array.from({ length: n }, (_, i) => ({ name: roleOf(i, n), isRuben: i === n - 1 })),
  );
  const steps = Math.round(at / COOP_DT);
  let found = false;
  for (const phase of solution(n)) {
    const goals = w.bodies.map((_, i) => {
      const spec = phase.do[roleOf(i, n)] ?? phase.do["*"];
      return spec ? (typeof spec === "function" ? spec(i) : spec) : null;
    });
    const ctxs: BotCtx[] = w.bodies.map((_, i) => ({ w, i, t: 0 }));
    const limit = Math.round((phase.timeout ?? 20) / COOP_DT);
    for (let s = 0; s < limit; s++) {
      if (phase.name === phaseName && s === steps) {
        found = true;
        break;
      }
      w.step(goals.map((g, i) => (g ? g.step(ctxs[i]!) : 0)));
      for (const c of ctxs) c.t++;
      const fin = phase.until
        ? phase.until(w)
        : goals.every((g, i) => !g || !g.done || g.done(ctxs[i]!)) && goals.some((g) => g?.done);
      if (fin) break;
    }
    if (found) break;
  }
  expect(found, `${phaseName} +${at} s`).toBe(true);
  const lo: number[] = [];
  const hi: number[] = [];
  const total = Math.round(seconds / COOP_DT);
  for (let t = 0; t < total; t++) {
    w.step(new Array(n).fill(0));
    expect(w.events.some((e) => e.kind === "death")).toBe(false);
    if (t < total - Math.round(2 / COOP_DT)) continue;
    w.bodies.forEach((b, i) => {
      for (const [k, v] of [
        [2 * i, b.cx],
        [2 * i + 1, b.cy],
      ] as const) {
        lo[k] = Math.min(lo[k] ?? v, v);
        hi[k] = Math.max(hi[k] ?? v, v);
      }
    });
  }
  return Math.max(...hi.map((h, k) => h - lo[k]!));
}

describe("coop02 beat 1: an idle anchor never slides off the lip", () => {
  it("the lip's cell is a non-slip floor's end", () => {
    expect(coop02.rows[6]).toBe("########################g...##");
    expect(coop02.legend?.g).toEqual({ kind: "grip" });
  });

  for (const n of [2, 3, 4, 5]) {
    it(`${n} players: nobody dies and the anchor never loses the lip`, () => {
      for (const rubenFirst of [true, false]) {
        for (const x of PLACES) {
          for (const speed of SPEEDS) {
            const label = `${n} players, ${rubenFirst ? "Ruben" : "a friend"} first, anchor at ${x}, step-off speed ${speed}`;
            const o = sweepRun(coop02, n, rubenFirst, x, speed);
            expect(o.died, label).toBe(false);
            expect(o.furthest, label).toBeLessThan(SLIDE_STOP + 1e-3);
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
      expect(fixed.furthest, label).toBeLessThan(SLIDE_STOP + 1e-3);
      const before = walkedRun(withoutGrip, x, speed);
      expect(before.died, `${label}, without the grip`).toBe(true);
      expect(before.furthest, `${label}, without the grip`).toBeGreaterThan(SLIDE_STOP + 0.05);
    }
  });

  it("a friend leaning in is set down on the slot's floor by an idle anchor's slide", () => {
    for (const n of [2, 3] as const) {
      for (const x of [22.2, 23.0, 23.8]) {
        for (const speed of [0.8, 99]) {
          const o = leanRun(n, x, speed);
          const label = `${n} players, anchor at ${x}, step-off speed ${speed}`;
          expect(o.died, label).toBe(false);
          expect(o.landed, label).toBe(true);
        }
      }
    }
  });

  it("a friend left swinging in the slot's mouth settles within 30 s", () => {
    // Poses of the bots' run (2 players: F0 lowering Ruben) at which everyone lets go of the keys.
    for (const at of [2.25, 2.75, 4.25]) {
      expect(settleRange(2, "beat 1: lower Ruben into the slot", at, 30), `+${at} s`).toBeLessThan(0.01);
    }
  });
});
