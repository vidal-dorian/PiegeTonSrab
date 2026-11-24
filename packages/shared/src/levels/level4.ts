import type { LevelDefinition } from "../level";

/**
 * Les Toits: city rooftops read left to right, about 11-14 s, open sky above.
 * - Roofs at different heights separated by alleys (deadly pits), with chimneys and
 *   antennas to hop over. A spring at the bottom of the second alley gives a fallen runner
 *   a second-chance bounce onto the third roof.
 * - High route: billboards and antenna wires floating above the roofs (rows 5-6), reached
 *   from the chimney of the second roof and running to the tall annex of the fourth building.
 * - Low route: the roofs themselves; the wide alley in the middle (8 cells, too far to jump)
 *   is crossed by going down a balcony, over a raised kiosk roof (1 down, then 2 up) and up
 *   the opposite balcony.
 *   An optional vine hangs from the middle antenna for a fast swing across.
 * - Last alley: a direct jump from the annex or a hop on a 2-wide pillar (push spot), then F.
 * Built-in objects: one spring, one vine. No built-in hazards.
 */
export const level4: LevelDefinition = {
  name: "Les Toits",
  rows: [
    "................................................................",
    "................................................................",
    "................................................................",
    "................................................................",
    "............................#...................................",
    "............................#...............####................",
    ".....................#####...####....#V##.......................",
    "...................................................#............",
    "...................##..............................#............",
    "...................##...........................#####...........",
    ".............##########.......##................#####.......F...",
    "...S.........##########.......##...........##########....#######",
    "##########...##########...#########........##########....#######",
    "##########...##########...#########......############.##.#######",
    "##########...##########...###########......##########.##.#######",
    "##########...##########...#########....##..##########.##.#######",
    "##########...##########...#########...##...##########.##.#######",
    "##########...##########.T.#########...##...##########.##.#######",
  ],
};
