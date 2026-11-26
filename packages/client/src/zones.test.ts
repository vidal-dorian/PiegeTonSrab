/**
 * Protected zones (level.ts, decided 2026-11-26): nothing may be placed in a box 7 cells wide
 * and 4 tall around the start, nor in a 5 by 5 box around the flag, and players don't touch
 * each other in the start zone. The session side (dead players' blocks, stomps) is in
 * sessionRules.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  bodyInSpawnZone,
  canPlaceAt,
  canPlaceObject,
  contactWith,
  DEFAULT_MOVEMENT,
  FINISH_ZONE_RADIUS,
  isFinishZoneCell,
  isProtectedCell,
  isSpawnPadCell,
  isSpawnZoneCell,
  objectPlacementProblem,
  OBJECT_KINDS,
  parseLevel,
  placementProblem,
  prepareObjects,
  protectedZones,
  SPAWN_ZONE_HALF_WIDTH,
  SPAWN_ZONE_HEIGHT,
  type PlacedObject,
} from "@game/shared";

/**
 * 30 x 12, S at (6, 8) standing on row 9 with an empty row 10 under the floor's gap at x 6,
 * F at (22, 5) on a ledge, far from both edges.
 */
const room = parseLevel({
  name: "zones",
  rows: [
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "..............................",
    "......................F.......",
    ".....................###......",
    "..............................",
    "......S.......................",
    "######.#######################",
    "..............................",
    "##############################",
  ],
});
const S = room.start;
const F = room.finish!;

describe("protected start zone", () => {
  it("is 7 cells wide and 4 tall: x sx-3..sx+3, rows sy-3..sy", () => {
    expect(SPAWN_ZONE_HALF_WIDTH * 2 + 1).toBe(7);
    expect(SPAWN_ZONE_HEIGHT).toBe(4);
    let count = 0;
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const inside = x >= S.x - 3 && x <= S.x + 3 && y >= S.y - 3 && y <= S.y;
        expect(isSpawnZoneCell(room, x, y), `(${x}, ${y})`).toBe(inside);
        if (inside) count++;
      }
    }
    expect(count).toBe(28);
  });

  it("refuses every object kind on every empty cell of the zone, allows the cells just outside", () => {
    for (let y = S.y - 3; y <= S.y; y++) {
      for (let x = S.x - 3; x <= S.x + 3; x++) {
        expect(canPlaceAt(room, [], x, y)).toBe(false);
        expect(placementProblem(room, [], x, y)).toBe("protected");
        for (const kind of OBJECT_KINDS) expect(canPlaceObject(room, [], { kind, x, y, dir: 1 })).toBe(false);
      }
    }
    // One step out on each side: left, right, above. (Below S is the hole in the floor.)
    for (const [x, y] of [
      [S.x - 4, S.y],
      [S.x + 4, S.y],
      [S.x, S.y - 4],
      [S.x - 4, S.y - 3],
      [S.x + 4, S.y - 3],
      [S.x, S.y + 1],
    ] as const) {
      expect(canPlaceAt(room, [], x, y), `(${x}, ${y})`).toBe(true);
      expect(placementProblem(room, [], x, y)).toBeNull();
    }
    expect(isSpawnZoneCell(room, S.x, S.y + 1)).toBe(false);
  });

  it("holds the whole spawn pad", () => {
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) if (isSpawnPadCell(room, x, y)) expect(isSpawnZoneCell(room, x, y)).toBe(true);
    }
  });

  it("is clipped to the level, never wraps past an edge", () => {
    const corner = parseLevel({ name: "corner", rows: ["S.........", "##########"] });
    expect(isSpawnZoneCell(corner, 3, 0)).toBe(true);
    expect(isSpawnZoneCell(corner, 4, 0)).toBe(false);
    expect(isSpawnZoneCell(corner, -1, 0)).toBe(false);
    expect(isSpawnZoneCell(corner, 0, -1)).toBe(false);
    expect(protectedZones(corner)).toEqual([{ kind: "start", x: 0, y: 0, w: 4, h: 1 }]);
  });
});

