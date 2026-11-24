import type { LevelDefinition } from "../level";

/**
 * Le Labyrinthe: four stacked corridors (3 cells high) linked by 2-3-wide holes in their
 * ceilings (rows 4, 8, 12), cut into rooms by walls at columns 11, 22, 33 and 44. Read from
 * the bottom left (S) to the top right (F, top corridor near the right edge), roughly 12-16 s.
 * - Most room walls have a way through: a 1-high crawl under it (walk), a hurdle over it, or a
 *   hole to the floor above right next to it. The top corridor is cut by full walls at 22 and
 *   44, so its rooms are entered from below. Dead ends are a few cells at most.
 * - Floor changes: stand on a 1-high step under a hole and jump 3 through it (tight), or use
 *   the easier 2-high step under one hole per floor (columns 16-17, 13-14, 18-19).
 * - Bottom corridor: a 2-wide deadly floor gap at columns 36-37 (jump spot, push spot), then
 *   a spring at column 50 that throws you through the 2-wide hole at 50-51 into corridor 2.
 * - Middle: a tall vine room (vine at 26,5 above a 7-wide hole in row 8) joins corridors 2
 *   and 3 for a swing; the right side climbs through holes at 51-53 and 54-55.
 * - Top corridor: a saw hangs under the ceiling at 16,1 over the left rooms; F sits in the
 *   last room (columns 45-55), reached through the holes at 46-47 or 54-55.
 * Three built-in objects (saw, vine, spring), none near the start.
 */
export const level8: LevelDefinition = {
  name: "Le Labyrinthe",
  rows: [
    "########################################################",
    "................*.....#..........#..........#...........",
    "......................#..........#..........#...........",
    "...........#..........#.....................#......F....",
    "##..##############..##########..#########..###..######..",
    "...........#..............V......#......................",
    "...........#......##.............#......................",
    "..##.......#......##.............#.......##.#.##......##",
    "#######..####..########.......#######..###########...###",
    "...........#.....................#..........#...........",
    "...........#.##..................#..........#...........",
    ".......##....##.......#......#...#...##............##...",
    "##..############..######..#############..#########..####",
    "......................#..........#..........#...........",
    "................##....#..........#..........#...........",
    "..##...S...#....##......##.............##.........T.....",
    "####################################..##################",
    "####################################..##################",
  ],
};
