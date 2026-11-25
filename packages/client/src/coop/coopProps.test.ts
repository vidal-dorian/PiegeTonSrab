/**
 * Co-op level things on the real physics: plates and gates, crates, seesaw, balance, platforms,
 * switch blocks, fragile floors, the key and the door, terminals, deaths and their blame,
 * titles, and snapshots with props.
 */
import { describe, expect, it } from "vitest";
import {
  BIT_DOWN,
  BIT_DOWN_PRESS,
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_LEFT,
  BIT_RIGHT,
  COOP_DT,
  CoopWorld,
  coopTitles,
  decodeWorld,
  deathQuip,
  encodeWorld,
  parseCoopLevel,
  PROPS,
  type CoopEvent,
  type CoopLevelDef,
  type CoopPlayer,
  type CoopStats,
  type ThingDef,
} from "@game/shared/coop";

const H = 0.9;

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

/** Body i standing with its left at x on a floor whose top is `top`. */
function stand(w: CoopWorld, i: number, x: number, top: number): void {
  w.placeBody(i, x, top - H);
}

function run(w: CoopWorld, steps: number, inputs: (s: number) => number[] = () => []): CoopEvent[] {
  const events: CoopEvent[] = [];
  for (let s = 0; s < steps; s++) {
    w.step(inputs(s));
    events.push(...w.events);
  }
  return events;
}

const sec = (s: number) => Math.round(s / COOP_DT);

describe("plates and gates", () => {
  // Plate "a" in the floor at x 10-11, a 4-high gate at x 15.
  const rows = room(30, 12, (set) => {
    set(10, 10, "a");
    set(11, 10, "a");
    for (let y = 6; y < 10; y++) set(15, y, "g");
  });

  it("a plate '2' needs Ruben, or two friends; it holds 150 ms; a gate never closes on anyone", () => {
    const w = world(def(rows, { a: { kind: "plate", need: 2, link: "L" }, g: { kind: "gate", link: "L" } }), 3, 2);
    const gate = w.props.gates[0]!;
    const plate = w.props.plates[0]!;
    stand(w, 0, 5, 10);
    stand(w, 1, 7, 10);
    stand(w, 2, 10.6, 10);
    run(w, 2);
    expect(plate.load).toBe(2);
    expect(gate.open).toBe(true);

    // Friend 0 walks into the gate; Ruben steps off: the gate wants to close but someone is in it.
    stand(w, 0, 15.1, 10);
    stand(w, 1, 12.6, 10);
    stand(w, 2, 8.5, 10);
    run(w, sec(PROPS.plateHold) - 2);
    expect(gate.open).toBe(true); // still held
    run(w, sec(0.5));
    expect(plate.active).toBe(false);
    expect(gate.open).toBe(true);
    expect(gate.blocked).toBe(true);
    stand(w, 0, 16.5, 10);
    run(w, 2);
    expect(gate.open).toBe(false);

    // One friend weighs 1: not enough.
    stand(w, 1, 10.1, 10);
    run(w, 3);
    expect(plate.load).toBe(1);
    expect(gate.open).toBe(false);
  });

  it("an exact plate '= 1' opens for a friend, not for Ruben (2) nor for both", () => {
    const w = world(def(rows, { a: { kind: "plate", need: 1, exact: true, link: "L" }, g: { kind: "gate", link: "L" } }), 2, 1);
    const gate = w.props.gates[0]!;
    stand(w, 0, 10.1, 10);
    stand(w, 1, 7, 10);
    run(w, 2);
    expect(gate.open).toBe(true);
    stand(w, 0, 7, 10);
    stand(w, 1, 10.6, 10);
    run(w, sec(0.5));
    expect(gate.open).toBe(false);
    stand(w, 0, 10.0, 10);
    stand(w, 1, 11.0, 10);
    run(w, sec(0.5));
    expect(w.props.plates[0]!.load).toBe(3);
    expect(gate.open).toBe(false);
  });

  it("team weights: with 3 players W is 4, so 'W-1' needs Ruben and a friend", () => {
    const w = world(def(rows, { a: { kind: "plate", need: "W-1", link: "L" }, g: { kind: "gate", link: "L" } }), 3, 2);
    expect(w.props.plates[0]!.need).toBe(3);
    stand(w, 0, 10.0, 10);
    stand(w, 1, 11.0, 10);
    stand(w, 2, 6, 10);
    run(w, 2);
    expect(w.props.gates[0]!.open).toBe(false);
    stand(w, 1, 7.5, 10);
    stand(w, 2, 11.0, 10);
    run(w, 2);
    expect(w.props.gates[0]!.open).toBe(true);
  });

  it("an inverted gate is open until its plate is pressed", () => {
    const w = world(def(rows, { a: { kind: "plate", need: 1, link: "L" }, g: { kind: "gate", link: "L", inverted: true } }), 2, 1);
    run(w, 1);
    expect(w.props.gates[0]!.open).toBe(true);
    stand(w, 0, 10.1, 10);
    stand(w, 1, 7, 10);
    run(w, 2);
    expect(w.props.gates[0]!.open).toBe(false);
  });

  it("a friend hanging from the rope weighs on the plate his anchor stands on", () => {
    // A ledge (top 10) with a plate at its rim (x 13-14), a deep pit from x 15.
    const tall = room(30, 26, (set) => {
      set(13, 10, "a");
      set(14, 10, "a");
      for (let y = 10; y < 26; y++) for (let x = 15; x < 29; x++) set(x, y, ".");
      for (let y = 11; y < 26; y++) for (let x = 1; x < 15; x++) set(x, y, "#");
      for (let x = 1; x < 15; x++) set(x, 10, x === 13 || x === 14 ? "a" : "#");
      set(2, 23, ".");
      set(2, 9, "S");
    });
    const w = world(def(tall, { a: { kind: "plate", need: 2, link: "L" } }), 2);
    stand(w, 0, 13.6, 10);
    w.placeBody(1, 16.5, 12);
    // The anchor stands still (pushing away would walk away and haul the friend up).
    run(w, sec(0.6));
    expect(w.bodies[1]!.hanging).toBe(true);
    expect(w.bodies[0]!.x).toBeGreaterThan(13); // it slid a little towards the pit, still on the plate
    expect(w.props.plates[0]!.load).toBe(2);
    expect(w.props.plates[0]!.active).toBe(true);
  });
});

