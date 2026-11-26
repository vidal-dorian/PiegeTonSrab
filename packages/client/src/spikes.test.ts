/**
 * Spikes (objects.ts, decided 2026-11-26): a solid block that kills only through its pointed
 * face, turned like the cannon (up, right, down, left), and always placed against a block.
 * Played with the real CharacterController and findKiller, as the race does.
 */
import { describe, expect, it } from "vitest";
import {
  canPlaceObject,
  CharacterController,
  DEFAULT_MOVEMENT,
  defaultDir,
  erasableAt,
  findKiller,
  HAZARD_INSET,
  hasErasable,
  isSupportCell,
  OBJECT_DEFS,
  OBJECT_KINDS,
  objectPlacementProblem,
  objectsLeaningOn,
  parseLevel,
  SIM_HZ,
  supportCell,
  supportFirst,
  withSolidObjects,
  type CardKind,
  type Dir,
  type Level,
  type PlacedObject,
  type StepInput,
} from "@game/shared";

const m = DEFAULT_MOVEMENT;
const DT = 1 / SIM_HZ;
const idle: StepInput = { left: false, right: false, jumpHeld: false, jumpPressed: false };

/** Spikes with an id, pointing `dir`. */
function spikes(id: number, x: number, y: number, dir: Dir, ownerId?: string): PlacedObject {
  return { id, kind: "spikes", x, y, dir, ...(ownerId ? { ownerId } : {}) };
}

/**
 * Play a character in `level` with `objects` in it (solid ones as terrain), checking traps
 * after every step like the race does. Returns what killed it (or null) and the controller.
 */
function play(
  level: Level,
  objects: PlacedObject[],
  setup: (c: CharacterController) => void,
  input: (c: CharacterController, step: number) => StepInput,
  seconds: number,
): { killer: PlacedObject | null; c: CharacterController } {
  for (const o of objects) expect(canPlaceObject(level, objects.filter((p) => p !== o), o), `spikes at (${o.x}, ${o.y})`).toBe(true);
  const c = new CharacterController(withSolidObjects(level, objects), m);
  setup(c);
  for (let i = 0; i < Math.round(seconds * SIM_HZ); i++) {
    c.step(DT, input(c, i));
    const box = { x: c.x + HAZARD_INSET, y: c.y + HAZARD_INSET, w: m.bodyWidth - 2 * HAZARD_INSET, h: m.bodyHeight - 2 * HAZARD_INSET };
    const killer = findKiller(objects, box, c.vy, i * DT, {}, c.vx);
    if (killer) return { killer, c };
  }
  return { killer: null, c };
}

const run = (dir: -1 | 1, jumpAt?: (c: CharacterController) => boolean) => (c: CharacterController) => {
  const jump = jumpAt?.(c) ?? false;
  return { left: dir < 0, right: dir > 0, jumpHeld: jump || !c.grounded, jumpPressed: jump };
};

