/**
 * The rope that ties the players together: a chain, each link a maximum distance between two
 * neighbours' body centres (a slack rope pulls nothing). Solved after every body has taken its
 * step, all bodies at once, so the same world gives the same rope on every machine.
 *
 * - Position: each taut link is shortened back to its length. The error is shared by "how easily
 *   the rope moves each end" (grip / mass): in the air 1, standing 0.35; a standing body holding a
 *   friend who hangs below it does not move for that link (it is an anchor: it only slides, see
 *   below). What one end cannot take (a wall, its haul budget) goes to the other end, so a link only
 *   stays stretched when both ends are stuck. Moves go through collisions, carrying whoever stands
 *   on the moved body. A player inside the door is a fixed point. Sweeps go both ways along the
 *   chain so a pull passes through a friend standing in the middle.
 * - Velocity: then the speed that stretches each taut link is removed, shared the same way and
 *   repeated a few times so a whole hanging chain comes to rest; a standing end only takes the
 *   horizontal part (the floor holds it).
 * - A body hauled up rises at most COOP.riseCap per second (Ruben slower); its own jump is kept.
 * - An anchor that does not brace (push away) slowly slides towards the friends hanging from it,
 *   faster the more hang below it.
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
  /** The rope moved body i by (dx, dy) towards body `by` (the referee's blame, the mantle). */
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

/** Velocity sweeps per step. */
const VELOCITY_PASSES = 4;

function riseCapOf(b: CoopController): number {
  return b.isRuben ? COOP.riseCap.ruben : COOP.riseCap.friend;
}

/** Whether `other` hangs from `b`: in the air, at least hangHeight lower. */
function hangsBelow(b: CoopController, other: CoopController): boolean {
  return !other.grounded && other.cy > b.cy + COOP.hangHeight;
}

/** How easily the rope moves body i, pulled by body `other` (0: it does not move for this link). */
function mobility(host: RopeHost, i: number, other: number): number {
  if (host.isFixed(i)) return 0;
  const b = host.bodies[i]!;
  if (!b.grounded) return COOP.grip.air / b.mass;
  // A standing anchor holds a friend who hangs below it; it only slides (anchor slide below).
  if (hangsBelow(b, host.bodies[other]!)) return 0;
  return COOP.grip.ground / b.mass;
}

/**
 * Solve the rope for one step. `chain` lists body indices in rope order; `out` receives one link
 * state per pair. `dt` is the step length (for the rise cap).
 */
