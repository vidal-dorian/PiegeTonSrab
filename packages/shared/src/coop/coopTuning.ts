/**
 * Tuning of the co-op mode ("Sauve Ton Srab"). Units: cells and seconds, like the race mode.
 *
 * The co-op world runs on the server (the referee) and on every client (for display, then for
 * prediction), so every machine must use the same numbers: COOP_MOVEMENT is a frozen copy of the
 * race mode's defaults, never the dev tuning panel's live values (which differ between machines).
 */
import { DEFAULT_MOVEMENT, SIM_HZ, type MovementTuning } from "../movement/tuning";

/** Movement of every co-op body. Same feel as the race mode (run, jump, coyote time, buffer). */
export const COOP_MOVEMENT: Readonly<MovementTuning> = Object.freeze({ ...DEFAULT_MOVEMENT });

/** Steps per second of the co-op world (the same fixed step as the race mode). */
export const COOP_HZ = SIM_HZ;
export const COOP_DT = 1 / COOP_HZ;

export const COOP = {
  /**
   * Rest length of the rope between two neighbours of the chain, cells, measured along its path:
   * body centre, the terrain corners it wraps around, body centre. Shorter, it is slack and pulls
   * nothing; longer, it pulls like a stiff rubber band, up to the hard stop (ropeStretch).
   */
  ropeLength: 4.5,
  /** How far a link stretches past its rest length before it stops dead, as a share of it (20 %: 5.4 cells). */
  ropeStretch: 0.2,
  /**
   * Stiffness of a stretched link, 1/s² per unit of mass: a friend hanging still stretches it by
   * gravity / ropeStiffness (about 0.25 cell; Ruben twice that).
   */
  ropeStiffness: 240,
  /** Damping ratio of a friend bouncing on a fixed anchor (0.5: one small rebound, settled in about half a second). */
  ropeDamping: 0.5,
  /**
   * A stretched link between bodies standing on something gives back this share of its stretch per
   * second (1/s): their pull is a position pull, they keep their own speed.
   */
  ropeRelax: 15,
  /**
   * Friction of the rope sliding round the terrain corners it wraps, 1/s per unit of mass (viscous:
   * on the difference of the two ends' speeds along the rope, ends in the air only). Two friends
   * hanging on either side of a block settle instead of seesawing for ever; 0 is a frictionless pulley.
   */
  ropePulleyDamping: 4,
  /**
   * A body in the air that the stretched rope presses against a wall loses this share of its speed
   * along the wall per cell/s of press, each step (viscous friction): held against a wall just under
   * a corner, it settles instead of bobbing.
   */
  ropeWallFriction: 0.3,
  /** Terrain corners a link can wrap around (more: the rope goes through, as it did before wrapping). */
  ropeMaxWraps: 8,
  /**
   * How easily a body is moved by the rope (multiplies 1 / mass). In the air a body follows the rope;
   * standing it resists; standing and pushing away from a friend who hangs below, it braces and holds.
   */
  grip: { air: 1, ground: 0.35, brace: 0.12 },
  /** Ruben's mass: harder to haul, a better anchor. Friends weigh 1. */
  rubenMass: 2,
  /** Fastest a body hauled up by the rope rises, cells/s (the comedy of hauling Ruben). */
  riseCap: { friend: 2.5, ruben: 1.2 },
  /**
   * A standing anchor holding friends who hang below slides towards them at this speed per unit of
   * hanging mass (a friend 1, Ruben 2), cells/s, unless it pushes away from them (bracing).
   */
  anchorSlide: 0.15,
  /**
   * A standing anchor whose friend hangs past the hard stop (more than his haul speed can take
   * back) gives ground towards him at most this fast, cells/s, on top of giving back its own move
   * of the step: it holds its ground instead of being yanked 0.3 cell a step off an edge.
   */
  anchorGive: 2.5,
  /**
   * Largest rope correction applied to one body in one step, cells: enough to catch a fall at full
   * speed (0.18 per step) or a catapulted friend, small enough that a stretched link never snaps back.
   */
  maxCorrection: 0.3,
  /** Gauss-Seidel passes of the rope solver per step. */
  ropePasses: 4,
  /** A body counts as hanging from a neighbour when the neighbour's centre is at least this much higher, cells. */
  hangHeight: 0.5,
  /** Damping of a swing (1/s) and its widest angle from vertical, given by its cosine (70°). */
  hangDamping: 0.25,
  hangMaxCos: 0.342,
  /** How fast Ruben slides off a friend he landed on (nobody can carry him), cells/s. */
  rubenSlideSpeed: 6,
  /** How long a friend stays squashed after Ruben lands on him, seconds (visual, and he cannot jump). */
  squashTime: 0.35,
  /** Death freeze before the level restarts for everyone, seconds. */
  deathFreeze: 0.8,
  /** Horizontal speed kept when leaving a moving support is capped at the run speed. */
  inheritMaxSpeed: DEFAULT_MOVEMENT.runSpeed,
  /** Players per room: same limit as the race mode (one colour per seat). */
  maxPlayers: 5,
  /** R held this long (by one player, from 3 players by half the team) restarts the level, seconds. */
  restartHold: 1.5,
} as const;

/** Longest a rope link gets along its path: the hard stop, cells. */
export const ROPE_MAX_LENGTH = COOP.ropeLength * (1 + COOP.ropeStretch);

/** COOP.deathFreeze in steps. */
export const DEATH_FREEZE_STEPS = Math.round(COOP.deathFreeze * COOP_HZ);

/** COOP.restartHold in steps. */
export const RESTART_HOLD_STEPS = Math.round(COOP.restartHold * COOP_HZ);
