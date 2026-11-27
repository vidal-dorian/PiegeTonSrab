/**
 * Level 4, "La Salle de TP": a crate is sacrificed so that another can pass.
 * Notes: docs/coop-levels/coop04.md.
 *
 * Left to right:
 * 1. Le marchepied (x 1-26): the team starts in the 2-high corridor (floor row 14), Ruben in
 *    front of the PC tower "a" (need 2). He pushes it through M (x 13-14, 5 high) into the shaft
 *    J (x 15), against the upper floor's wall, and climbs on it; his neighbour jumps from M onto
 *    his head, then up J onto the upper floor (row 9, height 5) and hauls the others over the
 *    lip. From 3 players the climber's other neighbour must wait in the cable duct (x 9-12,
 *    floor row 11, 1 high, reached with a leg-up in M): from the floor its rope, measured round
 *    the shaft's lip, is too short for the climber's jump; from the duct's mouth it reaches. From
 *    4 players a floor sensor in M (plate p, need 4) shuts the hatch l at the top of J under a
 *    human tower; the PC tower rests on a rail ("|", x 15) over a 2-deep pit, off the sensor.
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
    "#############..2################^^^########wwwwww#####", // 9
    "#########.......######################################", // 10
    "#############...######################################", // 11
    "#.......a.......######################################", // 12
    "#S......a.......######################################", // 13
    "#############113######################################", // 14
    "###############4######################################", // 15
    "###############4######################################", // 16
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
    // The pit under the rail (4-5): 2 deep, a lone jump gets out of it.
    "4": { "2-3": "#", "4-5": "." },
  },
  signs: [
    { x: 5.6, y: 12.3, text: "Ruben pousse comme deux" },
    { x: 10.9, y: 9.6, text: "Gaine technique" },
    { x: 10.9, y: 11.55, text: "Corde trop courte ? Attends dans la gaine" },
    { x: 21, y: 5.2, text: "Poussez ensemble !" },
    { x: 31, y: 6.3, text: "Câbles dénudés" },
    { x: 44.2, y: 6.55, text: "Toute la classe sur la plaque" },
    // Ruben's neighbour waiting on the floor holds him back from the key (critic re-check).
    { x: 44.6, y: 7.5, text: "Le suivant monte sur la tour" },
    { x: 49.5, y: 1.6, text: "Sortie" },
  ],
};