describe("upward spikes on the floor", () => {
  const floor = parseLevel({
    name: "floor",
    rows: ["....................", "....................", "....................", "S...................", "####################"],
  });
  const up = spikes(7, 10, 3, 3, "a");

  it("running into them sideways does not kill: they are a block", () => {
    const fromLeft = play(floor, [up], (c) => c.standInCell(6, 3), run(1), 1.5);
    expect(fromLeft.killer).toBeNull();
    expect(fromLeft.c.grounded).toBe(true);
    expect(fromLeft.c.x + m.bodyWidth).toBeCloseTo(10, 5); // stopped against the block
    const fromRight = play(floor, [up], (c) => c.standInCell(14, 3), run(-1), 1.5);
    expect(fromRight.killer).toBeNull();
    expect(fromRight.c.x).toBeCloseTo(11, 5);
  });

  it("landing on them kills, and the kill goes to them", () => {
    const drop = play(floor, [up], (c) => {
      c.x = 10.1;
      c.y = 0;
      c.grounded = false;
    }, () => idle, 2);
    expect(drop.killer?.id).toBe(7);
    // Landing with only the toes on the block counts too (body x 9.4..10.2).
    const edge = play(floor, [up], (c) => {
      c.x = 9.4;
      c.y = 0;
      c.grounded = false;
    }, () => idle, 2);
    expect(edge.killer?.id).toBe(7);
  });

  it("standing on them kills", () => {
    const { killer } = play(floor, [up], (c) => c.standInCell(10, 2), () => idle, 0.1);
    expect(killer?.id).toBe(7);
  });

  it("a running jump clears them", () => {
    const { killer, c } = play(floor, [up], (c) => c.standInCell(6, 3), run(1, (c) => c.grounded && c.x > 8.2 && c.x < 8.4), 1.5);
    expect(killer).toBeNull();
    expect(c.x).toBeGreaterThan(12);
    expect(c.grounded).toBe(true);
  });

  it("are refused in mid-air, accepted on the floor", () => {
    expect(objectPlacementProblem(floor, [], { kind: "spikes", x: 10, y: 3, dir: 3 })).toBeNull();
    expect(objectPlacementProblem(floor, [], { kind: "spikes", x: 10, y: 2, dir: 3 })).toBe("support");
    // No direction given: they point up, so they need the floor.
    expect(defaultDir("spikes")).toBe(3);
    expect(objectPlacementProblem(floor, [], { kind: "spikes", x: 10, y: 3 })).toBeNull();
    expect(objectPlacementProblem(floor, [], { kind: "spikes", x: 10, y: 2 })).toBe("support");
  });
});

describe("spikes on a wall", () => {
  // A wall at x = 15; spikes against both of its sides, on the floor row.
  const walled = parseLevel({
    name: "wall",
    rows: [
      "...............#....",
      "...............#....",
      "...............#....",
      "S..............#....",
      "####################",
    ],
  });

  it("running into their face kills, from either side", () => {
    const left = spikes(3, 14, 3, 2, "a"); // points left, leans on the wall
    expect(play(walled, [left], (c) => c.standInCell(9, 3), run(1), 1.5).killer?.id).toBe(3);
    const right = spikes(4, 16, 3, 0, "a"); // points right
    expect(play(walled, [right], (c) => c.standInCell(19, 3), run(-1), 1.5).killer?.id).toBe(4);
  });

  it("jumping into their face kills too", () => {
    // A column of two, so the body can't pass over them.
    const column = [spikes(5, 14, 2, 2, "a"), spikes(6, 14, 3, 2, "a")];
    const { killer, c } = play(walled, column, (c) => c.standInCell(13, 3), run(1, (c) => c.grounded), 1.5);
    expect(killer?.kind).toBe("spikes");
    expect(c.grounded).toBe(false);
    expect(c.vy).toBeLessThan(0); // still on the way up
  });

  it("their top is a plain block: landing on wall spikes is safe", () => {
    const left = spikes(3, 14, 3, 2, "a");
    const { killer, c } = play(walled, [left], (c) => {
      c.x = 14.1;
      c.y = 0;
      c.grounded = false;
    }, () => idle, 1.5);
    expect(killer).toBeNull();
    expect(c.grounded).toBe(true);
    expect(c.y + m.bodyHeight).toBeCloseTo(3, 5); // standing on top of the spikes block
  });

  it("must lean on the wall: pointing into it, or away from nothing, is refused", () => {
    expect(objectPlacementProblem(walled, [], { kind: "spikes", x: 14, y: 2, dir: 2 })).toBeNull();
    expect(objectPlacementProblem(walled, [], { kind: "spikes", x: 14, y: 2, dir: 0 })).toBe("support");
    expect(objectPlacementProblem(walled, [], { kind: "spikes", x: 16, y: 2, dir: 0 })).toBeNull();
    expect(objectPlacementProblem(walled, [], { kind: "spikes", x: 16, y: 2, dir: 2 })).toBe("support");
  });
});

