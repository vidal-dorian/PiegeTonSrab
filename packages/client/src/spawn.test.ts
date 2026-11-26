/**
 * The spawn pad (level.ts): up to five players start side by side on the S row, each on
 * their own seat's cell, and nobody can build on or right next to the start.
 */
import { describe, expect, it } from "vitest";
import {
  bodiesOverlap,
  buildReachGraph,
  canPlaceAt,
  CharacterController,
  DEFAULT_MOVEMENT,
  isSpawnPadCell,
  isSpawnZoneCell,
  MAX_PLAYERS,
  parseLevel,
  prepareObjects,
  RACE_LEVELS,
  SPAWN_PAD_HALF_WIDTH,
  SPAWN_SEAT_OFFSETS,
  spawnCell,
  spawnPadCells,
  spawnPadProblems,
  type Level,
} from "@game/shared";
import { LocalPlayer } from "./sim/localPlayer";
import { TUTORIAL_LEVEL } from "./tutorial/level";

const flat = parseLevel({
  name: "flat",
  rows: ["..........", "..........", "..........", "....S....F", "##########"],
});

function seatCells(level: Level): Array<{ x: number; y: number }> {
  return Array.from({ length: MAX_PLAYERS }, (_, seat) => spawnCell(level, seat));
}

describe("spawn pad", () => {
  it("has one seat per player, seat 0 on S", () => {
    expect(SPAWN_SEAT_OFFSETS.length).toBe(MAX_PLAYERS);
    expect(SPAWN_SEAT_OFFSETS[0]).toBe(0);
    expect(SPAWN_PAD_HALF_WIDTH * 2 + 1).toBe(MAX_PLAYERS);
  });

  it("covers the S row 2 cells each side and 2 rows of headroom", () => {
    const cells = spawnPadCells(flat);
    expect(cells.length).toBe(15);
    for (let y = 1; y <= 3; y++) for (let x = 2; x <= 6; x++) expect(isSpawnPadCell(flat, x, y)).toBe(true);
    expect(isSpawnPadCell(flat, 1, 3)).toBe(false);
    expect(isSpawnPadCell(flat, 7, 3)).toBe(false);
    expect(isSpawnPadCell(flat, 4, 0)).toBe(false);
  });

  it("refuses placement anywhere on the pad: it lies inside the protected start zone", () => {
    for (const k of spawnPadCells(flat)) {
      const x = k % flat.width;
      const y = Math.floor(k / flat.width);
      expect(canPlaceAt(flat, [], x, y)).toBe(false);
      expect(isSpawnZoneCell(flat, x, y)).toBe(true);
    }
    // The zone is wider and taller than the pad (exact extent: zones.test.ts).
    expect(canPlaceAt(flat, [], 1, 3)).toBe(false);
    expect(canPlaceAt(flat, [], 4, 0)).toBe(false);
    expect(canPlaceAt(flat, [], 0, 3)).toBe(true);
    expect(canPlaceAt(flat, [], 9, 3)).toBe(false); // finish rule unchanged
  });

  it("gives every seat its own cell, bodies side by side without overlapping", () => {
    const m = DEFAULT_MOVEMENT;
    const cells = seatCells(flat);
    expect(cells.map((c) => c.x)).toEqual([4, 3, 5, 2, 6]);
    const bodies = cells.map((_, seat) => {
      const c = new CharacterController(flat, m);
      c.respawn(seat);
      expect(c.grounded).toBe(true);
      return { x: c.x, y: c.y };
    });
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        expect(bodiesOverlap(bodies[i]!, bodies[j]!, m.bodyWidth, m.bodyHeight)).toBe(false);
      }
    }
  });

  it("LocalPlayer respawns on its seat at every reset", () => {
    const p = new LocalPlayer(flat, flat, DEFAULT_MOVEMENT);
    const s0 = p.controller.x;
    p.seat = 3;
    p.reset();
    expect(p.controller.x).toBeCloseTo(s0 - 2);
    p.controller.x += 5;
    p.reset();
    expect(p.controller.x).toBeCloseTo(s0 - 2);
  });

  it("reports a broken pad and falls back to S for the seats that do not fit", () => {
    const broken = parseLevel({
      name: "broken",
      // Row 0 is above the 2 headroom rows: its wall does not count.
      rows: ["..#.......", "..........", "......*...", "...#S.....", "####.#####"],
    });
    expect(spawnPadProblems(broken)).toEqual([
      "pad cell (3, 3) solid",
      "pad cell (4, 3) has no solid ground below at (4, 4)",
      "headroom cell (6, 2) has a map object",
    ]);
    // Seat 1 (x 3) is a wall, seat 0 (S) has a hole below: both stay on S as before.
    expect(spawnCell(broken, 1)).toEqual(broken.start);
    expect(spawnCell(broken, 4)).toEqual({ x: 6, y: 3 });
    // Wall on the edge of the level.
    const edge = parseLevel({ name: "edge", rows: ["....", "....", "S...", "####"] });
    expect(spawnPadProblems(edge)).toEqual(["pad cell (-2, 2) outside the level", "pad cell (-1, 2) outside the level"]);
    expect(spawnCell(edge, 3)).toEqual(edge.start);
  });

  for (const def of [...RACE_LEVELS, TUTORIAL_LEVEL]) {
    it(`${def.name}: pad is valid, every seat stands apart and reaches S's graph`, () => {
      const level = parseLevel(def);
      expect(spawnPadProblems(level)).toEqual([]);
      const cells = seatCells(level);
      expect(new Set(cells.map((c) => c.x)).size).toBe(MAX_PLAYERS);
      // The reach graph is rooted at S; the flat pad links every seat to it.
      const graph = buildReachGraph(level, prepareObjects(level, level.initialObjects), DEFAULT_MOVEMENT);
      for (const c of cells) expect(graph.edges.has(c.y * level.width + c.x)).toBe(true);
    });
  }
});
