/**
 * The rope that ties the players together: a chain of links between neighbours' body centres. A
 * link wraps around the corners of the fixed terrain (solid tiles only: platforms, gates, crates,
 * seesaws, balances and bodies never stop it) and its length is measured along that path. Shorter
 * than its rest length (COOP.ropeLength) it is slack and pulls nothing; longer, it is elastic up to
 * a hard stop at ROPE_MAX_LENGTH, where it holds dead. Solved after every body has taken its step,
 * all bodies at once, so the same world gives the same rope on every machine.
 *
 * - Wraps (sweepRope): each link keeps the ordered list of terrain corners it is wrapped around (the
 *   world saves it: it depends on history). When an end moves, the segment from it to its pivot (its
 *   wrap point next to it, or the other end) sweeps a triangle: the first convex corner inside it
 *   becomes a wrap point, and a wrap point is let go when the rope turns the other way round it
 *   (the thin triangle that letting go sweeps is swept too).
 *   The swept triangle covers the whole move, so a fast body never takes the rope through a wall.
 * - Elastic: past its rest length, a link pulls each end towards its pivot. A body in the air gets a
 *   damped spring's pull on its speed (stiffness per unit of mass, so Ruben stretches it twice as
 *   much); a body standing on something is pulled by position, a share of the stretch per step (it
 *   keeps its own speed: dragging a friend is a smooth half speed; never past the hard stop of its
 *   other link, never faster than walking; faded in as its end segment flattens past 72°). The
 *   tension is the same all along the path, but for a little viscous friction of the rope sliding
 *   round its wrap points between two ends in the air (COOP.ropePulleyDamping).
 * - Hard stop: a link longer than ROPE_MAX_LENGTH is shortened back to it. The error is shared by
 *   "how easily the rope moves each end" (grip / mass): in the air 1, standing 0.35. A body holding a
 *   friend who hangs below it does not move for that link when it is held itself: standing (an
 *   anchor: it only slides, see below), or hanging from a friend higher up the rope. What one end
 *   cannot take (a wall, its haul budget) goes to the other end, so a link only stays past its stop
 *   when both ends are stuck; but an anchor held the other way by another taut link only gives back
 *   its own move of the step, and ground beyond it at COOP.anchorGive. Sweeps go both ways along
 *   the chain, so a pull passes through a friend standing still in the middle (dragged like any idle
 *   friend). Moves go through collisions and carry whoever stands on the moved body; a body standing
 *   on a friend in the air (a jumping base) is pulled down with its whole pile. A player inside the
 *   door is a fixed point. Then the speed that stretches a link at its stop is removed from the
 *   bodies in the air.
 * - Hanging: "below" and "above" are measured from the pivot, so a friend hanging over a corner
 *   hangs from that corner, whoever holds the other end and wherever.
 * - Walls: a body in the air pulled into a wall slides along it as far as the rope needs, when its
 *   end segment is steep enough (30°) to hold it there (the spring's lift fades out below that), and
 *   the spring's press into the wall brakes it along the wall (COOP.ropeWallFriction); the spring's
 *   wall rule fades out over WALL_FADE off the wall, and its pulls into a wall are applied after the
 *   others (the wall takes the net press). A friend hanging against a wall below a lip is pulled
 *   straight up the wall towards the corner, then climbs over it with the mantle (world.ts).
 * - Nobody outruns the rope: a body pulled back against friends right behind it, or standing on a
 *   friend, takes them back too (a train), each never further than where it stood when the step
 *   began: the rope undoes this step's moves, it never pushes anyone.
 * - Haul speed: within a step the rope never brings a body higher than its haul speed x dt above
 *   where it started the step, nor above where its own move took it, and the speed it gives a body
 *   upwards is capped at that haul speed (no trampoline). Pulling a body back up after its own fall
 *   is free (a hanging body is held, not let down). The haul speed is COOP.riseCap (Ruben: slower),
 *   and no faster than what the body lifts: whoever hangs below it on taut links or stands on it.
 *   A body's own upward speed (a jump, a catapult) is kept.
 * - An anchor that does not brace (push away) slowly slides towards the friends hanging from it,
 *   faster the more hang below it.
 */
import type { CoopController } from "./coopController";
import { COOP, COOP_MOVEMENT, ROPE_MAX_LENGTH } from "./coopTuning";
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
  /** Body i's x when this step began (before its support carried it). */
  stepBeginX(i: number): number;
  /** The body at the bottom of the pile body i stands in (i itself when it stands on anything else or nothing). */
  pileBase(i: number): number;
  /** Whether body `rider` stands on body `base`, directly or not (moving the base carries it). */
  ridesOn(rider: number, base: number): boolean;
  /** Whether a cell stops bodies (terrain and springs): the walls a body pulled into slides along. */
  solidCell(cx: number, cy: number): boolean;
  /** Whether a cell is fixed terrain: the rope wraps around its corners. */
  ropeSolid(cx: number, cy: number): boolean;
  /** The rope moved body i by (dx, dy) towards body `by` (the referee's blame, the mantle). */
  onPull?(i: number, by: number, dx: number, dy: number): void;
}

/** One link of the chain after a step, for drawing and for the world's rules. */
export interface RopeLinkState {
  /** Body indices of the two ends. */
  a: number;
  b: number;
  /** Length along the path (centre, wrap points, centre), cells. */
  length: number;
  /** How far past its rest length: 0 at or under it, 1 at the hard stop. */
  stretch: number;
  /** At its rest length or longer: it holds, it pulls. */
  taut: boolean;
  /** The terrain corners it is wrapped around, flat x, y from end a to end b (empty: straight). */
  points: number[];
}

/**
 * The wrap points of one link, flat [x, y, turn, x, y, turn, ...] from end a to end b: integer
 * grid points (convex terrain corners) and the way the path turns there (+1 or -1, the sign of the
 * cross product of the path a -> b at that point when it wrapped).
 */
export type RopeWraps = number[];

/** Velocity sweeps per step (the hard stop). */
const VELOCITY_PASSES = 4;
/** A link this close to its rest length counts as taut (it holds). */
const TAUT_SLACK = 0.02;
/** The velocity pass acts on links within this much of their hard stop (the position pass leaves them there). */
const HOLD_SLACK = 0.005;
/**
 * A body pulled into a wall slides along it as far as the rope needs only when its end segment is
 * at least this steep (sine, 30°): a flatter rope cannot hold a body up a wall (it would wedge it at the lip).
 */
