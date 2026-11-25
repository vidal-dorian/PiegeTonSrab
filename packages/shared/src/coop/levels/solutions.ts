/**
 * The bot solution of every campaign level (check-coop-level.ts and coopLevels.test.ts), kept out
 * of the game's bundle: the game only imports the levels (levelList.ts).
 *
 * `shortcuts` are attempts that must fail: a towers-and-hauling route that skips the level's idea,
 * a jump that must be too long... Each one documents a way round the puzzle that the level closes.
 */
import type { CoopSolution } from "../bots";

export interface LevelSolutions {
  solution: CoopSolution;
  shortcuts?: Record<string, CoopSolution>;
}

export const COOP_SOLUTIONS: Record<string, LevelSolutions> = {};
