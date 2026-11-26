/**
 * Level 1, "La Rentrée": the rope. « Marcher, c'est tirer : celui d'en haut remonte les autres. »
 * Design notes: docs/coop-levels/coop01.md. Bot solution and closed shortcuts: coop01.solution.ts.
 *
 * Left to right, then down and back left (64 x 21):
 * - Le couloir (x 1-25, floor top 13, 4 high): the B12 (the key room) is seen through the window
 *   "%" at its end; whoever rushes ahead is held back by the rope.
 * - Le muret de 3 (x 26, top 10): its face is the window. Ruben is the base, a friend jumps from his
 *   head and walks on to haul him up. 11 flat cells on top (x 26-36).
 * - La tranchée (x 37-38, 3 deep, with a floor: nobody can die) at the foot of a 3-high wall (top 7):
 *   the friend jumps across from Ruben's head, the others let themselves fall in and are hauled up
 *   the 6-high face. 12 flat cells on top (x 39-50).
 * - Three slabs down (drops of 3, x 51-59) into the B12 (floor top 19), back left under the top
 *   floor to the key on a pillar 3 high and 1 wide (x 31), right behind the window, grabbed from
 *   a 2-tower; then the door of the B12 (x 42).
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop01: CoopLevelDef = {
  id: "coop01",
  name: "La Rentrée",
  quote: "C'est où la B12 ?",
  rows: [
    "################################################################",
    "####################...........................................#",
    "####################...........................................#",
    "####################...........................................#",
    "####################...........................................#",
    "####################...........................................#",
    "####################...........................................#",
    "####################...................############............#",
    "####################...................############............#",
    "#......................................############............#",
    "#.........................###########..###############.........#",
    "#.........................%.........#..############............#",
    "#.S.......................%.........#..############............#",
    "###########################.........###############...###......#",
    "###########################....................................#",
    "###########################....K...............................#",
    "###########################....#.........................###...#",
    "################################..........D....................#",
    "################################..........D....................#",
    "################################################################",
    "################################################################",
  ],
  signs: [
    { x: 11, y: 10.3, text: "Personne ne lâche personne" },
    { x: 23, y: 7.5, text: "Salle B12 →" },
    { x: 31, y: 7.6, text: "Tire !" },
    { x: 44.5, y: 4.6, text: "Saute, je te remonte !" },
    { x: 56, y: 8, text: "En bas !" },
    { x: 42.5, y: 16.2, text: "Salle B12" },
    { x: 34, y: 14.6, text: "Ruben, fais la base !" },
  ],
};
