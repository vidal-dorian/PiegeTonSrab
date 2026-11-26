/**
 * Regression tests for two co-op review findings. First, holding R to restart is decided inside the
 * deterministic world: it is saved and snapshotted, and it can be replayed from the input bits.
 * Second, timed things run on the attempt's clock (levelTick), not on the global tick.
 */
import { describe, expect, it } from "vitest";
import {
  BIT_RESTART,
  BIT_RIGHT,
  COOP_DT,
  CoopWorld,
  DEATH_FREEZE_STEPS,
  decodeWorld,
  encodeWorld,
  parseCoopLevel,
  RESTART_HOLD_STEPS,
  type CoopEvent,
  type CoopPlayer,
  type ThingDef,
} from "@game/shared/coop";

const H = 0.9;

/** A closed room `w` x `h`: walls, a ceiling and a two-row floor (top at y = h - 2); S at (2, h - 3). */
function room(w: number, h: number, draw: (set: (x: number, y: number, c: string) => void) => void = () => {}): string[] {
  const g: string[][] = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (y === 0 || y >= h - 2 || x === 0 || x === w - 1 ? "#" : ".")));
  g[h - 3]![2] = "S";
  draw((x, y, c) => {
    g[y]![x] = c;
  });
  return g.map((r) => r.join(""));
}

function team(n: number): CoopPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isRuben: false }));
}

function world(rows: string[], n: number, legend: Record<string, ThingDef> = {}): CoopWorld {
  return new CoopWorld(parseCoopLevel({ id: "t", name: "t", rows, legend }, n), team(n));
}

/** Input bits of `n` bodies, with R held by the `holders`. */
function holding(n: number, holders: readonly number[], extra = 0): number[] {
  return Array.from({ length: n }, (_, i) => (holders.includes(i) ? BIT_RESTART | extra : extra));
}

type RestartEvent = Extract<CoopEvent, { kind: "restart" }>;

/** Step with `bits(step)` (from step 1) until the level restarts: that step and the event, or null after `max` steps. */
function untilRestart(w: CoopWorld, bits: (step: number) => number[], max: number): { step: number; event: RestartEvent } | null {
  for (let s = 1; s <= max; s++) {
    w.step(bits(s));
    const event = w.events.find((e): e is RestartEvent => e.kind === "restart");
    if (event) return { step: s, event };
  }
  return null;
}

const EMPTY = room(40, 12);
/** Spikes on the floor at x 20-22. */
const SPIKES = (set: (x: number, y: number, c: string) => void) => {
  for (let x = 20; x <= 22; x++) set(x, 9, "^");
};

