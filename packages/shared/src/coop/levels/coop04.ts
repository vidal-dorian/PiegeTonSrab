/**
 * Level 4, "La Salle de TP": a crate is sacrificed so that another can pass.
 * Notes: docs/coop-levels/coop04.md.
 *
 * Left to right:
 * 1. Le marchepied (x 1-26): the team starts on the cable duct's walkway (floor row 11). Ruben
 *    drops into the corridor below (floor row 14) and pushes the PC tower "a" (need 2) under the
 *    shaft J (x 15); he jumps on it from M (x 14), a friend drops onto his head from the 1-high
 *    duct, jumps onto the upper floor (row 9) and hauls the others. From 4 players a floor
 *    sensor (plates p, q, need 4) shuts the hatch l in the shaft under a human tower; the tower
 *    rests on its rail ("|" at x 15) and never weighs on it.
 * 2. Le fossé du tunnel (x 27-35): everyone in a row pushes the server rack "r" (need W) along
 *    the 1-high tunnel into the ditch of bare cables (x 32-34, "^"); the stop at x 35 holds the
 *    rack right over the ditch.
 * 3. Une caisse, deux usages (x 36-61): the team pushes the second PC tower "t" onto plate w
 *    (need W, the whole team's weight): with the tower's 2 on it, one player is free; he jumps
 *    onto the duct's roof and takes the key through the cage gate c. Then the tower goes on,
 *    onto its rail under the exit shaft J3 (x 52), and everyone hops up it to the door on the
 *    landing (row 5), one at a time from 3 players (floor sensor d, e, need 3, hatch m).
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop04: CoopLevelDef = {
  id: "coop04",
  name: "La Salle de TP",
  quote: "Il est où le bouton pour compiler ?",
  rows: [
    "###############################################################", // 0
    "####################################################..........#", // 1
    "####################################################..........#", // 2
    "####################################################........D.#", // 3
    "###############............#########################........D.#", // 4
    "###############............##########.c.............6##########", // 5
    "###############............##########Kc..............##########", // 6
    "###############............#############t............##########", // 7
    "###############............rrr.....|....t............##########", // 8
    "#.........#####2################^^^######wwwww###5557##########", // 9
    "#S..............####################################8##########", // 10
    "#######.######..###############################################", // 11
    "#######|a.......###############################################", // 12
    "#######|a.......###############################################", // 13
    "##########111113###############################################", // 14
    "###############4###############################################", // 15
    "###############################################################", // 16
    "###############################################################", // 17
  ],
  legend: {
    // 1. Le marchepied.
    a: { kind: "crate", need: 2 },
    p: { kind: "plate", need: 4, link: "plancher1" },
    q: { kind: "plate", need: 4, link: "plancher1" },
    l: { kind: "gate", link: "plancher1", inverted: true },
    // 2. Le fossé du tunnel.
    r: { kind: "crate", need: "W" },
    // 3. Une caisse, deux usages.
    t: { kind: "crate", need: 2 },
    w: { kind: "plate", need: "W", link: "cage" },
    c: { kind: "gate", link: "cage" },
    d: { kind: "plate", need: 3, link: "plancher3" },
    e: { kind: "plate", need: 3, link: "plancher3" },
    m: { kind: "gate", link: "plancher3", inverted: true },
  },
  cells: {
    // Floor sensor and hatch of beat 1, from 4 players (a 4-tower would reach the upper floor).
    "1": { "2-3": "#", "4-5": "p" },
    "2": { "2-3": ".", "4-5": "l" },
    "3": { "2-3": "#", "4-5": "|" },
    "4": { "2-3": "#", "4-5": "q" },
    // Floor sensor and hatch of the exit, from 3 players (a 3-tower would reach the landing).
    "5": { "2": "#", "3+": "d" },
    "6": { "2": ".", "3+": "m" },
    "7": { "2": "#", "3+": "|" },
    "8": { "2": "#", "3+": "e" },
  },
  signs: [
    { x: 12.2, y: 12.4, text: "Ruben pousse comme deux" },
    { x: 11.8, y: 9.6, text: "Gaine technique" },
    { x: 21, y: 5.2, text: "Poussez ensemble !" },
    { x: 31, y: 6.3, text: "Câbles dénudés" },
    { x: 37.5, y: 4.4, text: "Clé confisquée" },
    { x: 43.5, y: 5.9, text: "Le poids de toute la classe" },
    { x: 47.6, y: 7.4, text: "Un à la fois !" },
    { x: 57, y: 2.2, text: "Sortie" },
  ],
};
