/**
 * Level 3, "L'Amphi": Ruben weighs two... but the order matters. Notes: docs/coop-levels/coop03.md.
 *
 * Left to right, along the back corridor of the lecture hall (floor top 9, ceiling 4):
 * 1. Relais (x 9-17): gate g with a plate "1" on each side (a before, b after). The plate before
 *    is 3 cells short of the gate, so nobody opens it and runs through alone.
 * 2. La place de Ruben (x 24-30): the seat is a 1 x 1 pocket at floor level whose floor is plate c
 *    ("2"), under a 2-high block: one body fits, nobody stands on it, and nothing lower is near
 *    enough to hang from it. Its step k is a still platform read before c: a second friend who
 *    leans into the pocket stands on k and weighs nothing on c. The others jump over the block to
 *    gate h; plate d ("1") after h lets the one in the seat through.
 * 3. Le contrôle surprise (x 33-56): plate "W-1" (p, the bench) opens the trapdoor w, 2 cells
 *    behind it (Ruben, needed on the bench, can never reach it); the one friend left free drops into
 *    the basement. The key is at its left end, behind gate n; plate f ("= 1", in the basement floor
 *    just inside x) opens the exit x for the team and shuts n. Once the team is out, the rope keeps
 *    the free friend away from the key: take it first. Plate r ("1", on the landing) opens the
 *    basement's exit e (in the landing) for him.
 * 4. The tiers (gradins) down to the stage (estrade) and the door.
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop03: CoopLevelDef = {
  id: "coop03",
  name: "L'Amphi",
  quote: "Je me mets au fond, personne me verra.",
  rows: [
    "####################################################################################",
    "####################################################################################",
    "####################################################################################",
    "####################################################################################",
    "#.............g............h..................x....................................#",
    "#.............g............h..................x....................................#",
    "#.............g............h..................x....................................#",
    "#.............g..........##h..................x....................................#",
    "#.S...........g...........#h..................x....................................#",
    "#########aa####bbb######kc##ddd####ww##ppppp#####e###rrr#..........................#",
    "#################################Kn...............#######..........................#",
    "#############################################f###############......................#",
    "#############################################################......................#",
    "#################################################################................D.#",
    "#################################################################................D.#",
    "#####################################################################........#######",
    "#####################################################################........#######",
    "####################################################################################",
    "####################################################################################",
  ],
  legend: {
    // 1. Relais.
    a: { kind: "plate", need: 1, link: "relais" },
    g: { kind: "gate", link: "relais" },
    b: { kind: "plate", need: 1, link: "relais" },
    // 2. La place de Ruben. The step k is a platform that never moves (no plate drives "marche"); it
    // comes before c in reading order, so someone straddling both stands on k and weighs nothing on c.
    k: { kind: "mover", link: "marche" },
    c: { kind: "plate", need: 2, link: "place" },
    h: { kind: "gate", link: "place" },
    d: { kind: "plate", need: 1, link: "place" },
    // 3. Le contrôle surprise. f (only a lone friend can stand on it, down in the basement) frees the
    // team and shuts the key's gate n; r, once everyone is out, opens the basement's exit e.
    w: { kind: "gate", link: "controle" },
    p: { kind: "plate", need: "W-1", link: "controle" },
    n: { kind: "gate", link: "libre", inverted: true },
    x: { kind: "gate", link: "libre" },
    f: { kind: "plate", need: 1, exact: true, link: "libre" },
    r: { kind: "plate", need: 1, link: "sortie" },
    e: { kind: "gate", link: "sortie" },
  },
  signs: [
    { x: 9.5, y: 5, text: "Tiens-moi la porte" },
    { x: 23, y: 5.5, text: "Réservé : Ruben" },
    { x: 37.6, y: 4.8, text: "Contrôle surprise !" },
    { x: 38.5, y: 6.1, text: "Tout le monde assis... sauf un" },
    { x: 34, y: 11.8, text: "clés confisquées" },
    { x: 45.5, y: 12.4, text: "Un seul pote" },
    { x: 66, y: 6, text: "Amphi B" },
    { x: 79.5, y: 11, text: "Estrade" },
  ],
};