describe("protected finish zone", () => {
  it("is a 5 by 5 box centred on the flag", () => {
    expect(FINISH_ZONE_RADIUS).toBe(2);
    for (let y = 0; y < room.height; y++) {
      for (let x = 0; x < room.width; x++) {
        const inside = Math.abs(x - F.x) <= 2 && Math.abs(y - F.y) <= 2;
        expect(isFinishZoneCell(room, x, y), `(${x}, ${y})`).toBe(inside);
        expect(isProtectedCell(room, x, y)).toBe(inside || isSpawnZoneCell(room, x, y));
      }
    }
  });

  it("refuses every empty cell of the box (so the flag can't be walled off), allows the cells just outside", () => {
    for (let y = F.y - 2; y <= F.y + 2; y++) {
      for (let x = F.x - 2; x <= F.x + 2; x++) {
        expect(canPlaceAt(room, [], x, y), `(${x}, ${y})`).toBe(false);
        // The ledge under the flag stays terrain: a terrain cell says so first.
        expect(placementProblem(room, [], x, y)).toBe(y === 6 && x >= 21 && x <= 23 ? "terrain" : "protected");
      }
    }
    for (const [x, y] of [
      [F.x - 3, F.y],
      [F.x + 3, F.y],
      [F.x, F.y - 3],
      [F.x, F.y + 3],
      [F.x + 3, F.y + 2],
    ] as const) {
      expect(canPlaceAt(room, [], x, y), `(${x}, ${y})`).toBe(true);
    }
  });

  it("a level without a finish has no finish zone", () => {
    const none = parseLevel({ name: "none", rows: ["S.........", "##########"] });
    expect(isFinishZoneCell(none, 5, 0)).toBe(false);
    expect(protectedZones(none).map((z) => z.kind)).toEqual(["start"]);
  });
});

describe("protected zones for drawing and placement checks", () => {
  it("protectedZones gives both boxes as cell rectangles", () => {
    expect(protectedZones(room)).toEqual([
      { kind: "start", x: S.x - 3, y: S.y - 3, w: 7, h: 4 },
      { kind: "finish", x: F.x - 2, y: F.y - 2, w: 5, h: 5 },
    ]);
  });

  it("the zone is checked before the support rule: spikes leaning on a wall in the zone are still refused", () => {
    const objects: PlacedObject[] = [{ id: 1, kind: "platform", x: S.x + 4, y: S.y }];
    // (S.x + 3, S.y) leans on the platform pointing left, but sits in the zone.
    expect(objectPlacementProblem(room, objects, { kind: "spikes", x: S.x + 3, y: S.y, dir: 2 })).toBe("protected");
    // One cell further out, the same spikes leaning on the platform's other side are fine.
    expect(objectPlacementProblem(room, objects, { kind: "spikes", x: S.x + 5, y: S.y, dir: 0 })).toBeNull();
    // The flag cell itself, as always.
    expect(objectPlacementProblem(room, [], { kind: "saw", x: F.x, y: F.y })).toBe("protected");
  });
});

describe("vine ropes and the protected zones", () => {
  it("a rope stops at the zone's top edge: a vine right above the start zone has no rope", () => {
    const above: PlacedObject = { id: 1, kind: "vine", x: S.x, y: S.y - 4 };
    const beside: PlacedObject = { id: 2, kind: "vine", x: S.x + 4, y: S.y - 4 };
    const [a, b] = prepareObjects(room, [above, beside]);
    expect(a!.range).toBe(0);
    // One column out of the zone the rope hangs down to the floor as usual (rows 5..8).
    expect(b!.range).toBe(4);
  });
});

describe("no contact between players in the start zone", () => {
  const m = DEFAULT_MOVEMENT;

  it("bodyInSpawnZone: any overlap with the zone counts, touching its edge does not", () => {
    // Standing on S, and on the outermost seat of the zone.
    expect(bodyInSpawnZone(room, S.x + 0.1, S.y + 0.1, m.bodyWidth, m.bodyHeight)).toBe(true);
    expect(bodyInSpawnZone(room, S.x + 3.1, S.y + 0.1, m.bodyWidth, m.bodyHeight)).toBe(true);
    // Half in, half out on the right edge (x = sx + 4 is the first cell out).
    expect(bodyInSpawnZone(room, S.x + 3.5, S.y + 0.1, m.bodyWidth, m.bodyHeight)).toBe(true);
    // Just past the right edge, and exactly touching it.
    expect(bodyInSpawnZone(room, S.x + 4.05, S.y + 0.1, m.bodyWidth, m.bodyHeight)).toBe(false);
    expect(bodyInSpawnZone(room, S.x + 4, S.y + 0.1, m.bodyWidth, m.bodyHeight)).toBe(false);
    // Above the zone (its top row is sy - 3), with the feet just clear of it.
    expect(bodyInSpawnZone(room, S.x + 0.1, S.y - 3 - m.bodyHeight, m.bodyWidth, m.bodyHeight)).toBe(false);
    expect(bodyInSpawnZone(room, S.x + 0.1, S.y - 3 - m.bodyHeight + 0.1, m.bodyWidth, m.bodyHeight)).toBe(true);
    // Falling through the hole under S: below the zone.
    expect(bodyInSpawnZone(room, S.x + 0.1, S.y + 1.05, m.bodyWidth, m.bodyHeight)).toBe(false);
  });

  it("contactWith itself knows nothing of zones: the callers skip it in the start zone", () => {
    // The same stomp as anywhere else, even right on S.
    const other = { x: S.x + 0.1, y: S.y + 0.1 };
    expect(contactWith({ x: other.x + 0.2, y: other.y - 0.85 }, other.y - 0.95, 6, other, m.bodyWidth, m.bodyHeight, false)).toBe("stomp");
  });
});
