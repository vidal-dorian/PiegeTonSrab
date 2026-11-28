/**
 * The rope after the owner's playtest (rope v2): an elastic link (20 % of give past its rest
 * length, then a hard stop) that wraps around the corners of the fixed terrain.
 * - The pulley: two friends on either side of a block, the rope over its two top corners, hold
 *   each other; one standing on one side holds the other hanging below the far lip, and hauls him over.
 * - Wraps and unwraps around one and two corners, in order; never through a thin wall, however fast.
 * - The spring: gives, comes back, settles, stops dead at the hard stop.
 * - The wraps are state: saved, hashed, sent in snapshots, deterministic; the budgets hold.
 * - All the fixed scenery stops it: a placed block "=" is wrapped like terrain, and no level has a
 *   static cell that stops bodies but lets the rope through.
 */
import { describe, expect, it } from "vitest";
import { isSolidCell } from "@game/shared";
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
  COOP_LEVELS,
  CoopWorld,
  decodeWorld,
  encodeWorld,
  isCoopSolidObject,
  parseCoopLevel,
  ROPE_MAX_LENGTH,
  sandboxLevel,
  sweepRope,
  type CoopController,
  type CoopPlayer,
  type RopeHost,
} from "@game/shared/coop";

const H = 0.9;
const REST = COOP.ropeLength;
const MAX = ROPE_MAX_LENGTH;

function team(n: number, rubenAt = -1): CoopPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isRuben: i === rubenAt }));
}

/** A room w x h with walls and a ceiling, `solid` cells, the spawn S at (sx, sy). */
function room(w: number, h: number, solid: (x: number, y: number) => boolean, sx: number, sy: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = "";
    for (let x = 0; x < w; x++) r += y === 0 || x === 0 || x === w - 1 || solid(x, y) ? "#" : ".";
    rows.push(r);
  }
  rows[sy] = rows[sy]!.slice(0, sx) + "S" + rows[sy]!.slice(sx + 1);
  return rows;
}

function world(rows: string[], n: number, rubenAt = -1): CoopWorld {
  return new CoopWorld(parseCoopLevel({ id: "t", name: "t", rows }, n), team(n, rubenAt));
}

/** The sandbox as two players see it: its pulley is the 2-wide pillar x 69-70 (top y = 10) between pits x 66-68 and 71-73 (bottom y = 13). */
function pulley(rubenAt = -1): CoopWorld {
  return new CoopWorld(parseCoopLevel(sandboxLevel, 2), team(2, rubenAt));
}

function run(w: CoopWorld, steps: number, inputs: (s: number) => number[], each?: (s: number) => void): void {
  for (let s = 0; s < steps; s++) {
    w.step(inputs(s));
    each?.(s);
  }
}

function wrapsOf(w: CoopWorld, k = 0): number[] {
  return w.rope[k]!.points.slice();
}

/** Whether a point is strictly inside a solid terrain cell (off its edges by more than 1e-6). */
function inTerrain(w: CoopWorld, x: number, y: number): boolean {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (x - cx < 1e-6 || cx + 1 - x < 1e-6 || y - cy < 1e-6 || cy + 1 - y < 1e-6) return false;
  return cy >= 0 && cy < w.level.terrain.height && (cx < 0 || cx >= w.level.terrain.width || w.level.terrain.solid[cy * w.level.terrain.width + cx] === true);
}

