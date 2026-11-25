import type { LevelDefinition } from "../level";

/**
 * L'Usine: a factory with three stacked floors (ground floor, middle floor, sawtooth roof),
 * read left to right, from S on the ground floor to F on the roof, about 11-15 s.
 * - Floors are linked by 2-wide holes in the slabs. Most have a one-cell catwalk under or
 *   beside them (stand on the catwalk, hop up through the hole); the others are drop-only
 *   chutes (middle slab x 16-17, roof x 24-25). Every hole also lets you drop a floor down.
 * - Ground floor: a pit crossed on a one-cell pillar (push spot), a hanging press to walk
 *   under, then a spring under a hole (express lift to the middle floor) and the far end.
 * - Middle floor: a cannon at its left end fires right along a 12-cell gallery (run behind
 *   a ball, or swing on the vine hanging over it); the roof and ground floor stay open there.
 * - A second cannon fires left along the far end of the ground floor (stopped by the spring);
 *   the middle floor and the roof stay open above it.
 * - Roof: three sawtooth sheds to hop over; four ways up from the middle floor (x 13-14,
 *   31-32, 41-42 and 52-53, the last one near F), so a jammed roof stretch is never far
 *   from a way down and back up.
 * At every column at least two floors are open, so traps can go almost anywhere.
 * For 5 players: the three floors are parallel lanes, and the extra holes and the fourth
 * catwalk keep them cross-linked all along, so when the race line fills up the
 * lower floors stay reachable and a detour is a short drop-and-climb rather than a lap.
 * The roof around F stays open (no shed, no hole) for five arrivals and the traps around it.
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
    "#############..#########..#####..########..#########..##########",
    "#####.....................V.....................................",
    "#####..........##............##........##.............##........",
    "#####...........................................................",
    "#####...............>............#........#.....................",
    "#######..#######..#################..##########..###########..##",
    "..............................##................................",
    ".........##...................##.....##...................##....",
    "................................................................",
    "...S..........................................T.........<.......",
    "######################..#..#####################################",
    "######################..#..#####################################",
  ],
};