describe("spikes on a ceiling", () => {
  it("jumping into them kills", () => {
    const hall = parseLevel({
      name: "hall",
      rows: ["####################", "....................", "....................", "....................", "S...................", "####################"],
    });
    // Three in a row so the head can't slip past an edge (corner correction).
    const row = [spikes(1, 9, 1, 1, "a"), spikes(2, 10, 1, 1, "a"), spikes(3, 11, 1, 1, "a")];
    const { killer } = play(hall, row, (c) => c.standInCell(10, 4), (c, i) => ({ ...idle, jumpPressed: i === 0, jumpHeld: true }), 1.5);
    expect(killer?.id).toBe(2);
    // Standing under them, nothing happens.
    expect(play(hall, row, (c) => c.standInCell(10, 4), () => idle, 0.5).killer).toBeNull();
  });

  it("walking under them through a gap one cell high is safe, jumping there is not", () => {
    const low = parseLevel({ name: "low", rows: ["####################", "....................", "S...................", "####################"] });
    const row = [spikes(1, 9, 1, 1, "a"), spikes(2, 10, 1, 1, "a"), spikes(3, 11, 1, 1, "a")];
    const walk = play(low, row, (c) => c.standInCell(5, 2), run(1), 1.5);
    expect(walk.killer).toBeNull();
    expect(walk.c.x).toBeGreaterThan(14);
    const jump = play(low, row, (c) => c.standInCell(10, 2), (c, i) => ({ ...idle, jumpPressed: i === 0, jumpHeld: true }), 0.5);
    expect(jump.killer?.id).toBe(2);
  });
});

describe("the support rule", () => {
  // A block in the middle at (15, 3), a ceiling, a floor and side walls.
  const room = parseLevel({
    name: "room",
    rows: [
      "##############################",
      "#............................#",
      "#............................#",
      "#..............#.............#",
      "#............................#",
      "#............................#",
      "#............................#",
      "#S..........................F#",
      "##############################",
    ],
  });
  const problem = (x: number, y: number, dir: Dir, objects: PlacedObject[] = []) =>
    objectPlacementProblem(room, objects, { kind: "spikes", x, y, dir });

  it("spikes point away from the block they lean on, in each of the four directions", () => {
    // Neighbour of the block at (15, 3) on each side, and the one direction that works there.
    const sides: Array<{ x: number; y: number; dir: Dir }> = [
      { x: 16, y: 3, dir: 0 },
      { x: 15, y: 4, dir: 1 },
      { x: 14, y: 3, dir: 2 },
      { x: 15, y: 2, dir: 3 },
    ];
    for (const s of sides) {
      expect(supportCell(s.x, s.y, s.dir)).toEqual({ x: 15, y: 3 });
      for (const dir of [0, 1, 2, 3] as const) {
        expect(problem(s.x, s.y, dir), `(${s.x}, ${s.y}) dir ${dir}`).toBe(dir === s.dir ? null : "support");
      }
    }
  });

  it("leans on any terrain: floor, ceiling, side walls", () => {
    expect(problem(10, 7, 3)).toBeNull();
    expect(problem(10, 1, 1)).toBeNull();
    expect(problem(1, 2, 0)).toBeNull();
    expect(problem(28, 2, 2)).toBeNull();
    expect(problem(10, 4, 3)).toBe("support");
  });

  it("leans on a solid object (platform, cannon, spring, vine, other spikes), never on a saw", () => {
    for (const kind of OBJECT_KINDS) {
      const below: PlacedObject = { id: 1, kind, x: 20, y: 3 };
      expect(problem(20, 2, 3, [below]), kind).toBe(OBJECT_DEFS[kind].solid ? null : "support");
      expect(isSupportCell(room, [below], 20, 3)).toBe(OBJECT_DEFS[kind].solid);
    }
    expect(OBJECT_DEFS.saw.solid).toBe(false);
    expect(OBJECT_DEFS.spikes.solid).toBe(true);
  });

  it("the open sky above the level and the pit below it are no support; its sides are", () => {
    const open = parseLevel({
      name: "open",
      rows: ["...............", "...............", "...............", "......S........", "#####.....#####"],
    });
    const p = (x: number, y: number, dir: Dir) => objectPlacementProblem(open, [], { kind: "spikes", x, y, dir });
    expect(p(12, 0, 1)).toBe("support"); // top row, hanging from the sky
    expect(p(7, 4, 3)).toBe("support"); // in the gap of the floor, over the pit
    expect(p(0, 1, 0)).toBeNull(); // the level's left edge is a wall
    expect(p(14, 1, 2)).toBeNull(); // and its right edge
    expect(p(12, 3, 3)).toBeNull();
    expect(isSupportCell(open, [], 12, -1)).toBe(false);
    expect(isSupportCell(open, [], 7, 5)).toBe(false);
    expect(isSupportCell(open, [], -1, 2)).toBe(true);
  });

  it("only spikes need a support: other objects may float", () => {
    expect(OBJECT_KINDS.filter((k) => OBJECT_DEFS[k].needsSupport)).toEqual(["spikes"]);
    for (const kind of OBJECT_KINDS) {
      if (kind === "spikes") continue;
      expect(objectPlacementProblem(room, [], { kind, x: 10, y: 4, dir: 1 }), kind).toBeNull();
    }
  });

  it("the cell's own problems come first: terrain, taken, outside", () => {
    const taken: PlacedObject[] = [{ id: 1, kind: "saw", x: 10, y: 7 }];
    expect(problem(15, 3, 3)).toBe("terrain");
    expect(problem(10, 7, 3, taken)).toBe("taken");
    expect(problem(-1, 3, 0)).toBe("outside");
  });
});