/** The first place where link k's path goes through the terrain (sampled every 0.02 cell), or null. */
function throughTerrain(w: CoopWorld, k: number): string | null {
  const l = w.rope[k]!;
  const a = w.bodies[l.a]!;
  const b = w.bodies[l.b]!;
  const xs = [a.cx, ...l.points.filter((_, i) => i % 2 === 0), b.cx];
  const ys = [a.cy, ...l.points.filter((_, i) => i % 2 === 1), b.cy];
  for (let i = 0; i + 1 < xs.length; i++) {
    const d = Math.hypot(xs[i + 1]! - xs[i]!, ys[i + 1]! - ys[i]!);
    const steps = Math.max(1, Math.ceil(d / 0.02));
    for (let s = 1; s < steps; s++) {
      const x = xs[i]! + ((xs[i + 1]! - xs[i]!) * s) / steps;
      const y = ys[i]! + ((ys[i + 1]! - ys[i]!) * s) / steps;
      if (inTerrain(w, x, y)) return `link ${k} part ${i} at (${x.toFixed(3)}, ${y.toFixed(3)}), path [${l.points.join(",")}]`;
    }
  }
  return null;
}

describe("rope v2: the pulley over a block", () => {
  for (const leftSeat of [0, 1]) {
    it(`two friends walk off the pillar on either side and hold each other (seat ${leftSeat} on the left)`, () => {
      const right = 1 - leftSeat;
      const press = (s: number, keep: boolean) => {
        const bits = [0, 0];
        if (s < 30 || keep) {
          bits[leftSeat] = BIT_LEFT;
          bits[right] = BIT_RIGHT;
        }
        return bits;
      };
      for (const keep of [false, true]) {
        const v = pulley();
        v.placeBody(leftSeat, 69.05, 10 - H);
        v.placeBody(right, 70.15, 10 - H);
        let longest = 0;
        const lengths: number[] = [];
        run(
          v,
          360,
          (s) => press(s, keep),
          () => {
            longest = Math.max(longest, v.rope[0]!.length);
            lengths.push(v.rope[0]!.length);
          },
        );
        const label = keep ? "walking away all along" : "walked off, then idle";
        // Both hang over the pits, the rope over the pillar's two top corners, nobody falls.
        expect(v.dying, label).toBe(0);
        for (const i of [0, 1]) {
          expect(v.bodies[i]!.grounded, `${label}: body ${i} hangs`).toBe(false);
          expect(v.bodies[i]!.hanging, `${label}: body ${i} hangs`).toBe(true);
          // Hanging in the pit, below the floors (top y = 11), above its bottom (y = 13).
          expect(v.bodies[i]!.y + H, label).toBeGreaterThan(11);
          expect(v.bodies[i]!.y + H, label).toBeLessThan(13 - 0.5);
        }
        const points = wrapsOf(v);
        expect(points, label).toEqual(leftSeat === 0 ? [69, 10, 71, 10] : [71, 10, 69, 10]);
        // Measured: at most 4.97 (the catch), settled at 4.64-4.66; level with each other.
        expect(longest, label).toBeLessThanOrEqual(MAX + 0.01);
        expect(Math.abs(v.bodies[0]!.cy - v.bodies[1]!.cy), label).toBeLessThan(0.05);
        // Settled within 1 s of the catch: the length moves by under 0.02 over the last 1.5 s.
        const late = lengths.slice(180);
        expect(Math.max(...late) - Math.min(...late), label).toBeLessThan(0.02);
      }
    });
  }

  it("Ruben against a friend: Ruben sinks, the friend rises to the corner, no faster than it lifts Ruben", () => {
    const w = pulley(1);
    w.placeBody(0, 69.05, 10 - H);
    w.placeBody(1, 70.15, 10 - H);
    let fastest = 0;
    let lastY = w.bodies[0]!.y;
    let longest = 0;
    run(
      w,
      480,
      (s) => (s < 30 ? [BIT_LEFT, BIT_RIGHT] : [0, 0]),
      (s) => {
        const y = w.bodies[0]!.y;
        if (s > 60) fastest = Math.max(fastest, (lastY - y) / COOP_DT);
        lastY = y;
        longest = Math.max(longest, w.rope[0]!.length);
      },
    );
    const friend = w.bodies[0]!;
    const ruben = w.bodies[1]!;
    expect(w.dying).toBe(0);
    // Measured: the friend just under the left corner (centre 10.2), Ruben at the end of the rope
    // near the pit's bottom (centre 12.33); rising at most 1.2 cells/s (Ruben's haul speed).
    expect(friend.cy).toBeLessThan(10.6);
    expect(ruben.cy).toBeGreaterThan(12);
    expect(fastest).toBeLessThanOrEqual(COOP.riseCap.ruben + 0.05);
    expect(longest).toBeLessThanOrEqual(MAX + 0.01);
  });

  // A floor (top y = 13) up to x 19, a 1-wide block at x 20 (top y = 12), a bottomless pit from x 21 to 30.
  const ledge = room(36, 40, (x, y) => (x <= 19 && y >= 13) || (x === 20 && y >= 12) || (x >= 31 && y >= 13), 2, 12);

  /** The anchor stands 2 cells back from the block, the friend hangs below its far lip, settled 1 s. */
  function heldOverBlock(rubenHangs = false): CoopWorld {
    const w = world(ledge, 2, rubenHangs ? 1 : -1);
    w.placeBody(0, 17.2, 13 - H);
    w.placeBody(1, 21.0, 12.6);
    run(w, 120, () => [0, 0]);
    return w;
  }

  it("one standing on one side of a block holds the other hanging below the far lip", () => {
    for (const rubenHangs of [false, true]) {
      const label = rubenHangs ? "Ruben hangs" : "a friend hangs";
      const w = heldOverBlock(rubenHangs);
      expect(wrapsOf(w), label).toEqual([20, 12, 21, 12]);
      const x0 = w.bodies[0]!.x;
      let longest = 0;
      run(
        w,
        240,
        () => [0, 0],
        () => (longest = Math.max(longest, w.rope[0]!.length)),
      );
      const drift = (w.bodies[0]!.x - x0) / (240 * COOP_DT);
      expect(w.dying, label).toBe(0);
      expect(w.bodies[1]!.hanging, label).toBe(true);
      expect(w.bodies[0]!.grounded, label).toBe(true);
      // The anchor slides towards the block at anchorSlide per unit of hanging mass (measured 0.150 / 0.300).
      const mass = rubenHangs ? COOP.rubenMass : 1;
      expect(drift, label).toBeGreaterThan(COOP.anchorSlide * mass - 0.03);
      expect(drift, label).toBeLessThan(COOP.anchorSlide * mass + 0.03);
      expect(longest, label).toBeLessThanOrEqual(MAX + 0.01);
    }
  });

  it("pushing away holds the friend below the far lip, and keeps walking hauls him over the block", () => {
    const w = heldOverBlock();
    const x0 = w.bodies[0]!.x;
    let towardsBlock = 0;
    let over = -1;
    let fastest = 0;
    let lastY = w.bodies[1]!.y;
    run(
      w,
      600,
      () => [BIT_LEFT, 0],
      (s) => {
        towardsBlock = Math.max(towardsBlock, w.bodies[0]!.x - x0);
        const b = w.bodies[1]!;
        fastest = Math.max(fastest, (lastY - b.y) / COOP_DT);
        lastY = b.y;
        if (over < 0 && b.grounded && b.x + b.width <= 21 + 1e-6) over = s;
      },
    );
    expect(towardsBlock).toBeLessThanOrEqual(0.01);
    expect(over, "hauled over the block within 5 s").toBeGreaterThanOrEqual(0);
    expect(fastest).toBeLessThanOrEqual(COOP.riseCap.friend + 0.05);
    expect(w.dying).toBe(0);
    // Back on the anchor's side: the rope comes off the block.
    run(w, 240, () => [BIT_LEFT, 0]);
    expect(wrapsOf(w)).toEqual([]);
  });
});

