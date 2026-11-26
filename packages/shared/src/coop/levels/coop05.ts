/**
 * Level 5, "La Salle" (the gym): « Le pote qui vole fait monter Ruben. » Notes: docs/coop-levels/coop05.md.
 *
 * 1. La poulie (x 1-24): Ruben jumps onto the left pan l; it sinks 4 and the right pan r rises
 *    4, flush with the 1-high tunnel. One by one the friends hop over l onto r and into the tunnel;
 *    Ruben's neighbour, last, hauls Ruben out of the pulley shaft.
 * 2. Le développé-catapulte (x 24-27): Ruben (F1 from 3 players) stands at the tunnel mouth under
 *    the switch k and anchors the rope; F0, the end of the chain, goes down onto the seesaw's far
 *    pad. On « vas-y ! » the anchor jumps into k, the shelf s vanishes, the barbell c falls onto
 *    the raised pad and F0 flies up the shaft. Straight up is the saw; steering left lands him on
 *    the mezzanine, on the key. Ruben falling onto the seesaw himself would hold F0 down by the
 *    rope: the barbell is the weight, Ruben the anchor.
 * 3. Le pote qui vole fait monter Ruben (x 12-26): F0 stands on plate p, the step g appears in the
 *    shaft; the others climb tunnel mouth, step, mezzanine, Ruben last; the key goes to the front
 *    of the queue and everyone goes through the door.
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop05: CoopLevelDef = {
  id: "coop05",
  name: "La Salle",
  quote: "Ça, je maîtrise.",
  rows: [
    "#################################",
    "#........###................#####",
    "#........###................#####",
    "#........###................#####",
    "#........###................#####",
    "#........###.............c..#####",
    "#........###.............s..#####",
    "#........###..D.............#####",
    "#........###..D.......#.K..*#####",
    "#........##############p#...#####",
    "#........################...#####",
    "#........###############k.g.#####",
    "#.S.....l...................#####",
    "########..###############...#####",
    "########..###############...#####",
    "########..###############WWW#####",
    "########..#######################",
    "#########r#######################",
    "#########.#######################",
    "#########.#######################",
    "#########.#######################",
    "#########.#######################",
    "#################################",
    "#################################",
  ],
  legend: {
    // 1. La poulie: one unit of difference moves the pans the whole way (4 cells).
    l: { kind: "pan", balance: "poulie", step: 4, travel: 4 },
    r: { kind: "pan", balance: "poulie", step: 4, travel: 4 },
    // 2. Le développé-catapulte: the barbell rests on shelf s until the switch k is hit. Seesaw v
    //    (from 4 players) tilts further, so a 4-tower on the spent barbell stays short of the mezzanine.
    w: { kind: "seesaw", travel: 0.4 },
    v: { kind: "seesaw", travel: 1.0 },
    k: { kind: "switch" },
    s: { kind: "shelf", group: "A" },
    c: { kind: "crate", need: 2, weight: 2 },
    // 3. Le pote qui vole fait monter Ruben: while the flyer stands on p, the step g holds the team.
    p: { kind: "plate", need: 1, link: "marche" },
    g: { kind: "gate", link: "marche", inverted: true },
  },
  cells: {
    W: { "2-3": "w", "4-5": "v" },
  },
  signs: [
    { x: 8.5, y: 5.5, text: "La poulie" },
    { x: 4.5, y: 8.5, text: "Ruben pèse 2" },
    { x: 18, y: 4, text: "Mezzanine" },
    // A climber who waits behind the block, not on it, stops the next one (critic re-check, 3-5 players).
    { x: 21.2, y: 6.6, text: "Attends sur le banc ↓" },
    { x: 19.5, y: 12.5, text: "Au bout : saute dans le bloc" },
    { x: 26, y: 4.2, text: "Une seule barre !" },
    { x: 25.6, y: 13.5, text: "Toi : pas de saut, tire à gauche" },
  ],
};
