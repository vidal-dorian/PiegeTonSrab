import type { LevelDefinition } from "../level";

/**
 * Le Grand Huit: a rollercoaster read left to right, from a low start station to a low
 * finish station, about 11-16 s. Big hills, deep valleys, springs at the bottom.
 * - Lift hill: hop up the 2-high stairs to the highest crest, or take the long 1-high tunnel
 *   under the stairs and wall-jump up the 2-wide chimney that opens in the crest.
 * - Big drop into valley 1: its spring launches you straight onto hill B, or climb the two
 *   steps on hill B's face, or hop the spring and run the 1-high tunnel through hill B's base.
 *   A vine hangs above the valley for a swing from the crest.
 * - Drop into valley 2, over a 3-wide deadly pit: a narrow bridge above it (push spot) or a
 *   low jump under the bridge. Then the spring onto hill C, or the door at its foot into a
 *   2-wide wall-jump shaft that opens on its crest.
 * - Last drop down the steps into the finish station.
 * Three built-in objects (two springs, one vine), no built-in hazards.
 */
export const level7: LevelDefinition = {
  name: "Le Grand Huit",
  rows: [
    "................................................................",
    "................................................................",
    "................................................................",
    ".........................V......................................",
    "................................................................",
    "................................................................",
    "...............##..##...........................................",
    "...............##..##...........................................",
    ".............####..###..........................................",
    ".............####..###..........#####..........#..###...........",
    "...........######..####.........#####..........#..###...........",
    "...........######..####.........######.........#..####..........",
    ".........########..#####.......#######.........#..####..........",
    ".........########..#####.......########.####...#..#####.........",
    ".......##########..#####......#########...........#####.........",
    "...S...............#####....T................T....#####.....F...",
    "#########################################...####################",
    "#########################################...####################",
  ],
};
