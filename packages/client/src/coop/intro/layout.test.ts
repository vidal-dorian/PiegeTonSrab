/**
 * Where the cast stands and how names fit (layout.ts): the roped line-up must look intentional
 * for 0 to 4 friends, and a nickname of any shape must never overflow its label.
 */
import { describe, expect, it } from "vitest";
import { fitToWidth, GANG_SPACING, gangLayout, graphemes, TAG_GAP } from "./layout";

/** Screen width in world pixels at the zoom of the two shots that show the line-up (1280 / 2.2). */
const VIEW_W = 1280 / 2.2;

describe("the roped line-up", () => {
  it.each([0, 1, 2, 3, 4])("places Ruben and %i friend(s) evenly, centred", (n) => {
    const lay = gangLayout(n);
    expect(lay.friends).toHaveLength(n);
    expect(lay.tagRow).toHaveLength(n);
    const xs = [lay.ruben, ...lay.friends].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(GANG_SPACING, 6);
    expect(xs[0]! + xs[xs.length - 1]!).toBeCloseTo(0, 6);
  });

  it.each([1, 2, 3, 4])("keeps the rope's order with %i friend(s): Ruben last, the first seat leading", (n) => {
    const lay = gangLayout(n);
    // Ruben is at the left end; the last seat stands next to him; seat 0 is the furthest.
    for (const x of lay.friends) expect(x).toBeGreaterThan(lay.ruben);
    expect(lay.friends[n - 1]! - lay.ruben).toBeCloseTo(GANG_SPACING, 6);
    for (let i = 1; i < n; i++) expect(lay.friends[i]!).toBeLessThan(lay.friends[i - 1]!);
  });

  it.each([0, 1, 2, 3, 4])("never lets two name labels touch with %i friend(s), however long the names", (n) => {
    const lay = gangLayout(n);
    const labels = [{ x: lay.ruben, row: lay.rubenTagRow }, ...lay.friends.map((x, i) => ({ x, row: lay.tagRow[i]! }))];
    for (let i = 0; i < labels.length; i++) {
      expect(i === 0 ? [2] : [0, 1]).toContain(labels[i]!.row);
      for (let j = i + 1; j < labels.length; j++) {
        if (labels[i]!.row !== labels[j]!.row) continue;
        // Two labels of the same row, both as wide as allowed, keep a gap.
        expect(Math.abs(labels[i]!.x - labels[j]!.x) - lay.tagMaxWidth).toBeGreaterThanOrEqual(TAG_GAP - 1e-9);
      }
    }
    // Neighbours are always on different rows.
    const sorted = [...labels].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.row).not.toBe(sorted[i - 1]!.row);
  });

  it.each([0, 1, 2, 3, 4])("fits on screen with %i friend(s), labels included", (n) => {
    const lay = gangLayout(n);
    expect(lay.tagMaxWidth).toBeGreaterThan(GANG_SPACING);
    // Both shots put the line a little left of centre (at most 50 world pixels) to leave room for a door.
    expect(lay.halfWidth + 50).toBeLessThan(VIEW_W / 2);
    for (const x of [lay.ruben, ...lay.friends]) expect(Math.abs(x) + lay.tagMaxWidth / 2).toBeLessThanOrEqual(lay.halfWidth + 1e-9);
  });

  it("clamps silly friend counts", () => {
    expect(gangLayout(-3).friends).toHaveLength(0);
    expect(gangLayout(9).friends).toHaveLength(4);
    expect(gangLayout(2.7).friends).toHaveLength(2);
  });
});

describe("fitting a name in a label", () => {
  /** A fake font: every character is 10 wide, as a reader counts characters. */
  const measure = (s: string): number => graphemes(s).length * 10;

  it("leaves a name that fits untouched", () => {
    expect(fitToWidth("Léo", 100, measure)).toBe("Léo");
    expect(fitToWidth("Joueur 2", 80, measure)).toBe("Joueur 2");
  });

  it("cuts a long name and ends it with an ellipsis, within the width", () => {
    const fitted = fitToWidth("WWWWWWWWWWWWWWWW", 100, measure);
    expect(fitted).toBe("WWWWWWWWW…");
    expect(measure(fitted)).toBeLessThanOrEqual(100);
  });

  it.each([
    "WWWWWWWWWWWWWWWW",
    "Jean-Christophe2",
    "ééééééééééééééé",
    "🔥 Le Boss 🔥🔥🔥🔥🔥",
    "👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦👨‍👩‍👧‍👦",
    "a b c d e f g h",
    "Joueur 2",
  ])("never overflows, whatever the width: %s", (name) => {
    for (const width of [0, 10, 25, 60, 148, 400]) {
      const fitted = fitToWidth(name, width, measure);
      expect(fitted.length).toBeGreaterThan(0);
      if (fitted !== "…") expect(measure(fitted)).toBeLessThanOrEqual(width);
      if (fitted !== name.replace(/\s+/g, " ").trim()) expect(fitted.endsWith("…")).toBe(true);
    }
  });

  it("never cuts an emoji in half", () => {
    const family = "👨‍👩‍👧‍👦";
    const fitted = fitToWidth(family.repeat(5), 30, measure);
    expect(fitted).toBe(`${family}${family}…`);
    expect(graphemes(family)).toHaveLength(1);
    expect(graphemes("été")).toHaveLength(3);
  });

  it("tidies spaces, and does not leave one before the ellipsis", () => {
    expect(fitToWidth("  Le   Boss  ", 200, measure)).toBe("Le Boss");
    expect(fitToWidth("Le Boss du 12", 40, measure)).toBe("Le…");
  });
});
