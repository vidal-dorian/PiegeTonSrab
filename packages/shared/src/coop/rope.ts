/**
 * The rope that ties the players together: a chain, each link a maximum distance between two
 * neighbours' body centres (a slack rope pulls nothing). Solved after every body has taken its
 * step, all bodies at once, so the same world gives the same rope on every machine.
 *
 * - Position: each taut link is shortened back to its length, shared out by "how easily the rope
 *   moves each end" (grip / mass): in the air 1, standing 0.35, standing and pushing away from a
 *   friend who hangs below 0.12 (bracing). Ruben weighs twice as much. A player inside the door is a
 *   fixed point. Moves go through collisions, carrying whoever stands on the moved body.
 * - Velocity: then the speed that stretches a taut link is removed, but only from bodies in the
 *   air: a standing body is only dragged in position, so dragging a passive friend is a smooth
 *   half speed instead of jerks.
 * - A body hauled up rises at most COOP.riseCap per second (Ruben slower): whatever the rope cannot
 *   lift goes to the other end, so the hauler is held back while the friend climbs.
 * - A body blocked by terrain (the rope goes through walls) counts as fixed for the rest of the step.
 */
import type { CoopController } from "./coopController";
import { COOP } from "./coopTuning";
import { dist } from "./detMath";

export interface RopeHost {
  readonly bodies: readonly CoopController[];
  /** Inside the door: a fixed point of the rope. */
  isFixed(i: number): boolean;
  /** Left/right input of the body this step (-1, 0, 1). */
  inputDir(i: number): number;
  /** Move body i and everything standing on it, through collisions. Returns what body i achieved. */
  moveStack(i: number, dx: number, dy: number): { dx: number; dy: number };
  /** How far body i already rose during this step on its own (cells, >= 0): it counts against the haul speed. */
  stepRise(i: number): number;
  /** The rope moved body i by (dx, dy) towards body `by` (the referee's blame). */
  onPull?(i: number, by: number, dx: number, dy: number): void;
}

/** One link of the chain after a solve, for drawing and for the next step's "hanging" flags. */
export interface RopeLinkState {
  /** Body indices of the two ends. */
  a: number;
  b: number;
  /** Distance between the two centres, cells. */
  length: number;
  taut: boolean;
}

function riseCapOf(b: CoopController): number {
  return b.isRuben ? COOP.riseCap.ruben : COOP.riseCap.friend;
}

/** How easily the rope moves body i when pulled towards (nx, ny) by body `other`. */
function mobility(host: RopeHost, i: number, other: number, nx: number): number {
  if (host.isFixed(i)) return 0;
  const b = host.bodies[i]!;
  if (!b.grounded) return COOP.grip.air / b.mass;
  const o = host.bodies[other]!;
  const pushingAway = host.inputDir(i) * nx < 0 && Math.abs(nx) > 0.2;
  const otherHangs = !o.grounded && o.cy > b.cy + COOP.hangHeight;
  return (pushingAway && otherHangs ? COOP.grip.brace : COOP.grip.ground) / b.mass;
}

/**
 * Solve the rope for one step. `chain` lists body indices in rope order; `out` receives one link
 * state per pair. `dt` is the step length (for the rise cap).
 */
