/**
 * The bot solution of every campaign level (check-coop-level.ts and coopLevels.test.ts), kept out
 * of the game's bundle: the game only imports the levels (levelList.ts).
 *
 * `shortcuts` are attempts that must fail: a towers-and-hauling route that skips the level's idea,
 * a jump that must be too long... Each one documents a way round the puzzle that the level closes.
 * The phase that tries the forbidden move is named "ATTEMPT: ...": the shortcut must fail there,
 * not in a later phase (a later failure would hide an attempt that worked).
 */
import type { CoopSolution } from "../bots";
import { shortcuts as coop03Shortcuts, solution as coop03Solution } from "./coop03.solution";

export interface LevelSolutions {
  solution: CoopSolution;
  shortcuts?: Record<string, CoopSolution>;
}

export const COOP_SOLUTIONS: Record<string, LevelSolutions> = {
  coop03: { solution: coop03Solution, shortcuts: coop03Shortcuts },
};
