/**
 * The rope in chains of three or more: what the M1 review still found broken after the first fixes.
 * - A hauler pulls the whole chain up a wall through a friend standing still in the middle.
 * - A walker cannot outrun the rope, even with a friend standing right behind it.
 * - A link never stretches far past its length (4.5): not when both ends are stuck, not in a fuzz.
 * - A pile lifted under a ceiling never moves its base into its rider.
 */
import { describe, expect, it } from "vitest";
import { BIT_JUMP, BIT_JUMP_PRESS, BIT_LEFT, BIT_RIGHT, CoopWorld, parseCoopLevel, sandboxLevel, type CoopPlayer } from "@game/shared/coop";

const H = 0.9;
const W = 0.8;
/** Longest a link may get in these scenarios (4.5 plus what one step of a fall can add before the solve). */
const MAX_LINK = 4.85;

function team(n: number, rubenAt = -1): CoopPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isRuben: i === rubenAt }));
}

function sandbox(n: number, rubenAt = -1): CoopWorld {
  return new CoopWorld(parseCoopLevel(sandboxLevel, n), team(n, rubenAt));
}

/** A room w x h with walls, a ceiling, floor rows from floorY, S at (2, floorY - 1); `solid` adds cells. */
function room(w: number, h: number, floorY: number, solid: (x: number, y: number) => boolean = () => false): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = "";
    for (let x = 0; x < w; x++) r += y === 0 || x === 0 || x === w - 1 || y >= floorY || solid(x, y) ? "#" : ".";
    rows.push(r);
  }
  rows[floorY - 1] = rows[floorY - 1]!.slice(0, 2) + "S" + rows[floorY - 1]!.slice(3);
  return rows;
}

function world(rows: string[], n: number, rubenAt = -1): CoopWorld {
  return new CoopWorld(parseCoopLevel({ id: "t", name: "t", rows }, n), team(n, rubenAt));
}

function longestLink(w: CoopWorld): number {
  return w.rope.reduce((m, l) => Math.max(m, l.length), 0);
}

/** Steps until body i stands with its feet at or above `top` (or -1 within `max` steps). */
function stepsUntilUp(w: CoopWorld, i: number, top: number, max: number, inputs: (s: number) => number[], track?: { worst: number }): number {
  for (let s = 0; s < max; s++) {
    w.step(inputs(s));
    if (track) track.worst = Math.max(track.worst, longestLink(w));
    const b = w.bodies[i]!;
    if (b.grounded && b.y + H <= top + 1e-6) return s;
  }
  return -1;
}

describe("co-op rope: hauling a chain", () => {
  // The sandbox's 3-cell wall: top y = 15 from x 15, foot on the 2-step (top y = 18).
  for (const p2x of [11.0, 12.5]) {
    it(`on the sandbox 3-wall, the hauler on top brings P1 then the idle P2 up (P2 at x=${p2x})`, () => {
      const w = sandbox(3);
      w.placeBody(0, 17.0, 15 - H);
      w.placeBody(1, 14.2, 18 - H);
      w.placeBody(2, p2x, 18 - H);
      const track = { worst: 0 };
      const p1 = stepsUntilUp(w, 1, 15, 360, () => [BIT_RIGHT, 0, 0], track);
      expect(p1, "P1 on top within 3 s").toBeGreaterThanOrEqual(0);
      const p2 = stepsUntilUp(w, 2, 15, 960, () => [BIT_RIGHT, 0, 0], track);
      expect(p2, "then P2 on top within 8 s").toBeGreaterThanOrEqual(0);
      expect(track.worst).toBeLessThanOrEqual(MAX_LINK);
    });
  }

  // A 6-high ledge: floor y = 20, ledge from x = 20 with its top at y = 14.
  const ledge = room(60, 27, 20, (x, y) => x >= 20 && y >= 14);

  it("on a 6-high ledge, two players: the control haul takes under 3 s", () => {
    const w = world(ledge, 2);
    w.placeBody(0, 21.5, 14 - H);
    w.placeBody(1, 19.1, 14 + 3.4);
    for (let s = 0; s < 60; s++) w.step([0, 0]);
    expect(stepsUntilUp(w, 1, 14, 360, () => [BIT_RIGHT, 0])).toBeGreaterThanOrEqual(0);
  });

  for (const p2x of [14, 15, 16, 17]) {
    it(`on a 6-high ledge, the hauler brings P1 up although P2 stands idle behind at x=${p2x}`, () => {
      const w = world(ledge, 3);
      w.placeBody(0, 21.5, 14 - H);
      w.placeBody(1, 19.1, 14 + 3.4);
      w.placeBody(2, p2x, 20 - H);
      for (let s = 0; s < 60; s++) w.step([0, 0, 0]);
      const track = { worst: 0 };
      expect(stepsUntilUp(w, 1, 14, 480, () => [BIT_RIGHT, 0, 0], track), "P1 up within 4 s").toBeGreaterThanOrEqual(0);
      expect(track.worst).toBeLessThanOrEqual(MAX_LINK);
    });
  }

  it("on a 6-high ledge, P1 comes up while P2 walks to the wall below it", () => {
    const w = world(ledge, 3);
    w.placeBody(0, 21.5, 14 - H);
    w.placeBody(1, 19.1, 14 + 3.4);
    w.placeBody(2, 16, 20 - H);
    for (let s = 0; s < 60; s++) w.step([0, 0, 0]);
    expect(stepsUntilUp(w, 1, 14, 480, () => [BIT_RIGHT, 0, BIT_RIGHT]), "P1 up within 4 s").toBeGreaterThanOrEqual(0);
  });
});

