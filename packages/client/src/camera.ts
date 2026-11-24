/**
 * Camera that follows one character through a level of any width.
 * Pure logic in cells; the scene converts the result to Phaser's scroll in pixels.
 *
 * - Dead zones: the character can move a little around the camera's focus point,
 *   horizontally and vertically, before the camera follows. Bouncing between two close
 *   walls or making small jumps therefore leaves the camera still.
 * - Look-ahead: the camera shifts towards where the character is running, so you see
 *   what is coming. The direction only changes after running on the ground in the new
 *   direction for a moment; in the air it never changes, so wall jumps don't swing it.
 * - Smoothing is exponential and frame-rate independent.
 * - The view is clamped to the level; a level narrower than the screen is centred.
 */
import type { CameraTuning } from "./config";

export interface FollowTarget {
  /** Centre of the followed character, cells. */
  cx: number;
  cy: number;
  /** Horizontal speed, cells/s. */
  vx: number;
  grounded: boolean;
  /** Direction the character faces; only used to place the camera on a snap. */
  facing: -1 | 1;
}

/** Below this horizontal speed (cells/s) the character counts as standing still for the look-ahead. */
const LOOK_MIN_SPEED = 1;

export class FollowCamera {
  /** Top-left corner of the view, cells. */
  x = 0;
  y = 0;
  /** Point the camera is centred on (before look-ahead); moves only when the target leaves the dead zone. */
  private focusX = 0;
  private focusY = 0;
  private lookDir: -1 | 1 = 1;
  private turnTimer = 0;
  private lookAheadOffset = 0;

  constructor(
    private tuning: CameraTuning,
    private viewW: number,
    private viewH: number,
    private levelW: number,
    private levelH: number,
  ) {}

  /** Jump straight to the target, e.g. on respawn. */
  snapTo(t: FollowTarget): void {
    this.lookDir = t.facing;
    this.turnTimer = 0;
    this.lookAheadOffset = this.lookDir * this.tuning.lookAhead;
    this.focusX = t.cx;
    this.focusY = t.cy;
    this.x = this.clampX(this.focusX + this.lookAheadOffset - this.viewW / 2);
    this.y = this.clampY(this.focusY - this.viewH / 2);
  }

  update(dt: number, t: FollowTarget): void {
    const c = this.tuning;

    // Look-ahead direction: commit to a new direction only after running that way on the ground.
    const moveDir = Math.abs(t.vx) > LOOK_MIN_SPEED ? (t.vx > 0 ? 1 : -1) : 0;
    if (t.grounded && moveDir !== 0 && moveDir !== this.lookDir) {
      this.turnTimer += dt;
      if (this.turnTimer >= c.lookAheadTurnDelay) {
        this.lookDir = moveDir;
        this.turnTimer = 0;
      }
    } else {
      this.turnTimer = 0;
    }
    this.lookAheadOffset = damp(this.lookAheadOffset, this.lookDir * c.lookAhead, c.lookAheadSpeed, dt);

    this.focusX = followDeadZone(this.focusX, t.cx, c.deadZoneX);
    this.focusY = followDeadZone(this.focusY, t.cy, c.deadZoneY);

    const wantX = this.clampX(this.focusX + this.lookAheadOffset - this.viewW / 2);
    const wantY = this.clampY(this.focusY - this.viewH / 2);
    this.x = damp(this.x, wantX, c.followSpeedX, dt);
    this.y = damp(this.y, wantY, c.followSpeedY, dt);
  }

  private clampX(x: number): number {
    if (this.levelW <= this.viewW) return (this.levelW - this.viewW) / 2;
    return Math.min(Math.max(x, 0), this.levelW - this.viewW);
  }

  private clampY(y: number): number {
    if (this.levelH <= this.viewH) return (this.levelH - this.viewH) / 2;
    return Math.min(Math.max(y, 0), this.levelH - this.viewH);
  }
}

/** Keep `focus` within `radius` of `target`, moving it as little as possible. */
function followDeadZone(focus: number, target: number, radius: number): number {
  if (target < focus - radius) return target + radius;
  if (target > focus + radius) return target - radius;
  return focus;
}

/** Move `value` towards `target`, closing the gap at `speed` per second, independent of frame rate. */
function damp(value: number, target: number, speed: number, dt: number): number {
  return target + (value - target) * Math.exp(-speed * dt);
}
