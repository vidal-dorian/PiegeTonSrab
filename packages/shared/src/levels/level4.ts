import type { LevelDefinition } from "../level";

/**
 * Les Toits: city rooftops read left to right, about 10-13 s, open sky above.
 * - Roofs at different heights separated by alleys (deadly pits), with chimneys and
 *   antennas to hop over. A spring at the bottom of the second alley gives a fallen runner
 *   a second-chance bounce onto the third roof.
 * - High route: a shop sign hanging over the second roof (row 7), then billboards and
 *   antenna wires floating above the roofs (rows 5-6), running to the tall annex of the
 *   fourth building. The sign floats with two free rows under it, so the roof lane runs
 *   straight underneath: climbing to the high route is a choice, not a forced hop.
 * - Low route: the roofs themselves. The third roof's chimney is a stepped stack (one flue,
 *   one low step) that can be hopped in several ways. The wide alley in the middle (8 cells,
 *   too far to jump) is crossed by going down a balcony, over a raised kiosk roof (1 down,
 *   then 2 up) and up the opposite balcony.
 *   An optional vine hangs from the middle antenna for a fast swing across.
 * - Last alley: a direct jump from the annex or a hop on a 2-wide pillar (push spot), then F.
 *   The annex carries no antenna, so the air above the last alley stays open for both
 *   approaches and for traps around the finish.
 * Built-in objects: one spring, one vine. No built-in hazards.
 *
 * 5 players: the floating sign (instead of a solid chimney) and the stepped chimney give
 * every roof two ways past its obstacle, so one trap never forces single file there, and the
 * open finish approach keeps room for 5 runners arriving together as objects pile up.
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
    "..................###...........................................",
    "................................................................",
    "................................................#####...........",
    ".............##########.......#.................#####.......F...",
    "...S.........##########.......##...........##########....#######",
    "##########...##########...#########........##########....#######",
    "##########...##########...#########......############.##.#######",
    "##########...##########...###########......##########.##.#######",
    "##########...##########...#########....##..##########.##.#######",
    "##########...##########...#########...##...##########.##.#######",
    "##########...##########.T.#########...##...##########.##.#######",
  ],
};
