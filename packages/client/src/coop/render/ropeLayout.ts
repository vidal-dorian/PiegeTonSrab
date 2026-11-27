/**
 * Where the rope is drawn and how it shows its tension, without Phaser (ropeView.ts draws it).
 *
 * A link goes from one drawn body centre through the terrain corners it wraps (its wrap points)
 * to the other. The parts between two corners lie along the terrain: straight. The two end parts
 * share the slack (rest length minus the drawn path), each in proportion to its length, and sag
 * like a shallow catenary. Past its rest length the rope is stretched: `stretch` goes from 0 at
 * the rest length to 1 at the hard stop.
 */

export interface RopeSegment {
  /** End points (drawn body centres), cells. */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** The terrain corners the link wraps, flat x, y from end a to end b (empty: straight). */
  points: readonly number[];
}

export interface RopeShape {
  /** The polyline to stroke, flat x, y in cells. */
  line: number[];
  /** Rest length minus the drawn path, when positive: how much rope hangs loose, cells. */
  slack: number;
  /** 0 at or under the rest length, 1 at the hard stop (and past it). */
  stretch: number;
}

/** Points per sagging part. */
const SAG_POINTS = 18;
/** The deepest a part sags, cells. */
const MAX_SAG = 2.2;

/** Push the points of the part from (x0, y0) to (x1, y1), with `slack` more rope than its length, onto `out` (not its first point). */
function pushPart(out: number[], x0: number, y0: number, x1: number, y1: number, slack: number): void {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (slack <= 1e-6) {
    out.push(x1, y1);
    return;
  }
  // A hanging rope sags roughly by half the slack it could take up (a shallow catenary).
  const l = d + slack;
  const sag = Math.min(MAX_SAG, 0.55 * Math.sqrt(Math.max(0, l * l - d * d)) * 0.5);
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2 + sag;
  for (let i = 1; i <= SAG_POINTS; i++) {
    const t = i / SAG_POINTS;
    const u = 1 - t;
    out.push(u * u * x0 + 2 * u * t * mx + t * t * x1, u * u * y0 + 2 * u * t * my + t * t * y1);
  }
}

/** The drawn shape of one link: `rest` is the rope's rest length, `max` its hard stop. */
export function ropeShape(s: RopeSegment, rest: number, max: number): RopeShape {
  const p = s.points;
  const xs = [s.ax];
  const ys = [s.ay];
  for (let i = 0; i + 1 < p.length; i += 2) {
    xs.push(p[i]!);
    ys.push(p[i + 1]!);
  }
  xs.push(s.bx);
  ys.push(s.by);
  const parts = xs.length - 1;
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < parts; i++) {
    const d = Math.hypot(xs[i + 1]! - xs[i]!, ys[i + 1]! - ys[i]!);
    lengths.push(d);
    total += d;
  }
  const slack = Math.max(0, rest - total);
  // Only the end parts hang loose: the corners hold the rest against the terrain.
  const ends = parts === 1 ? lengths[0]! : lengths[0]! + lengths[parts - 1]!;
  const line = [xs[0]!, ys[0]!];
  for (let i = 0; i < parts; i++) {
    const free = parts === 1 || i === 0 || i === parts - 1;
    const share = free && ends > 0 ? (slack * lengths[i]!) / ends : 0;
    pushPart(line, xs[i]!, ys[i]!, xs[i + 1]!, ys[i + 1]!, share);
  }
  const stretch = max > rest ? Math.min(1, Math.max(0, (total - rest) / (max - rest))) : 0;
  return { line, slack, stretch };
}

/** How a link is stroked: ink, then an overlay that shows the tension. */
export interface RopeLook {
  /** Ink width, px. */
  inkWidth: number;
  /** 0: no overlay; 1: near the rest length, orange; past it, red as it stretches. */
  overlayAlpha: number;
  overlayWidth: number;
  /** 0 orange, 1 red. */
  redness: number;
  /** The hard stop is reached: the overlay covers the whole ink (an all-red rope). */
  stopped: boolean;
}

/** Within this much of the rest length the rope starts to show its tension, cells. */
export const TENSION_ZONE = 0.35;
/** A stretch from this share of the give on counts as the hard stop. */
const STOP_AT = 0.97;

/**
 * The look of a link: as before, the ink thickens a little and an orange overlay fades in over
 * the last TENSION_ZONE before the rest length; past it the rope is a stretched rubber band, the
 * ink thinning from 4 to 2.5 px with the overlay filling it and going from orange to red; at the
 * hard stop the whole rope is red.
 */
export function ropeLook(shape: RopeShape): RopeLook {
  if (shape.stretch > 0) {
    const s = shape.stretch;
    const ink = 4 - 1.5 * s;
    const stopped = s >= STOP_AT;
    return { inkWidth: ink, overlayAlpha: 1, overlayWidth: stopped ? ink : ink - 1, redness: s, stopped };
  }
  const tension = shape.slack < TENSION_ZONE ? 1 - shape.slack / TENSION_ZONE : 0;
  return { inkWidth: 3 + tension, overlayAlpha: tension > 0 ? 0.35 + 0.65 * tension : 0, overlayWidth: 1.4 + tension * 0.6, redness: 0, stopped: false };
}
