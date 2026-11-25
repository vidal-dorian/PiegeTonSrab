/**
 * The co-op world must give the same bits on every machine for the same inputs: the server's
 * world is the referee, clients run the same code to display and predict it. The server's
 * snapshots correct any drift, but determinism keeps corrections at zero when inputs are known.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  ALL_BITS,
  BIT_DOWN_PRESS,
  BIT_JUMP_PRESS,
  CoopWorld,
  parseCoopLevel,
  sandboxLevel,
  type CoopPlayer,
} from "@game/shared/coop";

function players(n: number): CoopPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isRuben: i === n - 1 }));
}

/** Seeded inputs (mulberry32): held directions and jumps that change every few steps. */
function inputStream(seed: number, n: number): () => number[] {
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
  return () =>
    held.map((h, i) => {
      if (left[i]! <= 0) {
        left[i] = 5 + Math.floor(r() * 60);
        held[i] = Math.floor(r() * 32) & (ALL_BITS & ~BIT_JUMP_PRESS & ~BIT_DOWN_PRESS);
        return held[i]! | (held[i]! & 4 ? BIT_JUMP_PRESS : 0);
      }
      left[i] = left[i]! - 1;
      return h;
    });
}

function newWorld(n: number): CoopWorld {
  return new CoopWorld(parseCoopLevel(sandboxLevel), players(n));
}

describe("co-op world determinism", () => {
  it("the same inputs give the same state, step for step", () => {
    const a = newWorld(4);
    const b = newWorld(4);
    const ia = inputStream(42, 4);
    const ib = inputStream(42, 4);
    for (let s = 0; s < 1200; s++) {
      a.step(ia());
      b.step(ib());
      if (s % 100 === 0) expect(a.hash()).toBe(b.hash());
    }
    expect(a.hash()).toBe(b.hash());
  });

  it("saving and loading continues exactly like the original", () => {
    for (const seed of [1, 7, 99]) {
      const orig = newWorld(5);
      const inputs = inputStream(seed, 5);
      const log: number[][] = [];
      for (let s = 0; s < 400; s++) {
        const i = inputs();
        log.push(i);
        orig.step(i);
      }
      const saved = JSON.parse(JSON.stringify(orig.save()));
      const more: number[][] = [];
      for (let s = 0; s < 400; s++) {
        const i = inputs();
        more.push(i);
        orig.step(i);
      }
      const copy = newWorld(5);
      copy.load(saved);
      for (const i of more) copy.step(i);
      expect(copy.hash(), `seed ${seed}`).toBe(orig.hash());
      expect(copy.save()).toEqual(orig.save());
    }
  });
});

describe("co-op world uses only engine-independent maths", () => {
  const SAFE = new Set(["abs", "min", "max", "floor", "ceil", "round", "trunc", "sign", "sqrt", "fround", "imul"]);
  const saved = new Map<string, unknown>();
  let dateNow: (() => number) | null = null;
  let perfNow: (() => number) | null = null;

  afterEach(() => {
    const M = Math as unknown as Record<string, unknown>;
    for (const [k, v] of saved) M[k] = v;
    saved.clear();
    if (dateNow) Date.now = dateNow;
    if (perfNow) performance.now = perfNow;
  });

  it("calls no Math function outside the safe list, no clock and no random while stepping", () => {
    const w = newWorld(5);
    const inputs = inputStream(5, 5);
    const M = Math as unknown as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(Math)) {
      const v = M[name];
      if (typeof v !== "function" || SAFE.has(name)) continue;
      saved.set(name, v);
      M[name] = () => {
        throw new Error(`Math.${name} called inside the co-op world`);
      };
    }
    dateNow = Date.now;
    perfNow = performance.now.bind(performance);
    Date.now = () => {
      throw new Error("Date.now called inside the co-op world");
    };
    performance.now = () => {
      throw new Error("performance.now called inside the co-op world");
    };
    for (let s = 0; s < 3000; s++) w.step(inputs());
    w.hash();
    expect(w.tick).toBe(3000);
  });
});
