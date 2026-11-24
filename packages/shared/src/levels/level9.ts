import type { LevelDefinition } from "../level";

/**
 * La Jungle: tree trunks and a canopy over a jungle floor, read left to right, about 10-13 s.
 * - Floor route (slower): flat ground broken by three 2-cell spike patches to hop over, two
 *   streams (3-cell deadly pits), a low root and a tall buttress root to climb over, and
 *   2-cell-high passages under the four trunks (root arches: tempting saw spots, the canopy
 *   is the way around).
 * - Canopy route (row 7): four leafy platforms on top of the trunks, separated by gaps of 5,
 *   4 and 5 cells. A vine hangs over each 5-cell gap as an optional fast swing; the jumps
 *   are also possible without it (at the limit).
 * - Branch steps link the two levels: near the start, beside the first stream (a 2-cell
 *   perch over the water that also catches a missed canopy jump, a push spot), and up the
 *   buttress root in the middle. Dropping from the canopy is always possible.
 * - Both routes meet again on the open ground before F.
 * Built-in objects: two vines and six spike cells, none near S or F.
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
    "............#########.....##########....#####.....##########....",
    ".............##..............##..........##............##.......",
    ".............##..............##..........##............##.......",
    ".........###.##.........##...##........####............##.......",
    ".............##..............##..###.....#####.........##.......",
    ".............##..............##..........##............##.......",
    "......###....##............####......#...##............##.......",
    "....................................###.........................",
    "...S.....##.....^^...............^^.###............^^........F..",
    "######################...####################...################",
    "######################...####################...################",
  ],
};
