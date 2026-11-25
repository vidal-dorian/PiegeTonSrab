/**
 * A small practice course for the test bots (not part of the campaign: files starting with "_"
 * are skipped by check-coop-level --all). It is also the reference example of a level file and
 * of its bot solution (_course.solution.ts).
 */
import type { CoopLevelDef } from "../levelFormat";

/** Floor top 12 on the left, a 3-high wall from x 15 (top 9) with the key and the door on it. */
export const courseLevel: CoopLevelDef = {
  id: "_course",
  name: "Parcours",
  rows: (() => {
    const rows: string[] = [];
    for (let y = 0; y < 14; y++) {
      let r = "";
      for (let x = 0; x < 32; x++) {
        const solid = y === 0 || x === 0 || x === 31 || y >= 12 || (x >= 15 && y >= 9);
        r += solid ? "#" : ".";
      }
      rows.push(r);
    }
    const set = (x: number, y: number, c: string) => {
      rows[y] = rows[y]!.slice(0, x) + c + rows[y]!.slice(x + 1);
    };
    set(2, 11, "S");
    set(24, 8, "K");
    set(29, 7, "D");
    set(29, 8, "D");
    return rows;
  })(),
};
