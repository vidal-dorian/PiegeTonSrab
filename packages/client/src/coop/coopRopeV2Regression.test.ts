/**
 * Regressions from the review of rope v2 (elastic links that wrap the terrain), each one failing
 * on the code it was found in:
 * - a wrap point let go late (the ~1° margin) dropped a corner lying on the released part, and the
 *   rope stayed through the terrain (coop04's duct at 4-5 players);
 * - a standing anchor between a walker and a capped hanging chain was dragged into its other link's
 *   hard stop by the elastic pull, and thrown back by the stop every step (coop02's cable shaft);
 * - a body held against a wall just under a wrapped corner, two friends on either side of a
 *   frictionless pulley, and a friend held under the pillar's corner by a friend in the pit all
 *   bobbed or seesawed for ever;
 * - the sandbox's pulley: a friend walking off the pillar cleared the 2-wide pit;
 * - the screen drew a link through the world's wrap points from bodies drawn somewhere else
 *   (between snapshots, or smoothed), cutting through a corner.
 */
import { describe, expect, it } from "vitest";
import {
  ALL_BITS,
  BIT_DOWN_PRESS,
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_LEFT,
  BIT_RESTART,
  BIT_RIGHT,
  COOP_LEVELS,
  CoopWorld,
  parseCoopLevel,
  ROPE_MAX_LENGTH,
  sandboxLevel,
  type CoopPlayer,
} from "@game/shared/coop";
import { runSolution } from "@game/shared/coop/bots";
import { COOP_SOLUTIONS } from "../../../shared/src/coop/levels/solutions";
import { drawnRopeSegments } from "./render/ropeSegments";

const H = 0.9;
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

function terrainSolid(w: CoopWorld, cx: number, cy: number): boolean {
  const t = w.level.terrain;
  if (cx < 0 || cx >= t.width) return true;
  if (cy < 0 || cy >= t.height) return false;
  return t.solid[cy * t.width + cx] === true;
}

/** How deep a polyline goes into the terrain: the largest distance, sampled every 0.005, from a point inside a solid cell to that cell's nearest open face. */
function pathDepth(w: CoopWorld, xs: readonly number[], ys: readonly number[]): number {
  let best = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const d = Math.hypot(xs[i + 1]! - xs[i]!, ys[i + 1]! - ys[i]!);
    const steps = Math.max(1, Math.ceil(d / 0.005));
    for (let s = 1; s < steps; s++) {
      const x = xs[i]! + ((xs[i + 1]! - xs[i]!) * s) / steps;
      const y = ys[i]! + ((ys[i + 1]! - ys[i]!) * s) / steps;
      const cx = Math.floor(x);
      const cy = Math.floor(y);
      if (!terrainSolid(w, cx, cy)) continue;
      let dd = 1;
      if (!terrainSolid(w, cx - 1, cy)) dd = Math.min(dd, x - cx);
      if (!terrainSolid(w, cx + 1, cy)) dd = Math.min(dd, cx + 1 - x);
      if (!terrainSolid(w, cx, cy - 1)) dd = Math.min(dd, y - cy);
      if (!terrainSolid(w, cx, cy + 1)) dd = Math.min(dd, cy + 1 - y);
      best = Math.max(best, dd);
    }
  }
  return best;
}

/** How deep link k of the world goes into the terrain. */
function linkDepth(w: CoopWorld, k: number): number {
  const l = w.rope[k]!;
  const a = w.bodies[l.a]!;
  const b = w.bodies[l.b]!;
  return pathDepth(w, [a.cx, ...l.points.filter((_, i) => i % 2 === 0), b.cx], [a.cy, ...l.points.filter((_, i) => i % 2 === 1), b.cy]);
}

/** Random held keys, re-drawn every few steps (a seeded mulberry32). */
function randomKeys(seed: number, n: number): () => number[] {
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
  const allowed = ALL_BITS & ~BIT_JUMP_PRESS & ~BIT_RESTART;
  return () =>
    held.map((h, i) => {
      if (left[i]! > 0) {
        left[i] = left[i]! - 1;
        return h & ~BIT_JUMP_PRESS & ~BIT_DOWN_PRESS;
      }
      left[i] = 3 + Math.floor(r() * 50);
      let bits = Math.floor(r() * 64) & allowed;
      if (bits & BIT_LEFT && bits & BIT_RIGHT) bits &= r() < 0.5 ? ~BIT_LEFT : ~BIT_RIGHT;
      held[i] = bits;
      return bits | (bits & BIT_JUMP ? BIT_JUMP_PRESS : 0);
    });
}

