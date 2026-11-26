/**
 * The rope that ties the players together: a chain, each link a maximum distance between two
 * neighbours' body centres (a slack rope pulls nothing; it goes through the terrain, so levels
 * count 4.5 centre to centre). Solved after every body has taken its step, all bodies at once, so
 * the same world gives the same rope on every machine.
 *
 * - Corners: a link whose straight line cuts through the terrain bends over one terrain corner (a
 *   lip). An end pressed against the wall under that corner is pulled towards the corner, that is
 *   up the wall: a friend hanging against a wall below a lip is hauled straight up it, then climbs
 *   over the lip with the mantle (world.ts). With no single corner (a wall between two friends on
 *   the same floor), the link goes straight through.
 * - Position: each taut link is shortened back to its length. The error is shared by "how easily
 *   the rope moves each end" (grip / mass): in the air 1, standing 0.35. A body holding a friend
 *   who hangs below it does not move for that link when it is held itself: standing (an anchor: it
 *   only slides, see below), or hanging from a friend higher up the rope. What one end cannot take
 *   (a wall, its haul budget) goes to the other end, so a link only stays stretched when both ends
 *   are stuck. Sweeps go both ways along the chain, so a pull passes through a friend standing
 *   still in the middle (dragged like any idle friend). Moves go through collisions and carry
 *   whoever stands on the moved body; a body standing on a friend in the air (a jumping base) is
 *   pulled down with its whole pile. A player inside the door is a fixed point.
 * - Walls: a body in the air pulled into a wall slides along it as far as the rope needs, when the
 *   link is steep enough (30°) to hold it there.
 * - Nobody outruns the rope: a body pulled back against friends right behind it, or standing on a
 *   friend, takes them back too (a train), each never further than where it stood when the step
 *   began: the rope undoes this step's moves, it never pushes anyone.
 * - Haul speed: within a step the rope never brings a body higher than its haul speed x dt above
 *   where it started the step, nor above where its own move took it. Pulling a body back up after
 *   its own fall is free (a hanging body is held, not let down). The haul speed is COOP.riseCap
 *   (Ruben: slower), and no faster than what the body lifts: whoever hangs below it on taut links
 *   or stands on it (hauling a friend Ruben hangs from is slow too).
 * - Velocity: then the speed that stretches each taut link is removed from the bodies in the air,
 *   shared the same way and repeated a few times so a whole hanging chain comes to rest; a
 *   standing body keeps its own speed (the position pass alone drags it, at half speed). The rope
 *   lifts at most at the haul speed; a body's own upward speed (a jump, a catapult) is kept.
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
  /** Body i's y when it started its own move this step (after being carried by its support). */
  stepStartY(i: number): number;
  /** Body i's x when it started its own move this step (after being carried by its support). */
  stepStartX(i: number): number;
  /** The body at the bottom of the pile body i stands in (i itself when it stands on anything else or nothing). */
  pileBase(i: number): number;
  /** Whether a terrain cell is solid: the rope bends over the corners of the terrain. */
  solidCell(cx: number, cy: number): boolean;
  /** The rope moved body i by (dx, dy) towards body `by` (the referee's blame, the mantle). */
  onPull?(i: number, by: number, dx: number, dy: number): void;
}

/** One link of the chain after a solve, for drawing and for the next step's "hanging" flags. */
export interface RopeLinkState {
  /** Body indices of the two ends. */
  a: number;
  b: number;
  /** Distance between the two centres, cells (the rope's length rule, even when it bends). */
  length: number;
  taut: boolean;
  /** The terrain corner the link bends over (the lip a hauled friend climbs), or NaN for a straight link. */
  cornerX: number;
  cornerY: number;
}

/** Velocity sweeps per step. */
const VELOCITY_PASSES = 4;
/** A link this close to its length counts as taut (it holds, it pulls speed out). */
const TAUT_SLACK = 0.02;
/** The velocity pass acts on links within this much of their length (the position pass leaves them there). */
const HOLD_SLACK = 0.005;
/**
 * A body pulled into a wall slides along it as far as the rope needs only when the link is at least
 * this steep (sine, 30°): a flatter rope cannot hold a body up a wall (it would wedge it at the lip).
 */
