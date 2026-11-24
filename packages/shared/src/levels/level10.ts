import type { LevelDefinition } from "../level";

/**
 * Le Pont: a long 1-cell-thick bridge over a deadly chasm, read left to right, about 10-13 s.
 * Built for pushing and stomping friends off.
 * - Low route, the bridge: gaps of 4, 2 and 3 cells, a middle pylon crossed through a 1-high
 *   toll tunnel (the tempting chokepoint), then single-cell planks on posts before two steps
 *   up to the raised finish cliff.
 * - High route, the scaffold: short beams with 4-cell gaps and height changes, over the pylon
 *   roof and down to the finish cliff; the vine and wall jumps on the pylon link the two.
 *   Either route alone reaches F, so the tunnel and every bridge cell can be trapped.
 * - Two spring islands at the bottom of the chasm under the first and middle gaps (a second
 *   chance for whoever falls short), a vine hanging from a block beside the pylon (a swing from
 *   the bridge up to the scaffold), a saw in the chasm under the second gap.
 * Four built-in objects (two springs, one vine, one saw), no hazard on any route.
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
    "........................................###.....................",
    ".....................###........................................",
    "..............###..............................###..............",
    "............................#######...V............###..........",
    "............................#######.........................F...",
    "........###.................#######......................#######",
    "............................#######...................##########",
    "...S..................................................##########",
    "############....#######..#############...#..#..#..##############",
    "#######............#...*....#######.........#........#...#######",
    "#######............#........#######.........#........#...#######",
    "#######.....#T#....#........#######...#T#...#........#...#######",
  ],
};