describe("co-op rope: links never stretch", () => {
  it("a walker held by a friend hanging below cannot stretch the link to a friend stuck against a wall", () => {
    // P0 hangs in a pit at x 30-31 below P1; P2 presses into a 5-high wall at x 24; P1 walks right.
    const rows = room(60, 40, 20, (x, y) => (y >= 20 && x >= 30 && x <= 31 ? false : x === 24 && y >= 15));
    const fixed = rows.map((r, y) => (y >= 20 ? r.slice(0, 30) + ".." + r.slice(32) : r));
    const w = world(fixed, 3);
    w.placeBody(2, 24 - W, 20 - H);
    w.placeBody(1, 27.0, 20 - H);
    w.placeBody(0, 30.05, 20 - H + 4.0);
    for (let s = 0; s < 30; s++) w.step([0, 0, BIT_RIGHT]);
    const y0 = w.bodies[0]!.y;
    let worst = 0;
    for (let s = 0; s < 240; s++) {
      w.step([0, BIT_RIGHT, BIT_RIGHT]);
      worst = Math.max(worst, longestLink(w));
    }
    expect(worst).toBeLessThanOrEqual(MAX_LINK);
    expect(w.bodies[0]!.y - y0, "the hanging friend does not sink away").toBeLessThan(1);
  });

  it("a walker with a friend standing right behind it cannot outrun the friend it hauls", () => {
    // P0 at the foot of the sandbox 3-wall, P1 on top, P2 touching P1 from behind; P1 and P2 walk away.
    const w = sandbox(3);
    w.placeBody(0, 14.2, 18 - H);
    w.placeBody(1, 17.8, 15 - H);
    w.placeBody(2, 17.0, 15 - H);
    const track = { worst: 0 };
    const up = stepsUntilUp(w, 0, 15, 360, () => [0, BIT_RIGHT, BIT_RIGHT], track);
    expect(track.worst).toBeLessThanOrEqual(MAX_LINK);
    expect(up, "P0 hauled up within 3 s").toBeGreaterThanOrEqual(0);
  });

  function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("random play on the sandbox (3 to 5 players, 20 seeds): no link ever passes 4.85", () => {
    let worst = 0;
    let where = "";
    for (let seed = 1; seed <= 20; seed++) {
      for (const n of [3, 4, 5]) {
        const w = sandbox(n, seed % 2 === 0 ? n - 1 : -1);
        const r = rng(seed * 7 + n);
        let bits = new Array<number>(n).fill(0);
        for (let s = 0; s < 3000; s++) {
          if (s % 30 === 0) {
            bits = bits.map(() => {
              const v = r();
              let b = v < 0.4 ? BIT_RIGHT : v < 0.75 ? BIT_LEFT : 0;
              if (r() < 0.35) b |= BIT_JUMP | BIT_JUMP_PRESS;
              return b;
            });
          } else bits = bits.map((b) => b & ~BIT_JUMP_PRESS);
          w.step(bits);
          if (w.dying > 0 || w.events.some((e) => e.kind === "restart")) continue;
          const l = longestLink(w);
          if (l > worst) {
            worst = l;
            where = `seed ${seed}, ${n} players, step ${s}`;
          }
        }
      }
    }
    expect(worst, where).toBeLessThanOrEqual(MAX_LINK);
  }, 60_000);
});

describe("co-op rope: lifting a pile", () => {
  it("a base hauled up under an overhang never moves into its rider", () => {
    // Ledge from x 20 (top 14); an overhang at x 17-19 on row 12. A 2-tower hangs below the overhang.
    const rows = room(60, 27, 20, (x, y) => (x >= 20 && y >= 14) || (x >= 17 && x <= 19 && y === 12));
    const w = world(rows, 3);
    w.placeBody(0, 21.0, 14 - H);
    w.placeBody(1, 19.2, 13 + H + 1.0);
    w.placeBody(2, 19.2, 13 + 1.0);
    for (const b of w.bodies) b.refreshContacts();
    let overlapRun = 0;
    let worstRun = 0;
    for (let s = 0; s < 240; s++) {
      w.step([BIT_RIGHT, 0, 0]);
      const a = w.bodies[1]!;
      const b = w.bodies[2]!;
      const ox = Math.min(a.x + W, b.x + W) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + H, b.y + H) - Math.max(a.y, b.y);
      overlapRun = ox > 1e-4 && oy > 1e-4 ? overlapRun + 1 : 0;
      worstRun = Math.max(worstRun, overlapRun);
    }
    expect(worstRun, "steps in a row with the rider inside its base").toBeLessThanOrEqual(1);
    expect(w.bodies[2]!.y, "the rider never ends below its base").toBeLessThan(w.bodies[1]!.y);
  });
});
