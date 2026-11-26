/**
 * A co-op body: the race mode's character controller (same run, jump, coyote time and jump
 * buffer), plus what the co-op mode needs:
 *
 * - it collides with dynamic colliders (other players' bodies, the level's objects), not only the
 *   terrain grid, and knows what it stands on (its support) and what its head hit;
 * - no wall slide and no wall jump (a lone player could climb what should need a tower);
 * - a carrier cannot jump, and nobody jumps off a base that is in the air;
 * - it can be moved by something else (the support it stands on, the rope) without that becoming
 *   its own speed (carry / moveBy);
 * - while hanging from the rope it swings: left/right pump the swing, there is no air brake and
 *   gravity is the same up and down;
 * - its whole state can be saved and restored (the server's snapshots, prediction).
 *
 * The world (world.ts) orchestrates a step: it carries each body by its support, steps it, then
 * solves the rope. This class only provides the primitives.
 *
 * Note on construction order: the base constructor calls respawn → standInCell → senseContacts
 * before this class's fields exist, so the overrides treat a missing `space` as "terrain only".
 */
import { approach, CharacterController, CONTACT_PROBE, type StepInput } from "../movement/controller";

/** Corner correction step, as in the race controller. */
const CORNER_STEP = 0.02;
import { boxOverlapsSolid, isSolidCell, type Level } from "../level";
import type { MovementTuning } from "../movement/tuning";
import type { Vine } from "../objects";
import {
  boxesOverlap,
  EPS,
  NO_BODY,
  spansOverlap,
  TERRAIN_SUPPORT,
  type BoxCollider,
  type CoopSpace,
  type Support,
} from "./colliders";
import { COOP } from "./coopTuning";

/** Everything needed to put a body back exactly where it was (snapshots, prediction, tests). */
export interface CoopBodyState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  grounded: boolean;
  facing: -1 | 1;
  rising: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
  bounceCount: number;
  lastBounceCell: number;
  supportKind: 0 | 1 | 2;
  supportId: number;
  supportBody: number;
  impactVy: number;
  hanging: boolean;
  hasRider: boolean;
  rooted: boolean;
  speedFactor: number;
  squashTimer: number;
}

/** How far below the top of a wall a hauled body's feet can be and still climb over it, cells. */
export const MANTLE_REACH = 0.6;
/** A mantle lifts the feet this far above the top, so the next step's fall does not catch them on the lip. */
const MANTLE_CLEAR = 0.02;

export class CoopController extends CharacterController {
  /** Index of this body in the world (its place in the rope chain). */
  index = 0;
  isRuben = false;
  /** The world this body moves in; null outside a world (then it only sees the terrain). */
  space: CoopSpace | null = null;
  /** What the body stands on after its last move, or null in the air. */
  support: Support | null = null;
  /** Id of the solid collider the head hit while rising during the last step, or -1. */
  headCollider = -1;
  /** Downward speed at the last landing, cells/s (a hard landing slams a seesaw). */
  impactVy = 0;
  /** Set by the world before each step. */
  hanging = false;
  /** Someone stands on this body: it cannot jump. */
  hasRider = false;
  /** The pile under this body rests on something solid: false when standing on a body in the air. */
  rooted = true;
  /** Run speed multiplier. */
  speedFactor = 1;
  /** Seconds left of being squashed by Ruben (cannot jump meanwhile). */
  squashTimer = 0;

  constructor(level: Level, tuning: MovementTuning) {
    super(level, tuning);
    this.support = this.grounded ? TERRAIN_SUPPORT : null;
  }

  get mass(): number {
    return this.isRuben ? COOP.rubenMass : 1;
  }

  /** Body box centre, cells. */
  get cx(): number {
    return this.x + this.tuning.bodyWidth / 2;
  }

  get cy(): number {
    return this.y + this.tuning.bodyHeight / 2;
  }

  get width(): number {
    return this.tuning.bodyWidth;
  }

  get height(): number {
    return this.tuning.bodyHeight;
  }

