/**
 * What moves smoothly on screen between two states of the co-op world: bodies, crates, seesaws,
 * balances, platforms and gates. The world steps 120 times a second (and online arrives 30 times
 * a second); the screen draws a frame blended between the last two states, like the bodies.
 * Everything else (who carries the key, which shelf is solid...) is read from the world itself.
 */
import type { CoopWorld } from "@game/shared/coop";

export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PropFrame {
  /** World tick and level tick (fractional once blended). */
  tick: number;
  levelTick: number;
  /** Attempt of the state: nothing is blended across a restart. */
  attempt: number;
  bodies: FrameBox[];
  /** Top-left of each crate, cells: x0, y0, x1, y1... */
  crates: number[];
  /** Tilt of each seesaw (+1 left side down). */
  seesaws: number[];
  /** Offset of each balance (+ left pan down). */
  balances: number[];
  /** Top-left of each moving platform, cells: x0, y0, x1, y1... */
  movers: number[];
  /** Opening of each gate, 0 closed .. 1 open. */
  gates: number[];
}

/** Moved farther than this between two states, a thing jumped (home, into the door): no sliding there. */
export const TELEPORT_CELLS = 2.5;

export function newFrame(): PropFrame {
  return { tick: 0, levelTick: 0, attempt: 0, bodies: [], crates: [], seesaws: [], balances: [], movers: [], gates: [] };
}

/** The world as it is now, into `out` (its arrays are reused). */
export function captureFrame(world: CoopWorld, out: PropFrame = newFrame()): PropFrame {
  out.tick = world.tick;
  out.levelTick = world.levelTick;
  out.attempt = world.attempt;
  const bodies = world.bodies;
  out.bodies.length = bodies.length;
  bodies.forEach((b, i) => {
    const box = out.bodies[i] ?? (out.bodies[i] = { x: 0, y: 0, w: 0, h: 0 });
    box.x = b.x;
    box.y = b.y;
    box.w = b.width;
    box.h = b.height;
  });
  const p = world.props;
  out.crates.length = 0;
  for (const c of p.crates) out.crates.push(c.x, c.y);
  out.seesaws.length = 0;
  for (const s of p.seesaws) out.seesaws.push(s.t);
  out.balances.length = 0;
  for (const b of p.balances) out.balances.push(b.offset);
  out.movers.length = 0;
  for (const m of p.movers) out.movers.push(m.collider.x, m.collider.y);
  out.gates.length = 0;
  for (const g of p.gates) out.gates.push(g.anim);
  return out;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

/** Pairs of coordinates: blended, except a pair that jumped farther than TELEPORT_CELLS. */
function lerpPairs(a: readonly number[], b: readonly number[], k: number, out: number[]): void {
  out.length = b.length;
  for (let i = 0; i + 1 < b.length; i += 2) {
    const ax = a[i] ?? b[i]!;
    const ay = a[i + 1] ?? b[i + 1]!;
    const jumped = Math.abs(b[i]! - ax) > TELEPORT_CELLS || Math.abs(b[i + 1]! - ay) > TELEPORT_CELLS;
    out[i] = jumped ? b[i]! : lerp(ax, b[i]!, k);
    out[i + 1] = jumped ? b[i + 1]! : lerp(ay, b[i + 1]!, k);
  }
}

function lerpList(a: readonly number[], b: readonly number[], k: number, out: number[]): void {
  out.length = b.length;
  for (let i = 0; i < b.length; i++) out[i] = lerp(a[i] ?? b[i]!, b[i]!, k);
}

/**
 * The frame `k` of the way from `a` to `b` (0..1). Across a restart (another attempt) it is `b`:
 * everybody and everything is back home at once.
 */
export function lerpFrame(a: PropFrame, b: PropFrame, k: number, out: PropFrame = newFrame()): PropFrame {
  const t = a.attempt === b.attempt ? Math.min(1, Math.max(0, k)) : 1;
  out.tick = lerp(a.tick, b.tick, t);
  out.levelTick = lerp(a.levelTick, b.levelTick, t);
  out.attempt = b.attempt;
  out.bodies.length = b.bodies.length;
  b.bodies.forEach((bb, i) => {
    const ab = a.bodies[i] ?? bb;
    const box = out.bodies[i] ?? (out.bodies[i] = { x: 0, y: 0, w: 0, h: 0 });
    const jumped = Math.abs(bb.x - ab.x) > TELEPORT_CELLS || Math.abs(bb.y - ab.y) > TELEPORT_CELLS;
    box.x = jumped ? bb.x : lerp(ab.x, bb.x, t);
    box.y = jumped ? bb.y : lerp(ab.y, bb.y, t);
    box.w = bb.w;
    box.h = bb.h;
  });
  lerpPairs(a.crates, b.crates, t, out.crates);
  lerpList(a.seesaws, b.seesaws, t, out.seesaws);
  lerpList(a.balances, b.balances, t, out.balances);
  lerpPairs(a.movers, b.movers, t, out.movers);
  lerpList(a.gates, b.gates, t, out.gates);
  return out;
}

/** A copy of `src` into `out` (arrays reused). */
export function copyFrame(src: PropFrame, out: PropFrame): PropFrame {
  return lerpFrame(src, src, 1, out);
}
