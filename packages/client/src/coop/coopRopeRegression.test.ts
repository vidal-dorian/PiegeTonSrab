/**
 * Regression tests for the co-op rope solver (review of the co-op physics):
 * - a standing anchor that holds a friend hanging below it is not frozen for the rest of the step:
 *   a third player can still haul it, and a stretched link is taken up at most 0.3 cells per step;
 * - a chain of friends hanging below an idle anchor drags it at COOP.anchorSlide per unit of hanging
 *   mass (a friend 1, Ruben 2), nobody falls, and pushing away still holds;
 * - random play on the sandbox never puts a body inside the terrain, and never moves a body further in
 *   one step than the rope's per-step correction plus its own motion.
 */
import { describe, expect, it } from "vitest";
import { boxOverlapsSolid } from "@game/shared";
import {
  ALL_BITS,
  BIT_DOWN_PRESS,
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_LEFT,
  BIT_RESTART,
  BIT_RIGHT,
  COOP,
  COOP_DT,
  CoopWorld,
  parseCoopLevel,
  ROPE_MAX_LENGTH,
  sandboxLevel,
  type CoopPlayer,
} from "@game/shared/coop";

const H = 0.9; // body height

function players(n: number, rubens: readonly number[] = []): CoopPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isRuben: rubens.includes(i) }));
}

function makeWorld(rows: string[], n: number, rubens: readonly number[] = []): CoopWorld {
  return new CoopWorld(parseCoopLevel({ id: "test", name: "test", rows }), players(n, rubens));
}

/** Room 60 wide and `h` high, floor top at y = 20, spawn far left. `pit`: a bottomless pit at x = 30..31. */
function room(h: number, pit: boolean): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = "";
    for (let x = 0; x < 60; x++) {
      const hole = pit && x >= 30 && x <= 31;
      r += y === 0 || x === 0 || x === 59 || (y >= 20 && !hole) ? "#" : ".";
    }
    rows.push(r);
  }
  rows[19] = rows[19]!.slice(0, 2) + "S" + rows[19]!.slice(3);
  return rows;
}

/** Step `steps` times; `each` runs after every step. */
function run(w: CoopWorld, steps: number, inputs: (s: number) => number[], each?: (s: number) => void): void {
  for (let s = 0; s < steps; s++) {
    w.step(inputs(s));
    each?.(s);
  }
}

function longestLink(w: CoopWorld): number {
  return Math.max(0, ...w.rope.map((l) => l.length));
}

describe("rope: a standing anchor is not frozen by the friend hanging below it", () => {
  it("a third player walking away hauls an anchor that holds a hanging friend", () => {
    // Chain P0 - P1 - P2: P0 hangs in the pit almost straight below P1, who stands at the edge;
    // P2 stands behind P1 and walks away from the pit.
    const w = makeWorld(room(40, true), 3);
    w.placeBody(1, 29.1, 20 - H);
    w.placeBody(0, 30.05, 20 - H + 4.3);
    w.placeBody(2, 29.1 - 4.4, 20 - H);
    run(w, 120, () => [0, 0, 0]);
    expect(w.bodies[0]!.hanging).toBe(true);
    const x1 = w.bodies[1]!.x;
    const x2 = w.bodies[2]!.x;
    const y0 = w.bodies[0]!.y;
    let longest = 0;
    run(
      w,
      240,
      () => [0, 0, BIT_LEFT],
      () => (longest = Math.max(longest, longestLink(w))),
    );
    // Measured: P2 and P1 move 3.4 cells away from the pit and P0 rises 2.75 cells in 2 s. Before the
    // fix P1 was a fixed point for P2's link: both were dragged 0.31 towards the pit, and P0 sank.
    expect(x2 - w.bodies[2]!.x).toBeGreaterThan(2.5);
    expect(x1 - w.bodies[1]!.x).toBeGreaterThan(2.5);
    expect(y0 - w.bodies[0]!.y).toBeGreaterThan(2);
    // Was ropeLength + 0.1 with the rigid rope; the elastic one stretches to its stop (measured 5.400).
    expect(longest).toBeLessThan(ROPE_MAX_LENGTH + 0.1);
    expect(w.dying).toBe(0);
  });

  it("a stretched link is taken up at most 0.3 cells per body and step", () => {
    for (const n of [2, 3]) {
      // Idle bodies on a flat floor, 9 cells apart: every link is stretched by a full rope length.
      const w = makeWorld(room(30, false), n);
      for (let i = 0; i < n; i++) w.placeBody(i, 10 + 9 * i, 20 - H);
      let fastest = 0;
      let underStop = -1;
      let takenUp = -1;
      for (let s = 0; s < 120; s++) {
        const before = w.bodies.map((b) => ({ x: b.x, y: b.y }));
        w.step(new Array<number>(n).fill(0));
        w.bodies.forEach((b, i) => {
          fastest = Math.max(fastest, Math.hypot(b.x - before[i]!.x, b.y - before[i]!.y));
        });
        if (underStop < 0 && longestLink(w) <= ROPE_MAX_LENGTH + 0.01) underStop = s + 1;
        if (takenUp < 0 && longestLink(w) <= COOP.ropeLength + 0.05) takenUp = s + 1;
      }
      // Measured: 0.3 per step; back to the hard stop in 6 steps (2 bodies) and 14 (3 bodies), then
      // the elastic part comes back to its rest length (+0.05) in 28 and 58 steps. With the rigid
      // rope: back to 4.5 in 8 and 15 steps. Before the M1 fix a body was yanked 0.6 cells in one
      // step (72 cells/s).
      expect(fastest, `${n} bodies`).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(underStop, `${n} bodies`).toBeGreaterThan(0);
      expect(underStop, `${n} bodies`).toBeLessThanOrEqual(20);
      expect(takenUp, `${n} bodies`).toBeGreaterThan(0);
      expect(takenUp, `${n} bodies`).toBeLessThanOrEqual(70);
    }
  });
});