  /** The co-op mode has no vines. */
  override tryGrabVine(_vines: readonly Vine[], _canHold: (vineId: number) => boolean): Vine | null {
    return null;
  }

  override step(dt: number, input: StepInput): void {
    this.headCollider = -1;
    this.squashTimer = Math.max(0, this.squashTimer - dt);
    super.step(dt, input);
  }

  protected override updateHorizontal(dt: number, dir: number): void {
    const t = this.tuning;
    if (this.hanging && !this.grounded) {
      // Swinging on the rope: left/right pump the swing; only a light damping, no air brake.
      this.vx += dir * t.swingPump * dt;
      this.vx *= Math.max(0, 1 - COOP.hangDamping * dt);
      return;
    }
    const target = dir * t.runSpeed * this.speedFactor;
    let accel: number;
    if (this.grounded) accel = dir !== 0 ? t.groundAccel : t.groundDecel;
    else accel = dir !== 0 ? t.airAccel : t.airDecel;
    this.vx = approach(this.vx, target, accel * dt);
  }

  protected override canGroundJump(): boolean {
    // A carrier cannot jump (someone may have landed on it earlier in this step); nobody jumps off
    // a base in the air; a squashed friend is winded.
    if (this.hasRider || this.space?.hasRiderNow(this.index) || !this.rooted || this.squashTimer > 0) return false;
    return super.canGroundJump();
  }

  /** The race's corner correction, which must not push the body into another body or a solid thing. */
  protected override tryCornerCorrection(): boolean {
    const space = this.space;
    if (!space) return super.tryCornerCorrection();
    const max = this.tuning.cornerCorrection;
    const w = this.tuning.bodyWidth;
    const h = this.tuning.bodyHeight;
    for (let shift = CORNER_STEP; shift <= max + 1e-9; shift += CORNER_STEP) {
      for (const sign of [-1, 1]) {
        const nx = this.x + sign * shift;
        if (boxOverlapsSolid(this.level, nx, this.y, w, h)) continue;
        const blocked = space.colliders.some(
          (c) => !c.off && c.mode === "solid" && c.body !== this.index && !(c.node >= 0 && space.ridesOn(c.node, this.index)) && boxesOverlap(nx, this.y, w, h, c),
        );
        if (blocked) continue;
        this.x = nx;
        return true;
      }
    }
    return false;
  }

  protected override gravityNow(input: StepInput): number {
    if (this.hanging && !this.grounded) {
      // A pendulum: the same gravity both ways, so a passive swing slowly dies down instead of growing.
      this.rising = false;
      return this.derived.gravity;
    }
    return super.gravityNow(input);
  }

  protected override moveX(dx: number): boolean {
    if (dx === 0) return false;
    const space = this.space;
    if (!space) return super.moveX(dx);
    const w = this.tuning.bodyWidth;
    const h = this.tuning.bodyHeight;
    const x0 = this.x;
    let limit = dx;
    let hit = false;
    for (const c of space.colliders) {
      if (c.off || c.mode !== "solid" || c.body === this.index) continue;
      if (!spansOverlap(this.y, h, c.y, c.h)) continue;
      // Already overlapping (it appeared on us, or Ruben is sliding off): let them separate.
      if (boxesOverlap(x0, this.y, w, h, c)) continue;
      if (dx > 0) {
        const gap = c.x - (x0 + w);
        if (gap >= -EPS && gap < limit) {
          limit = Math.max(0, gap);
          hit = true;
        }
      } else {
        const gap = c.x + c.w - x0;
        if (gap <= EPS && gap > limit) {
          limit = Math.min(0, gap);
          hit = true;
        }
      }
    }
    if (super.moveX(limit)) return true;
    if (hit) {
      this.vx = 0;
      return true;
    }
    return false;
  }

