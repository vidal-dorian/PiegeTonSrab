/**
 * Level 7, "La BU" (the university library): « Frappe au bon moment : l'escalier apparaît sous
 * leurs pieds. » Notes: docs/coop-levels/coop07.md.
 *
 * One switch state for the whole level: every hit of any switch block swaps the A and B shelves.
 * Rows are y (top 0); "floor top 8" means feet at y 8.
 *
 * 1. Le sas (x 1-14, the 2-high corridor, floor top 11): the A wall a blocks the way; a hit on the
 *    switch s inside the airlock opens it and shuts the B wall z behind (a cell only turns solid
 *    once nobody is in it). The level then plays from B.
 * 2. L'escalier (x 23-30): Ruben stands in the reading alcove (x 23-26, floor top 8, 2 high) under
 *    its switch (f at x 25 at 2 players; b at its back, x 23, from 3, with F1 at its front, the
 *    only spot F0's rope reaches from the top of his climb). F0 jumps from the rim's end onto L1 (B,
 *    top 9), then « 3, 2, 1, frappe ! »: he jumps, Ruben hits, L2 (A, top 7) appears under his
 *    feet; again, and L3 (B, top 5) appears, level with the reading room. The cap over L1 (x 29-30)
 *    and L3 cover all of L1: no tower skips the hits. A hit too early drops him onto the fragile
 *    planks x, one under the rim (a friend holds on them; the pit under them is a catch pit).
 * 3. L'inversion (x 25-29): the room's mouth m is shut whenever L2 is there (A), so nobody jumps from
 *    L2 into the room, and hauling the alcove up jams. The one up hits the room's switch h (A: L2
 *    is back), the alcove's front one runs out onto L2, and the room hits again on his jump (B: L3
 *    under him, the mouth open): the climbers now hit for the hitter, Ruben last.
 * 4. La réserve (x 2-15): the room arrives in B: the footbridge e (A) to the door is gone, the
 *    key's shelf q (B) is there and its cage (bars u, v, w: A) open. The carrier takes the key on
 *    q; the hit of r (A) drops him onto e, over a deadly pit. Standing on e at a B hit kills.
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop07: CoopLevelDef = {
  id: "coop07",
  name: "La BU",
  quote: "Y'a des livres sur la muscu ?",
  rows: [
    "################################",
    "################################",
    "##.........uKv........o..###.###",
    "##D.........w..r......o..h##.###",
    "##D........qqq........o...m..###",
    "##eeeeeeeeeeee#########ttt#33..#",
    "##............#########b.f.....#",
    "##~~~~~~~~~~~~#########.....22.#",
    "##########################g....#",
    "#......z..s...a.............111#",
    "#S.....z......a................#",
    "############################...#",
    "################################",
  ],
  legend: {
    // 1. Le sas: A wall ahead, B wall behind, the switch between them.
    s: { kind: "switch" },
    a: { kind: "shelf", group: "A" },
    z: { kind: "shelf", group: "B" },
    // 2. L'escalier: the alcove's switch (x 25 at 2 players, at its back from 3) and the shelves L1, L2, L3.
    f: { kind: "switch", players: "2" },
    b: { kind: "switch", players: "3+" },
    // L2 and L3 never appear on a head: a hit a moment before the climber's jump (within the
    // coyote time) still lands him on them.
    "1": { kind: "shelf", group: "B" },
    "2": { kind: "shelf", group: "A", spareHeads: true },
    "3": { kind: "shelf", group: "B", spareHeads: true },
    // The alcove's floor end: an idle hitter holding a fallen climber never slides off it.
    g: { kind: "grip" },
    // The reading room's mouth: shut while L2 is there (A), so nobody jumps from L2 into the room.
    m: { kind: "shelf", group: "A" },
    // 3. L'inversion: the reading room's switch, for the ones still in the alcove.
    h: { kind: "switch" },
    // The room's turnstile: shut until the whole team stood on the mat t in front of it (then for
    // good). Until then the room is 4 cells deep: too short to haul a climber up to the mouth.
    t: { kind: "plate", need: "W", standing: true, latch: true, link: "portique" },
    o: { kind: "gate", link: "portique" },
    // 4. La réserve: the footbridge to the exit (A), the key's shelf (B), its bars (A), its switch.
    e: { kind: "shelf", group: "A" },
    q: { kind: "shelf", group: "B" },
    u: { kind: "shelf", group: "A" },
    v: { kind: "shelf", group: "A" },
    w: { kind: "shelf", group: "A" },
    r: { kind: "switch" },
  },
  signs: [
    // 1. Le sas.
    { x: 5.5, y: 8.5, text: "Saute sous le bloc : A ↔ B" },
    { x: 10.5, y: 11.55, text: "Tout le monde dans le sas !" },
    // 2. L'escalier.
    { x: 18.5, y: 6.45, text: "Alcôve : Ruben frappe" },
    { x: 18.5, y: 7.45, text: "« 3, 2, 1, frappe ! »" },
    // 3. L'inversion.
    { x: 19.5, y: 2.55, text: "Salle de lecture", print: true },
    { x: 18.5, y: 8.45, text: "Puis la salle frappe pour l'alcôve" },
    // 4. La réserve.
    { x: 6.5, y: 2.6, text: "Clé sur B, sortie sur A" },
    { x: 7, y: 3.6, text: "Pas sur la passerelle !" },
  ],
};
