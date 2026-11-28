/**
 * Level 7, "La BU" (the university library): « Frappe au bon moment : l'escalier apparaît sous
 * leurs pieds. » Notes: docs/coop-levels/coop07.md.
 *
 * One switch state for the whole level: every hit of any switch block swaps the A and B shelves.
 *
 * 1. Le sas (x 1-14, the 2-high corridor): the A wall blocks the way; a hit on the switch inside
 *    the airlock opens it and shuts the B wall behind (a cell only turns solid once nobody is in it).
 * 2. L'escalier (x 23-30): Ruben hits the switch in the reading alcove (x 23-26) on the signal while
 *    the others jump from shelf to shelf over the catch pit (x 28-30): L1 (B) is there, L2 (A) and
 *    L3 (B) appear under their feet. At most two climb at once; from 4 players the ones who wait
 *    stand in the alcove with Ruben (who then hits the switch at its back).
 * 3. L'inversion (x 26-27): at the top the last hit leaves B, so the trapdoor t over the alcove's
 *    mouth is shut and the hitter cannot be hauled up the chimney; the climbers hit the switch in
 *    the reading room (x 26) and haul the alcove up, Ruben last.
 * 4. La réserve (x 8-15): the key's cage opens on B (its bars are A, its shelf q is B) and the exit's
 *    floor e is A, over a deadly pit: off the footbridge before hitting, and the last hit drops the
 *    key carrier from q onto the footbridge.
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop07: CoopLevelDef = {
  id: "coop07",
  name: "La BU",
  quote: "Y'a des livres sur la muscu ?",
  rows: [
    "################################",
    "################################",
    "##.........uKv...........###.###",
    "##D.........w..r.........h##.###",
    "##D........qqq............m..###",
    "##eeeeeeeeeeee#############33..#",
    "##............#########b.f.....#",
    "##~~~~~~~~~~~~#########.....22.#",
    "##########################g....#",
    "#......z..s...a..............11#",
    "#S.....z......a................#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
    "############################...#",
  ],
  legend: {
    // 1. Le sas: A wall ahead, B wall behind, the switch between them.
    s: { kind: "switch" },
    a: { kind: "shelf", group: "A" },
    z: { kind: "shelf", group: "B" },
    // 2. L'escalier: the alcove's switch (at its front up to 3 players, at its back from 4) and the shelves.
    f: { kind: "switch", players: "2" },
    b: { kind: "switch", players: "3+" },
    "1": { kind: "shelf", group: "B" },
    "2": { kind: "shelf", group: "A" },
    "3": { kind: "shelf", group: "B" },
    // The alcove's floor end: an idle hitter holding a fallen climber never slides off it.
    g: { kind: "grip" },
    // The reading room's mouth: shut while L2 is there (A), so nobody jumps from L2 into the room.
    m: { kind: "shelf", group: "A" },
    // 3. L'inversion: the reading room's switch, for the ones still in the alcove.
    h: { kind: "switch" },
    // 4. La réserve: the footbridge to the exit (A), the key's shelf (B), its bars (A), its switch.
    e: { kind: "shelf", group: "A" },
    q: { kind: "shelf", group: "B" },
    u: { kind: "shelf", group: "A" },
    v: { kind: "shelf", group: "A" },
    w: { kind: "shelf", group: "A" },
    r: { kind: "switch" },
  },
  signs: [],
};
