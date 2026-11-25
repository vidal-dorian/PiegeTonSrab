import type { LevelDefinition } from "../level";

/**
 * La Grotte: a low cave read left to right, about 12 s.
 * - First half: three floating rock blocks over the cave floor. Hop from block to block
 *   (upper lane, stalactites just above the blocks so jumps stay flat) or run the floor
 *   underneath, crouching under the blocks and jumping two small pits in the gaps.
 * - Second half: a long shelf splits the cave into an upper and a lower passage.
 *   Upper: hop a rock, then cross a taller gallery (open up to row 5) between stalactite
 *   columns hanging to rows 7-8; a hole drops to the lower passage. Lower: two pits under
 *   a low ceiling (the shelf sits just above your head, so jumps are short), wide enough
 *   to stay two-lane, and a built-in saw hanging under the shelf a few cells past the
 *   second pit (walk under it, do not jump).
 * - Both passages meet again in a tall chamber before F.
 * One built-in object (the saw, with the upper passage as the way around it).
 */
export const level3: LevelDefinition = {
  name: "La Grotte",
  rows: [
    "################################################################",
    "################################################################",
    "################################################################",
    "################################################################",
    "################################################################",
    "##############################...##......##....##..#......##...#",
    "##############################...##......##....##..#......##...#",
    "##############################...##......##....##..#......##...#",
    "########....#......##..##................##........#......##...#",
    "########....#......##..##......................................#",
    "########....#......##..................#.......................#",
    "#..................................##########..##########......#",
    "#...................................#..................*.......#",
    "#.........####....####....####.................................#",
    "#..............................................................#",
    "#...S...#.......................#..........................F...#",
    "###############..######..##############...######..##############",
    "###############..######..##############...######..##############",
  ],
};
