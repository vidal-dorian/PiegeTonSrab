/**
 * Level 2, "Le Labo Réseau": you can lower a friend where nobody can jump.
 *
 * 1. La baie de brassage (top right, no danger): the raised floor of the lab runs under a low cable
 *    duct to a lip over a cable shaft (a deep catch pit). Under the lip, a slot leads into the low
 *    server room. Nobody can drop into it (you would have to drift a whole cell sideways while
 *    falling past it, and the duct leaves no room to jump onto a friend's head there). The rope
 *    runs over the lip's corner, so the one who steps off (Ruben: he spawns on the right) hangs as
 *    deep as the rope is long past that corner: his anchor stops about two cells back, Ruben hangs
 *    in the slot's mouth and leans in under the lip (the rope wraps its lower corner too), then
 *    the anchor walks towards the edge and sets him down on the slot's floor. Too close to the
 *    edge, he drops below the floor's top against its side: walking back brings him up and in.
 *    Then the others do the same, the ones already in making way, and the last one is hauled up.
 * 2. Les câbles dénudés (left): Ruben's key hangs on the near wall of a second shaft, stripped
 *    cables right below it and on the far wall, spikes at the bottom (deeper than the rope). Whoever
 *    entered the server room first (Ruben) is nearest it and goes down; the rope runs over the
 *    rim's corner, and his anchor must stop at the right depth, in a window of 0.65 cell. With 3
 *    players or more the key hangs deeper: two go down one below the other (Ruben at the bottom),
 *    and Ruben swings a little to touch it.
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
    "##############........########",
    "##############........########",
    "##############........########",
    "##############........########",
    "##############..S...........##",
    "#########################...##",
    "#...........................##",
    "#...........D...............##",
    "#...........D...............##",
    "#c..####################....##",
    "#c..####################....##",
    "#c.k####################....##",
    "#c.a####################....##",
    "#c.a####################....##",
    "#c.a####################....##",
    "#cja####################....##",
    "#c..####################....##",
    "#c.b####################....##",
    "#c.b####################....##",
    "#c.b####################....##",
    "#ddd####################....##",
    "########################....##",
    "########################....##",
    "########################....##",
    "########################....##",
    "########################....##",
    "########################....##",
  ],
  legend: {
    // Stripped cables on the near wall of the second shaft, under the key (2 players)...
    a: { kind: "spikes", dir: "left", players: "2" },
    // ... and under the deeper key (3 players or more).
    b: { kind: "spikes", dir: "left", players: "3+" },
    // Stripped cables on its far wall, and spikes at its bottom.
    c: { kind: "spikes", dir: "right" },
    d: { kind: "spikes", dir: "up" },
  },
  cells: {
    // The key: on the near wall with 2 players (one row above the cables: a narrow window), deeper
    // and one cell out with 3 or more.
    k: { "2": "K", "3+": "." },
    j: { "2": ".", "3+": "K" },
  },
  signs: [
    // On the raised floor, before the duct: how the rope over the lip's corner sets the depth, and
    // what the one hanging in the slot's mouth does.
    { x: 17.9, y: 2.3, text: "Avance : il descend.\nRecule : il remonte.\nEn bas : penche-toi !" },
    // Over shaft B, where Ruben goes down: his anchor slides 0.3 cells/s (0.45 with a friend
    // above him) and the window is 0.65 cell wide.
    { x: 7.8, y: 8, text: "Ruben, t'es lourd !\nStop ! Remonte un peu !" },
  ],
};
