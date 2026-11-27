/**
 * Co-op physics: the rules every level is designed against (heights, towers, the rope).
 * See the "Co-op mode" section of HANDOFF.md.
 */
import { describe, expect, it } from "vitest";
import {
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_LEFT,
  BIT_RIGHT,
  COOP,
  COOP_DT,
  CoopWorld,
  parseCoopLevel,
  ROPE_MAX_LENGTH,
  sandboxLevel,
  type CoopLevelDef,
  type CoopPlayer,
} from "@game/shared/coop";

const H = 0.9; // body height
const W = 0.8; // body width

/** A level from rows; "S" is required by the parser (the spawn row), put it somewhere harmless. */
function level(rows: string[]): CoopLevelDef {
  return { id: "test", name: "test", rows };
}

function players(n: number, rubenAt = -1): CoopPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isRuben: i === rubenAt }));
}

function makeWorld(rows: string[], n: number, rubenAt = -1): CoopWorld {
  return new CoopWorld(parseCoopLevel(level(rows)), players(n, rubenAt));
}

/** Put body i standing with its feet on y = floorTop, its left at x. */
function stand(w: CoopWorld, i: number, x: number, floorTop: number): void {
  w.placeBody(i, x, floorTop - H);
}

function run(w: CoopWorld, steps: number, inputs: (step: number) => number[]): void {
  for (let s = 0; s < steps; s++) w.step(inputs(s));
}

/** Inputs for a body that starts a full jump now and keeps steering towards `dir`. */
function jumpingTowards(dir: 1 | -1, s: number): number {
  const move = dir > 0 ? BIT_RIGHT : BIT_LEFT;
  return move | BIT_JUMP | (s === 0 ? BIT_JUMP_PRESS : 0);
}

/**
 * A wide room: floor top at y = 20, a ledge of height `h` from x = 20 on (top at 20 - h),
 * with the spawn far left. Rows up to 26.
 */
function ledgeRoom(h: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 27; y++) {
    let r = "";
    for (let x = 0; x < 40; x++) {
      const solid = y === 0 || x === 0 || x === 39 || y >= 20 || (x >= 20 && y >= 20 - h);
      r += solid ? "#" : ".";
    }
    rows.push(r);
  }
  const r19 = rows[19]!.split("");
  r19[2] = "S";
  rows[19] = r19.join("");
  return rows;
}

/** Whether body i ended standing on the ledge top (feet at 20 - h, over the ledge). */
function onLedge(w: CoopWorld, i: number, h: number): boolean {
  const b = w.bodies[i]!;
  return b.grounded && Math.abs(b.y + H - (20 - h)) < 1e-6 && b.x + W > 20;
}

describe("co-op reach: what a lone player and towers can climb", () => {
  for (const [k, h, reach] of [
    [1, 2, true],
    [1, 3, false],
    [2, 3, true],
    [2, 4, false],
    [3, 4, true],
    [3, 5, false],
  ] as Array<[number, number, boolean]>) {
    it(`a ${k}-high tower ${reach ? "climbs" : "does not climb"} a step of ${h}`, () => {
      const w = makeWorld(ledgeRoom(h), k);
      // Stack the tower against the wall (bottom at x = 18.6, wall at x = 20).
      for (let j = 0; j < k; j++) w.placeBody(j, 18.6, 20 - H * (j + 1));
      run(w, 5, () => []);
      const top = k - 1;
      let landed = false;
      run(w, 150, (s) => {
        if (onLedge(w, top, h)) landed = true;
        const inputs = new Array<number>(k).fill(0);
        // Steer towards the ledge until landed (then the rope would pull the climber back).
        if (!landed) inputs[top] = jumpingTowards(1, s);
        return inputs;
      });
      expect(landed).toBe(reach);
    });
  }
});

