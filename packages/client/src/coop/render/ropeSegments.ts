/**
 * The rope's links as the screen draws them: from the drawn body centres (between two snapshots,
 * or smoothed), through wrap points swept from the world's pose to the drawn one (wrapsForPose).
 * Taking the world's wrap points as they are drew a link straight through a terrain corner for the
 * frames where the drawn bodies had not yet let go of it, or had already passed it.
 */
import { wrapsForPose, type CoopController, type RopeHost, type RopeWraps } from "@game/shared/coop";
import type { RopeSegment } from "./ropeLayout";

/** What the drawing needs of the world. */
export interface RopeWorld extends Pick<RopeHost, "ropeSolid"> {
  readonly bodies: readonly CoopController[];
  readonly chain: readonly number[];
  readonly ropeWraps: readonly RopeWraps[];
}

/** A drawn body box, cells. */
export interface DrawnBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The links to draw for bodies drawn at `boxes` (one per body; a missing box skips its links). */
export function drawnRopeSegments(world: RopeWorld, boxes: readonly (DrawnBox | undefined)[]): RopeSegment[] {
  const out: RopeSegment[] = [];
  for (let k = 0; k + 1 < world.chain.length; k++) {
    const ia = world.chain[k]!;
    const ib = world.chain[k + 1]!;
    const a = boxes[ia];
    const b = boxes[ib];
    if (!a || !b) continue;
    const A = world.bodies[ia]!;
    const B = world.bodies[ib]!;
    const ax = a.x + a.w / 2;
    const ay = a.y + a.h / 2;
    const bx = b.x + b.w / 2;
    const by = b.y + b.h / 2;
    const points: number[] = [];
    wrapsForPose(world, world.ropeWraps[k] ?? [], A.cx, A.cy, B.cx, B.cy, ax, ay, bx, by, points);
    out.push({ ax, ay, bx, by, points });
  }
  return out;
}
