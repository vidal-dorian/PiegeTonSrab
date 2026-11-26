/**
 * Co-op level things: regression tests for the M3 engine review. A crate rises with what stands on
 * it; the rising side of a seesaw or balance never goes through a body (one it cannot lift, or one
 * landing on it); riding a lift into a switch block hits it; a body inside the door hits no switch;
 * a trapdoor opened by a pressed plate blames whoever pressed it; a tied seesaw levels.
 */
import { describe, expect, it } from "vitest";
import {
  BIT_DOWN,
  BIT_DOWN_PRESS,
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_RIGHT,
  COOP_DT,
  CoopWorld,
  decodeWorld,
  encodeWorld,
  parseCoopLevel,
  type CoopEvent,
  type CoopLevelDef,
  type CoopPlayer,
  type ThingDef,
} from "@game/shared/coop";

const H = 0.9; // body height
/** Below this, an overlap is a rounding error. */
const TOL = 1e-4;

const sec = (s: number) => Math.round(s / COOP_DT);

/** A closed room `w` x `h`: walls, a ceiling and a two-row floor (top at y = h - 2); S at (2, h - 3). */
function room(w: number, h: number, draw: (set: (x: number, y: number, c: string) => void) => void = () => {}): string[] {
  const g: string[][] = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (y === 0 || y >= h - 2 || x === 0 || x === w - 1 ? "#" : ".")));
  g[h - 3]![2] = "S";
  draw((x, y, c) => {
    g[y]![x] = c;
  });
  return g.map((r) => r.join(""));
}

function def(rows: string[], legend: Record<string, ThingDef> = {}): CoopLevelDef {
  return { id: "t", name: "t", rows, legend };
}

function team(n: number, rubenAt = -1): CoopPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isRuben: i === rubenAt }));
}

function world(d: CoopLevelDef, n: number, rubenAt = -1): CoopWorld {
  return new CoopWorld(parseCoopLevel(d, n), team(n, rubenAt));
}

function overlap(a0: number, aLen: number, b0: number, bLen: number): number {
  return Math.min(a0 + aLen, b0 + bLen) - Math.max(a0, b0);
}

describe("a crate rises with what stands on it", () => {
  // A lift (x 11-13, row 10) that goes up 4 cells while it carries a weight of 2; a crate on it.
  const lift = (draw: (set: (x: number, y: number, c: string) => void) => void = () => {}) =>
    room(20, 14, (set) => {
      for (let x = 11; x <= 13; x++) set(x, 10, "m");
      set(12, 9, "c");
      draw(set);
    });
  const legend: Record<string, ThingDef> = { m: { kind: "mover", dy: -4, need: 2 }, c: { kind: "crate", need: 1 }, d: { kind: "crate", need: 1 } };

  it("a friend standing on a crate rides the lift up with it, and a loaded world goes on the same", () => {
    const w = world(def(lift(), legend), 1);
    const crate = w.crates[0]!;
    const b = w.bodies[0]!;
    const mover = w.props.movers[0]!.collider;
    w.placeBody(0, 12.1, 9 - H);
    let twin: CoopWorld | null = null;
    for (let k = 0; k < sec(2.5); k++) {
      w.step([]);
      twin?.step([]);
      if (k === sec(0.5)) {
        twin = world(def(lift(), legend), 1);
        twin.load(decodeWorld(encodeWorld(w.save())));
      }
      if (twin) expect(twin.hash()).toBe(w.hash());
      // Never inside each other.
      expect(overlap(b.y, H, crate.y, crate.h)).toBeLessThan(TOL);
    }
    expect(mover.y).toBeCloseTo(6, 6);
    expect(crate.y).toBeCloseTo(5, 6);
    expect(crate.support).toEqual({ kind: "collider", id: mover.id, body: -1 });
    expect(b.y + H).toBeCloseTo(5, 6);
    expect(b.support).toEqual({ kind: "collider", id: crate.collider.id, body: -1 });
  });

  it("two stacked crates ride the lift up together", () => {
    const w = world(def(lift((set) => set(12, 8, "d")), legend), 1);
    run(w, sec(2.5));
    // Crates are in reading order: the upper one first.
    const [high, low] = w.crates;
    expect(low!.y).toBeCloseTo(5, 6);
    expect(high!.y).toBeCloseTo(4, 6);
    expect(high!.support).toEqual({ kind: "collider", id: low!.collider.id, body: -1 });
  });

  it("the crate and its rider rise only as far as the rider's head can go under a ceiling", () => {
    // A ceiling (bottom at y = 5) over the lift: the friend's head stops the pile at crate top 5.9.
    const w = world(def(lift((set) => {
      for (let x = 10; x <= 14; x++) set(x, 4, "#");
    }), legend), 1);
    const crate = w.crates[0]!;
    const b = w.bodies[0]!;
    w.placeBody(0, 12.1, 9 - H);
    let highest = Infinity;
    for (let k = 0; k < sec(2.5); k++) {
      w.step([]);
      highest = Math.min(highest, crate.y);
      expect(b.y).toBeGreaterThanOrEqual(5 - TOL);
      expect(overlap(b.y, H, crate.y, crate.h)).toBeLessThan(TOL);
    }
    // (The one-way lift then goes on through the stopped crate: it rose from 9 to about 5.9.)
    expect(highest).toBeGreaterThan(5 + H - TOL);
    expect(highest).toBeLessThan(5 + H + 0.01);
  });

  it("a pile lifted by the rope (moveStack): the crate on a friend's head rises with him, its rider too", () => {
    const w = world(def(room(20, 14, (set) => set(10, 9, "c")), legend), 2);
    w.placeBody(0, 10.1, 12 - H);
    w.placeBody(1, 13, 12 - H);
    run(w, 60);
    const crate = w.crates[0]!;
    w.placeBody(1, 10.1, crate.y - H);
    run(w, 10);
    const y0 = crate.y;
    expect(crate.support).toEqual({ kind: "collider", id: 0, body: 0 });
    const got = w.moveStack(0, 0, -0.5);
    expect(got.dy).toBeCloseTo(-0.5, 9);
    expect(crate.y).toBeCloseTo(y0 - 0.5, 9);
    expect(w.bodies[0]!.y).toBeCloseTo(crate.y + crate.h, 9);
    expect(w.bodies[1]!.y + H).toBeCloseTo(crate.y, 9);
  });
});