describe("rope v2 review: letting go of a wrap point late", () => {
  // coop04's duct at 4-5 players (x 0-19, things replaced by open cells): a hole at x 6 down from
  // the corridor (top y = 11), the crawl below (rows 12-13), a slab in row 14 from x 7, a lower crawl (row 15).
  const duct = [
    "####################",
    "####################",
    "####################",
    "####################",
    "####################",
    "####################",
    "####################",
    "####################",
    "####################",
    "#.........##########",
    "#S..................",
    "#######.......#.....",
    "######..........####",
    "######..........####",
    "######.#########....",
    "######..........####",
    "####################",
    "####################",
  ];

  for (const [mover, bits, wraps, label] of [
    // Over (7, 11), (7, 12), then (7, 15), touching (7, 14) on its face (the state the sweep itself builds there).
    [0, BIT_RIGHT, [7, 11, 1, 7, 12, 1, 7, 15, -1], "the top end walks over the hole: (7, 14) wraps"],
    // The mirror: over (7, 11), (7, 14) and (7, 15), touching (7, 12) on its face.
    [1, BIT_LEFT, [7, 11, 1, 7, 14, -1, 7, 15, -1], "the bottom end walks back along the crawl: (7, 12) wraps"],
  ] as const) {
    it(`a corner lying along the released part wraps: ${label}`, () => {
      // The rope down the hole along the wall face x = 7.
      const w = world(duct, 2);
      w.placeBody(0, 6.13, 10.1);
      w.placeBody(1, 7.16, 15.0);
      const s = w.save();
      s.ropeWraps = [wraps.slice()];
      w.load(s);
      let deepest = 0;
      for (let k = 0; k < 120; k++) {
        const input = [0, 0];
        input[mover] = bits;
        w.step(input);
        deepest = Math.max(deepest, linkDepth(w, 0));
      }
      // Measured before the fix: 0.500 (through the middle of cell (7, 14), or the mirror (6, 11)).
      expect(deepest).toBeLessThan(0.01);
    });
  }

  it("random play in coop04 (4-5 players) never takes the rope through the terrain", () => {
    const coop04 = COOP_LEVELS.find((l) => l.id === "coop04")!;
    // Seeds where it went through before the fix (up to 339 steps, 0.5 deep).
    for (const [n, seed] of [
      [4, 4],
      [5, 4],
      [5, 8],
      [5, 11],
    ] as const) {
      const w = new CoopWorld(parseCoopLevel(coop04, n), team(n, n - 1));
      const next = randomKeys(seed * 31 + n, n);
      let deepest = 0;
      for (let s = 0; s < 4000; s++) {
        w.step(next());
        if (w.dying > 0) continue;
        for (let k = 0; k < w.rope.length; k++) deepest = Math.max(deepest, linkDepth(w, k));
      }
      expect(deepest, `coop04 at ${n}, seed ${seed}`).toBeLessThan(0.01);
    }
  }, 60_000);
});