describe("rope v2: wrapping and unwrapping", () => {
  it("wraps the edge a friend walks off, and unwraps when he is hauled back up", () => {
    // A ledge (top y = 14) up to x 19; below it a floor at y = 30.
    const w = world(
      room(40, 34, (x, y) => (x <= 19 && y >= 14) || y >= 30, 2, 13),
      2,
    );
    w.placeBody(0, 16.5, 14 - H);
    w.placeBody(1, 18, 14 - H);
    const seen: string[] = [];
    const note = () => {
      const p = wrapsOf(w).join(",");
      if (seen[seen.length - 1] !== p) seen.push(p);
    };
    run(w, 90, (s) => (s < 40 ? [0, BIT_RIGHT] : [0, 0]), note);
    expect(w.bodies[1]!.hanging).toBe(true);
    expect(wrapsOf(w)).toEqual([20, 14]);
    run(w, 480, () => [BIT_LEFT, 0], note);
    expect(w.bodies[1]!.grounded).toBe(true);
    expect(w.bodies[1]!.y + H).toBeCloseTo(14, 6);
    expect(seen).toEqual(["", "20,14", ""]);
    expect(w.dying).toBe(0);
  });

  it("wraps a block's two corners one after the other, and unwraps them in reverse order", () => {
    // A floor (top y = 20) with a 2-wide, 1-high block at x 20-21 (top y = 19).
    const w = world(
      room(40, 24, (x, y) => y >= 20 || (y === 19 && x >= 20 && x <= 21), 2, 19),
      2,
    );
    w.placeBody(0, 18, 20 - H);
    w.placeBody(1, 20.6, 19 - H);
    expect(wrapsOf(w)).toEqual([]);
    const seen: string[] = [];
    const note = () => {
      const p = wrapsOf(w).join(",");
      if (seen[seen.length - 1] !== p) seen.push(p);
    };
    // Off the block to the right, then back onto it with a jump.
    run(w, 60, (s) => [0, s < 25 ? BIT_RIGHT : 0], note);
    expect(w.bodies[1]!.grounded).toBe(true);
    expect(w.bodies[1]!.x).toBeGreaterThan(22);
    expect(wrapsOf(w)).toEqual([20, 19, 22, 19]);
    run(w, 90, (s) => [0, BIT_LEFT | BIT_JUMP | (s === 0 ? BIT_JUMP_PRESS : 0)], note);
    expect(seen).toEqual(["", "20,19", "20,19,22,19", "20,19", ""]);
  });

  it("a fast body takes the rope over a 1-cell wall, never through it", () => {
    // A floor (top y = 20) with a 1-wide wall at x 20, 2 high (top y = 18); the anchor stands 2 cells before it.
    const rows = room(40, 24, (x, y) => y >= 20 || (x === 20 && y >= 18), 2, 19);
    for (const [x, y, vx, vy] of [
      [18.6, 15, 9, -4],
      [18.6, 15, 12, 0],
      [18.6, 15, 7, -8],
      [18.6, 15, 14, -2],
      [18.8, 15.5, 20, -3],
    ] as const) {
      const w = world(rows, 2);
      w.placeBody(0, 17.5, 20 - H);
      w.placeBody(1, x, y);
      w.bodies[1]!.vx = vx;
      w.bodies[1]!.vy = vy;
      const label = `launched at (${vx}, ${vy})`;
      let through: string | null = null;
      run(
        w,
        120,
        () => [0, BIT_RIGHT],
        () => (through ??= throughTerrain(w, 0)),
      );
      expect(through, label).toBeNull();
      // Past the wall (its left side against the wall's face at most), below its top.
      expect(w.bodies[1]!.x, label).toBeGreaterThanOrEqual(21 - 1e-9);
      expect(w.bodies[1]!.cy, label).toBeGreaterThan(18);
      expect(wrapsOf(w), label).toEqual([20, 18, 21, 18]);
    }
  });

  it("one sweep wraps both corners of a 1-wide wall an end jumped past in a single move", () => {
    // Unit test of sweepRope: a fixed end a at (10, 11), a 1-wide wall at x = 12 from y = 10 down.
    const ends = [
      { cx: 10, cy: 11 },
      { cx: 11.5, cy: 9 },
    ];
    const host = { bodies: ends as unknown as CoopController[], ropeSolid: (x: number, y: number) => x === 12 && y >= 10 } as unknown as RopeHost;
    const wraps = [[] as number[]];
    const x0 = ends.map((e) => e.cx);
    const y0 = ends.map((e) => e.cy);
    // Over the wall's top (its own path clears it) to below the top on the far side, 3 cells in one move.
    ends[1]!.cx = 14.5;
    ends[1]!.cy = 10.5;
    sweepRope(host, [0, 1], wraps, x0, y0);
    expect(wraps[0]!.filter((_, i) => i % 3 !== 2)).toEqual([12, 10, 13, 10]);
    // And back the same way in one move: both let go.
    const x1 = ends.map((e) => e.cx);
    const y1 = ends.map((e) => e.cy);
    ends[1]!.cx = 11.5;
    ends[1]!.cy = 9;
    sweepRope(host, [0, 1], wraps, x1, y1);
    expect(wraps[0]).toEqual([]);
  });
});