describe("the rising side of a seesaw or balance never goes through a body", () => {
  it("a balance pan stops where the friend on it meets the ceiling (the other pan with it)", () => {
    // Left pan x 4-5 (row 9) under a ceiling whose bottom is y = 8: 0.1 of headroom for a friend on it.
    const rows = [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "########...........#",
      "#..................#",
      "#...ll..rr.........#",
      "#..................#",
      "#.S................#",
      "####################",
      "####################",
    ];
    const w = world(def(rows, { l: { kind: "pan", balance: "B" }, r: { kind: "pan", balance: "B" } }), 2, 1);
    const bal = w.props.balances[0]!;
    const friend = w.bodies[0]!;
    w.placeBody(0, 4.6, 9 - H); // the friend on the left pan
    w.placeBody(1, 8.6, 9 - H); // Ruben on the right pan: the left pan rises
    for (let k = 0; k < sec(1); k++) {
      w.step([]);
      expect(friend.y).toBeGreaterThanOrEqual(8 - TOL);
      expect(friend.y + H).toBeCloseTo(bal.left.collider.y, 6);
    }
    expect(friend.support).toEqual({ kind: "collider", id: bal.left.collider.id, body: -1 });
    expect(bal.left.collider.y).toBeCloseTo(8.9, 6);
    expect(bal.right.collider.y).toBeCloseTo(9.1, 6);
  });

  it("a friend falling onto a pad that a catapult snaps up lands on it instead of falling through", () => {
    // A seesaw on row 15 (x 10-16, pivot 13), its fulcrum below; floor top at 18.
    const rows = room(32, 20, (set) => {
      for (let x = 10; x <= 16; x++) set(x, 15, "w");
      set(13, 16, "#");
      set(13, 17, "#");
    });
    const w = world(def(rows, { w: { kind: "seesaw" } }), 1);
    const s = w.props.seesaws[0]!;
    const b = w.bodies[0]!;
    // The friend just above the left pad (falling onto it) as the plank snaps its left side up.
    w.placeBody(0, 10.5, 15 - 0.05 - H);
    s.snap = -1;
    for (let k = 0; k < sec(0.5) && s.snap !== 0; k++) {
      w.step([]);
      expect(b.y + H).toBeLessThanOrEqual(s.left.y + TOL);
    }
    expect(s.snap).toBe(0);
    expect(s.t).toBe(-1);
    expect(b.support).toEqual({ kind: "collider", id: s.left.id, body: -1 });
    expect(b.y + H).toBeCloseTo(15 - s.travel, 6);
  });

  it("riding a lift head first into a switch block hits it, once", () => {
    // A clock lift x 9-11 going up 4 cells from row 11 and back in 4 s; a switch block at x 10 row 6.
    const rows = room(20, 14, (set) => {
      for (let x = 9; x <= 11; x++) set(x, 11, "m");
      set(10, 6, "k");
      set(15, 9, "s");
      set(16, 9, "s");
      set(15, 7, "t");
      set(16, 7, "t");
    });
    const w = world(def(rows, { m: { kind: "mover", dy: -4, period: 4 }, k: { kind: "switch" }, s: { kind: "shelf", group: "A" }, t: { kind: "shelf", group: "B" } }), 1);
    w.placeBody(0, 10.1, 11 - H);
    const events = run(w, sec(4));
    expect(events.filter((e) => e.kind === "switch")).toEqual([{ kind: "switch", body: 0, active: "B" }]);
    expect(w.props.active).toBe("B");
  });
});

