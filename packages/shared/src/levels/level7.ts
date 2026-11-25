import type { LevelDefinition } from "../level";

/**
 * Le Grand Huit: a rollercoaster read left to right, from a low start station to a low
 * finish station, about 11-15 s. Big hills, deep valleys, springs at the bottom, and two
 * tracks: the ground track runs through the valleys, under and through the hills; the high
 * track ("=" rails) runs from crest to crest above the valleys.
 * - Lift hill (the one climb everyone makes), two separate ways over: hop up the 2-high
 *   stairs to the highest crest; or take the long 1-high tunnel under the stairs into the
 *   2-wide chimney, then wall-jump up to the crest, or only halfway and out through the
 *   window in its right wall (rows 10-11), under the crest, onto the back steps.
 * - Valley 1: from the crest, a 4-cell jump onto the first rail (row 6), then down onto
 *   hill B's top; or down to the valley floor, where the spring launches you onto hill B
 *   (it fits under the rail), the two steps climb hill B's face, or the 1-high tunnel runs
 *   through hill B's base.
 * - Valley 2, three heights: the second rail (row 8) links hill B's top to hill C's top; a
 *   narrow bridge over the 3-wide deadly pit (push spot); or a low jump over the pit under
 *   the bridge. From the valley floor, the spring onto hill C, or the door at its foot into
 *   a 2-wide wall-jump shaft that opens on its crest.
 * - Hill C is hollow like the lift hill: halfway up the shaft a window (rows 10-11) runs
 *   under its roof to its back. Drop off the roof or out of the window into the finish
 *   station, open and 9 cells wide.
 * For 5 players: every section has at least two lanes at different heights (a trap fills
 *   one, the pack takes another), and none is a shortcut: on an empty map the high track,
 *   the ground track and the mixed fastest line are all within a few cells of each other,
 *   so blocking one costs little and building over one gains little.
 * Built-in objects: two springs and eleven rail cells (platforms), no built-in hazards.
 */
export const level7: LevelDefinition = {
  name: "Le Grand Huit",
  rows: [
    "................................................................",
    "................................................................",
    "................................................................",
    "................................................................",
    "................................................................",
    "................................................................",
    "...............##..##....======.................................",
    "...............##..##...........................................",
    ".............####..###..................=====...................",
    ".............####..###..........#####..........#..###...........",
    "...........######...............#####..........#................",
    "...........######...............######.........#................",
    ".........########..#####.......#######.........#..####..........",
    ".........########..#####.......########.####...#..#####.........",
    ".......##########..#####......#########...........#####.........",
    "...S...............#####....T................T....#####.....F...",
    "#########################################...####################",
    "#########################################...####################",
  ],
};
