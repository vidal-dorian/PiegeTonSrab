/**
 * Level 3, "L'Amphi": Ruben weighs two... but the order matters. Notes: docs/coop-levels/coop03.md.
 *
 * Left to right, along the back corridor of the lecture hall (floor top 9, ceiling 4):
 * 1. Relais (x 9-17): gate g with a plate "1" on each side (a before, b after). The plate before
 *    is 3 cells short of the gate, so nobody opens it and runs through alone.
 * 2. La place de Ruben (x 24-30): plate "2" (c) on a shelf over a 1-high passage, then gate h; a
 *    plate "1" (d) after the gate lets the one on the shelf through.
 * 3. Le contrôle surprise (x 34-49): plate "W-1" (p) opens the trapdoor w behind it; whoever is
 *    left free drops into the basement under the benches and takes the key behind gate n. The
 *    shelf plate "= 1" (f) opens the exit gate x and closes n: take the key first. Plate "2" (r)
 *    after x lets the shelf's friend out.
 * 4. The tiers (gradins) down to the stage (estrade) and the door.
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop03: CoopLevelDef = {
  id: "coop03",
  name: "L'Amphi",
  quote: "Je me mets au fond, personne me verra.",
  rows: [
    "##################################################################################",
    "##################################################################################",
    "##################################################################################",
    "##################################################################################",
    "#.............g............#..................#..................................#",
    "#.............g............#..................#..................................#",
    "#.............g............#..................#..................................#",
    "#.............g.........cc.#.................f#..................................#",
    "#.S...........g............h..................x..................................#",
    "#########aa####bbb##########ddd####wwppppp#####rrr###............................#",
    "###################################...n.K.###########............................#",
    "#########################################################........................#",
    "#########################################################........................#",
    "#############################################################.................D..#",
    "#############################################################.................D..#",
    "#################################################################........#########",
    "#################################################################........#########",
    "##################################################################################",
    "##################################################################################",
  ],
  legend: {
    // 1. Relais.
    a: { kind: "plate", need: 1, link: "relais" },
    g: { kind: "gate", link: "relais" },
    b: { kind: "plate", need: 1, link: "relais" },
    // 2. La place de Ruben.
    c: { kind: "plate", need: 2, link: "place" },
    h: { kind: "gate", link: "place" },
    d: { kind: "plate", need: 1, link: "place" },
    // 3. Le contrôle surprise.
    w: { kind: "gate", link: "controle" },
    p: { kind: "plate", need: "W-1", link: "controle" },
    n: { kind: "gate", link: "libre", inverted: true },
    f: { kind: "plate", need: 1, exact: true, link: "libre" },
    x: { kind: "gate", link: "libre" },
    r: { kind: "plate", need: 2, link: "libre" },
  },
  signs: [
    { x: 9.5, y: 5, text: "Tiens-moi la porte" },
    { x: 25.5, y: 5, text: "Place réservée" },
    { x: 37.6, y: 4.8, text: "Contrôle surprise !" },
    { x: 38.5, y: 6.1, text: "Tout le monde assis... sauf un" },
    { x: 39, y: 11.6, text: "clés confisquées" },
    { x: 43.4, y: 4.8, text: "Une seule personne" },
    { x: 64, y: 6, text: "Amphi B" },
    { x: 77, y: 11, text: "Estrade" },
  ],
};