describe("a body inside the door", () => {
  it("hits no switch: entering on the step of a head hit swaps the shelves once, and a loaded world goes on the same", () => {
    // A door at x 10, rows 9-11 (floor top 12), a switch block right above it at row 8.
    const rows = room(24, 14, (set) => {
      set(10, 9, "D");
      set(10, 10, "D");
      set(10, 11, "D");
      set(10, 8, "k");
      set(18, 9, "s");
      set(19, 9, "s");
      set(18, 7, "t");
      set(19, 7, "t");
    });
    const d = def(rows, { k: { kind: "switch" }, s: { kind: "shelf", group: "A" }, t: { kind: "shelf", group: "B" } });
    const w = world(d, 2);
    w.placeBody(0, 10.1, 12 - H);
    w.placeBody(1, 7, 12 - H);
    run(w, 10);
    const sw = w.props.switches[0]!.collider.id;
    let entered = false;
    for (let k = 0; k < 120 && !entered; k++) {
      const bits = k === 0 ? BIT_JUMP | BIT_JUMP_PRESS : BIT_JUMP;
      const before = w.save();
      w.step([bits, 0]);
      if (w.bodies[0]!.headCollider === sw) {
        // The same step again, with ↓ pressed in the open door.
        w.load(before);
        w.step([bits | BIT_DOWN | BIT_DOWN_PRESS, 0]);
        expect(w.events.map((e) => e.kind).sort()).toEqual(["enter", "switch"]);
        entered = w.inside[0]!;
      }
    }
    expect(entered).toBe(true);
    expect(w.props.active).toBe("B");
    const twin = world(d, 2);
    twin.load(decodeWorld(encodeWorld(w.save())));
    const events: CoopEvent[] = [];
    for (let k = 0; k < sec(5); k++) {
      w.step([0, 0]);
      twin.step([0, 0]);
      events.push(...w.events);
      expect(twin.hash()).toBe(w.hash());
    }
    expect(events.filter((e) => e.kind === "switch")).toEqual([]);
    expect(w.props.active).toBe("B");
  });
});

describe("blame for a trapdoor", () => {
  it("a floor that a pressed plate opens blames whoever stepped on the plate", () => {
    // A raised floor (top 8) with a trapdoor g (x 9-10, opens with link L) over spikes; plate a at x 6.
    const rows = [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#.S................#",
      "######a##gg#########",
      "#########xx#########",
      "####################",
      "####################",
    ];
    const w = world(def(rows, { a: { kind: "plate", need: 1, link: "L" }, g: { kind: "gate", link: "L" }, x: { kind: "spikes", dir: "up" } }), 2);
    w.placeBody(0, 4.5, 8 - H);
    w.placeBody(1, 9.6, 8 - H);
    run(w, 30);
    expect(w.props.gates[0]!.open).toBe(false);
    let death: CoopEvent | undefined;
    for (let k = 0; k < 400 && !death; k++) {
      w.step([w.bodies[0]!.x < 6.1 ? BIT_RIGHT : 0, 0]);
      death = w.events.find((e) => e.kind === "death");
    }
    expect(death).toMatchObject({ kind: "death", victim: 1, cause: "hazard", blame: 0, why: "plate" });
    expect(w.stats.caused[0]).toBe(1);
    expect(w.stats.own[1]).toBe(0);
  });
});

describe("a tied seesaw", () => {
  it("levels when both sides weigh the same", () => {
    // A seesaw on row 15 (x 10-16, pivot 13), its fulcrum below; floor top at 18.
    const rows = room(32, 20, (set) => {
      for (let x = 10; x <= 16; x++) set(x, 15, "w");
      set(13, 16, "#");
      set(13, 17, "#");
    });
    const w = world(def(rows, { w: { kind: "seesaw" } }), 2);
    const s = w.props.seesaws[0]!;
    w.placeBody(0, 11, 15 - H);
    w.placeBody(1, 7, 18 - H);
    run(w, sec(1));
    expect(s.t).toBe(1);
    // A second friend on the raised side: one against one.
    w.placeBody(1, 14.6, s.right.y - H);
    run(w, sec(1));
    expect(s.loadL).toBe(1);
    expect(s.loadR).toBe(1);
    expect(s.t).toBe(0);
    expect(s.left.y).toBe(15);
    expect(s.right.y).toBe(15);
  });
});

function run(w: CoopWorld, steps: number, inputs: (s: number) => number[] = () => []): CoopEvent[] {
  const events: CoopEvent[] = [];
  for (let s = 0; s < steps; s++) {
    w.step(inputs(s));
    events.push(...w.events);
  }
  return events;
}