describe("co-op towers and contacts", () => {
  it("a rider is carried by the body it stands on", () => {
    const w = makeWorld(ledgeRoom(1), 2);
    stand(w, 0, 5, 20);
    w.placeBody(1, 5, 20 - 2 * H);
    run(w, 5, () => []);
    expect(w.bodies[1]!.support).toMatchObject({ kind: "collider", body: 0 });
    run(w, 60, () => [BIT_RIGHT, 0]);
    const a = w.bodies[0]!;
    const b = w.bodies[1]!;
    expect(a.x).toBeGreaterThan(8);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y + H).toBeCloseTo(a.y, 6);
  });

  it("a carrier cannot jump", () => {
    const w = makeWorld(ledgeRoom(1), 2);
    stand(w, 0, 5, 20);
    w.placeBody(1, 5, 20 - 2 * H);
    run(w, 5, () => []);
    run(w, 20, (s) => [BIT_JUMP | (s === 0 ? BIT_JUMP_PRESS : 0), 0]);
    expect(w.bodies[0]!.grounded).toBe(true);
    expect(w.bodies[0]!.y + H).toBeCloseTo(20, 6);
  });

  it("nobody jumps off a base that is in the air", () => {
    // The base walks off the 1-high step with its rider; the rider presses jump while falling.
    const w = makeWorld(ledgeRoom(1), 2);
    stand(w, 0, 22, 19);
    w.placeBody(1, 22, 19 - 2 * H);
    run(w, 5, () => []);
    let riderJumped = false;
    run(w, 40, (s) => {
      const base = w.bodies[0]!;
      const rider = w.bodies[1]!;
      if (rider.vy < -10) riderJumped = true;
      return [BIT_LEFT, !base.grounded ? BIT_JUMP | (s % 3 === 0 ? BIT_JUMP_PRESS : 0) : 0];
    });
    expect(riderJumped).toBe(false);
  });

  it("there is no wall jump and no wall slide", () => {
    const w = makeWorld(ledgeRoom(6), 1);
    stand(w, 0, 18.6, 20);
    run(w, 5, () => []);
    // Jump against the wall; once falling, keep pressing into it and press jump again, until landing.
    let falling = false;
    let rose = false;
    let fastestFall = 0;
    for (let s = 0; s < 90; s++) {
      const b = w.bodies[0]!;
      if (falling && b.grounded) break;
      const press = s === 0 || (falling && s % 4 === 0);
      w.step([BIT_RIGHT | BIT_JUMP | (press ? BIT_JUMP_PRESS : 0)]);
      expect(b.wallSliding).toBe(false);
      if (b.vy > 0.5) falling = true;
      if (falling && b.vy < -1) rose = true;
      if (falling) fastestFall = Math.max(fastestFall, b.vy);
    }
    expect(rose).toBe(false);
    // No wall slide either: the fall is not slowed to the wall-slide speed.
    expect(fastestFall).toBeGreaterThan(5);
  });

  it("nobody can carry Ruben: he slides off and squashes the friend", () => {
    const w = makeWorld(ledgeRoom(1), 2, 1);
    stand(w, 0, 10, 20);
    w.placeBody(1, 10.05, 20 - 2 * H - 1);
    let squashed = false;
    run(w, 90, () => {
      if (w.events.some((e) => e.kind === "squash" && e.body === 0 && e.by === 1)) squashed = true;
      return [];
    });
    const friend = w.bodies[0]!;
    const ruben = w.bodies[1]!;
    expect(squashed).toBe(true);
    expect(ruben.grounded).toBe(true);
    expect(ruben.y + H).toBeCloseTo(20, 6);
    expect(Math.abs(ruben.cx - friend.cx)).toBeGreaterThanOrEqual(W - 1e-6);
  });

  it("Ruben can carry a friend", () => {
    const w = makeWorld(ledgeRoom(1), 2, 0);
    stand(w, 0, 10, 20);
    w.placeBody(1, 10, 20 - 2 * H - 0.5);
    run(w, 60, () => []);
    expect(w.bodies[1]!.support).toMatchObject({ kind: "collider", body: 0 });
  });
});