describe("rope: a chain hanging below an idle anchor", () => {
  /**
   * An anchor standing 1.2 cells from the pit edge (left at x = 28) and a chain hanging at rest below
   * the edge, each link just under its length. `order` lists body indices from the anchor down.
   */
  function hangingChain(order: readonly number[], rubens: readonly number[]): CoopWorld {
    const w = makeWorld(room(60, true), order.length, rubens);
    w.placeBody(order[0]!, 28, 20 - H);
    let px = 28.4;
    let py = 20 - H / 2;
    for (let j = 1; j < order.length; j++) {
      const cx = j === 1 ? 30.45 : px;
      const cy = py + (j === 1 ? Math.sqrt(4.49 ** 2 - (cx - px) ** 2) : 4.49);
      w.placeBody(order[j]!, cx - 0.4, cy - H / 2);
      px = cx;
      py = cy;
    }
    return w;
  }

  /** Settle 1 s, then measure 2 s, the anchor holding `bits` all along. */
  function measure(order: readonly number[], rubens: readonly number[] = [], bits = 0) {
    const n = order.length;
    const w = hangingChain(order, rubens);
    const anchor = w.bodies[order[0]!]!;
    const start = anchor.x;
    const inputs = () => Array.from({ length: n }, (_, i) => (i === order[0] ? bits : 0));
    let died = false;
    let towardsPit = 0;
    let longest = 0;
    const watch = () => {
      if (w.dying > 0) died = true;
      towardsPit = Math.max(towardsPit, anchor.x - start);
      longest = Math.max(longest, longestLink(w));
    };
    run(w, 120, inputs, watch);
    const x0 = anchor.x;
    run(w, 240, inputs, watch);
    return {
      /** Anchor speed towards the pit over the last 2 s, cells/s. */
      speed: (anchor.x - x0) / (240 * COOP_DT),
      /** Furthest the anchor ever got towards the pit from where it was placed, cells. */
      towardsPit,
      longest,
      died,
      anchorStands: anchor.grounded,
      allHang: order.slice(1).every((i) => !w.bodies[i]!.grounded),
    };
  }

  for (const k of [2, 3, 4]) {
    it(`${k} friends hanging in a chain drag an idle anchor at ${k} x anchorSlide, and nobody falls`, () => {
      for (const anchorFirst of [true, false]) {
        const n = k + 1;
        const order = Array.from({ length: n }, (_, j) => (anchorFirst ? j : n - 1 - j));
        const r = measure(order);
        const label = `${k} hanging, anchor ${anchorFirst ? "first" : "last"} in the rope`;
        // Measured: 0.310, 0.461 and 0.611 cells/s. Before the fix: 0.201 with 2 hanging, 0.37-0.57
        // with 3, and with 4 the anchor went over the edge in 0.83 s.
        expect(r.speed, label).toBeGreaterThan(COOP.anchorSlide * k - 0.04);
        expect(r.speed, label).toBeLessThan(COOP.anchorSlide * k + 0.04);
        expect(r.died, label).toBe(false);
        expect(r.anchorStands, label).toBe(true);
        expect(r.allHang, label).toBe(true);
        // Was ropeLength + 0.05 with the rigid rope; elastic, the drop stretches it (measured 5.235).
        expect(r.longest, label).toBeLessThan(ROPE_MAX_LENGTH + 0.05);
      }
    });
  }

  it("Ruben hanging weighs two friends on the anchor", () => {
    // Anchor P0, then a friend and Ruben hanging below it, in both orders: 3 units of hanging mass.
    for (const rubenAt of [1, 2]) {
      const r = measure([0, 1, 2], [rubenAt]);
      const label = `Ruben ${rubenAt === 1 ? "on top" : "at the bottom"}`;
      // Measured: 0.452 and 0.459 cells/s.
      expect(r.speed, label).toBeGreaterThan(COOP.anchorSlide * 3 - 0.04);
      expect(r.speed, label).toBeLessThan(COOP.anchorSlide * 3 + 0.04);
      expect(r.died, label).toBe(false);
      expect(r.allHang, label).toBe(true);
    }
  });

  it("an anchor pushing away from the pit never loses ground, with 2 to 4 friends hanging", () => {
    for (const k of [2, 3, 4]) {
      const r = measure(
        Array.from({ length: k + 1 }, (_, j) => j),
        [],
        BIT_LEFT,
      );
      expect(r.towardsPit, `${k} hanging`).toBeLessThanOrEqual(0.01);
      expect(r.died, `${k} hanging`).toBe(false);
      expect(r.anchorStands, `${k} hanging`).toBe(true);
    }
  });
});