const MIN_SLIDE = 0.5;
/** Below this cosine with the straight line, an end is pulled straight (a corner pull would barely shorten the link). */
const MIN_BEND_COS = 0.3;
/** Side contact between two bodies (a train), or with a wall, cells. */
const TOUCH = 1e-3;
/** Longest grid walk of a segment (cells crossed): far more than any link ever spans. */
const MAX_TRACE = 64;

function riseCapOf(b: CoopController): number {
  return b.isRuben ? COOP.riseCap.ruben : COOP.riseCap.friend;
}

/**
 * Standing, for the rope: on something solid. A body standing on a friend who is in the air (a
 * jumping base) moves with its pile: for the rope it is in the air.
 */
function standing(b: CoopController): boolean {
  return b.grounded && b.rooted;
}

/**
 * Whether `other` hangs from `b`: at least hangHeight lower, and in the air or as good as lifted (a
 * friend standing steeply below, 45° or more, is lifted by a taut link rather than dragged).
 */
function hangsBelow(b: CoopController, other: CoopController): boolean {
  const drop = other.cy - b.cy;
  return drop > COOP.hangHeight && (!standing(other) || drop >= Math.abs(other.cx - b.cx));
}

/** Whether body b touches solid terrain on the side its pull direction `ux` points to. */
function againstWall(host: RopeHost, b: CoopController, ux: number): boolean {
  if (ux === 0) return false;
  const edge = ux > 0 ? b.x + b.width : b.x;
  const line = Math.round(edge);
  if (Math.abs(edge - line) > TOUCH) return false;
  const col = ux > 0 ? line : line - 1;
  for (let r = Math.floor(b.y); r < b.y + b.height - 1e-6; r++) if (host.solidCell(col, r)) return true;
  return false;
}

/** Whether the segment (ax, ay)-(bx, by) crosses a solid cell (grid walk, cell by cell). */
function segmentHitsTerrain(host: RopeHost, ax: number, ay: number, bx: number, by: number): boolean {
  let cx = Math.floor(ax);
  let cy = Math.floor(ay);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  const dx = bx - ax;
  const dy = by - ay;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  // Parameter t (0 at a, 1 at b) of the next vertical and horizontal grid line.
  let tx = dx !== 0 ? ((dx > 0 ? cx + 1 : cx) - ax) / dx : 2;
  let ty = dy !== 0 ? ((dy > 0 ? cy + 1 : cy) - ay) / dy : 2;
  const stepX = dx !== 0 ? sx / dx : 2;
  const stepY = dy !== 0 ? sy / dy : 2;
  for (let k = 0; k < MAX_TRACE; k++) {
    if (host.solidCell(cx, cy)) return true;
    if (cx === ex && cy === ey) return false;
    if (tx < ty) {
      if (tx > 1) return false;
      cx += sx;
      tx += stepX;
    } else {
      if (ty > 1) return false;
      cy += sy;
      ty += stepY;
    }
  }
  return false;
}

/** Where a link bends this step: a terrain corner and the way the path turns there (0: straight). */
interface Bend {
  x: number;
  y: number;
  turn: number;
}

/** Turn of the path a -> corner -> b: the sign of the cross product (> 0 or < 0). */
function turnAt(ax: number, ay: number, cx: number, cy: number, bx: number, by: number): number {
  return (cx - ax) * (by - cy) - (cy - ay) * (bx - cx);
}

/**
 * The corner a link between centres a and b bends over, when the straight line cuts through the
 * terrain: among the convex terrain corners (one solid cell of the four around a grid point) in the
 * box spanned by the two centres, the one giving the shortest path whose two parts are both clear.
 * None found: the link goes straight (through the terrain).
 */
function findBend(host: RopeHost, ax: number, ay: number, bx: number, by: number, out: Bend): void {
  out.turn = 0;
  if (!segmentHitsTerrain(host, ax, ay, bx, by)) return;
  const x0 = Math.ceil(Math.min(ax, bx));
  const x1 = Math.floor(Math.max(ax, bx));
  const y0 = Math.ceil(Math.min(ay, by));
  const y1 = Math.floor(Math.max(ay, by));
  let best = Number.MAX_VALUE;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const tl = host.solidCell(x - 1, y - 1);
      const tr = host.solidCell(x, y - 1);
      const bl = host.solidCell(x - 1, y);
      const br = host.solidCell(x, y);
      if ((tl ? 1 : 0) + (tr ? 1 : 0) + (bl ? 1 : 0) + (br ? 1 : 0) !== 1) continue;
      const len = dist(x - ax, y - ay) + dist(bx - x, by - y);
      if (len >= best) continue;
      // The rope touches the corner from outside: test both parts against a point just off it.
      const ox = x + (tr || br ? -1e-4 : 1e-4);
      const oy = y + (bl || br ? -1e-4 : 1e-4);
      if (segmentHitsTerrain(host, ax, ay, ox, oy) || segmentHitsTerrain(host, ox, oy, bx, by)) continue;
      const turn = turnAt(ax, ay, x, y, bx, by);
      if (turn === 0) continue;
      best = len;
      out.x = x;
      out.y = y;
      out.turn = turn > 0 ? 1 : -1;
    }
  }
}

