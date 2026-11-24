import { describe, expect, it } from "vitest";
import { parseLevel, testLevel, type LevelDefinition } from "@game/shared";
import { CharacterController, NO_INPUT, type StepInput } from "@game/shared";
import { cloneTuning, DEFAULT_TUNING, SIM_HZ } from "./config";

const DT = 1 / SIM_HZ;

/** 40 x 12 flat floor, start on the left. */
function flatLevel(): LevelDefinition {
  const empty = ".".repeat(40);
  const rows = Array.from({ length: 10 }, () => empty);
  rows.push("S" + ".".repeat(39));
  rows.push("#".repeat(40));
  return { name: "flat", rows };
}

function setup(def: LevelDefinition = flatLevel()) {
  const tuning = cloneTuning(DEFAULT_TUNING).movement;
  const c = new CharacterController(parseLevel(def), tuning);
  return { c, tuning };
}

function run(c: CharacterController, steps: number, input: (i: number) => StepInput) {
  for (let i = 0; i < steps; i++) c.step(DT, input(i));
}

describe("CharacterController", () => {
  it("starts standing on the ground", () => {
    const { c } = setup();
    run(c, 10, () => NO_INPUT);
    expect(c.grounded).toBe(true);
    expect(c.vy).toBe(0);
  });

  it("full jump reaches the tuned height and length", () => {
    const { c, tuning } = setup();
    run(c, 60, (i) => ({ left: false, right: true, jumpHeld: false, jumpPressed: false }));
    const startY = c.y;
    const startX = c.x;
    let minY = c.y;
    let steps = 0;
    run(c, 1, () => ({ left: false, right: true, jumpHeld: true, jumpPressed: true }));
    while (!c.grounded && steps < 1000) {
      c.step(DT, { left: false, right: true, jumpHeld: true, jumpPressed: false });
      minY = Math.min(minY, c.y);
      steps++;
    }
    expect(startY - minY).toBeCloseTo(tuning.jumpHeight, 1);
    expect(c.x - startX).toBeGreaterThan(4.7);
    expect(c.x - startX).toBeLessThan(5.3);
  });

  it("a tap gives a much smaller jump than a hold", () => {
    const { c } = setup();
    run(c, 5, () => NO_INPUT);
    const startY = c.y;
    let minY = c.y;
    c.step(DT, { left: false, right: false, jumpHeld: true, jumpPressed: true });
    for (let i = 0; i < 200; i++) {
      c.step(DT, NO_INPUT);
      minY = Math.min(minY, c.y);
    }
    expect(startY - minY).toBeLessThan(1.5);
    expect(startY - minY).toBeGreaterThan(0.5);
  });

  it("jump pressed slightly before landing is buffered", () => {
    const { c, tuning } = setup();
    run(c, 5, () => NO_INPUT);
    c.step(DT, { left: false, right: false, jumpHeld: true, jumpPressed: true });
    // Fall until just above the ground, then press jump in the air.
    let pressed = false;
    for (let i = 0; i < 400 && !(pressed && c.vy < 0 && c.grounded === false && i > 0); i++) {
      const nearGround = c.vy > 0 && c.y > 11 - tuning.bodyHeight - 0.3;
      const press = nearGround && !pressed;
      if (press) pressed = true;
      c.step(DT, { left: false, right: false, jumpHeld: pressed, jumpPressed: press });
      if (pressed && c.vy < 0) break;
    }
    expect(pressed).toBe(true);
    expect(c.vy).toBeLessThan(0);
  });

  it("coyote time allows a jump just after walking off a ledge", () => {
    const def: LevelDefinition = {
      name: "ledge",
      rows: [
        ...Array.from({ length: 8 }, () => ".".repeat(20)),
        "S...................",
        "#####...............",
        "#####...............",
      ],
    };
    const { c } = setup(def);
    // Walk right until we leave the ledge.
    let i = 0;
    while (c.grounded && i++ < 500) c.step(DT, { left: false, right: true, jumpHeld: false, jumpPressed: false });
    expect(c.grounded).toBe(false);
    // A few steps later (well under 0.1 s) a jump still works.
    run(c, 4, () => ({ left: false, right: true, jumpHeld: false, jumpPressed: false }));
    c.step(DT, { left: false, right: true, jumpHeld: true, jumpPressed: true });
    expect(c.vy).toBeLessThan(0);
  });

  it("slides slowly down a wall when pressing into it, and wall-jumps away", () => {
    const def: LevelDefinition = {
      name: "wall",
      rows: [
        ...Array.from({ length: 4 }, () => "..........#"),
        ...Array.from({ length: 10 }, () => "..........#"),
        "S.........#",
        "###########",
      ],
    };
    const { c, tuning } = setup(def);
    // Run to the wall, jump, and keep pressing right.
    run(c, 200, () => ({ left: false, right: true, jumpHeld: false, jumpPressed: false }));
    c.step(DT, { left: false, right: true, jumpHeld: true, jumpPressed: true });
    run(c, 60, () => ({ left: false, right: true, jumpHeld: true, jumpPressed: false }));
    expect(c.wallSide).toBe(1);
    expect(c.wallSliding).toBe(true);
    expect(c.vy).toBeLessThanOrEqual(tuning.wallSlideSpeed + 1e-9);

    c.step(DT, { left: false, right: true, jumpHeld: true, jumpPressed: true });
    expect(c.vy).toBeLessThan(0);
    expect(c.vx).toBeLessThan(0);
  });

  it("can cross the 4 and 5 gaps of the test level", () => {
    const { c, tuning } = setup(testLevel);
    // Skip the steps: start on the ground at x = 14, just before the 4-cell gap.
    c.x = 14;
    c.y = 16 - tuning.bodyHeight;
    // Hold right and jump at the last moment: the first step after leaving the ground (coyote time).
    let jumpedSinceLanding = false;
    for (let i = 0; i < SIM_HZ * 6; i++) {
      if (c.grounded) jumpedSinceLanding = false;
      const press = !c.grounded && !jumpedSinceLanding && c.vy >= 0;
      if (press) jumpedSinceLanding = true;
      c.step(DT, { left: false, right: true, jumpHeld: true, jumpPressed: press });
      if (c.x > 31) break;
      expect(c.fellOut).toBe(false);
    }
    expect(c.x).toBeGreaterThan(30);
  });
  it("can climb the wall-jump shaft of the test level", () => {
    const { c, tuning } = setup(testLevel);
    // Shaft interior is x 43..46, floor at y = 16, top of the walls at y = 4.
    c.x = 44;
    c.y = 16 - tuning.bodyHeight;
    let dir: -1 | 1 = 1;
    let minY = c.y;
    c.step(DT, { left: false, right: true, jumpHeld: true, jumpPressed: true });
    for (let i = 0; i < SIM_HZ * 8 && c.y > 3; i++) {
      // Jump off a wall as soon as it is touched, then steer towards the other wall.
      const press = !c.grounded && c.wallSide !== 0;
      if (press) dir = c.wallSide === 1 ? -1 : 1;
      c.step(DT, { left: dir === -1, right: dir === 1, jumpHeld: true, jumpPressed: press });
      minY = Math.min(minY, c.y);
    }
    expect(minY).toBeLessThan(4 - tuning.bodyHeight);
  });
  it("can get over the 4-cell wall with a jump then a wall jump", () => {
    const { c, tuning } = setup(testLevel);
    // Ground before the wall; the wall is the column x = 57, its top at y = 12.
    c.x = 53;
    c.y = 16 - tuning.bodyHeight;
    let wallJumped = false;
    for (let i = 0; i < SIM_HZ * 4 && c.x < 58; i++) {
      const jumpFromGround = c.grounded && c.x > 55;
      // Wall-jump near the top of the first jump, not while still rising fast.
      const wallJump = !wallJumped && !c.grounded && c.wallSide === 1 && c.vy > -1;
      if (wallJump) wallJumped = true;
      c.step(DT, { left: false, right: true, jumpHeld: true, jumpPressed: jumpFromGround || wallJump });
    }
    expect(c.x).toBeGreaterThanOrEqual(58);
  });
});