describe("holding R restarts the level, inside the world", () => {
  it("takes 1.5 s", () => {
    expect(RESTART_HOLD_STEPS).toBe(Math.round(1.5 / COOP_DT));
  });

  for (const n of [1, 2]) {
    it(`with ${n} player${n > 1 ? "s" : ""}, one holder restarts after 1.5 s; the event names them`, () => {
      const w = world(EMPTY, n);
      const got = untilRestart(w, () => holding(n, [n - 1]), 3 * RESTART_HOLD_STEPS);
      expect(got).toEqual({ step: RESTART_HOLD_STEPS, event: { kind: "restart", attempt: 2, by: n - 1 } });
      expect(w.attempt).toBe(2);
      expect(w.levelTick).toBe(0);
    });
  }

  it("from 3 players, one holder is not enough: half the team (rounded up) is", () => {
    const cases: Array<[n: number, holders: number[], by: number | null]> = [
      [3, [2], null],
      [3, [1, 2], 1],
      [3, [2, 0], 0],
      [4, [3], null],
      [4, [2, 3], 2],
      [5, [3, 4], null],
      [5, [2, 3, 4], 2],
    ];
    for (const [n, holders, by] of cases) {
      const got = untilRestart(world(EMPTY, n), () => holding(n, holders), 3 * RESTART_HOLD_STEPS);
      const label = `${n} players, R held by ${holders.join(",")}`;
      if (by === null) expect(got, label).toBeNull();
      else expect(got, label).toEqual({ step: RESTART_HOLD_STEPS, event: { kind: "restart", attempt: 2, by } });
    }
  });

  it("letting go of R starts the count again", () => {
    // Held one step short of the restart, let go for one step, held again: a full 1.5 s more is needed.
    const w = world(EMPTY, 2);
    const got = untilRestart(w, (s) => holding(2, s === RESTART_HOLD_STEPS ? [] : [1]), 3 * RESTART_HOLD_STEPS);
    expect(got?.step).toBe(2 * RESTART_HOLD_STEPS);
  });

  it("the hold is world state: a world loaded mid-hold restarts on the same step as the original", () => {
    const bits = () => [BIT_RIGHT | BIT_RESTART, 0];
    const heldSteps = 125;
    const orig = world(EMPTY, 2);
    for (let s = 0; s < heldSteps; s++) orig.step(bits());
    const saved = orig.save();
    const fromSave = world(EMPTY, 2);
    fromSave.load(JSON.parse(JSON.stringify(saved)));
    const fromBytes = world(EMPTY, 2);
    fromBytes.load(decodeWorld(encodeWorld(saved)));
    expect(fromSave.hash()).toBe(orig.hash());
    expect(fromBytes.hash()).toBe(orig.hash());
    for (const w of [orig, fromSave, fromBytes]) {
      expect(untilRestart(w, bits, RESTART_HOLD_STEPS)?.step).toBe(RESTART_HOLD_STEPS - heldSteps);
      expect(w.tick).toBe(RESTART_HOLD_STEPS);
      expect(w.attempt).toBe(2);
    }
    expect(fromSave.hash()).toBe(orig.hash());
    expect(fromBytes.hash()).toBe(orig.hash());
  });

  it("R does not cut a death freeze, and the freeze's restart starts the count again", () => {
    // R held from the start; the player is put on the spikes 10 steps before R would restart.
    const w = world(room(40, 12, SPIKES), 1);
    const deathAt = RESTART_HOLD_STEPS - 10;
    const seen: string[] = [];
    for (let s = 1; s <= deathAt + DEATH_FREEZE_STEPS + 2 * RESTART_HOLD_STEPS; s++) {
      if (s === deathAt) w.placeBody(0, 20.6, 10 - H);
      w.step([BIT_RESTART]);
      for (const e of w.events) {
        if (e.kind === "death") seen.push(`${s} death of ${e.victim}`);
        if (e.kind === "restart") seen.push(`${s} restart by ${e.by}`);
      }
    }
    const freezeEnd = deathAt + DEATH_FREEZE_STEPS;
    expect(seen).toEqual([
      `${deathAt} death of 0`,
      `${freezeEnd} restart by -1`,
      `${freezeEnd + RESTART_HOLD_STEPS} restart by 0`,
      `${freezeEnd + 2 * RESTART_HOLD_STEPS} restart by 0`,
    ]);
    expect(w.attempt).toBe(4);
  });
});

describe("timed things run on the attempt's clock", () => {
  // A platform on the clock at x 8-10, row 7, moving 6 cells right and back every 4 s; spikes at x 20-22.
  const rows = room(32, 12, (set) => {
    for (let x = 8; x <= 10; x++) set(x, 7, "m");
    SPIKES(set);
  });
  const legend: Record<string, ThingDef> = { m: { kind: "mover", dx: 6, period: 4 } };
  const sec = (s: number) => Math.round(s / COOP_DT);

  for (const how of ["restart()", "R held", "a death"] as const) {
    it(`after ${how}, a platform on the clock is back at its start and runs as in the first attempt`, () => {
      const w = world(rows, 1, legend);
      const mover = w.props.movers[0]!.collider;
      const start = mover.x;
      for (let s = 0; s < sec(2); s++) w.step([0]);
      const after2s = mover.x;
      expect(after2s).toBeCloseTo(14, 6);
      // Somewhere mid-way when the attempt ends.
      for (let s = 0; s < 130; s++) w.step([0]);
      expect(mover.x).not.toBeCloseTo(start, 1);
      if (how === "restart()") w.restart();
      else if (how === "R held") expect(untilRestart(w, () => [BIT_RESTART], RESTART_HOLD_STEPS)?.step).toBe(RESTART_HOLD_STEPS);
      else {
        w.placeBody(0, 20.6, 10 - H);
        expect(untilRestart(w, () => [0], 2 * DEATH_FREEZE_STEPS)?.step).toBe(DEATH_FREEZE_STEPS + 1);
      }
      expect(w.attempt).toBe(2);
      expect(mover.x).toBe(start);
      for (let s = 0; s < sec(2); s++) w.step([0]);
      expect(mover.x).toBe(after2s);
    });
  }
});
