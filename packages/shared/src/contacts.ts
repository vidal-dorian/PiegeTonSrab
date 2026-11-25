/**
 * Contacts between players (decided 2026-11-24: players collide, which replaces the earlier
 * "players do not collide" rule).
 *
 * Each machine only ever moves its own character, so a contact is always resolved by the
 * player it pushes:
 * - Stomp: my character falls onto another player's head. I bounce high (my machine) and the
 *   server tells the other player's machine to slam them down and stun them.
 * - Bump: our bodies start touching sideways. Each machine sees the touch and pushes its own
 *   character away, so both fly apart with no message at all.
 *
 * Other players are seen where they were about 100 ms ago (interpolated ghosts). Contacts use
 * that position, which is what the player sees on screen: a stomp that looks right counts.
 */
export interface BodyPos {
  x: number;
  y: number;
}

export type Contact = "stomp" | "bump" | null;

/** How far below the top of the other body my feet may already be for a fall to count as a stomp, cells. */
export const STOMP_DEPTH = 0.35;
/** Bodies must overlap sideways by at least this much for a stomp, cells (no stomp on a shoulder graze). */
const STOMP_MIN_OVERLAP = 0.15;

/**
 * What happens between my body (now at `me`, at `prevY` one step earlier, moving down at `vy`)
 * and another body at `other`. Both bodies are `w` by `h` cells, positions are top-left corners.
 * `touching`: the bodies already overlapped on the previous step (a bump only fires when a
 * touch starts, so two players standing on the start cell don't push each other forever).
 */
export function contactWith(
  me: BodyPos,
  prevY: number,
  vy: number,
  other: BodyPos,
  w: number,
  h: number,
  touching: boolean,
): Contact {
  const overlapX = Math.min(me.x + w, other.x + w) - Math.max(me.x, other.x);
  if (overlapX <= 0) return null;
  // The other body is on top of me: that is its stomp (or nothing), resolved by its machine
  // and the server's "stomped" message. Never a bump, or every stomp would also shove the victim.
  if (other.y < me.y && other.y + h <= me.y + STOMP_DEPTH) return null;
  const myBottom = me.y + h;
  const wasAbove = prevY + h <= other.y + STOMP_DEPTH;
  if (vy > 0 && wasAbove && myBottom >= other.y && myBottom <= other.y + h && overlapX >= STOMP_MIN_OVERLAP) {
    return "stomp";
  }
  const overlapY = Math.min(me.y + h, other.y + h) - Math.max(me.y, other.y);
  if (overlapY > 0 && !touching) return "bump";
  return null;
}

/** Whether two bodies overlap at all. */
export function bodiesOverlap(a: BodyPos, b: BodyPos, w: number, h: number): boolean {
  return a.x < b.x + w && a.x + w > b.x && a.y < b.y + h && a.y + h > b.y;
}