describe("crates", () => {
  const rows = room(40, 12, (set) => set(14, 9, "c"));
  const legend: Record<string, ThingDef> = { c: { kind: "crate", need: 2 } };

  it("a crate '2' does not move for one friend, moves for Ruben alone and for two friends in a row", () => {
    let w = world(def(rows, legend), 2, 1);
    stand(w, 0, 13.2, 10);
    stand(w, 1, 10, 10);
    run(w, sec(1), () => [BIT_RIGHT, 0]);
    expect(w.crates[0]!.x).toBe(14);

    w = world(def(rows, legend), 2, 1);
    stand(w, 0, 10, 10);
    stand(w, 1, 13.2, 10);
    run(w, sec(1), () => [0, BIT_RIGHT]);
    expect(w.crates[0]!.x).toBeGreaterThan(15.5);
    expect(w.crates[0]!.x).toBeLessThan(16.5); // about PROPS.pushSpeed cells in a second

    w = world(def(rows, legend), 3, 2);
    stand(w, 0, 13.2, 10);
    stand(w, 1, 12.4, 10);
    stand(w, 2, 9.5, 10);
    run(w, sec(1), () => [BIT_RIGHT, BIT_RIGHT, BIT_RIGHT]);
    expect(w.crates[0]!.x).toBeGreaterThan(15.5);
    // The pushers kept up with it.
    expect(w.crates[0]!.x - (w.bodies[0]!.x + w.bodies[0]!.width)).toBeLessThan(0.1);
  });

  it("a crate never pushes anyone; it can be stood on; it comes home when it leaves the level", () => {
    const pit = room(40, 12, (set) => {
      set(14, 9, "c");
      set(20, 10, ".");
      set(20, 11, ".");
      set(21, 10, ".");
      set(21, 11, ".");
    });
    const w = world(def(pit, { c: { kind: "crate", need: 1 } }), 2, 1);
    const crate = w.crates[0]!;
    // A friend blocks the far side: Ruben cannot push the crate into him.
    stand(w, 0, 15.0, 10);
    stand(w, 1, 13.2, 10);
    run(w, sec(0.5), () => [0, BIT_RIGHT]);
    expect(crate.x).toBe(14);
    // Standing on it.
    w.placeBody(0, 14.1, 9 - H);
    run(w, 5);
    expect(w.bodies[0]!.grounded).toBe(true);
    expect(w.bodies[0]!.support).toEqual({ kind: "collider", id: crate.collider.id, body: -1 });
    // Over the pit it falls out of the level and comes back.
    w.placeBody(0, 5, 10 - H);
    w.placeBody(1, 8, 10 - H);
    crate.x = 20.5;
    crate.y = 9;
    crate.support = null;
    crate.sync();
    run(w, sec(1));
    expect(crate.x).toBe(14);
    expect(crate.y).toBe(9);
  });

  it("a crate weighs on a plate", () => {
    const rows2 = room(40, 12, (set) => {
      set(14, 9, "c");
      set(14, 10, "a");
      for (let y = 6; y < 10; y++) set(20, y, "g");
    });
    const w = world(def(rows2, { c: { kind: "crate", need: 2 }, a: { kind: "plate", need: 2, link: "L" }, g: { kind: "gate", link: "L" } }), 1);
    run(w, 3);
    expect(w.props.plates[0]!.load).toBe(2);
    expect(w.props.gates[0]!.open).toBe(true);
  });
});