describe("rope v2 review: an anchor between a walker and a hanging chain", () => {
  // An upper floor (top y = 6) up to x 21, a lower floor (top y = 10) up to x 23, a shaft from x 24.
  const rows = room(40, 40, (x, y) => (x <= 21 && y === 6) || (x <= 23 && y >= 10) || y >= 38, 3, 5);

  it("the walker hauls the chain through the anchor; the anchor does not shake and no link stays past the stop", () => {
    for (const [n, ruben, anchorKeys] of [
      [3, 2, 0],
      [3, 2, BIT_RIGHT],
      [5, 4, 0],
      [5, 4, BIT_RIGHT],
    ] as const) {
      const label = `${n} players, the anchor ${anchorKeys ? "pushes away" : "idle"}`;
      const w = world(rows, n, ruben);
      w.placeBody(0, 20.9, 5.1);
      w.placeBody(1, 22.6, 9.1);
      for (let i = 2; i < n; i++) w.placeBody(i, 24.2, 10.5 + 4.6 * (i - 1));
      for (let s = 0; s < 60; s++) w.step(new Array(n).fill(0));
      let longest = 0;
      let reversals = 0;
      let lastDx = 0;
      let largest = 0;
      for (let s = 0; s < 240; s++) {
        const bits = new Array(n).fill(0);
        bits[0] = BIT_LEFT;
        bits[1] = anchorKeys;
        const x1 = w.bodies[1]!.x;
        w.step(bits);
        const dx = w.bodies[1]!.x - x1;
        if (s > 10 && dx * lastDx < 0 && Math.abs(dx) > 0.05) reversals++;
        largest = Math.max(largest, Math.abs(dx));
        lastDx = dx;
        for (const l of w.rope) longest = Math.max(longest, l.length);
      }
      // Before the fix: 23-41 reversals of about 0.3 cell (the whole maxCorrection), links 5.87-6.04.
      // Measured after: no reversal, largest move 0.11 (the walker's pull through the anchor), longest 5.46-5.47.
      expect(reversals, label).toBe(0);
      expect(largest, label).toBeLessThan(0.15);
      expect(longest, label).toBeLessThanOrEqual(MAX + 0.1);
      expect(w.dying, label).toBe(0);
    }
  });

  it("random play in coop02 (3-5 players) keeps every link within the stop + 0.1", () => {
    const coop02 = COOP_LEVELS.find((l) => l.id === "coop02")!;
    // Seeds that reached 5.78-6.10 before the fix.
    for (const [n, seed] of [
      [3, 6],
      [4, 12],
      [5, 9],
    ] as const) {
      const w = new CoopWorld(parseCoopLevel(coop02, n), team(n, n - 1));
      const next = randomKeys(seed * 31 + n, n);
      let longest = 0;
      for (let s = 0; s < 4000; s++) {
        w.step(next());
        if (w.dying > 0) continue;
        for (const l of w.rope) longest = Math.max(longest, l.length);
      }
      expect(longest, `coop02 at ${n}, seed ${seed}`).toBeLessThanOrEqual(MAX + 0.1);
    }
  }, 60_000);
});

/** The y range and fastest vertical speed of body i over steps [from, to) while `play` runs. */
function settle(w: CoopWorld, steps: number, from: number, inputs: (s: number) => number[], i: number): { range: number; speed: number } {
  let lo = Number.MAX_VALUE;
  let hi = -Number.MAX_VALUE;
  let speed = 0;
  for (let s = 0; s < steps; s++) {
    w.step(inputs(s));
    if (s < from) continue;
    const b = w.bodies[i]!;
    lo = Math.min(lo, b.cy);
    hi = Math.max(hi, b.cy);
    speed = Math.max(speed, Math.abs(b.vy));
  }
  return { range: hi - lo, speed };
}

