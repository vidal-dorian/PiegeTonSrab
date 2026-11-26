/**
 * Name labels above the co-op bodies: when friends stand close, their names would print over each
 * other ("J1" and "Ruben (J2)" side by side at the start). Each label that overlaps one already
 * placed is lifted by its height, as many times as needed: names stack instead of colliding.
 */

export interface LabelBox {
  /** Centre x and bottom y, pixels (the label's origin is its bottom centre). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How far up (pixels, >= 0) to lift each label so that none overlaps another; placed left to right. */
export function stackLabels(boxes: readonly LabelBox[], gap = 2): number[] {
  const lifts = boxes.map(() => 0);
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[a]!.x - boxes[b]!.x || a - b);
  const placed: Array<{ x0: number; x1: number; y0: number; y1: number }> = [];
  for (const i of order) {
    const b = boxes[i]!;
    const x0 = b.x - b.w / 2;
    const x1 = b.x + b.w / 2;
    let lift = 0;
    for (let guard = 0; guard < boxes.length; guard++) {
      const y1 = b.y - lift;
      const y0 = y1 - b.h;
      const hit = placed.find((p) => x0 < p.x1 && p.x0 < x1 && y0 < p.y1 && p.y0 < y1);
      if (!hit) break;
      lift = b.y - hit.y0 + gap;
    }
    lifts[i] = lift;
    placed.push({ x0, x1, y0: b.y - lift - b.h, y1: b.y - lift });
  }
  return lifts;
}
