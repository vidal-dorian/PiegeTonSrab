import type { LevelDefinition } from "../level";

/**
 * La Tour: a climb from the bottom left to a finish high on the right, over a deadly pit
 * floor, about 11-15 s. Read left to right and bottom to top.
 * - Left tower: two walls with a 3-wide wall-jump shaft inside (doors at the bottom on both
 *   sides), or the outer route: zigzag ledges on its left face (the porch under the first
 *   ledge is a 1-high squeeze).
 * - Between the towers, three lanes over the pit: narrow high bridges (push spots), a mid lane
 *   of small blocks, and a low lane of stepping stones walked through the left tower's ground
 *   floor. A spring on the low lane is the express lift up to the high bridges.
 * - Right tower: same shaft or outer ledges choice; a spring in the middle of its ground floor
 *   throws you most of the way up the shaft (hop over it to reach the outer ledges). The outer ledges
 *   zigzag against the keep under the finish; both routes meet on the last ledge before F.
 * - A vine hangs from the sky between the towers (optional swing across the high lane).
 * Three built-in objects (two springs, one vine), no built-in hazards.
 */
export const level2: LevelDefinition = {
  name: "La Tour",
  rows: [
    "...................................V........................",
    "............................................................",
    ".........................................................F..",
    ".......................................................#####",
    "........................................................####",
    ".................#...#......................#...#....##.####",
    ".............###.#...#................###...#...#.......####",
    ".................#...#...###...###..........#...#.##....####",
    ".................#...#......................#...#.......####",
    "..........###....#...#......................#...#....##.####",
    ".................#...#......##.....##.......#...#.......####",
    ".................#...#............................##....####",
    ".............###.#...#..................................####",
    ".........................................#####T###......####",
    "........................###...T..###..##....................",
    "..S........##.#########.....................................",
    "#########...................................................",
    "#########...................................................",
  ],
};
