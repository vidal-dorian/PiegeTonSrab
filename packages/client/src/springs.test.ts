/**
 * Springs by direction (decided 2026-11-26: springs can be turned and put on walls and
 * ceilings). Facing up: landing on it throws you up, as before (mechanics.test.ts). Facing
 * left or right: running or jumping into its face throws you back the other way with a hop.
 * Facing down: hitting it with your head throws you down.
 */
import { describe, expect, it } from "vitest";
import {
  bounceDirAt,
  buildReachGraph,
  CharacterController,
  DEFAULT_MOVEMENT,
  isBouncyCell,
  parseLevel,
  SIM_HZ,
  withSolidObjects,
  type Dir,
  type PlacedObject,
  type StepInput,
} from "@game/shared";

const m = DEFAULT_MOVEMENT;
const DT = 1 / SIM_HZ;
const idle: StepInput = { left: false, right: false, jumpHeld: false, jumpPressed: false };
const right: StepInput = { ...idle, right: true };
const left: StepInput = { ...idle, left: true };

const spring = (x: number, y: number, dir: Dir): PlacedObject => ({ id: 1, kind: "spring", x, y, dir });

// A room with walls on both sides, floor on row 6.
const room = parseLevel({
  name: "room",
  rows: [
    "####################",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#S.................#",
    "####################",
  ],
});
const W = room.width;

/** Step until `done` (or the time runs out); returns the number of steps taken. */
function stepUntil(c: CharacterController, input: (c: CharacterController) => StepInput, done: (c: CharacterController) => boolean, seconds = 3): number {
  let i = 0;
  for (; i < seconds * SIM_HZ && !done(c); i++) c.step(DT, input(c));
  return i;
}

describe("springs keep their direction in the collision level", () => {
  it("withSolidObjects records which way each spring throws; only an upward one bounces a landing", () => {
    const level = withSolidObjects(room, [
      { id: 1, kind: "spring", x: 3, y: 5 },
      { id: 2, kind: "spring", x: 5, y: 5, dir: 0 },
      { id: 3, kind: "spring", x: 7, y: 1, dir: 1 },
      { id: 4, kind: "spring", x: 9, y: 5, dir: 2 },
      { id: 5, kind: "platform", x: 11, y: 5 },
    ]);
    expect([3, 5, 7, 9, 11].map((x) => bounceDirAt(level, x, x === 7 ? 1 : 5))).toEqual([3, 0, 1, 2, null]);
    expect([3, 5, 9].map((x) => isBouncyCell(level, x, 5))).toEqual([true, false, false]);
    expect(isBouncyCell(level, 7, 1)).toBe(false);
    expect(bounceDirAt(room, 3, 5)).toBeNull(); // the original level is untouched
  });
});

describe("a spring on a wall", () => {
  it("running into its face throws you back at springSideSpeed, with a small hop, about 6 cells", () => {
    // Against the right wall, facing left.
    const c = new CharacterController(withSolidObjects(room, [spring(18, 5, 2)]), m);
    c.standInCell(14, 5);
    stepUntil(c, () => right, (c) => c.bounceCount > 0);
    expect(c.bounceCount).toBe(1);
    expect(c.lastBounceCell).toBe(5 * W + 18);
    expect(c.vx).toBe(-m.springSideSpeed);
    expect(c.vy).toBeLessThan(0);
    expect(c.grounded).toBe(false);
    const x0 = c.x;
    const feet0 = c.y + m.bodyHeight;
    let top = c.y;
    // Holding right during the throw changes nothing: the input is locked for springSideLock.
    const lockSteps = Math.floor(m.springSideLock * SIM_HZ) - 2;
    for (let i = 0; i < lockSteps; i++) {
      c.step(DT, right);
      top = Math.min(top, c.y);
    }
    expect(c.vx).toBe(-m.springSideSpeed);
    stepUntil(c, () => idle, (c) => {
      top = Math.min(top, c.y);
      return c.grounded;
    });
    const hop = feet0 - (top + m.bodyHeight);
    expect(hop).toBeGreaterThan(m.springSideHeight - 0.1);
    expect(hop).toBeLessThan(m.springSideHeight + 0.1);
    const distance = x0 - c.x;
    expect(distance).toBeGreaterThan(5);
    expect(distance).toBeLessThan(8);
  });

  it("facing right on the left wall throws you to the right", () => {
    const c = new CharacterController(withSolidObjects(room, [spring(1, 5, 0)]), m);
    c.standInCell(5, 5);
    stepUntil(c, () => left, (c) => c.bounceCount > 0);
    expect(c.bounceCount).toBe(1);
    expect(c.vx).toBe(m.springSideSpeed);
    expect(c.vy).toBeLessThan(0);
  });

  it("jumping into its face throws you too", () => {
    const c = new CharacterController(withSolidObjects(room, [spring(18, 4, 2), spring(18, 3, 2)]), m);
    c.standInCell(16, 5);
    c.step(DT, { ...right, jumpPressed: true, jumpHeld: true });
    stepUntil(c, () => ({ ...right, jumpHeld: true }), (c) => c.bounceCount > 0);
    expect(c.bounceCount).toBe(1);
    expect(c.vx).toBe(-m.springSideSpeed);
  });

  it("is a plain block from its back and its top", () => {
    // Free-standing in the middle of the room, facing left: hit from the right (its back).
    const back = new CharacterController(withSolidObjects(room, [spring(10, 5, 2)]), m);
    back.standInCell(14, 5);
    stepUntil(back, () => left, () => false, 1);
    expect(back.bounceCount).toBe(0);
    expect(back.x).toBeCloseTo(11, 5);
    expect(back.grounded).toBe(true);
    // Landing on top of it: no bounce, you stand on it.
    const top = new CharacterController(withSolidObjects(room, [spring(10, 5, 2)]), m);
    top.x = 10.1;
    top.y = 1;
    top.grounded = false;
    stepUntil(top, () => idle, () => false, 1.5);
    expect(top.bounceCount).toBe(0);
    expect(top.grounded).toBe(true);
    expect(top.y + m.bodyHeight).toBeCloseTo(5, 5);
  });

  it("an upward spring does not throw you when you run into its side", () => {
    const c = new CharacterController(withSolidObjects(room, [spring(10, 5, 3)]), m);
    c.standInCell(6, 5);
    stepUntil(c, () => right, () => false, 1);
    expect(c.bounceCount).toBe(0);
    expect(c.x + m.bodyWidth).toBeCloseTo(10, 5);
  });
});

