import { describe, expect, it } from "vitest";
import { ropeLook, ropeShape } from "./ropeLayout";

const REST = 4.5;
const MAX = 5.4;

describe("rope drawing", () => {
  it("a straight slack link sags as before; a taut one is a straight line", () => {
    const slack = ropeShape({ ax: 0, ay: 0, bx: 3, by: 0, points: [] }, REST, MAX);
    expect(slack.slack).toBeCloseTo(1.5, 9);
    // The sag of the old view: 0.55 * sqrt(4.5² - 3²) / 2 at the middle (a quadratic's middle is half its control offset).
    const mid = slack.line[slack.line.length / 2]!;
    expect(mid).toBeCloseTo((0.55 * Math.sqrt(REST * REST - 9) * 0.5) / 2, 6);
    const taut = ropeShape({ ax: 0, ay: 0, bx: 4.5, by: 0, points: [] }, REST, MAX);
    expect(taut.line).toEqual([0, 0, 4.5, 0]);
    expect(taut.stretch).toBe(0);
  });

  it("a wrapped link goes through its corners; only its end parts sag", () => {
    // Over a pillar's two top corners (68, 10) and (70, 10), each end hanging 1 cell below.
    const s = ropeShape({ ax: 67.6, ay: 11, bx: 70.4, by: 11, points: [68, 10, 70, 10] }, REST, MAX);
    const xs = s.line.filter((_, i) => i % 2 === 0);
    const ys = s.line.filter((_, i) => i % 2 === 1);
    const at = (x: number, y: number) => xs.some((v, i) => Math.abs(v - x) < 1e-9 && Math.abs(ys[i]! - y) < 1e-9);
    expect(at(68, 10) && at(70, 10)).toBe(true);
    // Between the corners: straight along the top (no point in between).
    const i68 = xs.findIndex((v, i) => v === 68 && ys[i] === 10);
    expect(xs[i68 + 1]).toBe(70);
    expect(s.slack).toBeCloseTo(REST - 2 - 2 * Math.hypot(0.4, 1), 9);
    // The end parts hang below the straight line from the end to its corner: halfway along the
    // first part (its 9th of 18 points), lower than the chord's middle (67.8, 10.5).
    expect(xs[9]!).toBeCloseTo(67.8, 1);
    expect(ys[9]!).toBeGreaterThan(10.5 + 0.05);
  });

  it("past its rest length it is stretched, red at the hard stop", () => {
    const near = ropeLook(ropeShape({ ax: 0, ay: 0, bx: 4.4, by: 0, points: [] }, REST, MAX));
    expect(near.overlayAlpha).toBeGreaterThan(0);
    expect(near.redness).toBe(0);
    const half = ropeShape({ ax: 0, ay: 0, bx: 4.95, by: 0, points: [] }, REST, MAX);
    expect(half.stretch).toBeCloseTo(0.5, 9);
    const look = ropeLook(half);
    expect(look.inkWidth).toBeLessThan(4);
    expect(look.redness).toBeCloseTo(0.5, 9);
    expect(look.stopped).toBe(false);
    const stop = ropeLook(ropeShape({ ax: 0, ay: 0, bx: 5.4, by: 0, points: [] }, REST, MAX));
    expect(stop.redness).toBe(1);
    expect(stop.stopped).toBe(true);
    expect(stop.inkWidth).toBeCloseTo(2.5, 9);
    expect(stop.overlayWidth).toBe(stop.inkWidth);
  });
});
