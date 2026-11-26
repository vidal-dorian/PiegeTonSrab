/**
 * Geometry of the co-op things on screen: link symbols, wires, counters, rigs, cell groups.
 */
import { describe, expect, it } from "vitest";
import { parseCoopLevel, type CoopThing } from "@game/shared/coop";
import { showcaseLevel } from "../devShowcase";
import {
  alongPath,
  balanceRig,
  cellGroups,
  crateStopCells,
  doorPebbles,
  levelWires,
  LINK_SYMBOLS,
  linkMarks,
  plateLabel,
  seesawPose,
  variantWallCells,
  wireCurve,
} from "./thingLayout";

const level = parseCoopLevel(showcaseLevel, 2);

function thing(char: string): CoopThing {
  const t = level.things.find((x) => x.char === char);
  if (!t) throw new Error(`no thing ${char}`);
  return t;
}

describe("link symbols", () => {
  it("one distinct symbol per link, in reading order", () => {
    const marks = linkMarks(level.things);
    expect([...marks.keys()]).toEqual(["E", "F", "A", "B", "C", "D"]);
    const symbols = [...marks.values()].map((m) => m.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
    expect(symbols[0]).toBe("circle");
  });

  it("past eight links the shapes come back with a number", () => {
    const things = Array.from({ length: 10 }, (_, i) => ({
      index: i,
      char: String(i),
      def: { kind: "plate" as const, need: 1, link: `L${i}` },
      x: i,
      y: 0,
      w: 1,
      h: 1,
    }));
    const marks = linkMarks(things);
    expect(marks.get("L7")).toEqual({ symbol: LINK_SYMBOLS[7], round: 0 });
    expect(marks.get("L8")).toEqual({ symbol: LINK_SYMBOLS[0], round: 1 });
  });
});

describe("wires", () => {
  it("from every plate or terminal to every gate or linked platform on its link", () => {
    const wires = levelWires(level);
    const pairs = wires.map((w) => `${level.things[w.source]!.char}>${level.things[w.target]!.char}`);
    expect(pairs.sort()).toEqual(["3>4", "5>7", "6>7", "a>g", "b>g", "e>h", "f>h", "i>j", "l>m"].sort());
    // A plate's end is inside its housing; a gate's in the floor under it.
    const ag = wires.find((w) => level.things[w.source]!.char === "a")!;
    expect(ag.from).toEqual({ x: 10.5, y: 29.85 });
    expect(ag.to).toEqual({ x: 13.5, y: 29.3 });
  });

  it("a wire sags between its ends and dots walk along it evenly", () => {
    const pts = wireCurve({ x: 0, y: 10 }, { x: 4, y: 10 }, 8);
    expect(pts).toHaveLength(9);
    expect(pts[0]).toEqual({ x: 0, y: 10 });
    expect(pts[8]).toEqual({ x: 4, y: 10 });
    expect(pts[4]!.y).toBeGreaterThan(10.3);
    const dots = alongPath([{ x: 0, y: 0 }, { x: 10, y: 0 }], 2, 1);
    expect(dots.map((d) => d.x)).toEqual([1, 3, 5, 7, 9]);
  });
});

describe("counters", () => {
  it("load over need; an exact plate says '= n', then whether it matches", () => {
    expect(plateLabel(1, 2, false)).toBe("1/2");
    expect(plateLabel(0, 3, false)).toBe("0/3");
    expect(plateLabel(0, 1, true)).toBe("= 1");
    expect(plateLabel(1, 1, true)).toBe("1 = 1");
    expect(plateLabel(2, 1, true)).toBe("2 ≠ 1");
  });
});

describe("rigs", () => {
  it("the seesaw plank runs through both pads' middles and the pivot", () => {
    const w = thing("w");
    const pose = seesawPose(w, 0.75, 1);
    expect(pose.left.y).toBeCloseTo(27.75);
    expect(pose.right.y).toBeCloseTo(26.25);
    const [a, b] = pose.beam;
    // The middle of the plank is the pivot's bottom: it turns around the fulcrum.
    expect((a.x + b.x) / 2).toBeCloseTo(pose.pivot.x);
    expect((a.y + b.y) / 2).toBeCloseTo(27.3);
    expect(pose.pivot.x).toBe(56.5);
  });

  it("the balance beam hangs under the ceiling, above the pans at their highest", () => {
    const rig = balanceRig(level.terrain, thing("x"), thing("y"), 1.5);
    expect(rig.leftX).toBe(69);
    expect(rig.rightX).toBe(74);
    expect(rig.hangTop).toBe(17);
    expect(rig.beamY).toBeGreaterThan(17.4);
    expect(rig.beamY).toBeLessThan(25.5 - 1.5);
  });
});

describe("cells", () => {
  it("groups side-by-side cells", () => {
    // (0,0) (1,0) (1,1) form one group, (5,0) (5,1) another; (9,0) and (0,1) are not neighbours.
    const g = cellGroups(new Set([0, 1, 11, 5, 15]), 10);
    expect(g.map((x) => [x.x, x.y, x.w, x.h])).toEqual([
      [0, 0, 2, 2],
      [5, 0, 1, 2],
    ]);
    expect(cellGroups(level.glass, level.width).map((x) => [x.x, x.y, x.w, x.h])).toEqual([
      [56, 13, 1, 2],
      [60, 13, 1, 2],
    ]);
  });

  it("finds the variant walls and the crate stops", () => {
    expect([...variantWallCells(level)]).toEqual([14 * 100 + 52]);
    expect(variantWallCells(parseCoopLevel(showcaseLevel, 4)).size).toBe(0);
    expect([...crateStopCells(level)].sort((a, b) => a - b)).toEqual([27 * 100 + 32, 27 * 100 + 47, 28 * 100 + 32, 28 * 100 + 47]);
  });

  it("puts the pebbles of whoever is inside in the doorway", () => {
    const p = doorPebbles({ x: 5, y: 13, w: 1, h: 2 }, 3);
    expect(p).toHaveLength(3);
    for (const q of p) {
      expect(q.x).toBeGreaterThan(5);
      expect(q.x).toBeLessThan(6);
      expect(q.y).toBeGreaterThan(13);
      expect(q.y).toBeLessThan(15);
    }
    expect(p[2]!.y).toBeLessThan(p[0]!.y);
  });
});
