/**
 * Level 2, "Le Labo Réseau": you can lower a friend where nobody can jump.
 *
 * 1. La baie de brassage (top left, no danger): the raised floor of the lab ends on a cable shaft
 *    (a deep catch pit). Under the lip of the floor, a slot leads into the low server room. Nobody
 *    can drop into it (you would have to drift a whole cell sideways while falling past it): a
 *    friend must be lowered to the right depth, where the rope swings him under the lip and onto
 *    the slot's floor. Too close to the edge he hangs below it, too far he hangs beside the lip.
 *    Then the others step off one by one and the ones already in hold them and haul them in,
 *    Ruben last (slowly).
 * 2. Les câbles dénudés (right): Ruben's key hangs on the near wall of a second shaft, stripped
 *    cables below it and on the far wall, spikes at the bottom (deeper than the rope). The anchor
 *    must stop at the right depth. With 3 players or more the key hangs deeper: two friends go down
 *    one below the other, and the bottom one swings a little to touch it.
 *
 * Notes and exact numbers: docs/coop-levels/coop02.md.
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop02: CoopLevelDef = {
  id: "coop02",
  name: "Le Labo Réseau",
  quote: "Un câble RJ45, c'est une corde, non ?",
  rows: [
    "##############################",
    "##..............##############",
    "##..............##############",
    "##..............##############",
    "##..............##############",
    "##.......S......##############",
    "##...#########################",
    "##...........................#",
    "##...............D...........#",
    "##...............D...........#",
    "##....####################..c#",
    "##....####################..c#",
    "##....####################..c#",
    "##....####################k.c#",
    "##....####################a.c#",
    "##....####################a.c#",
    "##....####################ajc#",
    "##....####################..c#",
    "##....####################b.c#",
    "##....####################b.c#",
    "##....####################b.c#",
    "##....####################ddd#",
    "##....########################",
    "##....########################",
    "##....########################",
    "##....########################",
    "##....########################",
    "##....########################",
  ],
  legend: {
    // Stripped cables on the near wall of the second shaft, under the key (2 players)...
    a: { kind: "spikes", dir: "right", players: "2" },
    // ... and under the deeper key (3 players or more).
    b: { kind: "spikes", dir: "right", players: "3+" },
    // Stripped cables on its far wall, and spikes at its bottom.
    c: { kind: "spikes", dir: "left" },
    d: { kind: "spikes", dir: "up" },
  },
  cells: {
    // The key: on the near wall with 2 players, deeper and one cell out with 3 or more.
    k: { "2": "K", "3+": "." },
    j: { "2": ".", "3+": "K" },
  },
  signs: [
    // Last line: Ruben steps off last, and an idle catcher slides 0.3 cells/s under his weight.
    { x: 9, y: 2.2, text: "Avance : il descend.\nRecule : il remonte.\nRuben saute ? On RECULE !" },
    { x: 10, y: 8, text: "Ruben, t'es lourd !" },
    { x: 22.2, y: 8, text: "Stop !\nRemonte un peu !" },
  ],
};