describe("seesaw and balance", () => {
  // A seesaw on row 15 (x 10-16, pivot 13), its fulcrum below; floor top at 18.
  const rows = room(32, 20, (set) => {
    for (let x = 10; x <= 16; x++) set(x, 15, "w");
    set(13, 16, "#");
    set(13, 17, "#");
  });
  const legend: Record<string, ThingDef> = { w: { kind: "seesaw" } };

  it("the heavier side goes down", () => {
    const w = world(def(rows, legend), 2, 1);
    const s = w.props.seesaws[0]!;
    w.placeBody(0, 10.5, 15 - H);
    stand(w, 1, 7, 18);
    run(w, sec(1));
    expect(s.t).toBe(1);
    expect(s.left.y).toBeCloseTo(15 + s.travel, 6);
    expect(w.bodies[0]!.y + H).toBeCloseTo(s.left.y, 3); // carried down with it
    // Ruben (2) on the other side wins.
    w.placeBody(1, 15.5, s.right.y - H);
    run(w, sec(1.5));
    expect(s.t).toBe(-1);
  });

  it("a hard landing on the raised side throws whoever is on the other side up", () => {
    // One friend and a heavy crate dropped from high up (no rope with a single player).
    const rows2 = rows.slice();
    const w = world(def(rows2.map((r, y) => (y === 2 ? r.slice(0, 15) + "c" + r.slice(16) : r)), { ...legend, c: { kind: "crate", need: 9, weight: 2 } }), 1);
    const s = w.props.seesaws[0]!;
    const crate = w.crates[0]!;
    // Keep the crate up until the friend has tipped the seesaw towards him.
    crate.y = 2;
    w.placeBody(0, 10.5, 15 - H);
    for (let k = 0; k < sec(0.8); k++) {
      crate.y = 2;
      crate.vy = 0;
      crate.sync();
      w.step([]);
    }
    expect(s.t).toBe(1);
    const padTop = s.left.y;
    let events: CoopEvent[] = [];
    let top = Infinity;
    for (let k = 0; k < sec(1.5); k++) {
      w.step([]);
      events = events.concat(w.events);
      top = Math.min(top, w.bodies[0]!.y + H);
    }
    const shot = events.find((e) => e.kind === "catapult");
    expect(shot).toBeDefined();
    // The crate fell about 11 cells (capped speed): the friend flies far higher than a jump (3).
    expect(padTop - top).toBeGreaterThan(5);
  });

  it("a balance: the heavier pan goes down one cell per unit of difference", () => {
    const rows3 = room(32, 14, (set) => {
      set(8, 8, "p");
      set(9, 8, "p");
      set(13, 8, "q");
      set(14, 8, "q");
    });
    const w = world(def(rows3, { p: { kind: "pan", balance: "b" }, q: { kind: "pan", balance: "b" } }), 2, 0);
    w.placeBody(0, 8.5, 8 - H);
    w.placeBody(1, 13.5, 8 - H);
    run(w, sec(2));
    const b = w.props.balances[0]!;
    expect(b.offset).toBe(1); // Ruben 2 vs friend 1
    expect(b.left.collider.y).toBe(9);
    expect(b.right.collider.y).toBe(7);
    expect(w.bodies[1]!.y + H).toBeCloseTo(7, 3);
  });
});

