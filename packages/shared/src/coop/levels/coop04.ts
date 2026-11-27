/**
 * Level 4, "La Salle de TP": a crate is sacrificed so that another can pass.
 * Notes: docs/coop-levels/coop04.md.
 *
 * Left to right:
 * 1. Le marchepied (x 1-26): the team starts in the 2-high corridor (floor row 14), Ruben in
 *    front of the PC tower "a" (need 2). He pushes it through M (x 13-14, 5 high) into the shaft
 *    J (x 15), against the upper floor's wall, and climbs on it; his neighbour jumps from M onto
 *    his head, then up J onto the upper floor (row 9, height 5) and hauls the others over the
 *    lip. From 3 players the trap h over J is shut until someone uses the terminal y in the cable
 *    duct (x 9-12, floor row 11, 1 high, 2 high over its mouth where the terminal stands, reached
 *    with a leg-up in M); it then stays open. The climber's other neighbour waits at the duct's
 *    mouth: from the floor its rope, measured round the shaft's lip, is too short for a standing
 *    neighbour (a neighbour jumping with the climber gives it enough: the trap is what makes the
 *    duct needed). From 4 players floor sensors in M and J (plates p and q, need 4 each) shut the
 *    hatch l at the top of J under a human tower; the PC tower weighs nothing on them (Ruben on it
 *    and a friend on his head weigh 3).
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
    "###############6...........rrr.....|....t.......s#####", // 8
    "##########444..2################^^^########wwwwww#####", // 9
    "#########..5....######################################", // 10
    "#############...######################################", // 11
    "#.......a.......######################################", // 12
    "#S......a.......######################################", // 13
    "#############113######################################", // 14
    "######################################################", // 15
  ],
  legend: {
    // 1. Le marchepied.
    // The PC tower weighs nothing on the floor sensors: Ruben on it (2) and a friend on his head
    // (1) leave the hatch open; any 4 bodies standing in M or in J shut it.
    a: { kind: "crate", need: 2, weight: 0 },
    p: { kind: "plate", need: 4, link: "plancher" },
    q: { kind: "plate", need: 4, link: "plancher" },
    l: { kind: "gate", link: "plancher", inverted: true },
    // From 3 players the trap h over J is shut until someone, at the back of the duct, uses the
    // terminal y (it stays open: a latch).
    y: { kind: "terminal", prompt: "Ouvre la trappe", link: "trappe", set: "on" },
    h: { kind: "gate", link: "trappe" },
    // 2. Le fossé du tunnel.
    r: { kind: "crate", need: "W" },
    // 3. Une caisse, deux usages.
    t: { kind: "crate", need: 2 },
    w: { kind: "plate", need: "W", link: "cage" },
    c: { kind: "gate", link: "cage" },
    s: { kind: "spikes", dir: "right" },
  },
  cells: {
    // Floor sensors (M's floor, J's floor) and hatch of beat 1, from 4 players (a 4-tower would
    // reach the upper floor).
    "1": { "2-3": "#", "4-5": "p" },
    "2": { "2-3": ".", "4-5": "l" },
    "3": { "2-3": "#", "4-5": "q" },
    // From 3 players: a recess over the duct's mouth (x 10-12 row 9), the terminal in it, the trap over J.
    "4": { "2": "#", "3-5": "." },
    "5": { "2": ".", "3-5": "y" },
    "6": { "2": ".", "3-5": "h" },
  },
  signs: [
    // Under the corridor's floor: in the corridor it sat on the players' name labels at the spawn.
    { x: 5.0, y: 14.55, text: "Ruben pousse comme deux" },
    // Over the recess of the duct (the terminal's screen fills the recess from 3 players).
    { x: 11.0, y: 8.55, text: "Gaine technique" },
    // Clear of the terminal's link badge (x 11.5) from 3 players.
    { x: 6.5, y: 11.55, text: "Corde courte ? Attends dans la gaine" },
    { x: 21, y: 5.2, text: "Poussez ensemble !" },
    { x: 31, y: 6.3, text: "Câbles dénudés" },
    { x: 44.2, y: 6.55, text: "Toute la classe sur la plaque" },
    // Ruben's neighbour waiting on the floor holds him back from the key (critic re-check).
    { x: 44.6, y: 7.5, text: "Le suivant monte sur la tour" },
    { x: 49.5, y: 1.6, text: "Sortie" },
  ],
};