describe("hands and erasers with spikes", () => {
  it("supportFirst plays objects that need a support last, otherwise in order", () => {
    const hand: Array<{ kind: CardKind; x: number }> = [
      { kind: "spikes", x: 1 },
      { kind: "platform", x: 2 },
      { kind: "eraser", x: 3 },
      { kind: "spikes", x: 4 },
      { kind: "saw", x: 5 },
    ];
    const copy = [...hand];
    expect(supportFirst(hand).map((c) => c.x)).toEqual([2, 3, 5, 1, 4]);
    expect(hand).toEqual(copy); // the hand itself is left as it was
    expect(supportFirst([])).toEqual([]);
  });

  // Bob's platform at (20, 3) in an open sky, with Alice's spikes on three of its sides.
  const platform: PlacedObject = { id: 1, kind: "platform", x: 20, y: 3, ownerId: "b" };
  const onTop = spikes(2, 20, 2, 3, "a");
  const onRight = spikes(3, 21, 3, 0, "a");
  const under = spikes(4, 20, 4, 1, "a");
  const elsewhere = spikes(5, 15, 2, 3, "a");

  it("objectsLeaningOn finds the spikes leaning on an object, whatever their side", () => {
    const objects = [platform, onTop, onRight, under, elsewhere];
    expect(objectsLeaningOn(objects, platform).map((o) => o.id)).toEqual([2, 3, 4]);
    expect(objectsLeaningOn(objects, elsewhere)).toEqual([]);
    // Spikes pointing up next to the platform lean on the floor, not on it.
    expect(objectsLeaningOn([platform, spikes(6, 21, 3, 3)], platform)).toEqual([]);
  });

  it("an eraser can't remove a block spikes lean on, only the spikes first", () => {
    const objects = [platform, onTop, onRight];
    expect(erasableAt(objects, 20, 3, "c")).toEqual({ target: null, reason: "Des pics sont posés dessus" });
    expect(erasableAt(objects, 20, 2, "c").target).toBe(onTop);
    expect(erasableAt([platform, onRight], 20, 3, "c").target).toBeNull();
    expect(erasableAt([platform], 20, 3, "c").target).toBe(platform);
    // Spikes stacked on spikes: the bottom ones hold the top ones.
    const base = spikes(7, 10, 7, 3, "b");
    const stacked = spikes(8, 10, 6, 3, "a");
    expect(erasableAt([base, stacked], 10, 7, "c").reason).toBe("Des pics sont posés dessus");
    // Your own object stays "yours" first.
    expect(erasableAt(objects, 20, 3, "b").reason).toBe("C'est ton objet");
  });

  it("hasErasable leaves out a block held up by spikes nobody can erase", () => {
    const levelSpikes: PlacedObject = { id: -1, kind: "spikes", x: 20, y: 2, dir: 3 }; // part of the map
    expect(hasErasable([platform, levelSpikes], "a")).toBe(false);
    expect(hasErasable([platform], "a")).toBe(true);
    // Alice's spikes on Bob's platform: Bob can erase them, Alice can erase nothing of her own.
    expect(hasErasable([platform, onTop], "b")).toBe(true);
    expect(hasErasable([platform, onTop], "c")).toBe(true);
  });
});
