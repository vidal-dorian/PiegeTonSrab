/**
 * Co-op contacts and lifting: regression tests for the M1 physics review. Bodies that are lifted
 * over a lip (the mantle), land on a base that moves later in the same step, land across two
 * friends (Ruben), jump while tied to a higher partner, or bonk a ceiling edge beside a friend.
 */
import { describe, expect, it } from "vitest";
import {
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_LEFT,
  BIT_RIGHT,
  COOP,
  COOP_DT,
  CoopWorld,
  parseCoopLevel,
  sandboxLevel,
  type CoopController,
  type CoopLevelDef,
  type CoopPlayer,
} from "@game/shared/coop";

const H = 0.9; // body height
const W = 0.8; // body width
/** Below this, an overlap between two bodies is a rounding error. */
const TOL = 1e-4;

const sec = (s: number) => Math.round(s / COOP_DT);

function level(rows: string[]): CoopLevelDef {
  return { id: "test", name: "test", rows };
}

function players(n: number, rubenAt = -1): CoopPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isRuben: i === rubenAt }));
}

function makeWorld(rows: string[], n: number, rubenAt = -1): CoopWorld {
  return new CoopWorld(parseCoopLevel(level(rows)), players(n, rubenAt));
}

/** The sandbox level: its 2-wide trench is x 25 to 27, the rims' top is y = 15. */
function sandbox(n: number): CoopWorld {
  return new CoopWorld(parseCoopLevel(sandboxLevel), players(n));
}

/** A closed room `w` x `h`, floor top at y = floorY, plus the terrain cells `solid` adds; "S" at x = 2 on the floor. */
function room(w: number, h: number, floorY: number, solid: (x: number, y: number) => boolean = () => false): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = "";
    for (let x = 0; x < w; x++) r += y === 0 || y >= floorY || x === 0 || x === w - 1 || solid(x, y) ? "#" : ".";
    rows.push(r);
  }
  const spawnRow = rows[floorY - 1]!.split("");
  spawnRow[2] = "S";
  rows[floorY - 1] = spawnRow.join("");
  return rows;
}

/** Run `steps` steps; `after(s)` is called after each one. */
function run(w: CoopWorld, steps: number, inputs: (s: number) => number[], after: (s: number) => void = () => {}): void {
  for (let s = 0; s < steps; s++) {
    w.step(inputs(s));
    after(s);
  }
}

function overlaps(a: CoopController, b: CoopController): boolean {
  const ox = Math.min(a.x + W, b.x + W) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + H, b.y + H) - Math.max(a.y, b.y);
  return ox > TOL && oy > TOL;
}

/** Whether any two bodies overlap. */
function anyOverlap(w: CoopWorld): boolean {
  const bs = w.bodies;
  for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) if (overlaps(bs[i]!, bs[j]!)) return true;
  return false;
}

/** The body that body i stands on, or -1 (terrain or nothing). */
function standsOn(w: CoopWorld, i: number): number {
  const s = w.bodies[i]!.support;
  return s?.kind === "collider" ? s.body : -1;
}