describe("a spring on a ceiling", () => {
  it("hitting it with your head throws you down at springDownSpeed", () => {
    // Hung under a low ceiling (springs need no block behind them), within jumping height.
    const springs = [spring(9, 2, 1), spring(10, 2, 1), spring(11, 2, 1)];
    const c = new CharacterController(withSolidObjects(room, springs), m);
    c.standInCell(10, 5);
    c.step(DT, { ...idle, jumpPressed: true, jumpHeld: true });
    stepUntil(c, () => ({ ...idle, jumpHeld: true }), (c) => c.bounceCount > 0);
    expect(c.bounceCount).toBe(1);
    expect(c.lastBounceCell).toBe(2 * W + 10);
    expect(c.vy).toBe(m.springDownSpeed);
    // Back on the floor much sooner than a plain jump would be.
    const steps = stepUntil(c, () => idle, (c) => c.grounded);
    expect(steps * DT).toBeLessThan(0.3);
  });

  it("landing on a ceiling spring's top (it faces down) is no bounce", () => {
    const c = new CharacterController(withSolidObjects(room, [spring(10, 5, 1)]), m);
    c.x = 10.1;
    c.y = 1;
    c.grounded = false;
    stepUntil(c, () => idle, () => false, 1.5);
    expect(c.bounceCount).toBe(0);
    expect(c.grounded).toBe(true);
  });
});

describe("the reachability check plays sideways springs", () => {
  // A tunnel two cells high, and a gap of 4 in its floor that opens on the bottom of the
  // level: too long to jump (the ceiling cuts the jump). Running from S into a spring on the
  // right wall throws the player left across it, at more than twice the running speed.
  const tunnel = parseLevel({
    name: "tunnel",
    rows: [
      "##########################",
      "#........................#",
      "#.F....................S.#",
      "###################....###",
    ],
  });

  it("a ledge reachable only through a sideways spring", () => {
    const at = { x: 24, y: 2 };
    expect(buildReachGraph(tunnel, [], m).reachable).toBe(false);
    expect(buildReachGraph(tunnel, [{ id: 1, kind: "platform", ...at }], m).reachable).toBe(false);
    for (const dir of [0, 1, 3] as const) {
      expect(buildReachGraph(tunnel, [{ id: 1, kind: "spring", ...at, dir }], m).reachable, `dir ${dir}`).toBe(false);
    }
    expect(buildReachGraph(tunnel, [{ id: 1, kind: "spring", ...at, dir: 2 }], m).reachable).toBe(true);
  });

  it("the controller really makes it across", () => {
    const c = new CharacterController(withSolidObjects(tunnel, [{ id: 1, kind: "spring", x: 24, y: 2, dir: 2 }]), m);
    c.standInCell(23, 2);
    stepUntil(c, (c) => (c.bounceCount === 0 ? right : idle), (c) => c.fellOut || (c.bounceCount > 0 && c.grounded));
    expect(c.fellOut).toBe(false);
    expect(c.grounded).toBe(true);
    expect(c.x + m.bodyWidth).toBeLessThanOrEqual(19); // on the far side of the gap (x 19..22)
  });
});
