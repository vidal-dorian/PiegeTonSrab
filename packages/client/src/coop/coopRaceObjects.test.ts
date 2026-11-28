/**
 * Race objects in co-op levels after main's turned spikes and springs (merged 2026-11-28): the
 * race's spikes became solid blocks killing through their pointed face, but co-op levels keep the
 * rule they were designed with (not solid, deadly in the bottom 0.45 of the cell unless moving up),
 * and their springs stay plain upward springs.
 */
import { describe, expect, it } from "vitest";
import { bounceDirAt, boxHitsHazard, isBouncyCell, isSolidCell } from "@game/shared";
import { COOP_RACE_SPIKES_DEPTH, isCoopSolidObject, parseCoopLevel, raceObjectHazards } from "@game/shared/coop";

const def = {
  id: "race-objects",
  name: "race objects",
  rows: [
    "################",
    "#..............#",
    "#..............#",
    "#..............#",
    "#S.......T.*...#",
    "######^^########",
    "################",
  ],
};

describe("race objects in a co-op level", () => {
  const level = parseCoopLevel(def, 2);
  const spikes = level.objects.filter((o) => o.kind === "spikes");
  const spring = level.objects.find((o) => o.kind === "spring")!;

  it("spikes are not solid, springs are, and throw up only", () => {
    expect(spikes).toHaveLength(2);
    for (const o of spikes) {
      expect(isCoopSolidObject(o)).toBe(false);
      expect(isSolidCell(level.collision, o.x, o.y)).toBe(false);
      expect(isSolidCell(level.crateGrid, o.x, o.y)).toBe(false);
    }
    expect(isCoopSolidObject(spring)).toBe(true);
    expect(isSolidCell(level.collision, spring.x, spring.y)).toBe(true);
    expect(bounceDirAt(level.collision, spring.x, spring.y)).toBe(3);
    expect(isBouncyCell(level.collision, spring.x, spring.y)).toBe(true);
  });

  it("spikes kill in the bottom of their cell, and spare a body moving up", () => {
    const o = spikes[0]!;
    const [hz] = raceObjectHazards(o, 0);
    expect(hz).toEqual({ shape: "rect", x: o.x, y: o.y + 1 - COOP_RACE_SPIKES_DEPTH, w: 1, h: COOP_RACE_SPIKES_DEPTH, face: 3 });
    const at = (bottom: number) => ({ x: o.x + 0.2, y: bottom - 0.8, w: 0.6, h: 0.8 });
    // Feet still above the deadly part: alive, falling or not.
    expect(boxHitsHazard(at(o.y + 0.5), hz!, 5)).toBe(false);
    // Feet in it: dead when falling or still, alive when moving up.
    expect(boxHitsHazard(at(o.y + 0.6), hz!, 5)).toBe(true);
    expect(boxHitsHazard(at(o.y + 0.6), hz!, 0)).toBe(true);
    expect(boxHitsHazard(at(o.y + 0.6), hz!, -1)).toBe(false);
  });

  it("saws keep the race's hazard", () => {
    const saw = level.objects.find((o) => o.kind === "saw")!;
    expect(raceObjectHazards(saw, 0)[0]).toMatchObject({ shape: "circle", cx: saw.x + 0.5, cy: saw.y + 0.5 });
  });
});
