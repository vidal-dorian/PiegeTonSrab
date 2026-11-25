import type { LevelDefinition } from "../level";

/**
 * Le Pont: a long 1-cell-thick bridge over a deadly chasm, read left to right, about 10-13 s.
 * Built for pushing and stomping friends off.
 * - Low route, the bridge: gaps of 4, 2 and 3 cells, a middle pylon crossed through a 1-high
 *   toll tunnel (the tempting chokepoint), then single-cell planks on posts before a staircase
 *   (up 2, 1, 2) to the far bank's lookout, where F stands.
 * - High route, the scaffold: short beams with 3- and 4-cell gaps, all kept low (within two
 *   rows of the finish level) so a detour over a trapped bridge stays short; over the pylon roof,
 *   onto the vine's anchor, along two beams and down from a last high beam onto the lookout.
 *   The vine and wall jumps on the pylon link the two. Either route alone reaches F, so the
 *   tunnel and every bridge cell can be trapped.
 * - Two spring islands at the bottom of the chasm under the first and middle gaps (a second
 *   chance for whoever falls short), a vine hanging over the middle gap beside the pylon (a
 *   swing from the bridge up to the scaffold), a saw in the chasm under the second gap.
 * Four built-in objects (two springs, one vine, one saw), no hazard on any route.
 * For 5 players: F sits on a raised lookout (5 rows above the start) with a 6-cell top and open
 * sky above it, reached from below by the staircase or from above off the last beam, so a crowd
 * arriving together and the traps around F both have room. Raising F and lowering the scaffold
 * keeps the late-game detours (once the bridge is full of traps) close to the empty-map run.
 */
export const level10: LevelDefinition = {
  name: "Le Pont",
  rows: [
    "................................................................",
    "................................................................",
    "................................................................",
    "................................................................",
    "................................................................",
    "................................................................",
    "................................................................",
    "....................................................###.........",
    "........................................###.................F...",
    "..............###....###....#######...V........###........######",
    "............................#######.......................######",
    "........###.................#######....................#########",
    "............................#######...................##########",
    "...S..................................................##########",
    "############....#######..#############...#..#..#..##############",
    "#######............#...*....#######.........#........#...#######",
    "#######............#........#######.........#........#...#######",
    "#######.....#T#....#........#######...#T#...#........#...#######",
  ],
};