describe("rope: random play on the sandbox", () => {
  /** Small deterministic generator (mulberry32). */
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

  /** Each player holds random keys (left, right, jump, down) for 5 to 64 steps, leaning right. */
  function randomInputs(seed: number, n: number): () => number[] {
    const r = rng(seed);
    const held = new Array<number>(n).fill(0);
    const left = new Array<number>(n).fill(0);
    const allowed = ALL_BITS & ~BIT_JUMP_PRESS & ~BIT_DOWN_PRESS & ~BIT_RESTART;
    return () =>
      held.map((h, i) => {
        if (left[i]! > 0) {
          left[i] = left[i]! - 1;
          return h;
        }
        left[i] = 5 + Math.floor(r() * 60);
        let bits = Math.floor(r() * 32) & allowed;
        if (r() < 0.5) bits = (bits & ~BIT_LEFT) | BIT_RIGHT;
        held[i] = bits;
        return bits | (bits & BIT_JUMP ? BIT_JUMP_PRESS : 0);
      });
  }

  it("never puts a body inside the terrain, nor moves one more than 0.5 cell in a step", () => {
    const level = parseCoopLevel(sandboxLevel);
    const inside: string[] = [];
    let fastest = 0;
    let fastestAt = "";
    for (let seed = 1; seed <= 6; seed++) {
      for (const n of [3, 4, 5]) {
        const rubenAt = seed % 2 === 1 ? -1 : n - 1;
        const w = new CoopWorld(level, players(n, [rubenAt]));
        const next = randomInputs(seed, n);
        let attempt = w.attempt;
        for (let s = 0; s < 3000; s++) {
          const before = w.bodies.map((b) => ({ x: b.x, y: b.y }));
          w.step(next());
          w.bodies.forEach((b, i) => {
            if (boxOverlapsSolid(w.level.collision, b.x, b.y, b.width, b.height)) inside.push(`seed ${seed}, ${n} players, step ${s}: body ${i} at (${b.x}, ${b.y})`);
          });
          // A restart puts everyone back at the spawn, and the death freeze is not play.
          if (w.attempt !== attempt) {
            attempt = w.attempt;
            continue;
          }
          if (w.dying > 0) continue;
          w.bodies.forEach((b, i) => {
            const d = Math.hypot(b.x - before[i]!.x, b.y - before[i]!.y);
            if (d > fastest) {
              fastest = d;
              fastestAt = `seed ${seed}, ${n} players, step ${s}, body ${i}`;
            }
          });
        }
      }
    }
    expect(inside.slice(0, 5)).toEqual([]);
    // At most 0.3 from the rope plus the body's own run, jump or fall (measured worst: 0.43).
    expect(fastest, fastestAt).toBeLessThanOrEqual(0.5);
  }, 60_000);
});
