/**
 * The dev showcase is a valid co-op level for every team size and holds every kind of thing.
 */
import { describe, expect, it } from "vitest";
import { coopLevelProblems, parseCoopLevel, type ThingKind } from "@game/shared/coop";
import { showcaseLevel } from "./devShowcase";

describe("dev showcase level", () => {
  it("has no level problem from 2 to 5 players", () => {
    for (const n of [2, 3, 4, 5]) expect(coopLevelProblems(showcaseLevel, n)).toEqual([]);
  });

  it("holds every kind of thing, the key, the door, glass, a deadly pit, crate stops and a deadline", () => {
    const level = parseCoopLevel(showcaseLevel, 2);
    const kinds = new Set(level.things.map((t) => t.def.kind));
    const all: ThingKind[] = ["plate", "gate", "crate", "seesaw", "pan", "mover", "switch", "shelf", "terminal", "fragile", "spikes"];
    for (const k of all) expect(kinds.has(k)).toBe(true);
    expect(level.key).not.toBeNull();
    expect(level.door).not.toBeNull();
    expect(level.glass.size).toBeGreaterThan(0);
    expect(level.voids.size).toBeGreaterThan(0);
    expect(level.crateGrid.solid.filter(Boolean).length).toBeGreaterThan(level.collision.solid.filter(Boolean).length);
    expect(level.deadline).not.toBeNull();
    // Inverted gates, exact and team-weight plates, every spike direction, every kind of platform.
    expect(level.things.some((t) => t.def.kind === "gate" && t.def.inverted)).toBe(true);
    expect(level.things.some((t) => t.def.kind === "plate" && t.def.exact)).toBe(true);
    expect(level.things.some((t) => t.def.kind === "plate" && typeof t.def.need === "string")).toBe(true);
    const dirs = new Set(level.things.flatMap((t) => (t.def.kind === "spikes" ? [t.def.dir] : [])));
    expect([...dirs].sort()).toEqual(["down", "left", "right"]);
    const movers = level.things.flatMap((t) => (t.def.kind === "mover" ? [t.def] : []));
    expect(movers.some((m) => m.arc)).toBe(true);
    expect(movers.some((m) => m.period)).toBe(true);
    expect(movers.some((m) => m.need !== undefined)).toBe(true);
    expect(movers.some((m) => m.link !== undefined)).toBe(true);
    // Crates of the three shapes: a box, a PC tower, a server rack.
    const crates = level.things.filter((t) => t.def.kind === "crate").map((t) => `${t.w}x${t.h}`);
    expect(crates.sort()).toEqual(["1x1", "1x2", "3x1"]);
  });
});