describe("co-op mantle: only a hauled body climbs, and it lifts its riders with it", () => {
  it("a 2-tower walked into the trench is caught upright, the rider still on its base", () => {
    const w = sandbox(3);
    // P0 waits on the trench's left rim; the tower (base P1, rider P2) walks right into the trench.
    w.placeBody(0, 20, 15 - H);
    w.placeBody(1, 23, 15 - H);
    w.placeBody(2, 23, 15 - 2 * H);
    let overlapSteps = 0;
    let riderBelowBase = 0;
    run(
      w,
      sec(3),
      (s) => [0, s < 60 ? BIT_RIGHT : 0, 0],
      () => {
        if (anyOverlap(w)) overlapSteps++;
        if (w.bodies[2]!.y > w.bodies[1]!.y) riderBelowBase++;
      },
    );
    expect(overlapSteps).toBe(0);
    expect(riderBelowBase).toBe(0);
    const base = w.bodies[1]!;
    const rider = w.bodies[2]!;
    // The base hangs in the trench, below the rim, with the rider standing on its head.
    expect(base.x).toBeGreaterThanOrEqual(25 - 1e-6);
    expect(base.y).toBeGreaterThan(15);
    expect(base.hanging).toBe(true);
    expect(standsOn(w, 2)).toBe(1);
    expect(rider.y + H).toBeCloseTo(base.y, 6);
  });

  it("a body left over the trench drops to the end of the rope instead of hovering at rim height", () => {
    for (const p0x of [19.6, 20, 20.4]) {
      for (const hold of [60, 80, 100]) {
        const label = `P0 at x = ${p0x}, Right held ${hold} steps`;
        const w = sandbox(2);
        w.placeBody(0, p0x, 15 - H);
        w.placeBody(1, 23, 15 - H);
        // Highest position (least y) over the last 2.5 s, long after the keys were released.
        let highest = Infinity;
        run(
          w,
          sec(5),
          (s) => [0, s < hold ? BIT_RIGHT : 0],
          (s) => {
            if (s >= sec(2.5)) highest = Math.min(highest, w.bodies[1]!.y);
          },
        );
        const b = w.bodies[1]!;
        expect(b.x, label).toBeGreaterThanOrEqual(25 - 1e-6);
        expect(b.x + W, label).toBeLessThanOrEqual(27 + 1e-6);
        // Its head stays below the rim (top y = 15): it hangs, it does not hover on the void. The rope
        // is measured along its path over the rim's corner now (it used to be centre to centre: the
        // head stayed under 15.5), so with the anchor 5 cells back the friend hangs just under the
        // rim (measured 15.29-15.44), the link taut at its rest length plus its weight's stretch (4.64).
        expect(highest, label).toBeGreaterThan(15.2);
        expect(b.hanging, label).toBe(true);
        expect(w.rope[0]!.length, label).toBeGreaterThanOrEqual(COOP.ropeLength);
        expect(w.rope[0]!.length, label).toBeLessThan(COOP.ropeLength + 0.25);
      }
    }
  });

  it("a hauled body carrying a rider climbs over the lip with the rider still on its head", () => {
    // A 6-high ledge from x = 20 (top y = 14). P0 walks right on top; P1 hangs against the wall,
    // its feet 1.9 below the lip, with P2 standing on its head.
    const w = makeWorld(room(60, 27, 20, (x, y) => x >= 20 && y >= 14), 3);
    w.placeBody(0, 21.5, 14 - H);
    w.placeBody(1, 19.2, 15);
    w.placeBody(2, 19.2, 15 - H);
    let overlapSteps = 0;
    run(
      w,
      sec(2),
      () => [BIT_RIGHT, 0, 0],
      () => {
        if (anyOverlap(w)) overlapSteps++;
      },
    );
    expect(overlapSteps).toBe(0);
    const base = w.bodies[1]!;
    const rider = w.bodies[2]!;
    expect(base.grounded).toBe(true);
    expect(standsOn(w, 1)).toBe(-1);
    expect(base.y + H).toBeCloseTo(14, 6);
    expect(base.x).toBeGreaterThan(20);
    expect(standsOn(w, 2)).toBe(1);
    expect(rider.x).toBeCloseTo(base.x, 6);
    expect(rider.y + H).toBeCloseTo(base.y, 6);
  });
});

