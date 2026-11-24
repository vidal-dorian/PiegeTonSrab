/**
 * Hand-written platformer character controller.
 *
 * It does not use Phaser at all: it is a plain state object advanced in fixed time steps,
 * which makes it testable and keeps the feel identical at any frame rate.
 * Units are cells and seconds; y grows downwards, so a negative vy means moving up.
 */
import { boxOverlapsSolid, cellSpan, isSolidCell, type Level } from "@game/shared";
import { deriveMovement, type DerivedMovement, type MovementTuning } from "../config";

/** Input for one simulation step. */
export interface StepInput {
  left: boolean;
  right: boolean;
  /** Jump button is currently held. */
  jumpHeld: boolean;
  /** Jump button went down since the previous step. */
  jumpPressed: boolean;
}

export const NO_INPUT: StepInput = { left: false, right: false, jumpHeld: false, jumpPressed: false };

/** How far the body is probed to detect ground and walls it is touching, cells. */
const CONTACT_PROBE = 0.01;
/** Increment used when searching for a corner correction, cells. */
const CORNER_STEP = 0.02;

export class CharacterController {
  /** Top-left corner of the body, cells. */
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;

  grounded = false;
  /** -1 if touching a wall on the left, 1 on the right, 0 otherwise. Only meaningful in the air. */
  wallSide: -1 | 0 | 1 = 0;
  wallSliding = false;
  /** Last horizontal direction pressed or moved, used by the camera look-ahead. */
  facing: -1 | 1 = 1;

  /** True while rising from a jump the player started; this is what the jump cut applies to. */
  private rising = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private wallCoyoteTimer = 0;
  private lastWallSide: -1 | 1 = 1;
  private controlLockTimer = 0;

  private derived: DerivedMovement;

  constructor(
    private level: Level,
    private tuning: MovementTuning,
  ) {
    this.derived = deriveMovement(tuning);
    this.respawn();
  }

  /** Call after changing any tuning value. */
  retune(): void {
    this.derived = deriveMovement(this.tuning);
  }

  /** Swap the collision grid (e.g. after a platform was placed) without moving the character. */
  replaceLevel(level: Level): void {
    this.level = level;
    this.senseContacts();
  }

  respawn(): void {
    const t = this.tuning;
    // Stand on the bottom of the start cell, centred horizontally.
    this.x = this.level.start.x + (1 - t.bodyWidth) / 2;
    this.y = this.level.start.y + 1 - t.bodyHeight;
    this.vx = 0;
    this.vy = 0;
    this.rising = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wallCoyoteTimer = 0;
    this.controlLockTimer = 0;
    this.facing = 1;
    this.senseContacts();
  }

  /** True once the body has fallen out of the bottom of the level. */
  get fellOut(): boolean {
    return this.y > this.level.height + 1;
  }

  step(dt: number, input: StepInput): void {
    const t = this.tuning;
    const d = this.derived;

    // --- Timers -------------------------------------------------------------
    this.jumpBufferTimer = input.jumpPressed ? t.jumpBufferTime : Math.max(0, this.jumpBufferTimer - dt);
    this.controlLockTimer = Math.max(0, this.controlLockTimer - dt);

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) this.facing = dir > 0 ? 1 : -1;

    // --- Horizontal speed ---------------------------------------------------
    // During the wall-jump lock, horizontal speed is left untouched so the push off the wall lands.
    if (this.controlLockTimer <= 0) {
      const target = dir * t.runSpeed;
      let accel: number;
      if (this.grounded) accel = dir !== 0 ? t.groundAccel : t.groundDecel;
      else accel = dir !== 0 ? t.airAccel : t.airDecel;
      this.vx = approach(this.vx, target, accel * dt);
    }

    // --- Jumps --------------------------------------------------------------
    if (this.jumpBufferTimer > 0) {
      if (this.grounded || this.coyoteTimer > 0) {
        this.vy = -d.jumpVelocity;
        this.startJump();
      } else if (this.wallSide !== 0 || this.wallCoyoteTimer > 0) {
        const side = this.wallSide !== 0 ? this.wallSide : this.lastWallSide;
        this.vy = -d.wallJumpVelocity;
        this.vx = -side * t.wallJumpSpeedX;
        this.facing = side === 1 ? -1 : 1;
        this.controlLockTimer = t.wallJumpControlLock;
        this.startJump();
      }
    }

