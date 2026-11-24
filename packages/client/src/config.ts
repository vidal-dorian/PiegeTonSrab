/**
 * Every tuning value for movement and camera lives here.
 * Units: cells (1 cell = CELL_PX pixels) and seconds.
 * The in-game tuning panel edits a live copy of these values; once a set feels right,
 * use "Copier la config" in the panel and paste the result over DEFAULT_TUNING.
 */

export const CELL_PX = 40;

/** Screen size in cells. The game canvas is 32 x 18 cells (1280 x 720 px). */
export const VIEW_CELLS_X = 32;
export const VIEW_CELLS_Y = 18;

/** Simulation rate. The character always advances in fixed steps of 1/SIM_HZ seconds. */
export const SIM_HZ = 120;

export interface MovementTuning {
  /** Body size in cells. */
  bodyWidth: number;
  bodyHeight: number;

  /** Run speed, cells/s. There is a single speed, no sprint. */
  runSpeed: number;
  /** How fast the run speed is reached / lost, cells/s². */
  groundAccel: number;
  groundDecel: number;
  airAccel: number;
  airDecel: number;

  /** Height of a full jump (button held), in cells. */
  jumpHeight: number;
  /** Time to reach the top of a full jump, in seconds. Gravity is derived from this. */
  timeToApex: number;
  /** Gravity multiplier while falling. Above 1 makes the fall snappier than the rise. */
  fallGravityMultiplier: number;
  /** Gravity multiplier while rising after the jump button was released (short hop). */
  jumpCutGravityMultiplier: number;
  /** Terminal fall speed, cells/s. */
  maxFallSpeed: number;

  /** Maximum fall speed while pressing against a wall, cells/s. */
  wallSlideSpeed: number;
  /** Height of a wall jump, cells. */
  wallJumpHeight: number;
  /** Horizontal speed given by a wall jump, away from the wall, cells/s. */
  wallJumpSpeedX: number;
  /** Time after a wall jump during which left/right input is ignored, seconds. */
  wallJumpControlLock: number;

  /** Jump still allowed this long after leaving the ground, seconds. */
  coyoteTime: number;
  /** A jump pressed this long before landing still happens on landing, seconds. */
  jumpBufferTime: number;
  /** Wall jump still allowed this long after leaving a wall, seconds. */
  wallCoyoteTime: number;
  /** When the head clips a ceiling corner by less than this (cells), slide past it instead of bumping. */
  cornerCorrection: number;
}

export interface CameraTuning {
  /** How far ahead of the character the camera looks, in the facing direction, cells. */
  lookAhead: number;
  /** How fast the look-ahead swings when the character turns around (higher = faster), 1/s. */
  lookAheadSpeed: number;
  /** How fast the camera catches up with its target (higher = tighter), 1/s. */
  followSpeedX: number;
  followSpeedY: number;
  /** The character can move this far vertically from the camera target before it follows, cells. */
  deadZoneY: number;
}

export interface Tuning {
  movement: MovementTuning;
  camera: CameraTuning;
}

export const DEFAULT_TUNING: Tuning = {
  movement: {
    bodyWidth: 0.8,
    bodyHeight: 0.9,

    runSpeed: 7,
    groundAccel: 120,
    groundDecel: 140,
    airAccel: 80,
    airDecel: 60,

    jumpHeight: 3,
    timeToApex: 0.39,
    fallGravityMultiplier: 1.5,
    jumpCutGravityMultiplier: 3,
    maxFallSpeed: 22,

    wallSlideSpeed: 3.5,
    wallJumpHeight: 2.5,
    wallJumpSpeedX: 8,
    wallJumpControlLock: 0.14,

    coyoteTime: 0.1,
    jumpBufferTime: 0.1,
    wallCoyoteTime: 0.08,
    cornerCorrection: 0.25,
  },
  camera: {
    lookAhead: 4,
    lookAheadSpeed: 2.5,
    followSpeedX: 8,
    followSpeedY: 4,
    deadZoneY: 2,
  },
};

/** Values computed from the tuning, so the tuning can stay in designer-friendly units. */
export interface DerivedMovement {
  /** Base gravity, cells/s². */
  gravity: number;
  /** Initial upward speed of a full jump, cells/s. */
  jumpVelocity: number;
  /** Initial upward speed of a wall jump, cells/s. */
  wallJumpVelocity: number;
  /** Horizontal distance covered by a full jump at run speed, landing at the same height, cells. */
  jumpLength: number;
}

export function deriveMovement(m: MovementTuning): DerivedMovement {
  const gravity = (2 * m.jumpHeight) / (m.timeToApex * m.timeToApex);
  const jumpVelocity = (2 * m.jumpHeight) / m.timeToApex;
  const wallJumpVelocity = Math.sqrt(2 * gravity * m.wallJumpHeight);
  // Rise takes timeToApex; the fall from the same height under stronger gravity is shorter.
  const fallTime = Math.sqrt((2 * m.jumpHeight) / (gravity * m.fallGravityMultiplier));
  const jumpLength = m.runSpeed * (m.timeToApex + fallTime);
  return { gravity, jumpVelocity, wallJumpVelocity, jumpLength };
}

export function cloneTuning(t: Tuning): Tuning {
  return { movement: { ...t.movement }, camera: { ...t.camera } };
}
