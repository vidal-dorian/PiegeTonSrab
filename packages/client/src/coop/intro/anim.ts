/**
 * Small animation maths for the intro. Pure functions of time: the whole intro is drawn as
 * "the picture at second t", with no tweens and no accumulated state, so it can start anywhere
 * (startAt), be paused, or be asked for any frame in a test.
 */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;

/** Progress of `u` through the window [a, b], clamped to 0..1. */
export const seg = (u: number, a: number, b: number): number => (b <= a ? (u >= b ? 1 : 0) : clamp01((u - a) / (b - a)));

export const easeIn = (p: number): number => p * p * p;
export const easeOut = (p: number): number => 1 - (1 - p) ** 3;
export const easeInOut = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
export const smooth = (p: number): number => p * p * (3 - 2 * p);
/** Overshoots past 1 and settles: things that pop in. */
export const backOut = (p: number, s = 1.9): number => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2;
/** Rings around 1 before settling: things that slam in. */
export function elasticOut(p: number): number {
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  return 2 ** (-9 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

/** Scale of something that pops in at `at`: 0 before, overshoot, then 1. */
export const pop = (u: number, at: number, dur = 0.3): number => (u < at ? 0 : backOut(seg(u, at, at + dur)));
/** 0 → 1 → 0 over [at, at + dur] (a sine bump). */
export const bump = (u: number, at: number, dur: number): number => {
  const p = seg(u, at, at + dur);
  return p <= 0 || p >= 1 ? 0 : Math.sin(p * Math.PI);
};
/** Height of a hop, 0..1, for a progress 0..1. */
export const arc = (p: number): number => 4 * p * (1 - p);
/** A shake that dies out: starts at `at`, lasts `dur`, amplitude 1 at the start. */
export function shake(u: number, at: number, dur: number, freq = 38): number {
  if (u < at || u > at + dur) return 0;
  const k = 1 - (u - at) / dur;
  return Math.sin((u - at) * freq) * k * k;
}

/** Deterministic pseudo-random number in 0..1 for an integer-ish seed. */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth noise in -1..1: wobbles, hand-held camera, fluttering ribbons. */
export function noise(t: number, seed = 0): number {
  const i = Math.floor(t);
  const f = t - i;
  const a = hash(i + seed * 57.3);
  const b = hash(i + 1 + seed * 57.3);
  return (a + (b - a) * smooth(f)) * 2 - 1;
}

/** How many characters of a `length`-long text are typed at `u`, typing from `start` at `cps`. */
export const typed = (length: number, u: number, start: number, cps: number): number =>
  clamp(Math.floor((u - start) * cps), 0, length);

export interface HopStep {
  /** Position along the path, 0..1. */
  travel: number;
  /** Height above the ground, 0..1 of the hop height. */
  lift: number;
  /** Squash and stretch for this instant. */
  sx: number;
  sy: number;
}

/** A bouncy walk: `hops` hops between the start and the end of the move, with progress p in 0..1. */
export function hopWalk(p: number, hops: number, out: HopStep): HopStep {
  const q = clamp01(p) * hops;
  const i = Math.min(hops - 1, Math.floor(q));
  const f = clamp01(q - i);
  // Most of the distance is covered in the air; the feet stick for a moment on each landing.
  const air = seg(f, 0.12, 0.92);
  out.travel = (i + smooth(air)) / hops;
  out.lift = arc(air);
  const ground = f < 0.12 ? 1 - f / 0.12 : f > 0.92 ? (f - 0.92) / 0.08 : 0;
  const stretch = Math.sin(air * Math.PI) * 0.1;
  out.sy = 1 + stretch - ground * 0.2;
  out.sx = 1 - stretch * 0.8 + ground * 0.18;
  if (p <= 0 || p >= 1) {
    out.sx = 1;
    out.sy = 1;
    out.lift = 0;
  }
  return out;
}