/**
 * A link measured now: its length (centre to centre) and, for each end, the direction the rope
 * pulls it (towards the other end, or towards its side of the corner when the link bends), how
 * much of a move along that direction shortens the link (the cosine with the straight line), and
 * how far it may go along it (up to the corner).
 */
interface Measure {
  len: number;
  nx: number;
  ny: number;
  ax: number;
  ay: number;
  ka: number;
  ma: number;
  bx: number;
  by: number;
  kb: number;
  mb: number;
  bent: boolean;
}

function measureLink(host: RopeHost, A: CoopController, B: CoopController, bend: Bend, m: Measure): void {
  const dx = B.cx - A.cx;
  const dy = B.cy - A.cy;
  const d = dist(dx, dy);
  m.len = d;
  m.nx = d > 0 ? dx / d : 0;
  m.ny = d > 0 ? dy / d : 0;
  m.ax = m.nx;
  m.ay = m.ny;
  m.ka = 1;
  m.ma = Number.MAX_VALUE;
  m.bx = -m.nx;
  m.by = -m.ny;
  m.kb = 1;
  m.mb = Number.MAX_VALUE;
  m.bent = false;
  if (bend.turn === 0 || d === 0) return;
  // Still wrapped: the path turns the same way at the corner (a body that came round it unwraps).
  if (turnAt(A.cx, A.cy, bend.x, bend.y, B.cx, B.cy) * bend.turn <= 0) return;
  m.bent = true;
  const la = dist(bend.x - A.cx, bend.y - A.cy);
  const lb = dist(bend.x - B.cx, bend.y - B.cy);
  if (la > 1e-9) {
    const ux = (bend.x - A.cx) / la;
    const uy = (bend.y - A.cy) / la;
    const k = ux * m.nx + uy * m.ny;
    if (k >= MIN_BEND_COS && againstWall(host, A, ux)) {
      m.ax = ux;
      m.ay = uy;
      m.ka = k;
      m.ma = la;
    }
  }
  if (lb > 1e-9) {
    const ux = (bend.x - B.cx) / lb;
    const uy = (bend.y - B.cy) / lb;
    const k = -(ux * m.nx + uy * m.ny);
    if (k >= MIN_BEND_COS && againstWall(host, B, ux)) {
      m.bx = ux;
      m.by = uy;
      m.kb = k;
      m.mb = lb;
    }
  }
}

/**
 * Solve the rope for one step. `chain` lists body indices in rope order; `out` receives one link
 * state per pair. `dt` is the step length (for the haul speed).
 */
