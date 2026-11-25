import type { LevelDefinition } from "../level";

/**
 * L'Usine: a factory with three stacked floors (ground floor, middle floor, sawtooth roof),
 * read left to right, from S on the ground floor to F on the roof, about 11-15 s.
 * - Floors are linked by 2-wide holes in the slabs, each with a one-cell catwalk under it
 *   (stand on the catwalk, hop up through the hole). Holes also let you drop a floor down.
 * - Ground floor: a pit crossed on a one-cell pillar (push spot), a hanging press to walk
 *   under, then a spring under a hole (express lift to the middle floor) and the far end.
 * - Middle floor: a cannon at its left end fires right along a 12-cell gallery (run behind
 *   a ball, or swing on the vine hanging over it); the roof and ground floor stay open there.
 * - A second cannon fires left along the far end of the ground floor (stopped by the spring);
 *   the middle floor and the roof stay open above it.
 * - Roof: three sawtooth sheds to hop over; the last hole near F joins the middle floor.
 * At every column at least two floors are open, so traps can go almost anywhere.
 * Four built-in objects (two cannons, one spring, one vine), no hazard near S or F.
 */
export const level5: LevelDefinition = {
  name: "L'Usine",
  rows: [
    "############....................................................",
    "############....................................................",
    "############....................................................",
    "############.........#................#.......#.................",
    "############........##...............##......##.................",
    "############.......###..............###.....###.............F...",
    "#############..################..###################..##########",
    "#####.....................V.....................................",
    "#####..........##............##.......................##........",
    "#####...........................................................",
    "#####...............>............#........#.....................",
    "#######..##########################..##########..###########..##",
    "..............................##................................",
    ".........##...................##.....##...................##....",
    "................................................................",
    "...S..........................................T.........<.......",
    "######################..#..#####################################",
    "######################..#..#####################################",
  ],
};