  protected override moveY(dy: number): boolean {
    if (dy === 0) return false;
    const space = this.space;
    if (!space) return super.moveY(dy);
    const w = this.tuning.bodyWidth;
    const h = this.tuning.bodyHeight;
    const y0 = this.y;
    let limit = dy;
    let hit: BoxCollider | null = null;
    let riderBlocked = false;
    for (const c of space.colliders) {
      if (c.off || c.body === this.index) continue;
      if (!spansOverlap(this.x, w, c.x, c.w)) continue;
      if (boxesOverlap(this.x, y0, w, h, c)) continue;
      if (dy > 0) {
        if (c.body !== NO_BODY && !space.canStandOn(this.index, c.body)) continue;
        const gap = c.y - (y0 + h);
        if (gap >= -EPS && gap < limit) {
          limit = Math.max(0, gap);
          hit = c;
        }
      } else {
        if (c.mode !== "solid") continue;
        // Moving up never bumps into what stands on us: the world carries it along instead (riderRoom).
        if (c.node >= 0 && space.ridesOn(c.node, this.index)) continue;
        const gap = c.y + c.h - y0;
        if (gap <= EPS && gap > limit) {
          limit = Math.min(0, gap);
          hit = c;
        }
      }
    }
    // Moving up carries whoever stands on us: never further than they can follow (a ceiling above them).
    if (dy < 0 && limit < 0) {
      const room = space.riderRoom(this.index, -limit);
      if (room < -limit) {
        limit = -room;
        hit = null;
        riderBlocked = true;
      }
    }
    const vyBefore = this.vy;
    // The grid moves the clamped distance only, so its side effects (spring bounce, corner
    // correction) never happen beyond a dynamic contact.
    if (super.moveY(limit)) {
      if (dy > 0) this.impactVy = vyBefore;
      return true;
    }
    if (riderBlocked) {
      this.rising = false;
      this.vy = 0;
      return true;
    }
    if (!hit) return false;
    if (dy > 0) {
      this.impactVy = vyBefore;
    } else {
      this.rising = false;
      this.headCollider = hit.id;
    }
    this.vy = 0;
    return true;
  }

  protected override senseContacts(): void {
    super.senseContacts();
    // No wall slide and no wall jump in this mode: the wall jump needs a wall side or its coyote time.
    this.wallSide = 0;
    this.wallSliding = false;
    const space = this.space;
    if (!space) {
      this.support = this.grounded ? TERRAIN_SUPPORT : null;
      return;
    }
    if (this.vy < 0) {
      this.support = null;
      return;
    }
    const w = this.tuning.bodyWidth;
    const feet = this.y + this.tuning.bodyHeight;
    let best: BoxCollider | null = null;
    for (const c of space.colliders) {
      if (c.off || c.body === this.index) continue;
      if (!spansOverlap(this.x, w, c.x, c.w)) continue;
      if (c.body !== NO_BODY && !space.canStandOn(this.index, c.body)) continue;
      const gap = c.y - feet;
      if (gap < -EPS || gap > CONTACT_PROBE) continue;
      if (!best || c.id < best.id) best = c;
    }
    if (best) {
      this.grounded = true;
      this.support = { kind: "collider", id: best.id, body: best.body };
    } else {
      this.support = this.grounded ? TERRAIN_SUPPORT : null;
    }
  }

  /**
   * How far to lift the body to climb over a lip while the rope hauls it against a wall. The rope
   * pulls centre to centre, so once the hauled body's centre is level with the hauler's, its feet
   * are still under the edge: when the top of the wall on `side` is less than MANTLE_REACH above
   * its feet, with room above the edge, this returns the lift (at most `maxRise`), else 0. The
   * world does the move, through collisions and carrying riders.
   */
  mantleRise(side: -1 | 1, maxRise: number): number {
    if (this.grounded || maxRise <= 0) return 0;
    const w = this.tuning.bodyWidth;
    const h = this.tuning.bodyHeight;
    const edge = side > 0 ? this.x + w : this.x;
    const col = side > 0 ? Math.round(edge) : Math.round(edge) - 1;
    if (Math.abs(edge - (side > 0 ? col : col + 1)) > 0.02) return 0;
    const feet = this.y + h;
    for (let r = Math.ceil(feet - MANTLE_REACH); r < feet - EPS; r++) {
      if (!isSolidCell(this.level, col, r) || isSolidCell(this.level, col, r - 1)) continue;
      const rise = Math.min(feet - r + MANTLE_CLEAR, maxRise);
      if (boxOverlapsSolid(this.level, this.x, this.y - rise, w, h)) return 0;
      return rise;
    }
    return 0;
  }