export function solveRope(host: RopeHost, chain: readonly number[], length: number, dt: number, out: RopeLinkState[]): void {
  const n = host.bodies.length;
  const riseLeft = new Array<number>(n);
  const corrLeft = new Array<number>(n).fill(COOP.maxCorrection);
  const blocked = new Array<boolean>(n).fill(false);
  for (let i = 0; i < n; i++) {
    const b = host.bodies[i]!;
    riseLeft[i] = Math.max(0, riseCapOf(b) * dt - host.stepRise(i));
  }

  /** Cut correction c (along direction (ux, uy)) for body i to its budgets; returns the part allowed. */
  const allowed = (i: number, c: number, uy: number): number => {
    if (c <= 0) return 0;
    let a = Math.min(c, corrLeft[i]!);
    const up = -uy * a;
    if (up > 0 && up > riseLeft[i]!) a = riseLeft[i]! / -uy;
    return Math.max(0, a);
  };

  for (let pass = 0; pass < COOP.ropePasses; pass++) {
    for (let k = 0; k + 1 < chain.length; k++) {
      const ia = chain[k]!;
      const ib = chain[k + 1]!;
      const A = host.bodies[ia]!;
      const B = host.bodies[ib]!;
      const dx = B.cx - A.cx;
      const dy = B.cy - A.cy;
      const d = dist(dx, dy);
      if (d <= length || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const err = d - length;
      const wa = blocked[ia] ? 0 : mobility(host, ia, ib, nx);
      const wb = blocked[ib] ? 0 : mobility(host, ib, ia, -nx);
      if (wa + wb <= 0) continue;
      // A moves along +n (towards B), B along -n (towards A). What one end cannot take (its
      // correction or rise budget is spent) goes to the other end, within that end's budgets.
      let ca = wa > 0 ? allowed(ia, (err * wa) / (wa + wb), ny) : 0;
      const cb = wb > 0 ? allowed(ib, err - ca, -ny) : 0;
      if (wa > 0 && ca + cb < err) ca = allowed(ia, err - cb, ny);
      if (ca === 0 && cb === 0) continue;
      if (ca > 0) {
        const m = host.moveStack(ia, nx * ca, ny * ca);
        const got = m.dx * nx + m.dy * ny;
        if (got > 0) host.onPull?.(ia, ib, m.dx, m.dy);
        corrLeft[ia] = corrLeft[ia]! - Math.max(0, got);
        if (m.dy < 0) riseLeft[ia] = Math.max(0, riseLeft[ia]! + m.dy);
        if (got < ca * 0.5) blocked[ia] = true;
      }
      if (cb > 0) {
        const m = host.moveStack(ib, -nx * cb, -ny * cb);
        const got = -(m.dx * nx + m.dy * ny);
        if (got > 0) host.onPull?.(ib, ia, m.dx, m.dy);
        corrLeft[ib] = corrLeft[ib]! - Math.max(0, got);
        if (m.dy < 0) riseLeft[ib] = Math.max(0, riseLeft[ib]! + m.dy);
        if (got < cb * 0.5) blocked[ib] = true;
      }
    }
  }

  // An anchor that does not brace slowly slides towards the friends hanging from it.
  for (let k = 0; k + 1 < chain.length; k++) {
    for (const [ia, ib] of [
      [chain[k]!, chain[k + 1]!],
      [chain[k + 1]!, chain[k]!],
    ] as const) {
      const A = host.bodies[ia]!;
      const B = host.bodies[ib]!;
      if (!A.grounded || B.grounded || host.isFixed(ia)) continue;
      if (B.cy <= A.cy + COOP.hangHeight) continue;
      const dx = B.cx - A.cx;
      const dy = B.cy - A.cy;
      if (dist(dx, dy) < length - 0.02) continue;
      const side = Math.sign(dx);
      if (side === 0 || host.inputDir(ia) === -side) continue; // bracing: pushing away holds
      host.moveStack(ia, side * COOP.anchorSlide * B.mass * dt, 0);
    }
  }

  // Velocity: remove the speed that stretches each taut link, from bodies in the air only.
  out.length = 0;
  for (let k = 0; k + 1 < chain.length; k++) {
    const ia = chain[k]!;
    const ib = chain[k + 1]!;
    const A = host.bodies[ia]!;
    const B = host.bodies[ib]!;
    const dx = B.cx - A.cx;
    const dy = B.cy - A.cy;
    const d = dist(dx, dy);
    const taut = d >= length - 0.02;
    out.push({ a: ia, b: ib, length: d, taut });
    if (!taut || d === 0) continue;
    const nx = dx / d;
    const ny = dy / d;
    const vrel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
    if (vrel <= 0) continue;
    const airA = !A.grounded && !host.isFixed(ia);
    const airB = !B.grounded && !host.isFixed(ib);
    if (!airA && !airB) continue;
    let sa = 0;
    let sb = 0;
    if (airA && airB) {
      const ma = 1 / A.mass;
      const mb = 1 / B.mass;
      sa = ma / (ma + mb);
      sb = mb / (ma + mb);
    } else if (airA) sa = 1;
    else sb = 1;
    A.vx += nx * vrel * sa;
    A.vy += ny * vrel * sa;
    B.vx -= nx * vrel * sb;
    B.vy -= ny * vrel * sb;
    // A body the rope pulls upwards rises no faster than the haul speed.
    if (sa > 0 && ny < 0) A.vy = Math.max(A.vy, -riseCapOf(A));
    if (sb > 0 && ny > 0) B.vy = Math.max(B.vy, -riseCapOf(B));
  }

  // Hanging flags for the next step, and the widest swing.
  for (let i = 0; i < n; i++) host.bodies[i]!.hanging = false;
  for (const l of out) {
    if (!l.taut) continue;
    for (const [i, j] of [
      [l.a, l.b],
      [l.b, l.a],
    ] as const) {
      const h = host.bodies[i]!;
      const anchor = host.bodies[j]!;
      if (h.grounded || host.isFixed(i)) continue;
      if (anchor.cy >= h.cy - COOP.hangHeight) continue;
      h.hanging = true;
      // Past 70° from vertical, stop swinging further out.
      const cos = (h.cy - anchor.cy) / l.length;
      const side = h.cx - anchor.cx;
      if (cos < COOP.hangMaxCos && h.vx * side > 0) h.vx = 0;
    }
  }
}