const MIN_SLIDE = 0.5;
/** A standing body is dragged by a stretched link only when its end segment is at least this flat (cosine): straight below, it is lifted at the hard stop. */
const MIN_DRAG_COS = 0.3;
/**
 * The drag fades in from MIN_DRAG_COS to full at this cosine (linear in it): a drag that switched on
 * at MIN_DRAG_COS moved a standing anchor by want / cos (0.2-0.3 cell) in one step as its end
 * segment crossed it, then the anchor crept back (anchorSlide) and it fired again, a sawtooth.
 */
const FULL_DRAG_COS = 0.5;
/** Side contact between two bodies (a train), or with a wall, cells. */
const TOUCH = 1e-3;
/**
 * The spring's wall rule fades out from a body touching a wall (TOUCH) to this far off it, cells.
 * A body the air brake leaves a hair off the wall (1.3e-3) while the swing of a hanging body
 * closes it: with an on/off contact, the hanging flag switched the spring's lift along the wall
 * on and off, and a body held just under a corner bobbed for ever.
 */
const WALL_FADE = 0.02;
/** Longest grid walk of a segment (cells crossed): far more than any link ever spans. */
const MAX_TRACE = 64;
/** Events (wraps and unwraps) one end can go through in one sweep. */
const SWEEP_EVENTS = 2 * COOP.ropeMaxWraps + 4;
/** Damping of the spring, 1/s per unit of mass (critical damping is 2 sqrt(stiffness)). */
const SPRING_DAMPING = 2 * COOP.ropeDamping * Math.sqrt(COOP.ropeStiffness);
/** Viscous friction of the rope sliding round its wrap points, 1/s per unit of mass. */
const PULLEY_DAMPING = COOP.ropePulleyDamping;
/**
 * A wrap point is let go only once the rope turns the other way round it by more than this (the
 * sine of about 1°): a link that runs almost straight through a corner does not wrap and unwrap it
 * every step (the pivot, and with it the mantle and the hanging rules, would flicker).
 */
const UNWRAP_SIN = 0.02;
/** How far off a corner the static path tests its segments (so a segment along a face is clear). */
const CORNER_OFF = 1e-4;

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
 * Whether `other` hangs from `b`: at least hangHeight lower than its pivot (px, py) on that link
 * (the corner it hangs over, or b's centre), and in the air or as good as lifted (a friend standing
 * steeply below, 45° or more, is lifted by a taut link rather than dragged).
 */
function hangsBelow(other: CoopController, px: number, py: number): boolean {
  const drop = other.cy - py;
  return drop > COOP.hangHeight && (!standing(other) || drop >= Math.abs(other.cx - px));
}

/**
 * How far body b is from solid terrain on the side its pull direction `ux` points to, when that is
 * under WALL_FADE (0 when touching); else Infinity.
 */
function wallGap(host: RopeHost, b: CoopController, ux: number): number {
  if (ux === 0) return Number.POSITIVE_INFINITY;
  const edge = ux > 0 ? b.x + b.width : b.x;
  const line = ux > 0 ? Math.ceil(edge - TOUCH) : Math.floor(edge + TOUCH);
  const gap = Math.max(0, (line - edge) * (ux > 0 ? 1 : -1));
  if (gap >= WALL_FADE) return Number.POSITIVE_INFINITY;
  const col = ux > 0 ? line : line - 1;
  for (let r = Math.floor(b.y); r < b.y + b.height - 1e-6; r++) if (host.solidCell(col, r)) return gap;
  return Number.POSITIVE_INFINITY;
}

/** Whether body b touches solid terrain on the side its pull direction `ux` points to. */
function againstWall(host: RopeHost, b: CoopController, ux: number): boolean {
  return wallGap(host, b, ux) <= TOUCH;
}

/** How much the spring's wall rule applies to body b pulled along `ux`: 1 touching, fading to 0 at WALL_FADE. */
function wallWeight(host: RopeHost, b: CoopController, ux: number): number {
  const gap = wallGap(host, b, ux);
  if (gap <= TOUCH) return 1;
  if (gap >= WALL_FADE) return 0;
  return (WALL_FADE - gap) / (WALL_FADE - TOUCH);
}

// --- Geometry of the wraps ------------------------------------------------------------------

/** What the wrap geometry needs of the world: where the fixed terrain is. */
export type CornerHost = Pick<RopeHost, "ropeSolid">;

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Turn of the path a -> b -> c: the sign of the cross product (> 0 or < 0, 0 straight). */
function turnAt(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
}

/** Direction of the solid cell of a convex corner, by quadrant (1 up-left, 2 up-right, 3 down-left, 4 down-right). */
const QUAD_X = [0, -1, 1, -1, 1];
const QUAD_Y = [0, -1, -1, 1, 1];

/** The quadrant of the one solid cell around grid point (x, y), or 0 when it is not exactly one (not a convex corner). */
function cornerQuadrant(host: CornerHost, x: number, y: number): number {
  let q = 0;
  let count = 0;
  if (host.ropeSolid(x - 1, y - 1)) {
    q = 1;
    count++;
  }
  if (host.ropeSolid(x, y - 1)) {
    q = 2;
    count++;
  }
  if (host.ropeSolid(x - 1, y)) {
    q = 3;
    count++;
  }
  if (host.ropeSolid(x, y)) {
    q = 4;
    count++;
  }
  return count === 1 ? q : 0;
}

/**
 * Whether the solid quarter-plane of a convex corner (quadrant q) lies on side `s` (the sign of a
 * cross product) of a line through the corner with direction (ux, uy): the line only touches the
 * terrain there. Its two edges go (dx, 0) and (0, dy) from the corner.
 */
function solidOnSide(ux: number, uy: number, q: number, s: number): boolean {
  return -uy * QUAD_X[q]! * s >= 0 && ux * QUAD_Y[q]! * s >= 0;
}

/**
 * Whether the path p -> c -> e bends around corner c with its solid cell (quadrant q) inside the
 * bend, both parts touching the terrain only at the corner: the sign of that bend (turnAt(p, c, e)),
 * or 0 when it does not (straight, a part through the terrain, or the solid cell outside).
 */
