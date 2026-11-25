import { describe, expect, it } from "vitest";
import {
  buildReachGraph,
  DEFAULT_MOVEMENT,
  parseLevel,
  RACE_LEVELS,
  placementKeepsPath,
  prepareObjects,
  testLevel,
  type PlacedObject,
} from "@game/shared";

const tuning = { ...DEFAULT_MOVEMENT };

function timed<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  const r = fn();
  console.log(`${label}: ${(performance.now() - t0).toFixed(1)} ms`);
  return r;
}

describe("reachability", () => {
  it("every race level is finishable with its own objects, and the list is sound", () => {
    const names = new Set<string>();
    for (const def of RACE_LEVELS) {
      const level = parseLevel(def);
      expect(names.has(def.name), `duplicate name ${def.name}`).toBe(false);
      names.add(def.name);
      expect(level.width, def.name).toBeLessThanOrEqual(64);
      expect(level.height, def.name).toBeLessThanOrEqual(18);
      expect(level.finish, def.name).not.toBeNull();
      const objects = prepareObjects(level, level.initialObjects);
      expect(timed(def.name, () => buildReachGraph(level, objects, tuning)).reachable, def.name).toBe(true);
    }
  }, 30_000); // builds the reach graph of every map: ~3.5 s here, slower on a busy CI runner

  it("the test level is finishable (needs the wall-jump shaft)", () => {
    const level = parseLevel(testLevel);
    expect(timed("test level", () => buildReachGraph(level, [], tuning)).reachable).toBe(true);
  });

  it("refuses the saw that closes a corridor, accepts one that leaves room", () => {
    // Corridor 2 cells high: a saw in it blocks, a saw on the open floor of a big room does not.
    const def = {
      name: "corridor",
      rows: [
        "####################",
        "#..................#",
        "#..................#",
        "#..................#",
        "#.......############",
        "#S..............F..#",
        "####################",
      ],
    };
    const level = parseLevel(def);
    const graph = buildReachGraph(level, [], tuning);
    expect(graph.reachable).toBe(true);
    const blocking: PlacedObject = { id: 1, kind: "saw", x: 12, y: 5 };
    const harmless: PlacedObject = { id: 2, kind: "saw", x: 4, y: 2 };
    expect(timed("blocking check", () => placementKeepsPath(level, [], blocking, tuning, graph))).toBe(false);
    expect(timed("harmless check", () => placementKeepsPath(level, [], harmless, tuning, graph))).toBe(true);
  });

  it("refuses the saw that makes a column unjumpable, accepts the lower ones", () => {
    const level = parseLevel(testLevel);
    // Column x = 5 on the start floor, from the ground up: a short column can be jumped over.
    let objects: PlacedObject[] = [];
    let id = 1;
    let refusedAt: number | null = null;
    for (let y = 15; y >= 0; y--) {
      const candidate: PlacedObject = { id: id++, kind: "saw", x: 5, y };
      if (placementKeepsPath(level, objects, candidate, tuning)) objects = [...objects, candidate];
      else {
        refusedAt = y;
        break;
      }
    }
    expect(refusedAt).not.toBeNull();
    expect(objects.length).toBeGreaterThanOrEqual(1);
    expect(buildReachGraph(level, objects, tuning).reachable).toBe(true);
  });
});