export function solveRope(host: RopeHost, chain: readonly number[], length: number, dt: number, out: RopeLinkState[]): void {
  const n = host.bodies.length;
  const riseLeft = new Array<number>(n);
  const corrLeft = new Array<number>(n).fill(COOP.maxCorrection);
  for (let i = 0; i < n; i++) riseLeft[i] = Math.max(0, riseCapOf(host.bodies[i]!) * dt - host.stepRise(i));

  /** Move body i by up to c along (nx, ny) within its budgets and through collisions; returns the distance achieved. */
  const pull = (i: number, c: number, nx: number, ny: number, by: number): number => {
    if (c <= 1e-9 || host.isFixed(i)) return 0;
    let a = Math.min(c, corrLeft[i]!);
    const up = -ny * a;
    if (up > 0 && up > riseLeft[i]!) a = riseLeft[i]! / -ny;
    if (a <= 1e-9) return 0;
    const m = host.moveStack(i, nx * a, ny * a);
    const got = Math.max(0, m.dx * nx + m.dy * ny);
    if (got > 0) host.onPull?.(i, by, m.dx, m.dy);
    corrLeft[i] = corrLeft[i]! - got;
    if (m.dy < 0) riseLeft[i] = Math.max(0, riseLeft[i]! + m.dy);
    return got;
  };

  const links: Array<[number, number]> = [];
  for (let k = 0; k + 1 < chain.length; k++) links.push([chain[k]!, chain[k + 1]!]);

  const solveLink = (ia: number, ib: number): void => {
    const A = host.bodies[ia]!;
    const B = host.bodies[ib]!;
    const dx = B.cx - A.cx;
    const dy = B.cy - A.cy;
    const d = dist(dx, dy);
    if (d <= length || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const err = d - length;
    const wa = mobility(host, ia, ib);
    const wb = mobility(host, ib, ia);
    const shareA = wa + wb > 0 ? wa / (wa + wb) : 0.5;
    // A moves along +n (towards B), B along -n. What one end cannot take goes to the other.
    let ga = pull(ia, err * shareA, nx, ny, ib);
    const gb = pull(ib, err - ga, -nx, -ny, ia);
    if (ga + gb < err - 1e-9) ga += pull(ia, err - ga - gb, nx, ny, ib);
  };

  for (let pass = 0; pass < COOP.ropePasses; pass++) {
    // Alternate the sweep direction: a pull travels the whole chain in a few passes either way.
    if (pass % 2 === 0) for (const [a, b] of links) solveLink(a, b);
    else for (let k = links.length - 1; k >= 0; k--) solveLink(links[k]![0], links[k]![1]);
  }

  // An anchor that does not brace slowly slides towards the friends hanging from it.
  for (let k = 0; k < links.length; k++) {
    for (const [ia, ib, dirStep] of [
      [links[k]![0], links[k]![1], 1],
      [links[k]![1], links[k]![0], -1],
    ] as const) {
      const A = host.bodies[ia]!;
      const B = host.bodies[ib]!;
      if (!A.grounded || host.isFixed(ia) || !hangsBelow(A, B)) continue;
      const dx = B.cx - A.cx;
      const dy = B.cy - A.cy;
      if (dist(dx, dy) < length - 0.02) continue;
      const side = Math.sign(dx);
      if (side === 0 || host.inputDir(ia) === -side) continue; // bracing: pushing away holds
      // The whole hanging part of the chain below this anchor weighs on it.
      let mass = 0;
      for (let j = k + (dirStep > 0 ? 1 : 0); j >= 0 && j <= chain.length - 1; j += dirStep) {
        const h = host.bodies[chain[j]!]!;
        if (h === A) continue;
        if (h.grounded || host.isFixed(chain[j]!)) break;
        mass += h.mass;
      }
      host.moveStack(ia, side * COOP.anchorSlide * mass * dt, 0);
    }
  }

  // Velocity: remove the speed that stretches each taut link from the bodies in the air (shared by
  // mass when both are), repeated so a whole hanging chain comes to rest. A standing body keeps its
  // own speed: the position pass alone drags it, so dragging a friend is a smooth half speed.
  const vyBefore = host.bodies.map((b) => b.vy);
  for (let pass = 0; pass < VELOCITY_PASSES; pass++) {
    for (const [ia, ib] of links) {
      const A = host.bodies[ia]!;
      const B = host.bodies[ib]!;
      const dx = B.cx - A.cx;
      const dy = B.cy - A.cy;
      const d = dist(dx, dy);
      if (d < length - 0.02 || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;
      const vrel = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
      if (vrel <= 0) continue;
      const airA = !A.grounded && !host.isFixed(ia);
      const airB = !B.grounded && !host.isFixed(ib);
      if (!airA && !airB) continue;
      const wa = airA ? 1 / A.mass : 0;
      const wb = airB ? 1 / B.mass : 0;
      const sa = wa / (wa + wb);
      A.vx += nx * vrel * sa;
      A.vy += ny * vrel * sa;
      B.vx -= nx * vrel * (1 - sa);
      B.vy -= ny * vrel * (1 - sa);
    }
  }
  // The rope lifts at most at the haul speed; a body's own upward speed (a jump, a catapult) stays.
  host.bodies.forEach((b, i) => {
    if (b.vy < vyBefore[i]!) b.vy = Math.max(b.vy, Math.min(vyBefore[i]!, -riseCapOf(b)));
  });

  out.length = 0;
  for (const [ia, ib] of links) {
    const A = host.bodies[ia]!;
    const B = host.bodies[ib]!;
    const d = dist(B.cx - A.cx, B.cy - A.cy);
    out.push({ a: ia, b: ib, length: d, taut: d >= length - 0.02 });
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
