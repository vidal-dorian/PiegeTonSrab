/**
 * Camera that follows one character through a level of any width.
 * Pure logic in cells; the scene converts the result to Phaser's scroll in pixels.
 *
 * - Look-ahead: the camera shifts towards where the character is facing, so you see
 *   what is coming. The shift swings smoothly when the character turns around.
 * - Vertical dead zone: small jumps do not move the camera vertically.
 * - Smoothing is exponential and frame-rate independent.
 * - The view is clamped to the level; a level narrower than the screen is centred.
 */
import type { CameraTuning } from "./config";

export interface FollowTarget {
  /** Centre of the followed character, cells. */
  cx: number;
  cy: number;
  facing: -1 | 1;
}

export class FollowCamera {
  /** Top-left corner of the view, cells. */
  x = 0;
  y = 0;
  private lookAheadOffset = 0;
  private targetY = 0;

  constructor(
    private tuning: CameraTuning,
    private viewW: number,
    private viewH: number,
    private levelW: number,
    private levelH: number,
  ) {}

  /** Jump straight to the target, e.g. on respawn. */
  snapTo(t: FollowTarget): void {
    this.lookAheadOffset = t.facing * this.tuning.lookAhead;
    this.targetY = t.cy;
    this.x = this.clampX(t.cx + this.lookAheadOffset - this.viewW / 2);
    this.y = this.clampY(this.targetY - this.viewH / 2);
  }

  update(dt: number, t: FollowTarget): void {
    const c = this.tuning;

    this.lookAheadOffset = damp(this.lookAheadOffset, t.facing * c.lookAhead, c.lookAheadSpeed, dt);

    // Only move the vertical target once the character leaves the dead zone around it.
    if (t.cy < this.targetY - c.deadZoneY) this.targetY = t.cy + c.deadZoneY;
    else if (t.cy > this.targetY + c.deadZoneY) this.targetY = t.cy - c.deadZoneY;

    const wantX = this.clampX(t.cx + this.lookAheadOffset - this.viewW / 2);
    const wantY = this.clampY(this.targetY - this.viewH / 2);
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

/** Move `value` towards `target`, closing the gap at `speed` per second, independent of frame rate. */
function damp(value: number, target: number, speed: number, dt: number): number {
  return target + (value - target) * Math.exp(-speed * dt);
}
