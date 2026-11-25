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
  /** Rope length between two neighbours of the chain, body centre to body centre, cells. */
  ropeLength: 4.5,
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
  /** Largest rope correction applied to one body in one step, cells. */
  maxCorrection: 0.6,
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
} as const;

/** COOP.deathFreeze in steps. */
export const DEATH_FREEZE_STEPS = Math.round(COOP.deathFreeze * COOP_HZ);
