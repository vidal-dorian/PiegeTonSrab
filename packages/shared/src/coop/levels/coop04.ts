/**
 * Level 4, "La Salle de TP": a crate is sacrificed so that another can pass.
 * Notes: docs/coop-levels/coop04.md.
 *
 * Left to right:
 * 1. Le marchepied (x 1-26): the team starts on the cable duct's walkway (floor row 11). Ruben
 *    drops into the corridor below (floor row 14) and pushes the PC tower "a" (need 2) under the
 *    shaft J (x 15); he jumps on it from M (x 14), a friend drops onto his head from the 1-high
 *    duct, jumps onto the upper floor (row 9) and hauls the others. From 4 players a floor
 *    sensor (plate p, need 4) shuts the hatch l in the shaft under a human tower; the PC tower
 *    rests on its rail ("|" at x 15) and never weighs on it. Whoever falls through the rail
 *    walks out by the crawl under the corridor (row 15) and jumps back up at x 6 (4-5 only).
 * 2. Le fossé du tunnel (x 27-35): everyone in a row pushes the server rack "r" (need W) along
 *    the 1-high tunnel into the ditch of bare cables (x 32-34, "^"); the stop at x 35 holds the
 *    rack right over the ditch. Nobody can reach the ditch before the rack covers it: a breather.
 * 3. Une caisse, deux usages (x 40-52): the queue pushes the second PC tower "t" along plate w
 *    (need W, the whole team's weight) into the exit shaft T (x 48), the plate's last cell, where
 *    it stops against the far wall. Bare cables cross the foot of T up to height 2: nobody stands
 *    in it but the tower, and the lab (3 high) holds no human tower that reaches over them. From
 *    the tower the first one up jumps to the landing (row 5) and takes the key behind the cage
 *    gate c: it is open while plate w carries W (the tower's 2 stand for the one up, so with
 *    Ruben up, everyone else stays on the plate). Then everyone hops up the tower to the door.
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop04: CoopLevelDef = {
  id: "coop04",
  name: "La Salle de TP",
  quote: "Il est où le bouton pour compiler ?",
  rows: [
    "######################################################", // 0
    "################################################...###", // 1
    "################################################...###", // 2
    "################################################..Dc##", // 3
    "###############............#####################..DcK#", // 4
    "###############............#####################.#####", // 5
    "###############............#############.........#####", // 6
    "###############............#############t.......s#####", // 7
    "###############............rrr.....|....t.......s#####", // 8
    "#.........#####2################^^^########wwwwww#####", // 9
    "#S..............######################################", // 10
    "#######.######..######################################", // 11
    "######4|a.......######################################", // 12
    "######4|a.......######################################", // 13
    "######4###111113######################################", // 14
    "######4444444444######################################", // 15
    "######################################################", // 16
    "######################################################", // 17
  ],
  legend: {
    // 1. Le marchepied.
    a: { kind: "crate", need: 2 },
    p: { kind: "plate", need: 4, link: "plancher" },
    l: { kind: "gate", link: "plancher", inverted: true },
    // 2. Le fossé du tunnel.
    r: { kind: "crate", need: "W" },
    // 3. Une caisse, deux usages.
    t: { kind: "crate", need: 2 },
    w: { kind: "plate", need: "W", link: "cage" },
    c: { kind: "gate", link: "cage" },
    s: { kind: "spikes", dir: "right" },
  },
  cells: {
    // Floor sensor, hatch and rail of beat 1, from 4 players (a 4-tower would reach the upper floor).
    "1": { "2-3": "#", "4-5": "p" },
    "2": { "2-3": ".", "4-5": "l" },
    "3": { "2-3": "#", "4-5": "|" },
    // The crawl under the corridor and its shaft at x 6: the way out from under the rail (4-5).
    "4": { "2-3": "#", "4-5": "." },
  },
  signs: [
    { x: 12.2, y: 12.4, text: "Ruben pousse comme deux" },
    { x: 11.8, y: 9.6, text: "Gaine technique" },
    { x: 21, y: 5.2, text: "Poussez ensemble !" },
    { x: 31, y: 6.3, text: "Câbles dénudés" },
    { x: 44.2, y: 6.55, text: "Toute la classe sur la plaque" },
    { x: 49.5, y: 1.6, text: "Sortie" },
  ],
};