describe("rope v2: placed blocks are scenery", () => {
  /** `rows` with the cells where `at` holds turned into placed blocks "=". */
  function placed(rows: string[], at: (x: number, y: number) => boolean): string[] {
    return rows.map((r, y) => [...r].map((c, x) => (at(x, y) ? "=" : c)).join(""));
  }

  it("wraps a block of \"=\" corner by corner, as it wraps the same block of terrain", () => {
    // A floor (top y = 20) with a 2-wide, 1-high block at x 20-21 (top y = 19), in terrain or in "=".
    const isBlock = (x: number, y: number) => y === 19 && x >= 20 && x <= 21;
    const terrain = room(40, 24, (x, y) => y >= 20 || isBlock(x, y), 2, 19);
    const seen: string[][] = [];
    for (const rows of [terrain, placed(terrain, isBlock)]) {
      const w = world(rows, 2);
      expect(w.ropeSolid(20, 19)).toBe(true);
      w.placeBody(0, 18, 20 - H);
      w.placeBody(1, 20.6, 19 - H);
      const trace: string[] = [];
      const note = () => {
        const p = wrapsOf(w).join(",");
        if (trace[trace.length - 1] !== p) trace.push(p);
      };
      run(w, 60, (s) => [0, s < 25 ? BIT_RIGHT : 0], note);
      expect(wrapsOf(w)).toEqual([20, 19, 22, 19]);
      run(w, 90, (s) => [0, BIT_LEFT | BIT_JUMP | (s === 0 ? BIT_JUMP_PRESS : 0)], note);
      seen.push(trace);
    }
    expect(seen[1]).toEqual(["", "20,19", "20,19,22,19", "20,19", ""]);
    expect(seen[1]).toEqual(seen[0]);
  });

  it("a body placed beyond a wall of \"=\" gets the rope over it, not through it", () => {
    // A floor (top y = 20) with a 1-wide, 2-high wall at x 20 (top y = 18).
    const isWall = (x: number, y: number) => x === 20 && y >= 18 && y <= 19;
    const w = world(placed(room(40, 24, (x, y) => y >= 20 || isWall(x, y), 2, 19), isWall), 2);
    w.placeBody(0, 18.5, 20 - H);
    w.placeBody(1, 21.6, 20 - H);
    expect(wrapsOf(w)).toEqual([20, 18, 21, 18]);
  });

  it("in every co-op level, every cell that stops bodies stops the rope (no rope-transparent scenery)", () => {
    for (const def of COOP_LEVELS) {
      for (let n = 2; n <= COOP.maxPlayers; n++) {
        const w = new CoopWorld(parseCoopLevel(def, n), team(n, n - 1));
        const { collision } = w.level;
        for (const o of w.level.objects) {
          const label = `${def.id} at ${n}: ${o.kind} at (${o.x}, ${o.y})`;
          if (isCoopSolidObject(o)) expect(w.ropeSolid(o.x, o.y), label).toBe(true);
          // Race spikes are solid in the race since main's turned spikes, never in co-op levels
          // (La Salle de TP's rack drops into a ditch of them): neither bodies nor the rope stop there.
          if (o.kind === "spikes") {
            expect(isSolidCell(collision, o.x, o.y), label).toBe(false);
            expect(w.ropeSolid(o.x, o.y), label).toBe(false);
          }
        }
        for (let y = 0; y < collision.height; y++) {
          for (let x = 0; x < collision.width; x++) {
            const label = `${def.id} at ${n}: cell (${x}, ${y})`;
            expect(w.ropeSolid(x, y), label).toBe(isSolidCell(collision, x, y));
            if (isSolidCell(w.level.terrain, x, y)) expect(w.ropeSolid(x, y), label).toBe(true);
          }
        }
      }
    }
  });
});

