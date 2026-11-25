/**
 * Hand-written platformer character controller.
 *
 * It does not use Phaser at all: it is a plain state object advanced in fixed time steps,
 * which makes it testable and keeps the feel identical at any frame rate.
 * Units are cells and seconds; y grows downwards, so a negative vy means moving up.
 */
import { boxOverlapsSolid, cellSpan, isBouncyCell, isSolidCell, spawnCell, type Level } from "../level";
import { VINE_GRAB_HALF_WIDTH, type Vine } from "../objects";
import { deriveMovement, type DerivedMovement, type MovementTuning } from "./tuning";

/** Input for one simulation step. */
export interface StepInput {
  left: boolean;
  right: boolean;
  /** Jump button is currently held. */
  jumpHeld: boolean;
  /** Jump button went down since the previous step. */
  jumpPressed: boolean;
  /** Down (S / ↓) is held, or was tapped since the previous step: let go of the vine. Absent = false. */
  down?: boolean;
}

export const NO_INPUT: StepInput = { left: false, right: false, jumpHeld: false, jumpPressed: false, down: false };

/** How far the body is probed to detect ground and walls it is touching, cells. */
export const CONTACT_PROBE = 0.01;
/** Increment used when searching for a corner correction, cells. */
const CORNER_STEP = 0.02;

/** Swing on a vine: angular damping (1/s), widest angle from vertical (radians), shortest rope (cells). */
const SWING_DAMPING = 0.25;
const SWING_MAX_ANGLE = 1.45;
const SWING_MIN_LENGTH = 0.8;
/** After letting go of a vine, it can't be grabbed again for this long, seconds. */
const REGRAB_DELAY = 0.35;
/** After letting go, left/right input is ignored this long so the fling carries, seconds. */
const RELEASE_LOCK = 0.18;
/** Horizontal speed when letting go is capped at this many times the run speed. */
const RELEASE_MAX_SPEED = 1.9;