describe("platforms, switch blocks, fragile floors", () => {
  it("a platform on the clock carries whoever stands on it", () => {
    const rows = room(32, 12, (set) => {
      for (let x = 8; x <= 10; x++) set(x, 7, "m");
    });
    const w = world(def(rows, { m: { kind: "mover", dx: 6, period: 4 } }), 1);
    w.placeBody(0, 8.6, 7 - H);
    run(w, sec(2));
    const m = w.props.movers[0]!;
    expect(m.collider.x).toBeCloseTo(14, 6);
    expect(w.bodies[0]!.x).toBeCloseTo(14.6, 2);
  });

  it("hitting a switch block from below swaps the A and B shelves; a shelf turns solid only once free", () => {
    // Switch at (10, 6); A shelf at x 14-16 on row 7; B cells at x 12-13 on row 9 (just above the floor).
    const rows = room(32, 12, (set) => {
      set(10, 6, "k");
      for (let x = 14; x <= 16; x++) set(x, 7, "a");
      set(12, 9, "b");
      set(13, 9, "b");
    });
    const w = world(def(rows, { k: { kind: "switch" }, a: { kind: "shelf", group: "A" }, b: { kind: "shelf", group: "B" } }), 2);
    const solidOf = (g: "A" | "B") => w.props.shelves.filter((s) => s.group === g).map((s) => s.solid);
    expect(solidOf("A")).toEqual([true, true, true]);
    expect(solidOf("B")).toEqual([false, false]);
    stand(w, 0, 10.1, 10);
    stand(w, 1, 12.1, 10); // friend 1 stands where the first B cell will appear
    const ev = run(w, sec(0.5), (s) => [s === 0 ? BIT_JUMP | BIT_JUMP_PRESS : BIT_JUMP, 0]);
    expect(ev.some((e) => e.kind === "switch")).toBe(true);
    expect(w.props.active).toBe("B");
    expect(solidOf("A")).toEqual([false, false, false]);
    expect(solidOf("B")).toEqual([false, true]); // the cell friend 1 is in waits for him
    run(w, sec(0.5), () => [0, BIT_LEFT]);
    expect(solidOf("B")).toEqual([true, true]);
  });

  it("a fragile floor holds a friend and breaks under Ruben", () => {
    const rows = room(32, 12, (set) => {
      set(12, 10, "f");
      set(13, 10, "f");
    });
    const w = world(def(rows, { f: { kind: "fragile" } }), 2, 1);
    stand(w, 0, 12.1, 10);
    stand(w, 1, 9, 10);
    run(w, sec(0.5));
    expect(w.props.fragiles[0]!.broken).toBe(false);
    stand(w, 0, 9, 10);
    stand(w, 1, 12.6, 10);
    const ev = run(w, 3);
    expect(w.props.fragiles[0]!.broken).toBe(true);
    expect(ev.some((e) => e.kind === "crack")).toBe(true);
    // Back after a restart.
    w.restart();
    expect(w.props.fragiles[0]!.broken).toBe(false);
  });
});