function bendAround(px: number, py: number, cx: number, cy: number, ex: number, ey: number, q: number): number {
  const s = turnAt(px, py, cx, cy, ex, ey);
  if (s === 0) return 0;
  const sg = s > 0 ? 1 : -1;
  return solidOnSide(cx - px, cy - py, q, sg) && solidOnSide(ex - cx, ey - cy, q, sg) ? sg : 0;
}

/** The first corner a moving end segment touches. */
interface Hit {
  t: number;
  x: number;
  y: number;
  /** The way the path turns there once wrapped: the sign of turnAt(pivot, corner, end just after). */
  s: number;
}

/**
 * The first convex terrain corner the segment from pivot p to a moving end touches while the end
 * goes from f to e in a straight line: the grid points inside the triangle (p, f, e) it sweeps
 * whose solid quarter-plane lies on the side the segment sweeps to (the line p -> corner only
 * touches it: a rope already through the terrain does not hook a corner on its way out); the one
 * reached first (smallest t along f -> e), on a tie the farthest from p. hit.t > 1 when none.
 */
function firstCorner(host: CornerHost, px: number, py: number, fx: number, fy: number, ex: number, ey: number, hit: Hit): void {
  hit.t = 2;
  const area = cross(fx - px, fy - py, ex - px, ey - py);
  // The end moves along its own segment: it slides the rope along itself, it touches nothing side-on.
  if (area === 0) return;
  const sg = area > 0 ? 1 : -1;
  const x0 = Math.ceil(Math.min(px, fx, ex));
  const x1 = Math.floor(Math.max(px, fx, ex));
  const y0 = Math.ceil(Math.min(py, fy, ey));
  const y1 = Math.floor(Math.max(py, fy, ey));
  let bestD = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x === px && y === py) continue;
      if (cross(fx - px, fy - py, x - px, y - py) * sg < 0) continue;
      if (cross(ex - fx, ey - fy, x - fx, y - fy) * sg < 0) continue;
      if (cross(px - ex, py - ey, x - ex, y - ey) * sg < 0) continue;
      // When the segment p -> end(t) reaches it: cross(c - p, f + t (e - f) - p) = 0. The end then
      // goes on to the side `s` of the line p -> c: the rope turns that way round the corner.
      const den = cross(x - px, y - py, ex - fx, ey - fy);
      if (den === 0) continue;
      const s = den > 0 ? 1 : -1;
      const q = cornerQuadrant(host, x, y);
      if (q === 0 || !solidOnSide(x - px, y - py, q, s)) continue;
      let t = cross(fx - px, fy - py, x - px, y - py) / den;
      t = Math.max(0, Math.min(1, t));
      const d = (x - px) * (x - px) + (y - py) * (y - py);
      if (t < hit.t - 1e-12 || (t <= hit.t + 1e-12 && d > bestD)) {
        hit.t = t;
        hit.x = x;
        hit.y = y;
        hit.s = s;
        bestD = d;
      }
    }
  }
}

const hitScratch: Hit = { t: 2, x: 0, y: 0, s: 0 };

/**
 * One end of a link moves from f to e in a straight line, the other end at o: let go of the wrap
 * points it comes round (the rope turns the other way at its pivot) and wrap the corners its segment
 * sweeps, in the order they happen. `atA`: the moving end is end a (its wrap point is the first).
 */
function sweepEnd(host: CornerHost, w: RopeWraps, atA: boolean, fx0: number, fy0: number, ex: number, ey: number, ox: number, oy: number): void {
  sweepEndFor(host, w, atA, fx0, fy0, ex, ey, ox, oy, SWEEP_EVENTS);
}

/** sweepEnd with an event budget; returns what is left of it. */
function sweepEndFor(host: CornerHost, w: RopeWraps, atA: boolean, fx0: number, fy0: number, ex: number, ey: number, ox: number, oy: number, budget: number): number {
  let fx = fx0;
  let fy = fy0;
  const hit = hitScratch;
  let events = budget;
  while (events-- > 0) {
    const np = w.length / 3;
    let px = ox;
    let py = oy;
    let tU = 2;
    if (np > 0) {
      const ip = atA ? 0 : 3 * (np - 1);
      px = w[ip]!;
      py = w[ip + 1]!;
      const turn = w[ip + 2]!;
      let qx = ox;
      let qy = oy;
      if (np > 1) {
        const iq = atA ? 3 : 3 * (np - 2);
        qx = w[iq]!;
        qy = w[iq + 1]!;
      }
      // The turn at the pivot along the path a -> b, now and at the end of the move (linear in the
      // end), counted the way it wrapped, plus the margin before it lets go.
      const margin = UNWRAP_SIN * dist(qx - px, qy - py) * dist(ex - px, ey - py);
      const f0 = (atA ? turnAt(fx, fy, px, py, qx, qy) : turnAt(qx, qy, px, py, fx, fy)) * turn + margin;
      const f1 = (atA ? turnAt(ex, ey, px, py, qx, qy) : turnAt(qx, qy, px, py, ex, ey)) * turn + margin;
      if (f1 < 0) tU = f0 <= 0 ? 0 : f0 / (f0 - f1);
    }
    firstCorner(host, px, py, fx, fy, ex, ey, hit);
    if (tU <= 1 && tU <= hit.t) {
      w.splice(atA ? 0 : w.length - 3, 3);
      fx += tU * (ex - fx);
      fy += tU * (ey - fy);
      // Let go late (the margin), the end part jumps from pivot -> released corner -> end to
      // pivot -> end: it sweeps that thin triangle as if the end went from the corner to where it
      // is. A corner in it (one lying along the same face, collinear with the released one) wraps.
      if (fx !== px || fy !== py) events = sweepEndFor(host, w, atA, px, py, fx, fy, ox, oy, events);
      continue;
    }
    if (hit.t > 1 || np >= COOP.ropeMaxWraps) return events;
    // Along a -> b: at end a the path is end -> corner -> pivot, the reverse of pivot -> corner -> end.
    const turn = atA ? -hit.s : hit.s;
    if (atA) w.splice(0, 0, hit.x, hit.y, turn);
    else w.push(hit.x, hit.y, turn);
    fx += hit.t * (ex - fx);
    fy += hit.t * (ey - fy);
  }
  return 0;
}

