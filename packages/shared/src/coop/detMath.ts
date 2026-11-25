/**
 * Arithmetic the co-op world can use on every machine with the same results.
 *
 * The co-op world runs in Chrome, Firefox and Safari and on the Raspberry Pi (Node). IEEE-754
 * + - * / and Math.sqrt give the same bits everywhere; Math.sin, cos, atan2, hypot, pow, exp, log
 * and the ** operator do not (engines may differ by an ulp). The server's snapshots correct any
 * drift anyway, but keeping the world to safe operations keeps corrections small and lets the
 * tests compare runs bit for bit. coopDeterminism.test.ts enforces it.
 */

/** Distance without Math.hypot (which engines may round differently). */
export function dist(dx: number, dy: number): number {
  return Math.sqrt(dx * dx + dy * dy);
}

const TWO_PI = 6.283185307179586;
const PI = 3.141592653589793;
const HALF_PI = 1.5707963267948966;

/**
 * Sine from a polynomial (odd Taylor terms up to x^11 on [-π/2, π/2]), accurate to about 6e-8:
 * plenty for pendulums and platforms, and the same bits on every engine.
 */
export function dsin(x: number): number {
  // Reduce to [-π, π].
  let r = x - TWO_PI * Math.floor((x + PI) / TWO_PI);
  // Fold to [-π/2, π/2] (sin(π - r) = sin r).
  if (r > HALF_PI) r = PI - r;
  else if (r < -HALF_PI) r = -PI - r;
  const r2 = r * r;
  return r * (1 + r2 * (-1 / 6 + r2 * (1 / 120 + r2 * (-1 / 5040 + r2 * (1 / 362880 + r2 * (-1 / 39916800))))));
}

export function dcos(x: number): number {
  return dsin(x + HALF_PI);
}

/** 32-bit FNV-1a hash of a sequence of numbers (their float64 bits), for comparing world states. */
export class Fnv32 {
  h = 0x811c9dc5;
  private view = new DataView(new ArrayBuffer(8));

  byte(b: number): void {
    this.h ^= b & 0xff;
    this.h = Math.imul(this.h, 0x01000193) >>> 0;
  }

  num(x: number): void {
    this.view.setFloat64(0, x);
    for (let i = 0; i < 8; i++) this.byte(this.view.getUint8(i));
  }

  bool(b: boolean): void {
    this.byte(b ? 1 : 0);
  }
}