describe("the key, the door and the terminals", () => {
  const rows = room(32, 12, (set) => {
    set(10, 9, "K");
    set(20, 8, "D");
    set(20, 9, "D");
  });

  it("the key is picked up on contact, taken with ↓, opens the door; everybody in wins", () => {
    const w = world(def(rows), 2, 1);
    stand(w, 0, 9.7, 10);
    stand(w, 1, 7, 10);
    let ev = run(w, 1);
    expect(w.props.keyCarrier).toBe(0);
    expect(ev.find((e) => e.kind === "key")).toMatchObject({ body: 0, from: -1 });
    // Ruben, next to the carrier, takes it.
    stand(w, 1, 8.7, 10);
    ev = run(w, 1, () => [0, BIT_DOWN | BIT_DOWN_PRESS]);
    expect(w.props.keyCarrier).toBe(1);
    // The carrier opens the door by touching it.
    stand(w, 1, 19.9, 10);
    stand(w, 0, 17, 10);
    ev = run(w, 1);
    expect(w.props.doorOpen).toBe(true);
    expect(w.stats.opener).toBe(1);
    expect(w.props.keyCarrier).toBe(-2);
    // Ruben goes in, comes out, goes in again; then his friend: won.
    run(w, 1, () => [0, BIT_DOWN | BIT_DOWN_PRESS]);
    expect(w.inside[1]).toBe(true);
    run(w, 1);
    ev = run(w, 1, () => [0, BIT_DOWN | BIT_DOWN_PRESS]);
    expect(w.inside[1]).toBe(false);
    expect(ev.some((e) => e.kind === "exit")).toBe(true);
    run(w, 2);
    run(w, 1, () => [0, BIT_DOWN | BIT_DOWN_PRESS]);
    expect(w.inside[1]).toBe(true);
    stand(w, 0, 20.1, 10);
    ev = run(w, 1, () => [BIT_DOWN | BIT_DOWN_PRESS, 0]);
    expect(w.won).toBe(true);
    expect(ev.some((e) => e.kind === "win")).toBe(true);
    expect(w.stats.firstIn).toBe(1);
  });

  it("a terminal sets its link; Ruben's prompt does the opposite", () => {
    const rows2 = room(32, 12, (set) => {
      set(12, 8, "t");
      set(12, 9, "t");
      for (let y = 6; y < 10; y++) set(18, y, "g");
    });
    const w = world(def(rows2, { t: { kind: "terminal", prompt: "Ouvre la grille", link: "L", set: "on" }, g: { kind: "gate", link: "L" } }), 2, 1);
    stand(w, 0, 12.1, 10);
    stand(w, 1, 9, 10);
    let ev = run(w, 1, () => [BIT_DOWN | BIT_DOWN_PRESS, 0]);
    expect(ev.find((e) => e.kind === "terminal")).toMatchObject({ body: 0, inverted: false });
    run(w, 1);
    expect(w.props.gates[0]!.open).toBe(true);
    stand(w, 0, 9, 10);
    stand(w, 1, 12.1, 10);
    ev = run(w, 1, () => [0, BIT_DOWN | BIT_DOWN_PRESS]);
    expect(ev.find((e) => e.kind === "terminal")).toMatchObject({ body: 1, inverted: true });
    run(w, 1);
    expect(w.props.gates[0]!.open).toBe(false);
  });
});

describe("deaths and their blame", () => {
  it("whoever steps off the plate that held a trapdoor shut is blamed for the friend who falls through", () => {
    // Plate at x 11; an inverted gate as a trapdoor in the floor at x 14-15, a deadly pit under it.
    const rows = room(32, 12, (set) => {
      set(11, 10, "a");
      set(14, 10, "g");
      set(15, 10, "g");
      set(14, 11, "~");
      set(15, 11, "~");
    });
    const w = world(def(rows, { a: { kind: "plate", need: 1, link: "L" }, g: { kind: "gate", link: "L", inverted: true } }), 2, 1);
    stand(w, 1, 11.1, 10);
    stand(w, 0, 7, 10);
    run(w, 2);
    expect(w.props.gates[0]!.open).toBe(false);
    stand(w, 0, 14.5, 10);
    run(w, 2);
    stand(w, 1, 10.1, 10); // Ruben steps off the plate
    const ev = run(w, sec(1));
    const death = ev.find((e) => e.kind === "death");
    expect(death).toMatchObject({ victim: 0, blame: 1, why: "plate", cause: "hazard" });
    expect(w.stats.caused[1]).toBe(1);
    expect(deathQuip(death as Extract<CoopEvent, { kind: "death" }>, ["Léo", "Inès"], 1)).toContain("Inès");
  });

  it("spikes pointing down kill whoever jumps into them; a fall of one's own is one's own fault", () => {
    const rows = room(32, 12, (set) => set(15, 7, "v"));
    const w = world(def(rows, { v: { kind: "spikes", dir: "down" } }), 1);
    stand(w, 0, 15.1, 10);
    const ev = run(w, sec(1), (s) => [s === 0 ? BIT_JUMP | BIT_JUMP_PRESS : BIT_JUMP]);
    expect(ev.find((e) => e.kind === "death")).toMatchObject({ victim: 0, blame: 0, why: "self" });
    expect(w.stats.own[0]).toBe(1);
  });
});