describe("rope v2: the spring", () => {
  // A thin shelf (row 10, x 4 to 20) high above a floor (y = 42): whoever hangs off its end hangs in the open.
  const shelf = room(40, 44, (x, y) => (y === 10 && x >= 4 && x <= 20) || y >= 42, 5, 9);

  it("a tug of war stretches a link by its whole give, never past the hard stop, and it comes back", () => {
    const w = world(
      room(60, 24, (_x, y) => y >= 20, 2, 19),
      2,
    );
    w.placeBody(0, 30, 20 - H);
    w.placeBody(1, 30 + REST, 20 - H);
    let longest = 0;
    run(
      w,
      120,
      () => [BIT_LEFT, BIT_RIGHT],
      () => (longest = Math.max(longest, w.rope[0]!.length)),
    );
    expect(longest).toBeGreaterThan(REST + 0.85);
    expect(longest).toBeLessThanOrEqual(MAX + 0.01);
    // Let go: back to its rest length (+0.03) within 0.5 s (measured 29 steps, 0.24 s).
    let back = -1;
    run(
      w,
      120,
      () => [0, 0],
      (s) => {
        if (back < 0 && w.rope[0]!.length <= REST + 0.03) back = s + 1;
      },
    );
    expect(back).toBeGreaterThan(0);
    expect(back * COOP_DT).toBeLessThanOrEqual(0.5);
  });

  it("a friend hanging still stretches it a little, a chain more, by the weight below each link", () => {
    const one = world(shelf, 2);
    one.placeBody(0, 18, 10 - H);
    one.placeBody(1, 20.6, 10 + 1.6);
    run(one, 360, () => [0, 0]);
    expect(one.bodies[1]!.hanging).toBe(true);
    expect(wrapsOf(one)).toEqual([21, 10]);
    // Measured: 4.644 (a stretch of 0.144 for a friend; gravity / stiffness is 0.164).
    expect(one.rope[0]!.length).toBeGreaterThan(REST + 0.11);
    expect(one.rope[0]!.length).toBeLessThan(REST + 0.18);
    const chain = world(shelf, 3, 2);
    chain.placeBody(0, 18, 10 - H);
    chain.placeBody(1, 20.6, 10 + 1.4);
    chain.placeBody(2, 20.6, 10 + 1.4 + 4.6);
    run(chain, 480, () => [0, 0, 0]);
    const [top, bottom] = chain.rope.map((l) => l.length - REST);
    // Measured: 0.458 above a friend and Ruben (3 units of mass), 0.265 above Ruben (2).
    expect(top!).toBeGreaterThan(2.7 * 0.144);
    expect(top!).toBeLessThan(3.3 * 0.144);
    expect(bottom!).toBeGreaterThan(1.7 * 0.144);
    expect(bottom!).toBeLessThan(2.3 * 0.144);
    expect(chain.bodies[1]!.hanging && chain.bodies[2]!.hanging).toBe(true);
  });

  it("a friend dropped onto the rope bounces a little and settles, without endless oscillation", () => {
    const w = world(shelf, 2);
    w.placeBody(0, 19.5, 10 - H);
    // Straight below the shelf's end, 2 cells of slack.
    w.placeBody(1, 20.6, 11.0);
    const lengths: number[] = [];
    run(
      w,
      420,
      () => [0, 0],
      () => lengths.push(w.rope[0]!.length),
    );
    const taut = lengths.findIndex((l) => l >= REST);
    expect(taut).toBeGreaterThan(0);
    const settled = lengths[lengths.length - 1]!;
    let crossings = 0;
    let side = 0;
    for (const l of lengths.slice(taut)) {
      const d = l - settled;
      if (Math.abs(d) < 0.005) continue;
      if (side !== 0 && Math.sign(d) !== side) crossings++;
      side = Math.sign(d);
    }
    const late = lengths.slice(taut + 180).map((l) => Math.abs(l - settled));
    // Measured: a peak of 5.09 (a give of 0.59), one rebound to 4.60, settled at 4.65 within 0.7 s; 3 crossings.
    expect(Math.max(...lengths)).toBeGreaterThan(REST + 0.3);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(MAX + 0.01);
    expect(crossings).toBeLessThanOrEqual(4);
    expect(Math.max(...late)).toBeLessThan(0.02);
    expect(w.bodies[1]!.hanging).toBe(true);
  });

  it("stops dead at the hard stop: Ruben falling at 22 cells/s", () => {
    const w = world(shelf, 2, 1);
    w.placeBody(0, 18, 10 - H);
    // At the end of the rope (taut, straight below the corner), falling at the fastest fall speed.
    w.placeBody(1, 20.6, 10 + (REST - 2.64) - 0.45);
    w.bodies[1]!.vy = 22;
    let longest = 0;
    let at = -1;
    run(
      w,
      120,
      () => [0, 0],
      (s) => {
        if (w.rope[0]!.length > longest) {
          longest = w.rope[0]!.length;
          at = s;
        }
      },
    );
    // Measured: 5.40 at the stop (the solve brings any overshoot back within the step).
    expect(longest).toBeGreaterThan(MAX - 0.05);
    expect(longest).toBeLessThanOrEqual(MAX + 0.01);
    expect(at).toBeLessThan(30);
    expect(w.dying).toBe(0);
  });
});

