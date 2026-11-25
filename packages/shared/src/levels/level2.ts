import type { LevelDefinition } from "../level";

/**
 * La Tour: from the bottom left, through or over two towers, to a finish on the keep's roof
 * high on the right, over a deadly pit floor, about 10-13 s. Read left to right, bottom to top.
 * Built for 5 players: wide ground at both ends, two or three ways through every section.
 * - Start: a long flat ground floor (no gap to jump at the start) that runs under the left tower.
 * - Left tower: two walls with a 3-wide wall-jump shaft inside (doors at the bottom on both
 *   sides), each wall pierced by a window with a sill to rest on (left wall low, right wall
 *   high) that lets climbers step in or out halfway; or the outer route: zigzag ledges on its
 *   left face up to the tower top; or straight on along the ground floor to the low lane.
 * - Between the towers, three lanes over the pit: narrow high bridges (push spots), a mid lane
 *   of small blocks, and a low lane of stepping stones. A spring on the low lane is the express
 *   lift up to the high bridges; a vine hangs from the sky over the gap in the middle of the
 *   high lane (optional swing).
 * - Right tower: same shaft, with a spring in its floor that throws you most of the way up;
 *   windows in both walls (the left one faces the mid lane, the right one opens on the gallery
 *   side); a ledge on its left face for the high lane. Its right wall top is the start of the
 *   rampart walk: one flat surface from the tower to the keep's roof and the finish.
 * - Keep: a 12-wide roof (rampart + keep top) with open sky above, room for 5 arrivals and for
 *   traps around F. Under it, a gallery (2-3 high) and the ground floor link the tower's right
 *   door to a ledge climb on the keep's far side, the second way up to the roof (from the right).
 * Three built-in objects (two springs, one vine), no built-in hazards.
 */
export const level2: LevelDefinition = {
  name: "La Tour",
  rows: [
    "...................................V............................",
    "................................................................",
    "................................................................",
    "................................................................",
    ".........................................................F......",
    ".................#...#........................#...############..",
    ".................#...#...................###..#...#....#####....",
    "............##...#.......###...###...###..........#...........##",
    ".................#..............................................",
    ".................#...#........................#......#########..",
    ".........##..........#......##....##....##....#...#.............",
    ".....................#.............................##.........##",
    ".................#...#..........................................",
    "............##...#...#.....................#####T###############",
    "........................###...T..###...##.......................",
    "..S.............................................................",
    "#######################.........................................",
    "#######################.........................................",
  ],
};
