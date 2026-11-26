/**
 * Texts of the co-op screens, and the cleared levels kept on this computer.
 */
import { describe, expect, it } from "vitest";
import { COOP_LEVELS } from "@game/shared/coop";
import { showcaseLevel } from "../devShowcase";
import { parseCleared } from "../progress";
import { attemptsText, bubbleMs, formatClock, formatDuration, levelLabel } from "./coopText";

describe("co-op texts", () => {
  it("numbers campaign levels, keeps the name of others", () => {
    expect(levelLabel(COOP_LEVELS, COOP_LEVELS[0]!)).toBe(`Niveau 1 · ${COOP_LEVELS[0]!.name}`);
    expect(levelLabel(COOP_LEVELS, showcaseLevel)).toBe("Vitrine des objets");
  });

  it("clock, durations and attempts", () => {
    expect(formatClock(7.9)).toBe("0:07");
    expect(formatClock(102)).toBe("1:42");
    expect(formatClock(3723)).toBe("1:02:03");
    expect(formatDuration(42)).toBe("42 s");
    expect(formatDuration(65)).toBe("1 min 05");
    expect(formatDuration(3720)).toBe("1 h 02 min");
    expect(attemptsText(1)).toBe("du premier coup");
    expect(attemptsText(3)).toBe("en 3 essais");
  });

  it("Claude's lines stay a second per 15 characters, within bounds", () => {
    expect(bubbleMs("C'est fait.")).toBe(2800);
    expect(bubbleMs("x".repeat(75))).toBe(5000);
    expect(bubbleMs("x".repeat(300))).toBe(7000);
  });

  it("reads the cleared levels, ignoring anything broken", () => {
    expect(parseCleared(null)).toEqual([]);
    expect(parseCleared("pas du json")).toEqual([]);
    expect(parseCleared('{"a":1}')).toEqual([]);
    expect(parseCleared('["coop01", 3, "", "coop02", "coop01"]')).toEqual(["coop01", "coop02"]);
  });
});
