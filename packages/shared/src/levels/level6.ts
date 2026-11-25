import type { LevelDefinition } from "../level";

/**
 * Le Puits: one compact screen for 4 players, read as a big "N": drop into the well on the
 * left, run right along its bottom, climb, come back left inside the rock, climb again, then
 * run right to the finish. About 9-10 s for a good player (the checker's ideal sampled run is
 * about 6.9 s).
 * - Start on the clifftop at the top left (a one-block notch at its edge gives a second way
 *   off), free fall into the well (8 wide, too far to reach the rock face opposite).
 * - The cistern under the rock: a 5-high corridor with a pit split by a one-block stone (push
 *   your friend off it; a built-in vine hangs over the right half for a swing across).
 * - First climb, at the right end, two lanes split by a hanging pillar: a 2-wide opening in the
 *   gallery floor climbed off the pillar's face, or the spring in the corner, which throws you
 *   up between the pillar and the right edge (also climbable by wall jumps) and over the pillar.
 * - The gallery runs back left under the rock to twin 2-wide shafts (split by a thin pillar),
 *   climbed by wall jumps up to the top of the rock; then right along the top to F.
 * - Every way to F goes through the well bottom. The top of the rock is out of reach from the
 *   clifftop (8-cell gap): a placed platform in the well turns it into a risky shortcut.
 * Built-in objects: one spring, one vine. No built-in hazards.
 */
export const level6: LevelDefinition = {
  name: "Le Puits",
  rows: [
    "................................",
    "............................F...",
    "................#..#..##########",
    "................#..#..##########",
    "...S............#..#..##........",
    "#######.........#..#............",
    "########........#..#............",
    "########........#............#..",
    "########........#............#..",
    "########........#............#..",
    "########........###########..#..",
    "########................V....#..",
    "########.....................#..",
    "########........................",
    "########........................",
    "########.......................T",
    "#####################..#..######",
    "#####################..#..######",
  ],
};