describe("co-op landings on a base that moves later in the same step", () => {
  it("a body falling onto a friend who jumps ends on top, whatever the index order and the jump timing", () => {
    for (const [lander, jumper] of [
      [0, 1],
      [1, 0],
    ] as const) {
      for (const jumpAt of [0, 5, 10, 15]) {
        const label = `lander ${lander}, jumper ${jumper}, jump at step ${jumpAt}`;
        const w = makeWorld(room(40, 27, 20), 2);
        w.placeBody(jumper, 10, 20 - H);
        w.placeBody(lander, 10.1, 15.5);
        let overlapSteps = 0;
        run(
          w,
          150,
          (s) => {
            const inputs = [0, 0];
            inputs[jumper] = s === jumpAt ? BIT_JUMP | BIT_JUMP_PRESS : BIT_JUMP;
            return inputs;
          },
          () => {
            if (anyOverlap(w)) overlapSteps++;
          },
        );
        expect(overlapSteps, label).toBe(0);
        // Settled: the jumper back on the floor, the lander standing on its head (not swapped).
        expect(w.bodies[jumper]!.y + H, label).toBeCloseTo(20, 6);
        expect(standsOn(w, lander), label).toBe(jumper);
        expect(w.bodies[lander]!.y + H, label).toBeCloseTo(w.bodies[jumper]!.y, 6);
      }
    }
  });

  it("a friend who presses jump on the step someone lands on its head stays down and carries them", () => {
    for (const [lander, base] of [
      [0, 1],
      [1, 0],
    ] as const) {
      const label = `lander ${lander}, base ${base}`;
      const w = makeWorld(room(40, 27, 20), 2);
      w.placeBody(base, 10, 20 - H);
      w.placeBody(lander, 10, 20 - 2 * H - 1.5);
      // The step on which the lander lands when nobody presses anything (found on a copy).
      const probe = makeWorld(room(40, 27, 20), 2);
      probe.load(w.save());
      let landStep = -1;
      for (let s = 0; s < 200 && landStep < 0; s++) {
        probe.step([0, 0]);
        if (standsOn(probe, lander) === base) landStep = s;
      }
      expect(landStep, label).toBeGreaterThan(0);
      let overlapSteps = 0;
      let rise = 0;
      run(
        w,
        sec(0.75),
        (s) => {
          const inputs = [0, 0];
          inputs[base] = s === landStep ? BIT_JUMP | BIT_JUMP_PRESS : s > landStep ? BIT_JUMP : 0;
          return inputs;
        },
        () => {
          if (anyOverlap(w)) overlapSteps++;
          rise = Math.max(rise, 20 - H - w.bodies[base]!.y);
        },
      );
      expect(overlapSteps, label).toBe(0);
      // At most a hop (a base that steps first may leave the floor before the lander touches it), never a jump.
      expect(rise, label).toBeLessThan(0.25);
      expect(w.bodies[base]!.y + H, label).toBeCloseTo(20, 6);
      expect(standsOn(w, lander), label).toBe(base);
      expect(w.bodies[lander]!.y + H, label).toBeCloseTo(w.bodies[base]!.y, 6);
    }
  });
});

describe("Ruben landing across two friends", () => {
  it("slides off both within half a second and the friends stay where they are", () => {
    for (const rubenX of [10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7]) {
      const label = `Ruben dropped at x = ${rubenX}`;
      const w = makeWorld(room(40, 27, 20), 3, 2);
      // Two friends standing shoulder to shoulder; Ruben dropped from above, across the seam.
      w.placeBody(0, 10, 20 - H);
      w.placeBody(1, 10.8, 20 - H);
      w.placeBody(2, rubenX, 20 - 2 * H - 1);
      let firstInside = -1;
      let lastInside = -1;
      const squashes: number[] = [];
      run(
        w,
        sec(3),
        () => [0, 0, 0],
        (s) => {
          for (const e of w.events) if (e.kind === "squash") squashes.push(e.body);
          const r = w.bodies[2]!;
          if (overlaps(r, w.bodies[0]!) || overlaps(r, w.bodies[1]!)) {
            if (firstInside < 0) firstInside = s;
            lastInside = s;
          }
        },
      );
      expect(firstInside, label).toBeGreaterThanOrEqual(0);
      expect(lastInside - firstInside, label).toBeLessThan(sec(0.5));
      const r = w.bodies[2]!;
      // He ends on the floor beside them: left of friend 0 or right of friend 1.
      expect(r.grounded, label).toBe(true);
      expect(r.y + H, label).toBeCloseTo(20, 6);
      expect(r.x + W <= 10 + 1e-6 || r.x >= 11.6 - 1e-6, label).toBe(true);
      expect(w.bodies[0]!.x, label).toBeCloseTo(10, 6);
      expect(w.bodies[1]!.x, label).toBeCloseTo(10.8, 6);
      // Each friend is squashed once, by the landing.
      expect([...squashes].sort((a, b) => a - b), label).toEqual([0, 1]);
    }
  });
});