describe("titles", () => {
  it("at most four, never for zero, ties share, with the number that earned them", () => {
    const stats: CoopStats = {
      caused: [2, 0, 2],
      own: [0, 1, 0],
      catches: [0, 0, 0],
      carried: [0.4, 12.7, 0],
      hung: [3, 0, 0],
      plates: [0, 0, 20],
      kamikaze: [0, 0, 0],
      opener: 1,
      firstIn: 0,
    };
    const t = coopTitles(stats);
    expect(t.map((x) => x.id)).toEqual(["hero", "traitor", "boulet", "porter"]);
    expect(t[1]).toMatchObject({ name: "Le Traître", holders: [0, 2], value: "2 morts causées" });
    expect(t[3]!.value).toBe("12 s avec quelqu'un sur la tête");
  });
});

describe("snapshots and determinism with props", () => {
  const rows = room(40, 14, (set) => {
    set(9, 12, "a");
    for (let y = 8; y < 12; y++) set(13, y, "g");
    set(16, 11, "c");
    for (let x = 20; x <= 24; x++) set(x, 9, "w");
    set(22, 10, "#");
    set(22, 11, "#");
    for (let x = 27; x <= 29; x++) set(x, 8, "m");
    set(33, 7, "k");
    set(35, 9, "s");
    set(36, 9, "s");
    set(12, 11, "K");
    set(38, 10, "D");
    set(38, 11, "D");
  });
  const legend: Record<string, ThingDef> = {
    a: { kind: "plate", need: 1, link: "L" },
    g: { kind: "gate", link: "L" },
    c: { kind: "crate", need: 1 },
    w: { kind: "seesaw" },
    m: { kind: "mover", dx: 0, dy: -2, period: 3 },
    k: { kind: "switch" },
    s: { kind: "shelf", group: "B" },
  };

  function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function play(seed: number, steps: number): CoopWorld {
    const w = world(def(rows, legend), 3, 2);
    const r = rng(seed);
    let bits = [0, 0, 0];
    for (let s = 0; s < steps; s++) {
      if (s % 20 === 0) {
        bits = bits.map(() => {
          const v = r();
          let b = v < 0.45 ? BIT_RIGHT : v < 0.6 ? BIT_LEFT : 0;
          if (r() < 0.3) b |= BIT_JUMP | BIT_JUMP_PRESS;
          if (r() < 0.1) b |= BIT_DOWN | BIT_DOWN_PRESS;
          return b;
        });
      } else bits = bits.map((b) => b & ~(BIT_JUMP_PRESS | BIT_DOWN_PRESS));
      w.step(bits);
    }
    return w;
  }

  it("the same inputs give the same world, and a snapshot restores it exactly", () => {
    const a = play(11, 1500);
    const b = play(11, 1500);
    expect(a.hash()).toBe(b.hash());
    const copy = world(def(rows, legend), 3, 2);
    copy.load(decodeWorld(encodeWorld(a.save())));
    expect(copy.hash()).toBe(a.hash());
    // ... and both go on identically.
    for (let s = 0; s < 300; s++) {
      const bits = [BIT_RIGHT | (s % 50 === 0 ? BIT_JUMP | BIT_JUMP_PRESS : 0), BIT_RIGHT, s % 90 === 0 ? BIT_DOWN | BIT_DOWN_PRESS : BIT_LEFT];
      a.step(bits);
      copy.step(bits);
    }
    expect(copy.hash()).toBe(a.hash());
  });
});
