/**
 * Frames blended between two states of the co-op world: halfway is halfway, a restart or a thing
 * jumping home is never slid across.
 */
import { describe, expect, it } from "vitest";
import { BIT_RIGHT, COOP_DT, CoopWorld, parseCoopLevel } from "@game/shared/coop";
import { showcaseLevel } from "../devShowcase";
import { captureFrame, copyFrame, lerpFrame, newFrame } from "./propFrame";

function world(): CoopWorld {
  return new CoopWorld(parseCoopLevel(showcaseLevel, 2), [
    { name: "A", isRuben: false },
    { name: "B", isRuben: true },
  ]);
}

describe("prop frames", () => {
  it("captures bodies, crates, seesaws, balances, platforms and gates", () => {
    const w = world();
    const f = captureFrame(w);
    expect(f.bodies).toHaveLength(2);
    expect(f.crates).toHaveLength(2 * w.props.crates.length);
    expect(f.seesaws).toHaveLength(1);
    expect(f.balances).toHaveLength(1);
    expect(f.movers).toHaveLength(2 * w.props.movers.length);
    expect(f.gates).toHaveLength(w.props.gates.length);
    expect(f.crates[0]).toBe(w.props.crates[0]!.x);
  });

  it("blends halfway between two states of the same attempt", () => {
    const w = world();
    const a = captureFrame(w);
    for (let i = 0; i < Math.round(0.5 / COOP_DT); i++) w.step([BIT_RIGHT, 0]);
    const b = captureFrame(w);
    const m = lerpFrame(a, b, 0.5);
    expect(m.bodies[0]!.x).toBeCloseTo((a.bodies[0]!.x + b.bodies[0]!.x) / 2);
    // The platform on the clock moved: halfway too.
    const k = w.props.movers.findIndex((p) => p.def.period !== undefined);
    expect(m.movers[2 * k]).toBeCloseTo((a.movers[2 * k]! + b.movers[2 * k]!) / 2);
    expect(m.tick).toBeCloseTo((a.tick + b.tick) / 2);
  });

  it("never slides across a restart or a jump home", () => {
    const a = newFrame();
    a.attempt = 1;
    a.bodies.push({ x: 10, y: 5, w: 0.8, h: 0.9 });
    a.crates.push(30, 20);
    a.gates.push(0);
    const b = newFrame();
    b.attempt = 1;
    b.bodies.push({ x: 11, y: 5, w: 0.8, h: 0.9 });
    b.crates.push(4, 20); // fell out of the level: back home
    b.gates.push(1);
    const m = lerpFrame(a, b, 0.5);
    expect(m.bodies[0]!.x).toBeCloseTo(10.5);
    expect(m.crates).toEqual([4, 20]);
    expect(m.gates[0]).toBeCloseTo(0.5);
    b.attempt = 2;
    const r = lerpFrame(a, b, 0.5);
    expect(r.bodies[0]!.x).toBe(11);
    expect(r.gates[0]).toBe(1);
    expect(copyFrame(b, newFrame())).toEqual(b);
  });
});