describe("co-op rope: the haul-speed cap and a player's own jump", () => {
  // Floor top y = 20, a 1-high step from x = 30 (top y = 19).
  const rows = room(60, 27, 20, (x, y) => x >= 30 && y >= 19);

  /** P0 idles with its left at p0x, feet on p0Top; P1 stands on the floor `sep` to its left, then jumps holding Left. */
  function jumpAway(p0x: number, p0Top: number, sep: number): { peak: number; maxSpeedChange: number } {
    const w = makeWorld(rows, 2);
    w.placeBody(0, p0x, p0Top - H);
    w.placeBody(1, p0x - sep, 20 - H);
    run(w, 30, () => [0, 0]);
    const y0 = w.bodies[1]!.y;
    let peak = 0;
    // The largest change of the vertical speed in one step while P1 still rises fast.
    let maxSpeedChange = 0;
    let prevVy = 0;
    run(
      w,
      80,
      (s) => [0, BIT_LEFT | BIT_JUMP | (s === 0 ? BIT_JUMP_PRESS : 0)],
      (s) => {
        const b = w.bodies[1]!;
        peak = Math.max(peak, y0 - b.y);
        if (s > 0 && prevVy < -1) maxSpeedChange = Math.max(maxSpeedChange, Math.abs(b.vy - prevVy));
        prevVy = b.vy;
      },
    );
    return { peak, maxSpeedChange };
  }

  it("a body below a taut partner standing higher still jumps its own jump", () => {
    const higher = jumpAway(30.5, 19, COOP.ropeLength); // partner one cell higher, rope taut
    const flat = jumpAway(26, 20, COOP.ropeLength); // partner on the same floor, rope taut
    const slack = jumpAway(30.5, 19, 3.5); // partner one cell higher, rope slack at the start
    expect(higher.peak).toBeGreaterThanOrEqual(flat.peak);
    expect(higher.peak).toBeGreaterThan(0.9 * slack.peak);
    // Gravity takes about 0.33 cells/s per step: nothing cuts the jump's speed at once.
    expect(higher.maxSpeedChange).toBeLessThan(1);
  });
});

describe("co-op corner correction", () => {
  // A 1-high tunnel: its ceiling (rows 15 to 18) ends at x = 10, the floor top is y = 20, so a
  // body standing on the floor has 0.1 of headroom under it.
  const rows = room(40, 27, 20, (x, y) => x <= 9 && y >= 15 && y <= 18);

  /** Body 0 stands 0.1 under the ceiling's edge and jumps; body 1 stands on the floor at friendX. */
  function jumpUnderEdge(friendX: number): { w: CoopWorld; overlapSteps: number; rightmost: number; peak: number } {
    const w = makeWorld(rows, 2);
    w.placeBody(0, 9.9, 20 - H);
    w.placeBody(1, friendX, 20 - H);
    run(w, 5, () => [0, 0]);
    let overlapSteps = 0;
    let rightmost = -Infinity;
    let peak = 0;
    run(
      w,
      40,
      (s) => [s === 0 ? BIT_JUMP | BIT_JUMP_PRESS : BIT_JUMP, 0],
      () => {
        const a = w.bodies[0]!;
        if (anyOverlap(w)) overlapSteps++;
        rightmost = Math.max(rightmost, a.x);
        peak = Math.max(peak, 20 - H - a.y);
      },
    );
    return { w, overlapSteps, rightmost, peak };
  }

  it("does not shift a jumping body sideways into the friend touching it", () => {
    const { w, overlapSteps, rightmost } = jumpUnderEdge(10.7);
    expect(overlapSteps).toBe(0);
    expect(rightmost).toBeLessThanOrEqual(9.9 + 1e-6);
    expect(w.bodies[1]!.x).toBeCloseTo(10.7, 6);
  });

  it("still nudges the body clear of the edge when there is room beside it", () => {
    const { overlapSteps, rightmost, peak } = jumpUnderEdge(12);
    expect(overlapSteps).toBe(0);
    expect(rightmost).toBeCloseTo(10, 6);
    expect(peak).toBeGreaterThan(2.5);
  });
});
