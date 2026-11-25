/**
 * The tutorial's own tiny level: one screen (32 x 18 cells = 1280 x 720 px), so the camera
 * never moves and every lesson is in view. It is not a race map: it is not in RACE_LEVELS.
 *
 * Read left to right, one lesson per area:
 * - Start on the left, a 2-wide pit to hop over, the step-1 arrow just after it.
 * - A high ledge in the middle: the rival's lane, where the player drops the saw. Nobody can
 *   jump up there (6 cells), so the saw can never hurt the player afterwards.
 * - Open ground right of the ledge, where the rival lands for the stomp (nothing overhead, so
 *   the 4-cell stomp bounce never hits a ceiling).
 * - The flag on a 2-high block at the far right: one last little jump.
 * The top 4 rows stay empty: the prompt is drawn over them.
 */
import type { LevelDefinition } from "@game/shared";
import type { StepId } from "./flow";

const W = 32;
const empty = ".".repeat(W);
const ground = "#####..#########################";

export const TUTORIAL_LEVEL: LevelDefinition = {
  name: "Tuto",
  rows: [
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty,
    empty, // 8: the rival's lane, on top of the ledge
    ".............###########........", // 9: the ledge, x 13..23
    empty,
    empty,
    "..............................F.", // 12: the flag, on the block
    ".............................###", // 13
    "..S..........................###", // 14
    ground,
    ground,
    ground,
  ],
};

export interface Cell {
  x: number;
  y: number;
}

/** Where things are in TUTORIAL_LEVEL, in cells. */
export const TUTO = {
  /** Step 1 is done once the player's centre passes this cell (just after the pit). */
  marker: { x: 10, y: 14 } as Cell,
  /** Cells where the saw may go: the rival's whole path along the ledge, row 8. */
  lane: { y: 8, x0: 14, x1: 22 },
  /** Where the saw goes when the player does not place it in time (middle of the lane). */
  autoSaw: { x: 18, y: 8 } as Cell,
  /** The rival waits at the right end of the ledge, then runs left along the lane. */
  rivalLedge: { x: 23, y: 8 } as Cell,
  /** Where the rival comes back for the stomp lesson. */
  rivalGround: { x: 27, y: 14 } as Cell,
  /** The finish flag (same cell as "F" above). */
  flag: { x: 30, y: 12 } as Cell,
};

/** Where the player comes back after a death, per step: the start of the area of that step. */
export const CHECKPOINTS: Record<StepId, Cell> = {
  move: { x: 2, y: 14 },
  trap: TUTO.marker,
  stomp: TUTO.marker,
  flag: { x: 24, y: 14 },
};

export function isLaneCell(x: number, y: number): boolean {
  return y === TUTO.lane.y && x >= TUTO.lane.x0 && x <= TUTO.lane.x1;
}