  /** Re-detect ground and support after the world moved the body (rope, depenetration). */
  refreshContacts(): void {
    this.senseContacts();
    if (this.grounded) this.coyoteTimer = this.tuning.coyoteTime;
  }

  /**
   * Moved by something else (the support it stands on, the rope): collides like its own move but
   * keeps its own speed. Moves up first when going up, sideways first otherwise. Returns the
   * displacement actually achieved.
   */
  moveBy(dx: number, dy: number): { dx: number; dy: number } {
    const vx = this.vx;
    const vy = this.vy;
    const rising = this.rising;
    const impact = this.impactVy;
    const x0 = this.x;
    const y0 = this.y;
    if (dy < 0) {
      this.moveY(dy);
      this.moveX(dx);
    } else {
      this.moveX(dx);
      this.moveY(dy);
    }
    this.vx = vx;
    this.vy = vy;
    this.rising = rising;
    this.impactVy = impact;
    return { dx: this.x - x0, dy: this.y - y0 };
  }

  /** Land a body exactly in a cell (spawn), like standInCell, and clear the co-op state. */
  placeInCell(cx: number, cy: number): void {
    this.standInCell(cx, cy);
    this.headCollider = -1;
    this.impactVy = 0;
    this.hanging = false;
    this.hasRider = false;
    this.rooted = true;
    this.speedFactor = 1;
    this.squashTimer = 0;
    this.support = this.grounded ? TERRAIN_SUPPORT : null;
  }

  save(): CoopBodyState {
    const s = this.support;
    return {
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      grounded: this.grounded,
      facing: this.facing,
      rising: this.rising,
      coyoteTimer: this.coyoteTimer,
      jumpBufferTimer: this.jumpBufferTimer,
      bounceCount: this.bounceCount,
      lastBounceCell: this.lastBounceCell,
      supportKind: s === null ? 0 : s.kind === "terrain" ? 1 : 2,
      supportId: s && s.kind === "collider" ? s.id : -1,
      supportBody: s && s.kind === "collider" ? s.body : NO_BODY,
      impactVy: this.impactVy,
      hanging: this.hanging,
      hasRider: this.hasRider,
      rooted: this.rooted,
      speedFactor: this.speedFactor,
      squashTimer: this.squashTimer,
    };
  }

  load(s: CoopBodyState): void {
    this.x = s.x;
    this.y = s.y;
    this.vx = s.vx;
    this.vy = s.vy;
    this.grounded = s.grounded;
    this.facing = s.facing;
    this.rising = s.rising;
    this.coyoteTimer = s.coyoteTimer;
    this.jumpBufferTimer = s.jumpBufferTimer;
    this.bounceCount = s.bounceCount;
    this.lastBounceCell = s.lastBounceCell;
    this.support =
      s.supportKind === 0 ? null : s.supportKind === 1 ? TERRAIN_SUPPORT : { kind: "collider", id: s.supportId, body: s.supportBody };
    this.impactVy = s.impactVy;
    this.hanging = s.hanging;
    this.hasRider = s.hasRider;
    this.rooted = s.rooted;
    this.speedFactor = s.speedFactor;
    this.squashTimer = s.squashTimer;
    // Not saved: it only lives from a step's move to that step's reactions.
    this.headCollider = -1;
    // Never used in co-op, but part of the base state: keep them neutral.
    this.wallSide = 0;
    this.wallSliding = false;
    this.wallCoyoteTimer = 0;
    this.controlLockTimer = 0;
    this.regrabTimer = 0;
    this.stunTimer = 0;
    this.swing = null;
    this.dropHeld = false;
    this.droppedVineId = null;
  }
}
