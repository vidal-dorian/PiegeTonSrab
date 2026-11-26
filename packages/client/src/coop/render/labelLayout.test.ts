import { describe, expect, it } from "vitest";
import { stackLabels } from "./labelLayout";

describe("co-op name labels", () => {
  it("leaves apart labels where they are", () => {
    expect(stackLabels([{ x: 0, y: 100, w: 40, h: 16 }, { x: 100, y: 100, w: 40, h: 16 }])).toEqual([0, 0]);
  });

  it("lifts a label that would overlap its neighbour, and stacks three in a row", () => {
    const lifts = stackLabels([
      { x: 100, y: 100, w: 60, h: 16 },
      { x: 120, y: 100, w: 60, h: 16 },
      { x: 140, y: 100, w: 60, h: 16 },
    ]);
    expect(lifts[0]).toBe(0);
    expect(lifts[1]).toBe(18);
    expect(lifts[2]).toBe(36);
  });

  it("does not lift a label that is already higher than its neighbour (a tower)", () => {
    expect(stackLabels([{ x: 100, y: 100, w: 60, h: 16 }, { x: 105, y: 60, w: 60, h: 16 }])).toEqual([0, 0]);
  });
});