describe("rope v2: wraps are part of the world's state", () => {
  /** A sandbox world with both friends hanging over the pulley (wraps on). */
  function wrapped(): CoopWorld {
    const w = pulley();
    w.placeBody(0, 69.05, 10 - H);
    w.placeBody(1, 70.15, 10 - H);
    run(w, 90, (s) => (s < 30 ? [BIT_LEFT, BIT_RIGHT] : [0, 0]));
    expect(w.ropeWraps[0]!.length).toBe(6);
    return w;
  }

  it("save, JSON and load give the same world, hash and future; the hash sees the wraps", () => {
    const w = wrapped();
    const saved = JSON.parse(JSON.stringify(w.save()));
    const copy = pulley();
    copy.load(saved);
    expect(copy.save()).toEqual(w.save());
    expect(copy.hash()).toBe(w.hash());
    expect(copy.rope.map((l) => l.points)).toEqual(w.rope.map((l) => l.points));
    const inputs = (s: number) => [s % 50 < 25 ? BIT_LEFT : BIT_RIGHT, s % 70 < 30 ? BIT_RIGHT | BIT_JUMP | (s % 70 === 0 ? BIT_JUMP_PRESS : 0) : 0];
    run(w, 600, inputs);
    run(copy, 600, inputs);
    expect(copy.hash()).toBe(w.hash());
    expect(copy.save()).toEqual(w.save());
    const other = pulley();
    other.load(saved);
    other.ropeWraps[0]!.length = 0;
    const back = pulley();
    back.load(saved);
    expect(other.hash()).not.toBe(back.hash());
  });

  it("snapshots carry the wraps; a snapshot of the old version is refused", () => {
    const s = wrapped().save();
    const bytes = encodeWorld(s);
    expect(decodeWorld(bytes)).toEqual(s);
    expect(decodeWorld(bytes).ropeWraps[0]!.filter((_, i) => i % 3 !== 2)).toEqual([69, 10, 71, 10]);
    const old = bytes.slice();
    old[0] = 3;
    expect(() => decodeWorld(old)).toThrow(/version 3/);
  });

  it("a level restart and a new attempt start with a straight rope", () => {
    const w = wrapped();
    w.restart();
    expect(w.ropeWraps.every((x) => x.length === 0)).toBe(true);
    expect(w.rope.every((l) => l.points.length === 0)).toBe(true);
  });

  it("random play on the sandbox never takes the rope through the terrain, and replays bit for bit", () => {
    /** Seeded keys (mulberry32), held 5 to 64 steps, leaning right. */
    function keys(seed: number, n: number): () => number[] {
      let a = seed >>> 0;
      const r = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
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
    let wrappedSteps = 0;
    for (const [seed, n] of [
      [3, 3],
      [8, 4],
      [11, 5],
    ] as const) {
      const w = new CoopWorld(parseCoopLevel(sandboxLevel, n), team(n, n - 1));
      const twin = new CoopWorld(parseCoopLevel(sandboxLevel, n), team(n, n - 1));
      const next = keys(seed, n);
      let through: string | null = null;
      for (let s = 0; s < 3000; s++) {
        const bits = next();
        w.step(bits);
        twin.step(bits);
        if (w.ropeWraps.some((x) => x.length > 0)) wrappedSteps++;
        for (let k = 0; k < w.rope.length && !through; k++) {
          const t = throughTerrain(w, k);
          if (t) through = `seed ${seed}, ${n} players, step ${s}: ${t}`;
        }
        if (s === 1500) {
          // A copy loaded mid-run (wraps and all) continues exactly like the original.
          twin.load(JSON.parse(JSON.stringify(w.save())));
        }
      }
      expect(through).toBeNull();
      expect(twin.hash(), `seed ${seed}`).toBe(w.hash());
    }
    // The rope does wrap the sandbox's walls in these runs.
    expect(wrappedSteps).toBeGreaterThan(1000);
  }, 60_000);
});

describe("rope v2: budgets", () => {
  it("a server step at 5 players stays under 0.2 ms (median), wraps included", () => {
    const w = new CoopWorld(parseCoopLevel(sandboxLevel, 5), team(5, 4));
    // Everyone on the pulley: four bodies hang or stand around the pillar, the rope wrapped.
    w.placeBody(0, 67.1, 11.4);
    w.placeBody(1, 69.05, 10 - H);
    w.placeBody(2, 71.1, 11.4);
    w.placeBody(3, 74.2, 11 - H);
    w.placeBody(4, 76.5, 11 - H);
    run(w, 60, () => [0, 0, 0, 0, 0]);
    const times: number[] = [];
    let wrappedLinks = 0;
    for (let s = 0; s < 1200; s++) {
      const bits = [s % 90 < 45 ? BIT_LEFT : 0, s % 120 < 20 ? BIT_JUMP | BIT_JUMP_PRESS : 0, s % 80 < 40 ? BIT_RIGHT : BIT_LEFT, BIT_LEFT, s % 60 < 30 ? BIT_RIGHT : 0];
      const t0 = performance.now();
      w.step(bits);
      times.push(performance.now() - t0);
      wrappedLinks += w.ropeWraps.filter((x) => x.length > 0).length;
    }
    times.sort((a, b) => a - b);
    const median = times[times.length >> 1]!;
    expect(wrappedLinks / 1200).toBeGreaterThan(1);
    expect(median).toBeLessThan(0.2);
  });
});