/**
 * Wrap and unwrap every link as its ends moved from (x0[i], y0[i]) (body centres) to where the
 * bodies are now: end a first (end b where it was), then end b (end a where it now is).
 */
export function sweepRope(host: RopeHost, chain: readonly number[], wraps: RopeWraps[], x0: readonly number[], y0: readonly number[]): void {
  const bodies = host.bodies;
  for (let k = 0; k + 1 < chain.length; k++) {
    const ia = chain[k]!;
    const ib = chain[k + 1]!;
    const A = bodies[ia]!;
    const B = bodies[ib]!;
    const w = wraps[k]!;
    const ax0 = x0[ia]!;
    const ay0 = y0[ia]!;
    const bx0 = x0[ib]!;
    const by0 = y0[ib]!;
    const ax = A.cx;
    const ay = A.cy;
    const bx = B.cx;
    const by = B.cy;
    if (ax !== ax0 || ay !== ay0) sweepEnd(host, w, true, ax0, ay0, ax, ay, bx0, by0);
    if (bx !== bx0 || by !== by0) sweepEnd(host, w, false, bx0, by0, bx, by, ax, ay);
  }
}

/**
 * The wrap points of a link drawn at another pose than the world's: its wraps `w` (the world's,
 * for ends at (fax, fay) and (fbx, fby)), swept as if end a then end b moved straight to (tax, tay)
 * and (tbx, tby), into `out` (flat x, y, no turns). A screen that draws bodies between two
 * snapshots, or smoothed, draws each link through these: the drawn rope wraps and lets go with the
 * drawn bodies instead of cutting a corner for the frames where the two disagree.
 */
export function wrapsForPose(
  host: CornerHost,
  w: RopeWraps,
  fax: number,
  fay: number,
  fbx: number,
  fby: number,
  tax: number,
  tay: number,
  tbx: number,
  tby: number,
  out: number[],
): void {
  const tmp = poseScratch;
  tmp.length = 0;
  for (let i = 0; i < w.length; i++) tmp.push(w[i]!);
  if (tax !== fax || tay !== fay) sweepEnd(host, tmp, true, fax, fay, tax, tay, fbx, fby);
  if (tbx !== fbx || tby !== fby) sweepEnd(host, tmp, false, fbx, fby, tbx, tby, tax, tay);
  // An end drawn across a corner (blended along the chord of its move, or smoothed) sweeps
  // through the terrain and misses it: then the shortest clear path, as for a placed body.
  if (!pathClear(host, tax, tay, tmp, tbx, tby)) {
    placeWraps(host, tax, tay, tbx, tby, poseFallback);
    if (pathClear(host, tax, tay, poseFallback, tbx, tby)) {
      tmp.length = 0;
      for (let i = 0; i < poseFallback.length; i++) tmp.push(poseFallback[i]!);
    }
  }
  out.length = 0;
  for (let i = 0; i < tmp.length; i += 3) out.push(tmp[i]!, tmp[i + 1]!);
}

const poseScratch: RopeWraps = [];
const poseFallback: RopeWraps = [];

/** Whether the path a -> wrap points -> b stays clear of the terrain (each part tested from just off its corners). */
function pathClear(host: CornerHost, ax: number, ay: number, w: RopeWraps, bx: number, by: number): boolean {
  let px = ax;
  let py = ay;
  for (let i = 0; i <= w.length; i += 3) {
    let qx = bx;
    let qy = by;
    if (i < w.length) {
      const q = cornerQuadrant(host, w[i]!, w[i + 1]!);
      qx = w[i]! - QUAD_X[q]! * CORNER_OFF;
      qy = w[i + 1]! - QUAD_Y[q]! * CORNER_OFF;
    }
    if (segmentHitsTerrain(host, px, py, qx, qy)) return false;
    px = qx;
    py = qy;
  }
  return true;
}

/** Whether the segment (ax, ay)-(bx, by) crosses a cell of fixed terrain (grid walk, cell by cell). */
function segmentHitsTerrain(host: CornerHost, ax: number, ay: number, bx: number, by: number): boolean {
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
    if (host.ropeSolid(cx, cy)) return true;
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

/**
 * The wraps of a link between centres a and b placed there out of the blue (a body put somewhere
 * by a test or a dev tool, a body entering the door), with no history: straight when the straight
 * line is clear of the terrain, else the shortest clear path over one or two convex corners (in
 * the box of the two centres widened by 2), else straight through.
 */
export function placeWraps(host: CornerHost, ax: number, ay: number, bx: number, by: number, out: RopeWraps): void {
  out.length = 0;
  if (!segmentHitsTerrain(host, ax, ay, bx, by)) return;
  const corners: number[] = [];
  const x0 = Math.floor(Math.min(ax, bx)) - 2;
  const x1 = Math.ceil(Math.max(ax, bx)) + 2;
  const y0 = Math.floor(Math.min(ay, by)) - 2;
  const y1 = Math.ceil(Math.max(ay, by)) + 2;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const q = cornerQuadrant(host, x, y);
      if (q !== 0) corners.push(x, y, q);
    }
  }
  // Test a segment from just off a corner (away from its solid cell), so one along a face is clear.
  const offX = (k: number) => corners[k]! - QUAD_X[corners[k + 2]!]! * CORNER_OFF;
  const offY = (k: number) => corners[k + 1]! - QUAD_Y[corners[k + 2]!]! * CORNER_OFF;
  let best = Number.MAX_VALUE;
  for (let i = 0; i < corners.length; i += 3) {
    const cx = corners[i]!;
    const cy = corners[i + 1]!;
    const s = bendAround(ax, ay, cx, cy, bx, by, corners[i + 2]!);
    if (s === 0) continue;
    const len = dist(cx - ax, cy - ay) + dist(bx - cx, by - cy);
    if (len >= best) continue;
    if (segmentHitsTerrain(host, ax, ay, offX(i), offY(i)) || segmentHitsTerrain(host, offX(i), offY(i), bx, by)) continue;
    best = len;
    out.length = 0;
    out.push(cx, cy, s);
  }
  if (out.length > 0) return;
  for (let i = 0; i < corners.length; i += 3) {
    const c1x = corners[i]!;
    const c1y = corners[i + 1]!;
    const toFirst = dist(c1x - ax, c1y - ay);
    if (toFirst >= best || segmentHitsTerrain(host, ax, ay, offX(i), offY(i))) continue;
    for (let j = 0; j < corners.length; j += 3) {
      if (j === i) continue;
      const c2x = corners[j]!;
      const c2y = corners[j + 1]!;
      const len = toFirst + dist(c2x - c1x, c2y - c1y) + dist(bx - c2x, by - c2y);
      if (len >= best) continue;
      const s1 = bendAround(ax, ay, c1x, c1y, c2x, c2y, corners[i + 2]!);
      const s2 = bendAround(c1x, c1y, c2x, c2y, bx, by, corners[j + 2]!);
      if (s1 === 0 || s2 === 0) continue;
      if (segmentHitsTerrain(host, offX(i), offY(i), offX(j), offY(j)) || segmentHitsTerrain(host, offX(j), offY(j), bx, by)) continue;
      best = len;
      out.length = 0;
      out.push(c1x, c1y, s1, c2x, c2y, s2);
    }
  }
}