describe("co-op rope", () => {
  /** Flat room 80 wide. */
  function flat(): string[] {
    const rows: string[] = [];
    for (let y = 0; y < 24; y++) {
      let r = "";
      for (let x = 0; x < 80; x++) r += y === 0 || x === 0 || x === 79 || y >= 20 ? "#" : ".";
      rows.push(r);
    }
    rows[19] = rows[19]!.slice(0, 2) + "S" + rows[19]!.slice(3);
    return rows;
  }

  /** Average speed of body i over `steps` steps. */
  function speedOver(w: CoopWorld, i: number, steps: number, inputs: () => number[]): number {
    const x0 = w.bodies[i]!.x;
    run(w, steps, inputs);
    return (w.bodies[i]!.x - x0) / (steps * COOP_DT);
  }

  it("never stretches past its hard stop in open space", () => {
    const w = makeWorld(flat(), 3);
    stand(w, 0, 30, 20);
    stand(w, 1, 34, 20);
    stand(w, 2, 38, 20);
    let worst = 0;
    run(w, 240, (s) => {
      for (const l of w.rope) worst = Math.max(worst, l.length);
      return [BIT_LEFT, s < 120 ? 0 : BIT_RIGHT, BIT_RIGHT | (s % 40 === 0 ? BIT_JUMP | BIT_JUMP_PRESS : BIT_JUMP)];
    });
    // Elastic rope (20 % give): before, a rigid 4.5 (worst 4.5 + 0.01); now the stop, measured 5.400.
    expect(worst).toBeLessThanOrEqual(ROPE_MAX_LENGTH + 0.01);
  });

  it("a runner drags a passive friend at about half speed", () => {
    const w = makeWorld(flat(), 2);
    stand(w, 0, 40, 20);
    stand(w, 1, 40 - COOP.ropeLength, 20);
    run(w, 60, () => [BIT_RIGHT, 0]);
    const v = speedOver(w, 1, 120, () => [BIT_RIGHT, 0]);
    expect(v).toBeGreaterThan(3.2);
    expect(v).toBeLessThan(3.8);
  });

  it("a tug of war between two friends stays put, and Ruben wins it", () => {
    const even = makeWorld(flat(), 2);
    stand(even, 0, 40, 20);
    stand(even, 1, 40 - COOP.ropeLength, 20);
    run(even, 60, () => [BIT_RIGHT, BIT_LEFT]);
    expect(Math.abs(speedOver(even, 0, 120, () => [BIT_RIGHT, BIT_LEFT]))).toBeLessThan(0.2);

    const ruben = makeWorld(flat(), 2, 0);
    stand(ruben, 0, 40, 20);
    stand(ruben, 1, 40 - COOP.ropeLength, 20);
    run(ruben, 60, () => [BIT_RIGHT, BIT_LEFT]);
    const v = speedOver(ruben, 0, 120, () => [BIT_RIGHT, BIT_LEFT]);
    expect(v).toBeGreaterThan(2.0);
    expect(v).toBeLessThan(2.7);
  });

  /** Ledge of height 6 from x = 20; anchor on top, the other body hanging over the left edge. */
  function hanging(rubenHangs: boolean): CoopWorld {
    const w = makeWorld(ledgeRoom(6), 2, rubenHangs ? 1 : -1);
    stand(w, 0, 21.5, 14);
    // Hang body 1 below the edge, just left of the wall, about a rope length below the anchor.
    w.placeBody(1, 19.1, 14 + 3.4);
    run(w, 60, () => []);
    return w;
  }

  it("an idle anchor slowly slides towards the void, faster under Ruben; pushing away never loses ground", () => {
    const drift = (rubenHangs: boolean) => {
      const w = hanging(rubenHangs);
      const x0 = w.bodies[0]!.x;
      run(w, 240, () => []);
      expect(w.bodies[1]!.grounded, "still hanging").toBe(false);
      return (x0 - w.bodies[0]!.x) / (240 * COOP_DT);
    };
    const friend = drift(false);
    expect(friend).toBeGreaterThan(0.1);
    expect(friend).toBeLessThan(0.25);
    expect(drift(true)).toBeGreaterThan(friend * 1.6);

    const brace = hanging(false);
    const b0 = brace.bodies[0]!.x;
    run(brace, 60, () => [BIT_RIGHT, 0]);
    expect(brace.bodies[0]!.x).toBeGreaterThan(b0);
  });

  it("hauling: a friend rises at most 2.5 cells/s, Ruben at most 1.2", () => {
    for (const [ruben, cap] of [
      [false, COOP.riseCap.friend],
      [true, COOP.riseCap.ruben],
    ] as Array<[boolean, number]>) {
      const w = hanging(ruben);
      let fastest = 0;
      let lastY = w.bodies[1]!.y;
      let climbed = false;
      run(w, 600, () => {
        const y = w.bodies[1]!.y;
        fastest = Math.max(fastest, (lastY - y) / COOP_DT);
        lastY = y;
        if (w.bodies[1]!.grounded && w.bodies[1]!.y + H <= 14 + 1e-6) climbed = true;
        return [BIT_RIGHT, 0];
      });
      expect(climbed, `${ruben ? "Ruben" : "friend"} hauled onto the ledge`).toBe(true);
      expect(fastest).toBeLessThanOrEqual(cap + 0.05);
    }
  });

  it("a passive swing dies down", () => {
    const w = hanging(false);
    // Push the hanging body sideways, then let it swing alone.
    w.bodies[1]!.vx = -6;
    const amp = (from: number, to: number) => {
      let m = 0;
      run(w, to - from, () => {
        m = Math.max(m, Math.abs(w.bodies[1]!.cx - w.bodies[0]!.cx));
        return [];
      });
      return m;
    };
    const early = amp(0, 240);
    run(w, 480, () => []);
    const late = amp(0, 240);
    expect(late).toBeLessThan(early);
  });

  it("the sandbox level parses with five spawns", () => {
    const l = parseCoopLevel(sandboxLevel);
    expect(l.spawns).toHaveLength(5);
    const w = new CoopWorld(l, players(5, 4));
    run(w, 30, () => []);
    for (const b of w.bodies) expect(b.grounded).toBe(true);
  });
});
