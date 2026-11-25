import type { LevelDefinition } from "../level";

/**
 * Le Puits: the one map read from right to left. Jump off the well's rim into the well,
 * run left through the cistern under the rock (two floors side by side, so five players never
 * queue in one corridor), then up to F on the far left. About 9-10 s for a good player
 * (55 cells of running from S to F, about 8 s flat out).
 * - Start on the rim at the top right: a thin stone lip over the well water. The well is 10
 *   wide and 10 deep, open to the sky; everyone falls and lands together on its floor. There
 *   is no floor under the rim: whoever drifts back right in the fall, or is shoved off the
 *   right end of the well floor, drowns.
 * - No bypass: the rock is closed above, with a solid roof over the whole cistern and a wall
 *   down the well's left side that stops just above the gallery floor, so nothing built in the
 *   well or on the rim leads anywhere but down. Every route goes through the well floor and
 *   the whole length of the cistern, and placed springs or platforms only open other lines
 *   through it (the old Le Puits lost its whole well to a staircase built over it).
 * - Two floors from the well to the finish, linked all along:
 *   - the low cistern (4 high), over a pair of pits split by a one-block stone (push spot;
 *     a built-in vine hangs over the far pit), then a single pit;
 *   - the gallery above it, reached from the well floor by a step: a thin slab with three
 *     2-wide holes, each with a wooden plank under it (hop up from the cistern through the
 *     hole, or drop down). The vault over the gallery is high, with rock teeth only near the
 *     roof: room for traps, and for springs and platforms that open higher lines.
 * - The finish shelf at the far left, one step above the gallery: jump the 5-cell gap from
 *   the gallery's end (fall short and you land in the cistern), take the built-in spring on
 *   the cistern floor under that gap, or hop up through either of the shelf's two holes from
 *   their planks. The shelf and the open vault over it leave room for five arrivals and traps.
 * Built-in objects: one spring, one vine, ten wooden planks (map platforms under the holes).
 * No built-in hazards.
 */
export const level6: LevelDefinition = {
  name: "Le Puits",
  rows: [
    "##############################################..................",
    ".......................##.........##.....#...#..................",
    ".......................##.........##.....#...#..................",
    ".......................##.........##.........#..................",
    ".............................................#..................",
    ".............................................#..............S...",
    ".............................................#..........########",
    ".............................................#..................",
    ".............................................#..................",
    ".....F..........................................................",
    "#..####..###....................................................",
    ".................##..######..#######..######....................",
    "..............................V.................................",
    ".==....==..........==......==.......==......##..................",
    "................................................................",
    "..............T.................................................",
    "######################..#####..#..######################........",
    "######################..#####..#..######################........",
  ],
};
