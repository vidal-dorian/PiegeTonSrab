import type { ScoreLine } from "@game/shared";

/** Points as French players read them: "2", "0,5", "10,5". Halves are exact; the rounding only guards future values. */
export function formatPoints(n: number): string {
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

/**
 * The "Pièges" cell of the score table: kill points, with the victim count when it differs
 * from the points and the push-kills, so "2" with one victim or "2,5" with three makes sense.
 * Examples: "0", "1", "2 (1 victime, 1 poussé)", "2,5 (3 victimes)", "0,5 (1 victime)".
 */
export function trapCell(l: Pick<ScoreLine, "kills" | "pushKills" | "victims">): string {
  if (l.victims === 0) return "0";
  const details: string[] = [];
  if (l.victims !== l.kills) details.push(`${l.victims} victime${l.victims > 1 ? "s" : ""}`);
  if (l.pushKills > 0) details.push(`${l.pushKills} poussé${l.pushKills > 1 ? "s" : ""}`);
  const points = formatPoints(l.kills);
  return details.length > 0 ? `${points} (${details.join(", ")})` : points;
}