// --- Measuring a link -----------------------------------------------------------------------

/** Length of the path between a link's first and last wrap points. */
function interiorLength(w: RopeWraps): number {
  let len = 0;
  for (let i = 3; i < w.length; i += 3) len += dist(w[i]! - w[i - 3]!, w[i + 1]! - w[i - 2]!);
  return len;
}

/**
 * A link measured now: its length along the path and, for each end, its pivot (the wrap point next
 * to it, or the other end), the direction the rope pulls it (towards that pivot: a move along it
 * shortens the link by as much) and how far it may go along it (up to a corner).
 */
interface Measure {
  len: number;
  ax: number;
  ay: number;
  ma: number;
  pax: number;
  pay: number;
  la: number;
  bx: number;
  by: number;
  mb: number;
  pbx: number;
  pby: number;
  lb: number;
}

function newMeasure(): Measure {
  return { len: 0, ax: 0, ay: 0, ma: 0, pax: 0, pay: 0, la: 0, bx: 0, by: 0, mb: 0, pbx: 0, pby: 0, lb: 0 };
}

function measureLink(A: CoopController, B: CoopController, w: RopeWraps, interior: number, m: Measure): void {
  if (w.length === 0) {
    const dx = B.cx - A.cx;
    const dy = B.cy - A.cy;
    const d = dist(dx, dy);
    m.len = d;
    m.la = d;
    m.lb = d;
    m.ax = d > 0 ? dx / d : 0;
    m.ay = d > 0 ? dy / d : 0;
    m.bx = -m.ax;
    m.by = -m.ay;
    m.ma = Number.MAX_VALUE;
    m.mb = Number.MAX_VALUE;
    m.pax = B.cx;
    m.pay = B.cy;
    m.pbx = A.cx;
    m.pby = A.cy;
    return;
  }
  m.pax = w[0]!;
  m.pay = w[1]!;
  m.pbx = w[w.length - 3]!;
  m.pby = w[w.length - 2]!;
  const la = dist(m.pax - A.cx, m.pay - A.cy);
  const lb = dist(m.pbx - B.cx, m.pby - B.cy);
  m.la = la;
  m.lb = lb;
  m.ax = la > 0 ? (m.pax - A.cx) / la : 0;
  m.ay = la > 0 ? (m.pay - A.cy) / la : 0;
  m.bx = lb > 0 ? (m.pbx - B.cx) / lb : 0;
  m.by = lb > 0 ? (m.pby - B.cy) / lb : 0;
  m.ma = la;
  m.mb = lb;
  m.len = la + interior + lb;
}

/** The links' state now (length along the path, stretch, wrap points), into `out`. */
export function measureRope(bodies: readonly CoopController[], chain: readonly number[], wraps: readonly RopeWraps[], out: RopeLinkState[]): void {
  const m = newMeasure();
  out.length = 0;
  const rest = COOP.ropeLength;
  for (let k = 0; k + 1 < chain.length; k++) {
    const ia = chain[k]!;
    const ib = chain[k + 1]!;
    const w = wraps[k]!;
    measureLink(bodies[ia]!, bodies[ib]!, w, interiorLength(w), m);
    const points: number[] = [];
    for (let i = 0; i < w.length; i += 3) points.push(w[i]!, w[i + 1]!);
    out.push({
      a: ia,
      b: ib,
      length: m.len,
      stretch: Math.max(0, (m.len - rest) / (ROPE_MAX_LENGTH - rest)),
      taut: m.len >= rest - TAUT_SLACK,
      points,
    });
  }
}

// --- The solve ------------------------------------------------------------------------------

/**
 * Solve the rope for one step. `chain` lists body indices in rope order, `wraps` each link's wrap
 * points (sweepRope keeps them); `out` receives one link state per pair. `dt` is the step length.
 */