describe("rope v2 review: no endless bouncing", () => {
  it("a body held against a block's face just under its wrapped corner settles", () => {
    // A ledge (top y = 10) up to x 19 with a 3-wide, 2-high block on it (x 15-17), a drop beyond.
    const ledge = room(60, 90, (x, y) => (x <= 19 && y >= 10) || (x >= 15 && x <= 17 && y >= 8) || y >= 88, 3, 9);
    for (const ruben of [-1, 1]) {
      const label = ruben < 0 ? "a friend" : "Ruben";
      const w = world(ledge, 2, ruben);
      w.placeBody(0, 13.6, 9.1);
      w.placeBody(1, 15.0, 7.1);
      // He walks off the block's far side for 1 s, then nobody touches a key.
      const r = settle(w, 10 * 120, 8 * 120, (s) => [0, s < 120 ? BIT_RIGHT : 0], 1);
      expect(w.ropeWraps[0]!.filter((_, i) => i % 3 !== 2), label).toEqual([15, 8, 18, 8]);
      expect(w.bodies[1]!.grounded, label).toBe(false);
      // Before the fix, from 8 to 10 s: a friend 0.245 up and down at up to 3 cells/s, Ruben 0.071 at 1.4.
      expect(r.range, label).toBeLessThan(0.02);
      expect(r.speed, label).toBeLessThan(0.3);
    }
  });

  it("two friends on either side of the sandbox's pillar stop seesawing", () => {
    for (const [delay, x0] of [
      [0, 69.05],
      [1, 69.05],
      [5, 69.05],
      [0, 69.3],
    ] as const) {
      const label = `second walk ${delay} steps late, from ${x0}`;
      const w = new CoopWorld(parseCoopLevel(sandboxLevel, 2), team(2));
      w.placeBody(0, x0, 10 - H);
      w.placeBody(1, 70.15, 10 - H);
      let lo = [Number.MAX_VALUE, Number.MAX_VALUE];
      let hi = [-Number.MAX_VALUE, -Number.MAX_VALUE];
      for (let s = 0; s < 40 * 120; s++) {
        w.step([s < 30 ? BIT_LEFT : 0, s >= delay && s < 30 + delay ? BIT_RIGHT : 0]);
        if (s < 30 * 120) continue;
        for (const i of [0, 1]) {
          lo[i] = Math.min(lo[i]!, w.bodies[i]!.cy);
          hi[i] = Math.max(hi[i]!, w.bodies[i]!.cy);
        }
      }
      expect(w.dying, label).toBe(0);
      expect(w.rope[0]!.points, label).toEqual([69, 10, 71, 10]);
      // Before the fix, from 30 to 40 s: each friend 2.15 cells up and down (a 3 s seesaw).
      for (const i of [0, 1]) expect(hi[i]! - lo[i]!, `${label}: body ${i}`).toBeLessThan(0.02);
    }
  });

  it("a friend held under the pillar's corner by a friend standing in the far pit settles", () => {
    for (const px of [71.4, 71.9, 72.5]) {
      const w = new CoopWorld(parseCoopLevel(sandboxLevel, 2), team(2));
      w.placeBody(1, px, 13 - H);
      w.placeBody(0, 69.6, 10 - H);
      // P0 walks off the pillar's left side for 1 s, then nobody touches a key.
      const r = settle(w, 10 * 120, 7 * 120, (s) => (s < 120 ? [BIT_LEFT, 0] : [0, 0]), 0);
      // Before the fix, from 7 to 10 s: 0.26 up and down at up to 3 cells/s.
      expect(r.range, `pit friend at ${px}`).toBeLessThan(0.02);
      expect(r.speed, `pit friend at ${px}`).toBeLessThan(0.3);
    }
  });

  it("Ruben against a friend over the pillar settles", () => {
    const w = new CoopWorld(parseCoopLevel(sandboxLevel, 2), team(2, 1));
    w.placeBody(0, 69.05, 10 - H);
    w.placeBody(1, 70.15, 10 - H);
    const friend = settle(w, 14 * 120, 8 * 120, (s) => (s < 30 ? [BIT_LEFT, BIT_RIGHT] : [0, 0]), 0);
    // Before the fix, from 8 to 14 s: the friend 0.072 up and down at up to 1.3 cells/s (a 6.5 s cycle).
    expect(friend.range).toBeLessThan(0.02);
    expect(friend.speed).toBeLessThan(0.3);
  });
});

describe("rope v2 review: the sandbox's pulley by hand", () => {
  it("two friends who walk off the pillar on either side a little apart (up to 0.2 s) are both held over its corners", () => {
    // The pillar: the 2-wide block on row 10 (its top), wherever the sandbox puts it.
    const p = sandboxLevel.rows[10]!.indexOf("##", 60);
    for (const [x0, x1] of [
      [p + 0.05, p + 1.15],
      [p + 0.3, p + 1.3],
      [p + 0.5, p + 1.5],
    ] as const) {
      for (const delay of [0, 6, 12, 18, 24]) {
        const label = `from ${x0} / ${x1}, the second ${delay} steps late`;
        const w = new CoopWorld(parseCoopLevel(sandboxLevel, 2), team(2));
        w.placeBody(0, x0, 10 - H);
        w.placeBody(1, x1, 10 - H);
        // Both keep walking away.
        for (let s = 0; s < 5 * 120; s++) w.step([BIT_LEFT, s >= delay ? BIT_RIGHT : 0]);
        // Before the 3-wide pits: from a delay of 12 steps (0.1 s) the first one landed on the far floor.
        expect(w.rope[0]!.points, label).toEqual([p, 10, p + 2, 10]);
        // Both off the ground, in the pits (one may be held up at its corner, less than hangHeight under it).
        for (const i of [0, 1]) {
          expect(w.bodies[i]!.grounded, `${label}: body ${i}`).toBe(false);
          expect(w.bodies[i]!.cy, `${label}: body ${i}`).toBeGreaterThan(10);
        }
      }
    }
  });
});

