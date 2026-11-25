import { describe, expect, it } from "vitest";
import { formatPoints, trapCell } from "./ui/points";

describe("points display", () => {
  it("writes points with a French decimal comma", () => {
    expect(formatPoints(0.5)).toBe("0,5");
    expect(formatPoints(10)).toBe("10");
    expect(formatPoints(2.5)).toBe("2,5");
    expect(formatPoints(10.5)).toBe("10,5");
    expect(formatPoints(0)).toBe("0");
  });

  it("the Pièges cell explains points that differ from the victim count", () => {
    expect(trapCell({ kills: 0, pushKills: 0, victims: 0 })).toBe("0");
    expect(trapCell({ kills: 1, pushKills: 0, victims: 1 })).toBe("1");
    expect(trapCell({ kills: 2, pushKills: 1, victims: 1 })).toBe("2 (1 victime, 1 poussé)");
    expect(trapCell({ kills: 2.5, pushKills: 0, victims: 3 })).toBe("2,5 (3 victimes)");
    expect(trapCell({ kills: 0.5, pushKills: 0, victims: 1 })).toBe("0,5 (1 victime)");
    expect(trapCell({ kills: 4.5, pushKills: 2, victims: 3 })).toBe("4,5 (3 victimes, 2 poussés)");
  });
});