/** The character hanging from a vine: a rigid rope of `length` from (ax, ay). Angle 0 is straight down. */
export interface Swing {
  vineId: number;
  ax: number;
  ay: number;
  length: number;
  angle: number;
  /** Angular speed, radians per second (positive swings to the right at the bottom). */
  omega: number;
}

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
  /** Set while hanging from a vine. */
  swing: Swing | null = null;
  /** Seconds left of a stun (after being stomped on): no jump, slow run. */
  stunTimer = 0;
  /** Counts spring bounces, so the caller can tell a new one happened; lastBounceCell is the spring's cell. */
  bounceCount = 0;
  lastBounceCell = -1;

  // Protected rather than private so the co-op controller (packages/shared/src/coop) can extend
  // the same movement and save its whole state; the race mode never subclasses it.
  /** True while rising from a jump the player started; this is what the jump cut applies to. */
  protected rising = false;
  protected coyoteTimer = 0;
  protected jumpBufferTimer = 0;
  protected wallCoyoteTimer = 0;
  protected lastWallSide: -1 | 1 = 1;
  protected controlLockTimer = 0;
  protected regrabTimer = 0;
  /** Down was held at the last step: no vine is grabbed meanwhile, so the player can drop past one. */
  protected dropHeld = false;
  /** Vine let go of with Down: skipped until the body leaves its reach (inVineReach) or lands, so one tap is enough. */
  protected droppedVineId: number | null = null;

  protected derived: DerivedMovement;

  constructor(
    protected level: Level,
    protected tuning: MovementTuning,
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

  /**
   * Stand on this seat's spawn cell (see spawnCell in level.ts): each player has their own
   * cell on the spawn pad so up to five bodies start side by side, not stacked on S.
   * Seat 0 is S itself.
   */
  respawn(seat = 0): void {
    const cell = spawnCell(this.level, seat);
    this.standInCell(cell.x, cell.y);
  }

  /** Put the character standing still on the bottom of a cell, centred, with every timer cleared. */
  standInCell(cx: number, cy: number): void {
    const t = this.tuning;
    this.x = cx + (1 - t.bodyWidth) / 2;
    this.y = cy + 1 - t.bodyHeight;
    this.vx = 0;
    this.vy = 0;
    this.rising = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.wallCoyoteTimer = 0;
    this.controlLockTimer = 0;
    this.regrabTimer = 0;
    this.stunTimer = 0;
    this.swing = null;
    this.dropHeld = false;
    this.droppedVineId = null;
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
    this.regrabTimer = Math.max(0, this.regrabTimer - dt);
    this.stunTimer = Math.max(0, this.stunTimer - dt);
    // Stunned: jumps are lost, not kept for later.
    if (this.stunTimer > 0) this.jumpBufferTimer = 0;
    this.dropHeld = input.down === true;

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) this.facing = dir > 0 ? 1 : -1;

    // --- Hanging from a vine -------------------------------------------------
    // Letting go ends with the rest of this step run as a normal airborne step.
    if (this.swing) {
      if (input.down) {
        // Down drops off, keeping the swing's momentum, with no push and no steering lock.
        // It wins over a jump pressed in the same step, and works even when stunned.
        this.droppedVineId = this.swing.vineId;
        this.releaseVine(false);
        this.jumpBufferTimer = 0;
      } else if (!input.jumpPressed || this.stunTimer > 0) {
        // Stunned players can't jump off.
        this.stepSwing(dt, dir);
        return;
      } else {
        // Jump lets go, with a push upwards.
        this.releaseVine(true);
        this.jumpBufferTimer = 0;
      }
    }

    // --- Horizontal speed ---------------------------------------------------
    this.updateHorizontal(dt, dir);

    // --- Jumps --------------------------------------------------------------
    if (this.jumpBufferTimer > 0) {
      if (this.canGroundJump()) {
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
    const gravity = this.gravityNow(input);
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
    if (this.grounded) this.droppedVineId = null;
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

  /**
   * Horizontal speed for this step. During the wall-jump lock, horizontal speed is left untouched
   * so the push off the wall lands. (A hook: the co-op controller swings differently on the rope.)
   */
  protected updateHorizontal(dt: number, dir: number): void {
    const t = this.tuning;
    if (this.controlLockTimer <= 0) {
      const target = dir * t.runSpeed * (this.stunTimer > 0 ? t.stunSpeedFactor : 1);
      let accel: number;
      if (this.grounded) accel = dir !== 0 ? t.groundAccel : t.groundDecel;
      else accel = dir !== 0 ? t.airAccel : t.airDecel;
      this.vx = approach(this.vx, target, accel * dt);
    }
  }

  /** Whether a buffered jump can start from the ground now (standing, or within coyote time). */
  protected canGroundJump(): boolean {
    return this.grounded || this.coyoteTimer > 0;
  }

  /** Gravity for this step: stronger when falling, and when a jump is cut short. */
  protected gravityNow(input: StepInput): number {
    const t = this.tuning;
    let gravity = this.derived.gravity;
    if (this.vy < 0) {
      if (this.rising && !input.jumpHeld) gravity *= t.jumpCutGravityMultiplier;
    } else {
      this.rising = false;
      gravity *= t.fallGravityMultiplier;
    }
    return gravity;
  }

  // --- Pushes from outside (other players) --------------------------------------

  /**
   * Thrown upwards to `height` cells. `cuttable`: releasing jump cuts it short like a normal
   * jump (used for the bounce off another player's head, so holding jump bounces higher).
   */
  launch(height: number, cuttable: boolean): void {
    if (this.swing) this.releaseVine(false);
    this.vy = -Math.sqrt(2 * this.derived.gravity * height);
    this.rising = cuttable;
    this.grounded = false;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
  }

  /** Stomped on by another player: pushed down hard and stunned for a moment. */
  slam(speed: number, stunTime: number): void {
    if (this.swing) this.releaseVine(false);
    if (!this.grounded) this.vy = Math.max(this.vy, speed);
    this.rising = false;
    this.stunTimer = Math.max(this.stunTimer, stunTime);
    this.jumpBufferTimer = 0;
  }

  /** Bumped sideways: horizontal speed set to `vx`, input ignored for `lock` seconds. */
  shove(vx: number, lock: number): void {
    if (this.swing) return;
    this.vx = vx;
    this.controlLockTimer = Math.max(this.controlLockTimer, lock);
  }

  // --- Vines ---------------------------------------------------------------------

  /**
   * Grab the first vine the body touches in mid-air, keeping the current momentum.
   * `canHold` says whether a vine is free (only one player holds a vine at a time).
   * Returns the vine grabbed, or null.
   */
  tryGrabVine(vines: readonly Vine[], canHold: (vineId: number) => boolean): Vine | null {
    // The vine dropped with Down becomes grabbable again once the body is out of its reach.
    if (this.droppedVineId !== null) {
      const dropped = vines.find((x) => x.id === this.droppedVineId);
      if (!dropped || !this.inVineReach(dropped)) this.droppedVineId = null;
    }
    if (this.swing || this.grounded || this.regrabTimer > 0 || this.stunTimer > 0 || this.dropHeld || vines.length === 0) {
      return null;
    }
    const { bodyWidth: w, bodyHeight: h } = this.tuning;
    const cx = this.x + w / 2;
    const cy = this.y + h / 2;
    for (const v of vines) {
      if (v.id === this.droppedVineId) continue;
      if (!this.inGrabZone(v)) continue;
      if (!canHold(v.id)) continue;
      const dx = cx - v.ax;
      const dy = cy - v.ay;
      const length = Math.min(Math.max(Math.hypot(dx, dy), SWING_MIN_LENGTH), v.length);
      const angle = Math.atan2(dx, dy);
      const nx = v.ax + length * Math.sin(angle) - w / 2;
      const ny = v.ay + length * Math.cos(angle) - h / 2;
      if (boxOverlapsSolid(this.level, nx, ny, w, h)) continue;
      // Keep the part of the velocity along the swing's direction of travel.
      const omega = (this.vx * Math.cos(angle) - this.vy * Math.sin(angle)) / length;
      this.swing = { vineId: v.id, ax: v.ax, ay: v.ay, length, angle, omega };
      this.x = nx;
      this.y = ny;
      this.grounded = false;
      this.wallSide = 0;
      this.wallSliding = false;
      this.rising = false;
      this.coyoteTimer = 0;
      this.wallCoyoteTimer = 0;
      return v;
    }
    return null;
  }

  /** True if the body's centre is where vine `v` can be grabbed. */
  private inGrabZone(v: Vine): boolean {
    const { bodyWidth: w, bodyHeight: h } = this.tuning;
    const cx = this.x + w / 2;
    const cy = this.y + h / 2;
    return Math.abs(cx - v.ax) <= VINE_GRAB_HALF_WIDTH && cy >= v.ay + 0.3 && cy <= v.ay + v.length + h / 2;
  }

  /**
   * True if the body's centre is anywhere the rope of vine `v` can sweep, at any swing angle
   * (a circle around the anchor that holds the whole grab zone). Wider than inGrabZone: a
   * swinging body is usually far off the rope's resting axis, so leaving the grab zone is not
   * leaving the vine.
   */
  private inVineReach(v: Vine): boolean {
    const { bodyWidth: w, bodyHeight: h } = this.tuning;
    const cx = this.x + w / 2;
    const cy = this.y + h / 2;
    return Math.hypot(cx - v.ax, cy - v.ay) <= v.length + h / 2 + VINE_GRAB_HALF_WIDTH;
  }

  /** Let go of the vine. `jump`: with the push upwards given by the jump button. */
  releaseVine(jump: boolean): void {
    if (!this.swing) return;
    const t = this.tuning;
    const max = t.runSpeed * RELEASE_MAX_SPEED;
    this.vx = Math.max(-max, Math.min(max, this.vx * 1.1));
    if (jump) {
      this.vy = Math.min(this.vy, 0) - t.vineReleaseJump * this.derived.jumpVelocity;
      this.rising = true;
      this.controlLockTimer = RELEASE_LOCK;
    }
    this.swing = null;
    this.regrabTimer = REGRAB_DELAY;
  }

  private stepSwing(dt: number, dir: number): void {
    const s = this.swing!;
    const t = this.tuning;
    const { bodyWidth: w, bodyHeight: h } = t;
    // Rigid pendulum; left/right pushes along the swing.
    const alpha = (-this.derived.gravity * Math.sin(s.angle) + dir * t.swingPump) / s.length;
    s.omega += alpha * dt;
    s.omega *= Math.max(0, 1 - SWING_DAMPING * dt);
    let angle = s.angle + s.omega * dt;
    if (Math.abs(angle) > SWING_MAX_ANGLE) {
      angle = Math.sign(angle) * SWING_MAX_ANGLE;
      s.omega = -s.omega * 0.3;
    }
    const nx = s.ax + s.length * Math.sin(angle) - w / 2;
    const ny = s.ay + s.length * Math.cos(angle) - h / 2;
    if (boxOverlapsSolid(this.level, nx, ny, w, h)) {
      // Swung into a wall: bounce back a little and stay where we are.
      s.omega = -s.omega * 0.3;
    } else {
      s.angle = angle;
      this.x = nx;
      this.y = ny;
    }
    this.vx = s.length * s.omega * Math.cos(s.angle);
    this.vy = -s.length * s.omega * Math.sin(s.angle);
    if (Math.abs(this.vx) > 0.5) this.facing = this.vx > 0 ? 1 : -1;
    this.grounded = false;
    this.wallSide = 0;
    this.wallSliding = false;
  }

  protected startJump(): void {
    this.rising = true;
    this.grounded = false;
    this.jumpBufferTimer = 0;
    this.coyoteTimer = 0;
    this.wallCoyoteTimer = 0;
  }

  /** Move horizontally against the grid. Returns true if a wall stopped the body. */
  protected moveX(dx: number): boolean {
    if (dx === 0) return false;
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
        return true;
      }
    }
    return false;
  }

  /** Move vertically against the grid. Returns true if the floor or a ceiling stopped the body (a spring bounce counts). */
  protected moveY(dy: number): boolean {
    if (dy === 0) return false;
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
    if (!hit) return false;

    if (dy < 0 && this.tryCornerCorrection()) return false;

    this.y = dy > 0 ? row - h : row + 1;
    this.vy = 0;
    if (dy < 0) this.rising = false;

    // Landing on a spring: thrown up to the full spring height, whatever the jump button does.
    if (dy > 0) {
      for (let cx = x0; cx <= x1; cx++) {
        if (!isBouncyCell(this.level, cx, row)) continue;
        this.vy = -this.derived.springVelocity;
        this.rising = false;
        this.jumpBufferTimer = 0;
        this.coyoteTimer = 0;
        this.bounceCount++;
        this.lastBounceCell = row * this.level.width + cx;
        break;
      }
    }
    return true;
  }

  /**
   * When the head hits the very edge of a ceiling, nudge the body sideways
   * so the jump continues instead of stopping dead. Returns true if it did.
   */
  protected tryCornerCorrection(): boolean {
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

  protected senseContacts(): void {
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

export function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  if (value > target) return Math.max(value - maxDelta, target);
  return value;
}