describe("rope v2 review: the drawn rope follows the drawn bodies", () => {
  it("a body drawn back below the corner it has just left: the drawn link wraps the pillar again", () => {
    // The world: P0 on the left floor, P1 on the pillar, the link straight over the pillar.
    const w = new CoopWorld(parseCoopLevel(sandboxLevel, 2), team(2));
    w.placeBody(0, 65.5, 11 - H);
    w.placeBody(1, 69.6, 10 - H);
    expect(w.rope[0]!.points).toEqual([]);
    // Drawn a moment earlier (between two snapshots): P1 still in the right pit.
    const boxes = w.bodies.map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height }));
    boxes[1] = { x: 71.2, y: 11.05, w: 0.8, h: H };
    const [seg] = drawnRopeSegments(w, boxes);
    const xs = [seg!.ax, ...seg!.points.filter((_, i) => i % 2 === 0), seg!.bx];
    const ys = [seg!.ay, ...seg!.points.filter((_, i) => i % 2 === 1), seg!.by];
    // Straight, the drawn link went through the pillar (more than 0.4 deep).
    expect(pathDepth(w, [seg!.ax, seg!.bx], [seg!.ay, seg!.by])).toBeGreaterThan(0.3);
    expect(seg!.points).toEqual([69, 10, 71, 10]);
    expect(pathDepth(w, xs, ys)).toBeLessThan(1e-9);
  });

  it("step A (bodies blended between snapshots 4 ticks apart) never draws a link into the terrain", () => {
    // The level bots record every tick; each in-between frame is drawn as the online screen's step A
    // does: the later snapshot's world, the bodies blended between the two.
    let drawnBad = 0;
    let oldBad = 0;
    let frames = 0;
    for (const id of ["coop01", "coop04", "coop05"]) {
      const def = COOP_LEVELS.find((l) => l.id === id)!;
      for (const n of [2, 5]) {
        const ticks: Array<{ save: ReturnType<CoopWorld["save"]>; attempt: number; boxes: Array<{ x: number; y: number; w: number; h: number }>; inside: boolean[] }> = [];
        const r = runSolution(def, n, COOP_SOLUTIONS[id]!.solution, {
          every: 1,
          trace: (tw) => {
            ticks.push({ save: tw.save(), attempt: tw.attempt, boxes: tw.bodies.map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })), inside: tw.inside.slice() });
          },
        });
        expect(r.ok, `${id} at ${n}`).toBe(true);
        const later = new CoopWorld(parseCoopLevel(def, n), team(n, n - 1));
        for (let t = 0; t + 4 < ticks.length; t += 4) {
          const a = ticks[t]!;
          const b = ticks[t + 4]!;
          if (a.attempt !== b.attempt || a.inside.some(Boolean) || b.inside.some(Boolean)) continue;
          if (a.boxes.some((box, i) => Math.hypot(box.x - b.boxes[i]!.x, box.y - b.boxes[i]!.y) > 2)) continue;
          later.load(b.save);
          for (const k of [0.25, 0.5, 0.75]) {
            const boxes = a.boxes.map((box, i) => ({ x: box.x + (b.boxes[i]!.x - box.x) * k, y: box.y + (b.boxes[i]!.y - box.y) * k, w: box.w, h: box.h }));
            const segs = drawnRopeSegments(later, boxes);
            segs.forEach((s, j) => {
              frames++;
              const xs = [s.ax, ...s.points.filter((_, i) => i % 2 === 0), s.bx];
              const ys = [s.ay, ...s.points.filter((_, i) => i % 2 === 1), s.by];
              if (pathDepth(later, xs, ys) > 0.03) drawnBad++;
              const old = later.rope[j]!.points;
              const oxs = [s.ax, ...old.filter((_, i) => i % 2 === 0), s.bx];
              const oys = [s.ay, ...old.filter((_, i) => i % 2 === 1), s.by];
              if (pathDepth(later, oxs, oys) > 0.03) oldBad++;
            });
          }
        }
      }
    }
    expect(frames).toBeGreaterThan(10_000);
    // The world's wrap points as they are (before the fix) cut a corner in some of these frames.
    expect(oldBad).toBeGreaterThan(0);
    expect(drawnBad).toBe(0);
  }, 120_000);
});
