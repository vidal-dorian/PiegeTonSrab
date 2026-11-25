import type { LevelDefinition } from "../level";

/**
 * La Jungle: tree trunks and a canopy over a jungle floor, read left to right, about 10-12 s.
 * - Floor route: flat ground broken by three 2-cell spike patches to hop over, two streams
 *   (3-cell deadly pits), a low root and a tall buttress root to climb over, and 4-cell-high
 *   root arches under the four trunks: one saw in an arch does not close it, so five
 *   runners keep two or three lines through every arch.
 * - Canopy route (row 8): three leafy platforms on top of the first three trunks, separated
 *   by gaps of 5 and 4 cells, then the last canopy one row lower (row 9), so the third gap
 *   (5 cells) is a slight drop that leads down toward F. A vine hangs over each 5-cell gap
 *   as an optional fast swing; the jumps are also possible without it (at the limit).
 * - Branch steps link the two levels, each 3 cells up at most: a step and a branch near the
 *   start; a step at the foot of the second trunk and a 2-cell perch over the first stream
 *   (it also catches a missed canopy jump, a push spot); the buttress root, a branch beside
 *   it and the buttress of the third trunk (a mid-level ledge over the pocket between the
 *   root and the second stream). Dropping from the canopy is always possible.
 * - Both routes meet again on the open ground before F, an 8-cell run with nothing overhead.
 * Built-in objects: two vines and six spike cells, none near S or F.
 *
 * 5-player design: the canopy sits only 8 rows above the floor (the last part 7), so when
 * traps push the race up to the canopy and back down, the detour stays short (late races
 * stay well under the 45 s timer), and the tall arches keep the floor itself hard to wall
 * off. Floor, arches, branches, canopy and the sky above it give parallel lines in every
 * section, so one trap never forces single file.
 */
export const level9: LevelDefinition = {
  name: "La Jungle",
  rows: [
    "................................................................",
    "................................................................",
    "................................................................",
    ".......................V.......................V................",
    "................................................................",
    "................................................................",
    "................................................................",
    "................................................................",
    "............#########.....##########....#####...................",
    ".............##..............##..........##.......##########....",
    ".............##..............##........####............##.......",
    ".........###.##.........##...##..###.....#####.........##.......",
    "................................................................",
    "......###..................##........#..........................",
    "....................................###.........................",
    "...S.....##.....^^...............^^.###............^^........F..",
    "######################...####################...################",
    "######################...####################...################",
  ],
};
