/**
 * Level 3, "L'Amphi": Ruben weighs two... but the order matters. Notes: docs/coop-levels/coop03.md.
 *
 * Left to right, from the back corridor of the lecture hall (floor top 12) up to the back row of
 * benches (aisle floor top 10), then down the tiers to the stage:
 * 1. Relais (x 9-17): gate g with a plate "1" on each side (a before, b after). The plate before
 *    is 3 cells short of the gate, so nobody opens it and runs through alone.
 * 2. La place de Ruben (x 22-25): the seat is a 1 x 1 pocket at the end of a 1-high tunnel, on
 *    plate c ("2"): one body fits, nobody stands on it, and nothing lower is near enough to hang
 *    from it. Its step k is a still platform read before c: a second friend who leans into the
 *    pocket stands on k and weighs nothing on c. The tunnel's ceiling is gate h (over its mouth) and
 *    plate d ("1", the first cells of the upper floor, right over the seat): whoever goes up
 *    through h and stands on d holds h for Ruben, with the rope straight through d to him.
 * 3. Le contrôle surprise (x 26-41): plate "W-1" (p, the bench, one cell above the aisle, two seats,
 *    under a ceiling two cells over it: a friend on a head at most, so nobody stands high enough for
 *    Ruben to hang from him far out on the aisle and still be over the trapdoor before it shuts)
 *    opens the 2-cell trapdoor w just left of it; the one friend left free drops into the cellar
 *    under the bench. w is a platform on the bench's link that slides under the bench while the
 *    bench holds W-1, and back the step it lets go: unlike a gate, it never waits for a body in its
 *    way, so the friend below cannot hop up into it and hold it open for someone else. The bench's
 *    end m, over w's right half, is an inverted gate on the same link: shut (a step at the bench's
 *    height) while w is open, a pit the rest of the time. Whoever leaves the bench towards w stands
 *    on m, which the bench lets go of, and w is back before he is past it, even dragged there by
 *    the rope. The rope runs down through w and round the aisle's edge, so the
 *    team must come over w for him to reach the key (behind gate n, under the aisle). Plate f ("= 1", in the cellar floor)
 *    opens gate x, which stands on the bench's last cell, and shuts n: the team goes out onto the
 *    first tier and the rope keeps the free friend far from the key, so take it first. Plate r
 *    ("1", on the first tier) opens e, the cellar's side door onto that tier, for him.
 * 4. The tiers (gradins) down to the stage (estrade) and the door.
 *
 * The cellar's ceiling from w to e is things only (w, m over it, the bench, e is a door in its side
 * wall): the rope from the team to the free friend goes through it wherever he walks under the bench.
 * w is one-way, as every platform is: someone in the cellar can jump up through it into the pen
 * (back towards the start), never down through it.
 */
import type { CoopLevelDef } from "../levelFormat";

export const coop03: CoopLevelDef = {
  id: "coop03",
  name: "L'Amphi",
  quote: "Je me mets au fond, personne me verra.",
  rows: [
    "#####################################################################",
    "#####################################################################",
    "#####################################################################",
    "#####################################################################",
    "#####################################################################",
    "#######################..........####...............................#",
    "#######################..........####...............................#",
    "#.............g.......h.............x...............................#",
    "#.............g.......h.............x...............................#",
    "#.............g.......h..........mppp...............................#",
    "#.............g.......hddd######ww...e..............................#",
    "#.S...........g...........##K..n.....e..............................#",
    "#########aa####bbb######kc######s##f###rrr##........................#",
    "############################################........................#",
    "################################################..................D.#",
    "################################################..................D.#",
    "####################################################........#########",
    "####################################################........#########",
    "#####################################################################",
    "#####################################################################",
    "#####################################################################",
  ],
  legend: {
    // 1. Relais.
    a: { kind: "plate", need: 1, link: "relais" },
    g: { kind: "gate", link: "relais" },
    b: { kind: "plate", need: 1, link: "relais" },
    // 2. La place de Ruben. The step k is a platform that never moves (no plate drives "marche"); it
    // comes before c in reading order, so someone straddling both stands on k and weighs nothing on c.
    h: { kind: "gate", link: "place" },
    d: { kind: "plate", need: 1, link: "place" },
    k: { kind: "mover", link: "marche" },
    c: { kind: "plate", need: 2, link: "place" },
    // 3. Le contrôle surprise. f (only a lone friend can stand on it, down in the cellar) frees the
    // team and shuts the key's gate n; r, once everyone is out, opens the cellar's door e.
    x: { kind: "gate", link: "libre" },
    p: { kind: "plate", need: "W-1", link: "controle" },
    // The trapdoor: a platform that slides 2 cells right, under the bench, while the bench holds
    // W-1, in one step (240 cells/s), and back in one step when it lets go. A gate here never shut
    // while the free friend below hopped with his head in it, and the one leaving the bench
    // followed him in (integration's skeptic, round 2); a platform passes through a body from below.
    w: { kind: "mover", link: "controle", dx: 2, speed: 240 },
    // The bench's end m, over the trapdoor's right half: shut while the bench holds W-1 (the trapdoor
    // slid away), so that nobody leaving the bench falls straight in; open the rest of the time (a
    // pit onto the trapdoor).
    m: { kind: "gate", link: "controle", inverted: true },
    e: { kind: "gate", link: "sortie" },
    r: { kind: "plate", need: 1, link: "sortie" },
    // The door's inside plate, 3 cells from it: nobody opens e from inside alone and gets out, but
    // two shut in the cellar (the team dragged in through e, say) let each other out.
    s: { kind: "plate", need: 1, link: "sortie" },
    n: { kind: "gate", link: "libre", inverted: true },
    f: { kind: "plate", need: 1, exact: true, link: "libre" },
  },
  signs: [
    { x: 9.5, y: 8, text: "Tiens-moi la porte" },
    { x: 19.5, y: 9, text: "Réservé : Ruben" },
    { x: 28, y: 6, text: "Contrôle surprise !" },
    { x: 28, y: 7.3, text: "Tout le monde assis... sauf un" },
    { x: 29.5, y: 12.7, text: "clés confisquées" },
    { x: 35.5, y: 13.4, text: "Un seul pote" },
    { x: 55, y: 8, text: "Amphi B" },
    { x: 63, y: 13, text: "Estrade" },
  ],
};