export function solveRope(host: RopeHost, chain: readonly number[], wraps: readonly RopeWraps[], dt: number, out: RopeLinkState[]): void {
  const REST = COOP.ropeLength;
  const MAX = ROPE_MAX_LENGTH;
  const bodies = host.bodies;
  const n = bodies.length;
  /** Highest y the rope may bring each body to this step (smaller y is higher). */
  const topY = new Array<number>(n);
  const corrLeft = new Array<number>(n).fill(COOP.maxCorrection);
  const links: Array<[number, number]> = [];
  for (let k = 0; k + 1 < chain.length; k++) links.push([chain[k]!, chain[k + 1]!]);
  const interior = links.map((_, k) => interiorLength(wraps[k]!));
  const m = newMeasure();
  const held = newMeasure();
  const measure = (k: number, into: Measure): void => {
    const [ia, ib] = links[k]!;
    measureLink(bodies[ia]!, bodies[ib]!, wraps[k]!, interior[k]!, into);
  };

  // A body rises no faster than what it lifts: the friends hanging below it on taut links, and
  // whoever stands on it with the friends hanging from them (hauling a friend Ruben hangs from is slow).
  const cap = bodies.map((b) => riseCapOf(b));
  for (let round = 0; round < n; round++) {
    for (let k = 0; k < links.length; k++) {
      const [ia, ib] = links[k]!;
      measure(k, m);
      if (m.len < REST - TAUT_SLACK) continue;
      if (hangsBelow(bodies[ib]!, m.pbx, m.pby)) cap[ia] = Math.min(cap[ia]!, cap[ib]!);
      if (hangsBelow(bodies[ia]!, m.pax, m.pay)) cap[ib] = Math.min(cap[ib]!, cap[ia]!);
    }
    for (let i = 0; i < n; i++) {
      const base = host.pileBase(i);
      if (base !== i) cap[base] = Math.min(cap[base]!, cap[i]!);
    }
  }
  for (let i = 0; i < n; i++) topY[i] = Math.min(bodies[i]!.y, host.stepStartY(i) - cap[i]! * dt);

  /** Whether body i is held by a taut link whose pivot at i is level with it or higher, other than the link to `except`. */
  const heldFromAbove = (i: number, except: number): boolean => {
    for (let k = 0; k < links.length; k++) {
      const [a, b] = links[k]!;
      if (a !== i && b !== i) continue;
      if ((a === i ? b : a) === except) continue;
      measure(k, held);
      const py = a === i ? held.pay : held.pby;
      if (py > bodies[i]!.cy + COOP.hangHeight) continue;
      if (held.len >= REST - TAUT_SLACK) return true;
    }
    return false;
  };

  /**
   * How easily the rope moves body i, pulled by body `other` whose pivot on that link is (opx, opy)
   * (0: it does not move for this link). A body holding a friend who hangs below it does not move
   * for that link when it is held itself: standing (an anchor: it only slides, see below), or
   * hanging from a friend higher up the rope.
   */
  const mobility = (i: number, other: number, opx: number, opy: number): number => {
    if (host.isFixed(i)) return 0;
    const b = bodies[i]!;
    const below = hangsBelow(bodies[other]!, opx, opy);
    if (!standing(b)) return below && heldFromAbove(i, other) ? 0 : COOP.grip.air / b.mass;
    return below ? 0 : COOP.grip.ground / b.mass;
  };

  /** How much higher the rope may still bring body i this step. */
  const riseRoom = (i: number): number => Math.max(0, bodies[i]!.y - topY[i]!);

  const carried = newMeasure();
  /**
   * The share (0 to 1) of a move (dx, dy) of body i that the links of whoever rides on it allow:
   * moving a base carries its riders, and never takes one further than its own link's hard stop
   * (a hauled friend carrying a friend whose rope is held below does not drag it away).
   */
  const riderShare = (i: number, dx: number, dy: number): number => {
    let share = 1;
    for (let k = 0; k < links.length; k++) {
      const [a, b] = links[k]!;
      const ra = a !== i && host.ridesOn(a, i);
      const rb = b !== i && host.ridesOn(b, i);
      if (ra === rb || (ra && b === i) || (rb && a === i)) continue;
      measure(k, carried);
      if (carried.len <= REST) continue;
      const lengthen = ra ? -(dx * carried.ax + dy * carried.ay) : -(dx * carried.bx + dy * carried.by);
      if (lengthen <= 1e-12) continue;
      share = Math.min(share, Math.max(0, MAX - carried.len) / lengthen);
    }
    return share;
  };

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
   * Shorten the link by up to `want` by moving body i (pulled by `by`) along (ux, uy), which
   * shortens the link by k per cell moved, at most `max` cells; (ex, ey) is the direction towards
   * its pivot. Within its budgets and through collisions. Returns how much shorter the link got.
   */
  const pull = (i: number, want: number, ux: number, uy: number, k: number, max: number, ex: number, ey: number, by: number, maxX = Number.MAX_VALUE): number => {
    if (want <= 1e-9 || host.isFixed(i)) return 0;
    const b = bodies[i]!;
    const grounded = b.grounded;
    const a = Math.min(want / k, max, corrLeft[i]!);
    if (a <= 1e-9) return 0;
    // The haul speed only limits how high the rope brings it, not how far it swings it sideways.
    let wantX = Math.max(-maxX, Math.min(maxX, ux * a));
    let wantY = uy < 0 ? Math.max(uy * a, -riseRoom(i)) : uy * a;
    const share = riderShare(i, wantX, wantY);
    wantX *= share;
    wantY *= share;
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
        slide *= riderShare(i, 0, dirY * slide);
        if (slide > 1e-9) my += host.moveStack(i, 0, dirY * slide).dy;
      }
    }
    const moved = dist(mx, my);
    if (moved > 0) host.onPull?.(i, by, mx, my);
    corrLeft[i] = corrLeft[i]! - moved;
    return Math.max(0, mx * ex + my * ey);
  };

  /**
   * Elastic pull on the ends standing on something: a share of the stretch each step, split by
   * mobility, along the ground (the rope drags a standing body; it lifts one only at its hard stop,
   * within the haul speed). An end in the air leaves its share to the spring (below).
   */
  const relaxLink = (k: number): void => {
    const [ia, ib] = links[k]!;
    measure(k, m);
    if (m.len <= REST) return;
    const want = COOP.ropeRelax * dt * (Math.min(m.len, MAX) - REST);
    const A = bodies[ia]!;
    const B = bodies[ib]!;
    const wa = mobility(ia, ib, m.pbx, m.pby);
    const wb = mobility(ib, ia, m.pax, m.pay);
    if (wa + wb <= 0) return;
    const drag = (i: number, share: number, ux: number, uy: number, seg: number, wrapped: boolean, by: number): void => {
      const c = Math.abs(ux);
      if (c <= MIN_DRAG_COS) return;
      const fade = Math.min(1, (c - MIN_DRAG_COS) / (FULL_DRAG_COS - MIN_DRAG_COS));
      const dir = ux > 0 ? 1 : -1;
      // Never past the hard stop of the body's other link: an anchor between a walker and a
      // friend hanging below it is not dragged into that link's stop (the stop would throw it back).
      const room = otherLinkRoom(k, i, dir);
      // Never faster than walking, on top of giving back its own move of the step (a tug of war):
      // a body let down onto the floor with its link stretched glides in instead of snapping.
      const glide = Math.max(0, (host.stepBeginX(i) - bodies[i]!.x) * dir) + COOP_MOVEMENT.runSpeed * dt;
      pull(i, want * share * fade, dir, 0, c, Math.min(wrapped ? seg * c : Number.MAX_VALUE, room, glide), ux, uy, by);
    };
    const wrapped = wraps[k]!.length > 0;
    if (A.grounded && wa > 0) {
      drag(ia, wa / (wa + wb), m.ax, m.ay, m.la, wrapped, ib);
      measure(k, m);
    }
    if (B.grounded && wb > 0) drag(ib, wb / (wa + wb), m.bx, m.by, m.lb, wrapped, ia);
  };

  const other = newMeasure();
  /**
   * How far body i may move along x (`dir`) before one of its links other than link `k` reaches
   * its hard stop (a link already past it allows no move that lengthens it).
   */
  const otherLinkRoom = (k: number, i: number, dir: number): number => {
    let room = Number.MAX_VALUE;
    for (let j = 0; j < links.length; j++) {
      if (j === k) continue;
      const [a, b] = links[j]!;
      if (a !== i && b !== i) continue;
      measure(j, other);
      const lengthen = -dir * (a === i ? other.ax : other.bx);
      if (lengthen <= 1e-9) continue;
      room = Math.min(room, Math.max(0, MAX - other.len) / lengthen);
    }
    return room;
  };

  const back = newMeasure();
  /**
   * How far along x (its pull direction `ux`) the hard stop of link k may move body i, the anchor
   * of `other`. A standing body holding a friend in the air below it (pivot (opx, opy)), and held
   * the other way by another taut link, takes what the friend cannot (his haul budget) only as far
   * as it moved away from him this step (its walk, its support's carry, a drag), and gives ground
   * beyond that at most at COOP.anchorGive: its grip and its other link hold it. Anything else: no
   * limit. Without it, a chain past the stop (placed there) yanked its anchor 0.3 cell a step
   * against the walker's link, off the edge, and the whole chain fell.
   */
  const anchorGiveBack = (k: number, i: number, other: number, opx: number, opy: number, ux: number): number => {
    const b = bodies[i]!;
    const o = bodies[other]!;
    if (ux === 0 || !standing(b) || standing(o) || host.isFixed(other) || !hangsBelow(o, opx, opy)) return Number.MAX_VALUE;
    let held = false;
    for (let j = 0; j < links.length && !held; j++) {
      if (j === k) continue;
      const [a, c] = links[j]!;
      if (a !== i && c !== i) continue;
      measure(j, back);
      held = back.len >= REST - TAUT_SLACK && (a === i ? back.ax : back.bx) * ux < 0;
    }
    if (!held) return Number.MAX_VALUE;
    return Math.max(0, (host.stepBeginX(i) - b.x) * (ux > 0 ? 1 : -1) + COOP.anchorGive * dt);
  };

  /** The hard stop: shorten a link longer than MAX back to it. */
  const solveLink = (k: number): void => {
    const [ia, ib] = links[k]!;
    measure(k, m);
    if (m.len <= MAX || m.len === 0) return;
    const err = m.len - MAX;
    const { ax, ay, ma, bx, by, mb, pax, pay, pbx, pby } = m;
    const wa = mobility(ia, ib, pbx, pby);
    const wb = mobility(ib, ia, pax, pay);
    const shareA = wa + wb > 0 ? wa / (wa + wb) : 0.5;
    const xa = anchorGiveBack(k, ia, ib, pbx, pby, ax);
    const xb = anchorGiveBack(k, ib, ia, pax, pay, bx);
    // A moves towards its pivot, B towards its own. What one end cannot take goes to the other.
    let ga = pull(ia, err * shareA, ax, ay, 1, ma, ax, ay, ib, xa);
    const gb = pull(ib, err - ga, bx, by, 1, mb, bx, by, ia, xb);
    if (ga + gb < err - 1e-9) ga += pull(ia, err - ga - gb, ax, ay, 1, Math.max(0, ma - ga), ax, ay, ib, xa);
  };

  // Alternate the sweep direction: a pull travels the whole chain in a few passes either way.
  for (let k = 0; k < links.length; k++) relaxLink(k);
  for (let pass = 0; pass < COOP.ropePasses; pass++) {
    if (pass % 2 === 0) for (let k = 0; k < links.length; k++) solveLink(k);
    else for (let k = links.length - 1; k >= 0; k--) solveLink(k);
  }

  // An anchor that does not brace slowly slides towards the friends hanging from it (towards its pivot).
  for (let k = 0; k < links.length; k++) {
    for (const [ia, ib, dirStep] of [
      [links[k]![0], links[k]![1], 1],
      [links[k]![1], links[k]![0], -1],
    ] as const) {
      const A = bodies[ia]!;
      const B = bodies[ib]!;
      if (!standing(A) || host.isFixed(ia)) continue;
      measure(k, m);
      const aIsA = dirStep > 0;
      if (!hangsBelow(B, aIsA ? m.pbx : m.pax, aIsA ? m.pby : m.pay)) continue;
      if (m.len < REST - TAUT_SLACK) continue;
      const side = Math.sign((aIsA ? m.pax : m.pbx) - A.cx);
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
   * Give body b a speed of q more along its pull direction (ux, uy). Pressed against a wall, it
   * cannot speed into the wall: what that part cannot give goes along the wall (up or down).
   */
  const speedUp = (b: CoopController, q: number, ux: number, uy: number): void => {
    let dvx = ux * q;
    let dvy = uy * q;
    if (dvx !== 0 && againstWall(host, b, dvx)) {
      const side = dvx > 0 ? 1 : -1;
      const x = Math.min(Math.abs(dvx), Math.max(0, -b.vx * side)) * side;
      dvx = x;
      if (Math.abs(uy) >= MIN_SLIDE) dvy = (q - x * ux) / uy;
    }
    b.vx += dvx;
    b.vy += dvy;
  };

  /**
   * The spring's pull on body b in the air: q more speed along its pull direction (ux, uy), as a
   * force. Pressed against a wall, the wall takes the part into it (a force is not redirected:
   * only the part along the wall moves the body), and that press brakes the body's speed along
   * the wall (COOP.ropeWallFriction): a body held against a wall just under a corner settles
   * instead of bobbing (nothing else damps a move along the wall when the rope pulls nearly flat).
   */
  const springUp = (b: CoopController, q: number, ux: number, uy: number): void => {
    let dvx = ux * q;
    let dvy = uy * q;
    let press = 0;
    const w = dvx !== 0 ? wallWeight(host, b, dvx) : 0;
    if (w > 0) {
      const side = dvx > 0 ? 1 : -1;
      const x = Math.min(Math.abs(dvx), Math.max(0, -b.vx * side)) * side;
      // Along the wall as far as the rope needs (as speedUp), fading out below MIN_SLIDE instead
      // of stopping there: a jump in the lift as the end segment crosses 30° drove a bob. And
      // blended in by how close the wall is (wallWeight), not switched by a contact test.
      const lift = ((q - x * ux) * uy) / Math.max(uy * uy, MIN_SLIDE * MIN_SLIDE);
      press = w * Math.abs(dvx - x);
      dvx += w * (x - dvx);
      dvy += w * (lift - dvy);
    }
    b.vx += dvx;
    b.vy += dvy;
    if (press > 0) b.vy *= 1 - Math.min(1, COOP.ropeWallFriction * press);
  };

  /** Spring pulls into a wall, applied after the others: [body, q, ux, uy]. */
  const wallPulls: Array<[CoopController, number, number, number]> = [];
  const springOrDefer = (b: CoopController, q: number, ux: number, uy: number): void => {
    if (ux !== 0 && wallGap(host, b, ux) < WALL_FADE) wallPulls.push([b, q, ux, uy]);
    else springUp(b, q, ux, uy);
  };

  const vyBefore = bodies.map((b) => b.vy);

  // The spring: a stretched link pulls each end in the air towards its pivot, the same tension all
  // along the path, damped by how fast the path gets longer. Ends standing on something were pulled
  // by position above; they keep their own speed. A pull into a wall the body is at is applied
  // after the others: the wall takes what the net pull presses into it, so one link pulling into the
  // wall does not leave another's pull away from it unopposed (that kicked a body off the wall).
  wallPulls.length = 0;
  for (let k = 0; k < links.length; k++) {
    const [ia, ib] = links[k]!;
    measure(k, m);
    if (m.len <= REST) continue;
    const A = bodies[ia]!;
    const B = bodies[ib]!;
    const fixedA = host.isFixed(ia);
    const fixedB = host.isFixed(ib);
    const airA = !fixedA && !A.grounded;
    const airB = !fixedB && !B.grounded;
    if (!airA && !airB) continue;
    const rateA = fixedA ? 0 : -(A.vx * m.ax + A.vy * m.ay);
    const rateB = fixedB ? 0 : -(B.vx * m.bx + B.vy * m.by);
    const tension = COOP.ropeStiffness * (Math.min(m.len, MAX) - REST) + SPRING_DAMPING * (rateA + rateB);
    // Over corners, a little friction: the rope sliding round them between two ends in the air
    // (one going down as the other goes up, the length unchanged) is braked, so two friends on
    // either side of a block settle instead of seesawing for ever. A standing end's own move
    // does not count (it pulls by position; hauling over a block is unchanged).
    const slip = wraps[k]!.length > 0 ? PULLEY_DAMPING * ((airA ? rateA : 0) - (airB ? rateB : 0)) : 0;
    const forceA = Math.max(0, tension + slip);
    const forceB = Math.max(0, tension - slip);
    if (airA && forceA > 0) springOrDefer(A, (forceA * dt) / A.mass, m.ax, m.ay);
    if (airB && forceB > 0) springOrDefer(B, (forceB * dt) / B.mass, m.bx, m.by);
  }
  for (const [b, q, ux, uy] of wallPulls) springUp(b, q, ux, uy);

  // At the hard stop: remove the speed that stretches each link from the bodies in the air (shared
  // by mass when both are), repeated so a whole hanging chain stops.
  for (let pass = 0; pass < VELOCITY_PASSES; pass++) {
    for (let k = 0; k < links.length; k++) {
      const [ia, ib] = links[k]!;
      const A = bodies[ia]!;
      const B = bodies[ib]!;
      measure(k, m);
      if (m.len < MAX - HOLD_SLACK || m.len === 0) continue;
      // Who moves each end: itself in the air; nobody the rope can speed up when it stands on
      // something (it keeps its own speed).
      const va = host.isFixed(ia) || A.grounded ? null : A;
      const vb = host.isFixed(ib) || B.grounded ? null : B;
      if (!va && !vb) continue;
      // How fast the path gets longer; each end takes its share along its own pull direction.
      const stretch = -(A.vx * m.ax + A.vy * m.ay) - (B.vx * m.bx + B.vy * m.by);
      if (stretch <= 0) continue;
      const wa = va ? 1 / va.mass : 0;
      const wb = vb ? 1 / vb.mass : 0;
      const sa = wa / (wa + wb);
      if (va) speedUp(va, stretch * sa, m.ax, m.ay);
      if (vb) speedUp(vb, stretch * (1 - sa), m.bx, m.by);
    }
  }
  // The rope lifts at most at the haul speed; a body's own upward speed (a jump, a catapult) stays.
  bodies.forEach((b, i) => {
    if (b.vy < vyBefore[i]!) b.vy = Math.max(b.vy, Math.min(vyBefore[i]!, -cap[i]!));
  });

  measureRope(bodies, chain, wraps, out);

  // Hanging flags for the next step, and the widest swing (both measured from the pivot).
  for (let i = 0; i < n; i++) bodies[i]!.hanging = false;
  for (let k = 0; k < out.length; k++) {
    const l = out[k]!;
    if (!l.taut) continue;
    measure(k, m);
    for (const [i, px, py] of [
      [l.a, m.pax, m.pay],
      [l.b, m.pbx, m.pby],
    ] as const) {
      const h = bodies[i]!;
      if (h.grounded || host.isFixed(i)) continue;
      if (py >= h.cy - COOP.hangHeight) continue;
      h.hanging = true;
      // Past 70° from vertical, stop swinging further out.
      const seg = dist(h.cx - px, h.cy - py);
      const cos = (h.cy - py) / seg;
      const side = h.cx - px;
      if (cos < COOP.hangMaxCos && h.vx * side > 0) h.vx = 0;
    }
  }
}
