/**
 * Things a co-op body collides with besides the terrain grid: the other players' bodies, and
 * the level's moving or switching objects (gates, crates, platforms, plates...). Each one is a
 * box, either solid (blocks from every side) or a one-way top (only stops a body coming down
 * onto it, like a platform you can jump through from below).
 *
 * Every collider records how far it moved during the current step (dx, dy): whatever stands on
 * it is carried by that much before taking its own step.
 */

/** A body standing on nothing that moves: the terrain, or no support at all. */
export const NO_BODY = -1;

export interface BoxCollider {
  /** Unique within the world. Bodies use their index; objects use ids from OBJECT_COLLIDER_BASE up. */
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** solid: blocks from every side. top: a one-way platform. */
  mode: "solid" | "top";
  /** How far it moved during the current step, cells. */
  dx: number;
  dy: number;
  /** The body this collider is (an index into the world's bodies), or NO_BODY for an object. */
  body: number;
  /**
   * The world node that owns it: a body (its index) or a crate (after the bodies), or -1 for a
   * prop that only moves on its own (gates, plates, platforms...).
   */
  node: number;
  /** Switched off (an open gate, a broken floor, a body inside the door): nothing collides with it. */
  off: boolean;
}

/** Object colliders get ids from here up, so they never clash with body indices. */
export const OBJECT_COLLIDER_BASE = 100;

/** Below this, a gap or an overlap is a rounding error, cells. */
export const EPS = 1e-6;

/** What a body stands on. */
export type Support =
  | { kind: "terrain" }
  | {
      kind: "collider";
      id: number;
      /** The body it is, or NO_BODY for an object. */
      body: number;
    };

export const TERRAIN_SUPPORT: Support = { kind: "terrain" };

/** The world, as seen by one body while it moves. */
export interface CoopSpace {
  readonly colliders: readonly BoxCollider[];
  /** True if node `rider` (a body or a crate) stands, directly or through others, on node `base`. */
  ridesOn(rider: number, base: number): boolean;
  /** Whether body `lander` may stand on body `body` (false for Ruben: nobody can carry him). */
  canStandOn(lander: number, body: number): boolean;
  /** Whether something (a body or a crate) stands on body i right now. */
  hasRiderNow(i: number): boolean;
}

/** Strict overlap of two intervals (touching is not overlapping). */
export function spansOverlap(a0: number, aLen: number, b0: number, bLen: number): boolean {
  return a0 < b0 + bLen - EPS && b0 < a0 + aLen - EPS;
}

export function boxesOverlap(x: number, y: number, w: number, h: number, c: BoxCollider): boolean {
  return spansOverlap(x, w, c.x, c.w) && spansOverlap(y, h, c.y, c.h);
}