    // --- Gravity ------------------------------------------------------------
    let gravity = d.gravity;
    if (this.vy < 0) {
      if (this.rising && !input.jumpHeld) gravity *= t.jumpCutGravityMultiplier;
    } else {
      this.rising = false;
      gravity *= t.fallGravityMultiplier;
    }
    const vyBefore = this.vy;
    this.vy += gravity * dt;

    // Wall slide: falling, in the air, pressing towards a wall we touch.
    this.wallSliding = !this.grounded && this.vy > 0 && this.wallSide !== 0 && dir === this.wallSide;
    const maxFall = this.wallSliding ? t.wallSlideSpeed : t.maxFallSpeed;
    if (this.vy > maxFall) this.vy = maxFall;

    // --- Move and collide, one axis at a time ------------------------------
    this.moveX(this.vx * dt);
    // Average of the speeds before and after gravity: exact under constant gravity,
    // so a jump tuned to 3 cells really peaks at 3 cells.
    this.moveY(((vyBefore + this.vy) / 2) * dt);

    // --- Contacts and grace timers -----------------------------------------
    this.senseContacts();
    if (this.grounded) {
      this.coyoteTimer = t.coyoteTime;
      this.rising = false;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }
    if (!this.grounded && this.wallSide !== 0) {
      this.wallCoyoteTimer = t.wallCoyoteTime;
      this.lastWallSide = this.wallSide;
    } else {
      this.wallCoyoteTimer = Math.max(0, this.wallCoyoteTimer - dt);
    }
  }

  private startJump(): void {
    this.rising = true;
    this.grounded = false;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.wallCoyoteTimer = 0;
  }

  private moveX(dx: number): void {
    if (dx === 0) return;
    const { bodyWidth: w, bodyHeight: h } = this.tuning;
    this.x += dx;
    const [y0, y1] = cellSpan(this.y, h);
    const [x0, x1] = cellSpan(this.x, w);
    // Steps are much shorter than a cell, so only the leading column can newly overlap.
    const col = dx > 0 ? x1 : x0;
    for (let cy = y0; cy <= y1; cy++) {
      if (isSolidCell(this.level, col, cy)) {
        this.x = dx > 0 ? col - w : col + 1;
        this.vx = 0;
        return;
      }
    }
  }

  private moveY(dy: number): void {
    if (dy === 0) return;
    const { bodyWidth: w, bodyHeight: h } = this.tuning;
    this.y += dy;
    const [x0, x1] = cellSpan(this.x, w);
    const [y0, y1] = cellSpan(this.y, h);
    const row = dy > 0 ? y1 : y0;
    let hit = false;
    for (let cx = x0; cx <= x1; cx++) {
      if (isSolidCell(this.level, cx, row)) {
        hit = true;
        break;
      }
    }
    if (!hit) return;

    if (dy < 0 && this.tryCornerCorrection()) return;

    this.y = dy > 0 ? row - h : row + 1;
    this.vy = 0;
    if (dy < 0) this.rising = false;
  }

  /**
   * When the head hits the very edge of a ceiling, nudge the body sideways
   * so the jump continues instead of stopping dead. Returns true if it did.
   */
  private tryCornerCorrection(): boolean {
    const max = this.tuning.cornerCorrection;
    const { bodyWidth: w, bodyHeight: h } = this.tuning;
    for (let shift = CORNER_STEP; shift <= max + 1e-9; shift += CORNER_STEP) {
      for (const sign of [-1, 1]) {
        const nx = this.x + sign * shift;
        if (!boxOverlapsSolid(this.level, nx, this.y, w, h)) {
          this.x = nx;
          return true;
        }
      }
    }
    return false;
  }

  private senseContacts(): void {
    const { bodyWidth: w, bodyHeight: h } = this.tuning;
    this.grounded = this.vy >= 0 && boxOverlapsSolid(this.level, this.x, this.y + CONTACT_PROBE, w, h);
    if (this.grounded) {
      this.wallSide = 0;
      return;
    }
    if (boxOverlapsSolid(this.level, this.x - CONTACT_PROBE, this.y, w, h)) this.wallSide = -1;
    else if (boxOverlapsSolid(this.level, this.x + CONTACT_PROBE, this.y, w, h)) this.wallSide = 1;
    else this.wallSide = 0;
  }
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  if (value > target) return Math.max(value - maxDelta, target);
  return value;
}
