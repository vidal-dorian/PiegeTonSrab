import type { LevelDefinition } from "../level";

/**
 * La Grotte: a tall cave read left to right, about 10 s on an empty map, laid out for five
 * players: the roof is a single row (stalactites and a few roof bumps hang from it) so the
 * cave is open from row 1 to the floor, and every section has three lanes on top of each other.
 * - First half (columns 1-31), the hall of floating rocks: rocks on three tiers, staggered so
 *   you climb in a zigzag. Low rocks (row 13, a full jump up from the floor, walk under them),
 *   middle rocks (row 10) and high rocks (row 7); two stalactites (columns 13 and 22) hang over
 *   the middle rocks. The floor runs under everything with one 2-wide pit (23-24). The tiers
 *   also cut cannon lines short: a vertical line stops on a rock, so it never walls off the hall.
 * - Second half (columns 32-52): a long shelf (row 11) splits the cave into an upper and a
 *   lower passage. Upper: a tall gallery between two stalactites (36 and 47, hanging to row 7),
 *   with a bump to hop on each shelf piece (39 and 46; the one at 39 is also the step up to a
 *   high rock at 40-43) and another high rock at 50-52. A 3-wide hole (41-43) with a step rock
 *   under it (41-42, row 13) links the passages both ways. Lower: 4 cells high, a 2-wide pit
 *   (35-36) under the low ceiling, then the built-in saw hanging under the shelf at 48 (walk
 *   under it, do not jump).
 * - Finish chamber (columns 53-62), tall: F stands on a 5-wide ledge (56-60, row 9) with open
 *   air above it, room for five players arriving together and for traps. In from the shelf
 *   (across the rock at 54-55), from the high rock at 50-52, from the lower passage up a tight
 *   1-wide chimney at column 53 (step at 52-53), or from the hollow under the ledge: the rock at
 *   61-62 (row 12) and up the 2-wide shaft right of the ledge.
 * One built-in object (the saw, with the upper passage and the hole as ways around it).
 * Five players: no single-file corridor anywhere (floor, rocks and air in the hall; shelf,
 * gallery and lower passage after it; four ways onto the ledge), so one trap slows a lane but
 * never forces everyone into it, and the lanes are about as long as each other, so filling the
 * map makes the race longer but never opens a shortcut.
 */
export const level3: LevelDefinition = {
  name: "La Grotte",
  rows: [
    "################################################################",
    "#..........####......###............#..........#.###...........#",
    "#............#........#.............#..........#...............#",
    "#............#........#.............#..........#...............#",
    "#............#........#.............#..........#...............#",
    "#...................................#..........#...............#",
    "#...................................#..........#...............#",
    "#........###......###......###......#...####...#..###..........#",
    "#..........................................................F...#",
    "#.......................................................#####..#",
    "#............####.....####.............#......#................#",
    "#................................########...#########.##.......#",
    "#...............................................*............###",
    "#........###......###......###...........##....................#",
    "#...................................................##.........#",
    "#...S...............................................##.........#",
    "#######################..##########..###########################",
    "#######################..##########..###########################",
  ],
};
