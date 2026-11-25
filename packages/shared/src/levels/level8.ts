import type { LevelDefinition } from "../level";

/**
 * Le Labyrinthe: a three-storey maze under an open sky, read left to right, from S at the
 * bottom left to F in the finish room on the middle storey at the right, about 10-14 s.
 * - Storeys: the bottom lane (5 high, rows 10-14), the middle lane (4 high, rows 5-8) and the
 *   top lane (rows 0-3, open to the sky; the top left is solid rock). One trap never closes a
 *   lane on its own.
 * - Four halls join two storeys each, climbed on zig-zag ledges two cells apart (easy jumps,
 *   a 1-high crawl under the low ones): the start hall and Ha (columns 27-32) join the bottom
 *   and the middle island (columns 17-26); H2 (19-25) and H4 (46-52) join the middle and the
 *   top; H3 (36-43) joins the bottom and the right half of the middle.
 * - A thick wall (columns 33-35) cuts the middle lane: past it, go over by the top lane or
 *   under by the bottom lane, then come back through H3, H4 or the finish room.
 * - The top lane has two drop holes (into Ha and onto H3's high ledge), so every storey can
 *   be reached from above as well as from below: more loops, fewer dead-end pockets.
 * - Bottom lane: 1-high plates break the long runs (and stop low cannon shots), a 2-wide
 *   deadly pit under H3's high ledge (jump spot, push spot), then the climb into the finish
 *   room: two ledges under a 3-wide hole, or the spring that throws you straight up.
 * - Finish room (columns 55-63): no ceiling, so the top lane drops in, the middle lane walks
 *   in and the bottom lane climbs in; room for five players and for traps around F.
 * Three built-in objects: the vine over H2 (grab it from the low ledge and swing to the top
 * lane), the saw at the top of the sky over the top lane (no full jumps under it), and the
 * spring at the end of the bottom lane. None near S or F.
 */
export const level8: LevelDefinition = {
  name: "Le Labyrinthe",
  rows: [
    "###################...V.............*...........................",
    "###################.............................................",
    "###################.............................................",
    "###################.............###.............................",
    "###################.......###..##########..###.......##.........",
    ".......................##........###...........##...............",
    ".................................###............................",
    "....................##...........###..............##............",
    ".................................###....................F.......",
    ".................##########......###........###############...##",
    "..............................................................##",
    "............##.............##...........##.................##.##",
    "..............................................................##",
    "........##....................##.....##..................##...##",
    "...S..........###....####........###........####...####......T##",
    "########################################..######################",
    "########################################..######################",
    "########################################..######################",
  ],
};
