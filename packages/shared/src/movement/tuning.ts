/**
 * Character movement tuning, shared by the client (which simulates its own character)
 * and the server (which checks that the finish stays reachable when objects are placed).
 * Units: cells and seconds.
 *
 * The client's tuning panel edits a live copy of these values. Once a set feels right,
 * paste it over DEFAULT_MOVEMENT so the server uses the same values.
 */

/** Simulation rate. The character always advances in fixed steps of 1/SIM_HZ seconds. */
export const SIM_HZ = 120;

/**
 * The body used to test traps is smaller than the collision body by this much on each side, cells.
 * Grazing a trap by a pixel does not kill, which feels fairer.
 */
export const HAZARD_INSET = 0.1;

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

  // --- Objects and other players -------------------------------------------------
  /** Height a spring throws the character, cells (always the full height). */
  springHeight: number;
  /** Bounce after landing on another player's head, cells (jump held: full; released: cut like a jump). */
  stompBounceHeight: number;
  /** Downward speed given to a player who gets stomped on, cells/s. */
  stompSlamSpeed: number;
  /** How long a stomped player can't jump and runs slowly, seconds. */
  stunTime: number;
  /** Run speed multiplier while stunned. */
  stunSpeedFactor: number;
  /** Sideways speed when two players bump into each other, cells/s. */
  shoveSpeed: number;
  /** Left/right input is ignored this long after a bump, seconds. */
  shoveLock: number;
  /** How hard left/right pumps a swing on a vine, cells/s². */
  swingPump: number;
  /** Extra upward speed when letting go of a vine, as a fraction of the jump speed. */
  vineReleaseJump: number;
}

export const DEFAULT_MOVEMENT: MovementTuning = {
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

  springHeight: 7,
  stompBounceHeight: 4.2,
  stompSlamSpeed: 18,
  stunTime: 0.55,
  stunSpeedFactor: 0.35,
  shoveSpeed: 8,
  shoveLock: 0.16,
  swingPump: 14,
  vineReleaseJump: 0.6,
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
  /** Initial upward speed given by a spring, cells/s. */
  springVelocity: number;
}

export function deriveMovement(m: MovementTuning): DerivedMovement {
  const gravity = (2 * m.jumpHeight) / (m.timeToApex * m.timeToApex);
  const jumpVelocity = (2 * m.jumpHeight) / m.timeToApex;
  const wallJumpVelocity = Math.sqrt(2 * gravity * m.wallJumpHeight);
  // Rise takes timeToApex; the fall from the same height under stronger gravity is shorter.
  const fallTime = Math.sqrt((2 * m.jumpHeight) / (gravity * m.fallGravityMultiplier));
  const jumpLength = m.runSpeed * (m.timeToApex + fallTime);
  const springVelocity = Math.sqrt(2 * gravity * m.springHeight);
  return { gravity, jumpVelocity, wallJumpVelocity, jumpLength, springVelocity };
}