export function solveRope(host: RopeHost, chain: readonly number[], length: number, dt: number, out: RopeLinkState[]): void {
  const bodies = host.bodies;
  const n = bodies.length;
  /** Highest y the rope may bring each body to this step (smaller y is higher). */
  const topY = new Array<number>(n);
  const corrLeft = new Array<number>(n).fill(COOP.maxCorrection);
  const links: Array<[number, number]> = [];
  for (let k = 0; k + 1 < chain.length; k++) links.push([chain[k]!, chain[k + 1]!]);
  const bends: Bend[] = links.map(([ia, ib]) => {
    const bend: Bend = { x: 0, y: 0, turn: 0 };
    findBend(host, bodies[ia]!.cx, bodies[ia]!.cy, bodies[ib]!.cx, bodies[ib]!.cy, bend);
    return bend;
  });
  const m: Measure = { len: 0, nx: 0, ny: 0, ax: 0, ay: 0, ka: 1, ma: 0, bx: 0, by: 0, kb: 1, mb: 0, bent: false };

  // A body rises no faster than what it lifts: the friends hanging below it on taut links, and
  // whoever stands on it with the friends hanging from them (hauling a friend Ruben hangs from is slow).
  const cap = bodies.map((b) => riseCapOf(b));
  for (let round = 0; round < n; round++) {
    for (let k = 0; k < links.length; k++) {
      const [ia, ib] = links[k]!;
      measureLink(host, bodies[ia]!, bodies[ib]!, bends[k]!, m);
      if (m.len < length - TAUT_SLACK) continue;
      if (hangsBelow(bodies[ia]!, bodies[ib]!)) cap[ia] = Math.min(cap[ia]!, cap[ib]!);
      if (hangsBelow(bodies[ib]!, bodies[ia]!)) cap[ib] = Math.min(cap[ib]!, cap[ia]!);
    }
    for (let i = 0; i < n; i++) {
      const base = host.pileBase(i);
      if (base !== i) cap[base] = Math.min(cap[base]!, cap[i]!);
    }
  }
  for (let i = 0; i < n; i++) topY[i] = Math.min(bodies[i]!.y, host.stepStartY(i) - cap[i]! * dt);

  const held: Measure = { ...m };
  /** Whether body i is held by a taut link to a friend level with it or higher, other than `except`. */
  const heldFromAbove = (i: number, except: number): boolean => {
    for (let k = 0; k < links.length; k++) {
      const [a, b] = links[k]!;
      if (a !== i && b !== i) continue;
      const j = a === i ? b : a;
      if (j === except || bodies[j]!.cy > bodies[i]!.cy + COOP.hangHeight) continue;
      measureLink(host, bodies[a]!, bodies[b]!, bends[k]!, held);
      if (held.len >= length - TAUT_SLACK) return true;
    }
    return false;
  };

  /**
   * How easily the rope moves body i, pulled by body `other` (0: it does not move for this link).
   * A body holding a friend who hangs below it does not move for that link when it is held itself:
   * standing (an anchor: it only slides, see below), or hanging from a friend higher up the rope.
   */
  const mobility = (i: number, other: number): number => {
    if (host.isFixed(i)) return 0;
    const b = bodies[i]!;
    const below = hangsBelow(b, bodies[other]!);
    if (!standing(b)) return below && heldFromAbove(i, other) ? 0 : COOP.grip.air / b.mass;
    return below ? 0 : COOP.grip.ground / b.mass;
  };

  /** How much higher the rope may still bring body i this step. */
  const riseRoom = (i: number): number => Math.max(0, bodies[i]!.y - topY[i]!);

  /**
   * Make room behind body i for a move of `want` along `dir` (-1 left, 1 right): the friend right
   * behind it, if it came towards i during this step (its walk, a pull), goes back (with whoever is
   * behind it), never further than where it was when the step began. Returns the room made.
   */
  const clearBehind = (i: number, dir: number, want: number, depth: number): number => {
    if (depth >= n) return 0;
    const I = bodies[i]!;
    for (let j = 0; j < n; j++) {
      if (j === i || host.isFixed(j)) continue;
      const J = bodies[j]!;
      const back = (host.stepStartX(j) - J.x) * dir;
      if (back <= 1e-9) continue;
      const gap = dir > 0 ? J.x - (I.x + I.width) : I.x - (J.x + J.width);
      if (gap < -TOUCH || gap > TOUCH) continue;
      if (!(I.y < J.y + J.height - 1e-6 && J.y < I.y + I.height - 1e-6)) continue;
      const amount = Math.min(want, back);
      clearBehind(j, dir, amount, depth + 1);
      return Math.abs(host.moveStack(j, dir * amount, 0).dx);
    }
    return 0;
  };

  /**
   * Shorten the link by up to `want` by moving body i (pulled by `by`) along its pull direction
   * (ux, uy), which shortens the link by k per cell moved, at most `max` cells; (ex, ey) is the
   * straight direction from body i to the other end. Within its budgets and through collisions.
   * Returns how much shorter the link got.
   */
  const pull = (i: number, want: number, ux: number, uy: number, k: number, max: number, ex: number, ey: number, by: number): number => {
    if (want <= 1e-9 || host.isFixed(i)) return 0;
    const b = bodies[i]!;
    const grounded = b.grounded;
    const a = Math.min(want / k, max, corrLeft[i]!);
    if (a <= 1e-9) return 0;
    // The haul speed only limits how high the rope brings it, not how far it swings it sideways.
    const wantX = ux * a;
    const wantY = uy < 0 ? Math.max(uy * a, -riseRoom(i)) : uy * a;
    const dir = wantX > 0 ? 1 : -1;
    let mx = 0;
    let my = 0;
    // Standing on a friend who walked away with it this step: the pile moves as one, the friend
    // gives that walk back first (with whoever is behind it).
    const base = host.pileBase(i);
    if (base !== i && wantX !== 0) {
      const amount = Math.min(Math.abs(wantX), (host.stepStartX(base) - bodies[base]!.x) * dir);
      if (amount > 1e-9) {
        clearBehind(base, dir, amount, 0);
        mx += host.moveStack(base, dir * amount, 0).dx;
      }
    }
    const mv = host.moveStack(i, wantX - mx, wantY);
    mx += mv.dx;
    my += mv.dy;
    // Pulled down onto a friend in the air: the whole pile comes down.
    if (wantY > 0 && my < wantY - 1e-9 && b.grounded && !b.rooted && base !== i && !bodies[base]!.grounded) {
      my += host.moveStack(base, 0, wantY - my).dy;
    }
    if (Math.abs(mx) < Math.abs(wantX) - 1e-9) {
      // Held back against friends right behind it who moved its way this step: they give their move back too.
      const room = clearBehind(i, dir, Math.abs(wantX) - Math.abs(mx), 0);
      if (room > 1e-9) mx += host.moveStack(i, dir * room, 0).dx;
      if (!grounded && Math.abs(mx) < Math.abs(wantX) - 1e-9 && Math.abs(ey) >= MIN_SLIDE) {
        // Pulled into a wall in the air: it slides along the wall as far as the rest of the pull needs.
        const rest = want - (mx * ex + my * ey);
        const dirY = ey < 0 ? -1 : 1;
        let slide = Math.min(rest / Math.abs(ey), corrLeft[i]! - dist(mx, my));
        if (dirY < 0) slide = Math.min(slide, riseRoom(i));
        if (slide > 1e-9) my += host.moveStack(i, 0, dirY * slide).dy;
      }
    }
    const moved = dist(mx, my);
    if (moved > 0) host.onPull?.(i, by, mx, my);
    corrLeft[i] = corrLeft[i]! - moved;
    return Math.max(0, mx * ex + my * ey);
  };

  const solveLink = (k: number): void => {
    const [ia, ib] = links[k]!;
    measureLink(host, bodies[ia]!, bodies[ib]!, bends[k]!, m);
    if (m.len <= length || m.len === 0) return;
    const err = m.len - length;
    const { nx, ny, ax, ay, ka, ma, bx, by, kb, mb } = m;
    const wa = mobility(ia, ib);
    const wb = mobility(ib, ia);
    const shareA = wa + wb > 0 ? wa / (wa + wb) : 0.5;
    // A moves towards B (or the corner), B towards A (or the corner). What one end cannot take goes to the other.
    let ga = pull(ia, err * shareA, ax, ay, ka, ma, nx, ny, ib);
    const gb = pull(ib, err - ga, bx, by, kb, mb, -nx, -ny, ia);
    if (ga + gb < err - 1e-9) ga += pull(ia, err - ga - gb, ax, ay, ka, Math.max(0, ma - ga / ka), nx, ny, ib);
  };

  for (let pass = 0; pass < COOP.ropePasses; pass++) {
    // Alternate the sweep direction: a pull travels the whole chain in a few passes either way.
    if (pass % 2 === 0) for (let k = 0; k < links.length; k++) solveLink(k);
    else for (let k = links.length - 1; k >= 0; k--) solveLink(k);
  }

  // An anchor that does not brace slowly slides towards the friends hanging from it.
  for (let k = 0; k < links.length; k++) {
    for (const [ia, ib, dirStep] of [
      [links[k]![0], links[k]![1], 1],
      [links[k]![1], links[k]![0], -1],
    ] as const) {
      const A = bodies[ia]!;
      const B = bodies[ib]!;
      if (!standing(A) || host.isFixed(ia) || !hangsBelow(A, B)) continue;
      measureLink(host, bodies[links[k]![0]]!, bodies[links[k]![1]]!, bends[k]!, m);
      if (m.len < length - TAUT_SLACK) continue;
      const side = Math.sign(B.cx - A.cx);
      if (side === 0 || host.inputDir(ia) === -side) continue; // bracing: pushing away holds
      // The whole hanging part of the chain below this anchor weighs on it.
      let mass = 0;
      for (let j = k + (dirStep > 0 ? 1 : 0); j >= 0 && j <= chain.length - 1; j += dirStep) {
        const h = bodies[chain[j]!]!;
        if (h === A) continue;
        if (standing(h) || host.isFixed(chain[j]!)) break;
        mass += h.mass;
      }
      host.moveStack(ia, side * COOP.anchorSlide * mass * dt, 0);
    }
  }

  /**
   * Give body b a speed of q more towards the other end of a link (straight direction (ex, ey)),
   * along its pull direction (ux, uy) whose cosine with it is k. Pressed against a wall, it cannot
   * speed into the wall: what that part cannot give goes along the wall (up or down).
   */
  const speedUp = (b: CoopController, q: number, ux: number, uy: number, k: number, ex: number, ey: number): void => {
    let dvx = (ux * q) / k;
    let dvy = (uy * q) / k;
    if (dvx !== 0 && againstWall(host, b, dvx)) {
      const side = dvx > 0 ? 1 : -1;
      const x = Math.min(Math.abs(dvx), Math.max(0, -b.vx * side)) * side;
      dvx = x;
      if (Math.abs(ey) >= MIN_SLIDE) dvy = (q - x * ex) / ey;
    }
    b.vx += dvx;
    b.vy += dvy;
  };

  // Velocity: remove the speed that stretches each taut link from the bodies in the air (shared by
  // mass when both are), repeated so a whole hanging chain comes to rest. A standing body keeps its
  // own speed: the position pass alone drags it, so dragging a friend is a smooth half speed.
  const vyBefore = bodies.map((b) => b.vy);
  for (let pass = 0; pass < VELOCITY_PASSES; pass++) {
    for (let k = 0; k < links.length; k++) {
      const [ia, ib] = links[k]!;
      const A = bodies[ia]!;
      const B = bodies[ib]!;
      measureLink(host, A, B, bends[k]!, m);
      if (m.len < length - HOLD_SLACK || m.len === 0) continue;
      // Who moves each end: itself in the air, the pile's base when it stands on a friend in the air,
      // nobody the rope can speed up when it stands on solid ground (it keeps its own speed).
      const va = host.isFixed(ia) || A.grounded ? null : A;
      const vb = host.isFixed(ib) || B.grounded ? null : B;
      if (!va && !vb) continue;
      // How fast the link gets longer; each end takes its share along its own pull direction.
      const pa = va ?? A;
      const pb = vb ?? B;
      const stretch = (pb.vx - pa.vx) * m.nx + (pb.vy - pa.vy) * m.ny;
      if (stretch <= 0) continue;
      const wa = va ? 1 / va.mass : 0;
      const wb = vb ? 1 / vb.mass : 0;
      const sa = wa / (wa + wb);
      if (va) speedUp(va, stretch * sa, m.ax, m.ay, m.ka, m.nx, m.ny);
      if (vb) speedUp(vb, stretch * (1 - sa), m.bx, m.by, m.kb, -m.nx, -m.ny);
    }
  }
  // The rope lifts at most at the haul speed; a body's own upward speed (a jump, a catapult) stays.
  bodies.forEach((b, i) => {
    if (b.vy < vyBefore[i]!) b.vy = Math.max(b.vy, Math.min(vyBefore[i]!, -cap[i]!));
  });

  out.length = 0;
  for (let k = 0; k < links.length; k++) {
    const [ia, ib] = links[k]!;
    measureLink(host, bodies[ia]!, bodies[ib]!, bends[k]!, m);
    out.push({
      a: ia,
      b: ib,
      length: m.len,
      taut: m.len >= length - TAUT_SLACK,
      cornerX: m.bent ? bends[k]!.x : NaN,
      cornerY: m.bent ? bends[k]!.y : NaN,
    });
  }

  // Hanging flags for the next step, and the widest swing.
  for (let i = 0; i < n; i++) bodies[i]!.hanging = false;
  for (const l of out) {
    if (!l.taut) continue;
    for (const [i, j] of [
      [l.a, l.b],
      [l.b, l.a],
    ] as const) {
      const h = bodies[i]!;
      const anchor = bodies[j]!;
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
