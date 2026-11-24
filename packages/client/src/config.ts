import { DEFAULT_MOVEMENT, type MovementTuning } from "@game/shared";

// Movement tuning lives in the shared package (the server needs it too); re-exported for convenience.
export { DEFAULT_MOVEMENT, deriveMovement, HAZARD_INSET, SIM_HZ } from "@game/shared";
export type { DerivedMovement, MovementTuning } from "@game/shared";

/**
 * Client tuning: camera here, movement from the shared package.
 * Units: cells (1 cell = CELL_PX pixels) and seconds.
 * The in-game tuning panel edits a live copy of these values; once a set feels right,
 * use "Copier la config" in the panel and paste the movement part over DEFAULT_MOVEMENT
 * (packages/shared/src/movement/tuning.ts) and the camera part over DEFAULT_TUNING below.
 */

export const CELL_PX = 40;

/** Screen size in cells. The game canvas is 32 x 18 cells (1280 x 720 px). */
export const VIEW_CELLS_X = 32;
export const VIEW_CELLS_Y = 18;

/** Delay between a death and the respawn at the start, seconds. */
export const RESPAWN_DELAY = 0.7;

export interface CameraTuning {
  /** How far ahead of the character the camera looks, in the facing direction, cells. */
  lookAhead: number;
  /** How fast the look-ahead swings when the character turns around (higher = faster), 1/s. */
  lookAheadSpeed: number;
  /** How long the character must run on the ground in a new direction before the look-ahead turns, seconds. */
  lookAheadTurnDelay: number;
  /** How fast the camera catches up with its target (higher = tighter), 1/s. */
  followSpeedX: number;
  followSpeedY: number;
  /** The character can move this far horizontally from the camera focus before it follows, cells. */
  deadZoneX: number;
  /** The character can move this far vertically from the camera focus before it follows, cells. */
  deadZoneY: number;
}

export interface Tuning {
  movement: MovementTuning;
  camera: CameraTuning;
}

export const DEFAULT_TUNING: Tuning = {
  movement: { ...DEFAULT_MOVEMENT },
  camera: {
    lookAhead: 4,
    lookAheadSpeed: 2.5,
    lookAheadTurnDelay: 0.15,
    followSpeedX: 8,
    followSpeedY: 4,
    deadZoneX: 1.5,
    deadZoneY: 2,
  },
};

export function cloneTuning(t: Tuning): Tuning {
  return { movement: { ...t.movement }, camera: { ...t.camera } };
}
