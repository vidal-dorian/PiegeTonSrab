import { describe, expect, it } from "vitest";
import {
  createRng,
  DEFAULT_GAME_CONFIG as cfg,
  drawOffer,
  gameWinner,
  objectsForRound,
  scoreRound,
  type RaceResult,
} from "@game/shared";

const r = (playerId: string, finishTime: number | null, killedBy: string | null = null): RaceResult => ({
  playerId,
  finishTime,
  killedBy,
});
const totals = (results: RaceResult[], solo = false) =>
  Object.fromEntries(scoreRound(results, cfg, solo).lines.map((l) => [l.playerId, l.total]));

describe("rules", () => {
  it("3 objects for the first 3 rounds, then 2", () => {
    for (const players of [1, 2, 3, 4]) {
      expect([1, 2, 3, 4, 10].map((n) => objectsForRound(cfg, n, players))).toEqual([3, 3, 3, 2, 2]);
    }
  });

  it("2 objects from round 1 in a full room of 5", () => {
    expect([1, 2, 3, 4, 10].map((n) => objectsForRound(cfg, n, 5))).toEqual([2, 2, 2, 2, 2]);
  });

  it("draw is reproducible from its seed and has the requested size", () => {
    const a = drawOffer(createRng(42), 5);
    const b = drawOffer(createRng(42), 5);
    expect(a).toHaveLength(5);
    expect(a).toEqual(b);
  });

  it("finish 2, first +1, only finisher +1, kills +1 each", () => {
    expect(totals([r("a", 10), r("b", null, "a"), r("c", null, "a")])).toEqual({ a: 6, b: 0, c: 0 });
    expect(totals([r("a", 10), r("b", 12), r("c", null, "b")])).toEqual({ a: 3, b: 3, c: 0 });
  });

  it("2 victims a round count at full value, each further one 0.5", () => {
    const res = [r("a", 10), r("b", null, "a"), r("c", null, "a"), r("d", null, "a")];
    expect(scoreRound(res, cfg).lines.find((l) => l.playerId === "a")).toMatchObject({ kills: 2.5, victims: 3 });
  });

  it("dying to your own object gives nothing", () => {
    expect(totals([r("a", null, "a"), r("b", 10)])).toEqual({ a: 0, b: 4 });
  });

  it("everyone finished: nobody scores (except in solo test mode)", () => {
    expect(scoreRound([r("a", 10), r("b", 11)], cfg).verdict).toBe("everyone-finished");
    expect(totals([r("a", 10), r("b", 11)])).toEqual({ a: 0, b: 0 });
    expect(totals([r("a", 10)], true)).toEqual({ a: 4 });
  });

  it("nobody finished: no race points, each trap kill is worth 0.5", () => {
    const s = scoreRound([r("a", null, "b"), r("b", null)], cfg);
    expect(s.verdict).toBe("nobody-finished");
    expect(totals([r("a", null, "b"), r("b", null)])).toEqual({ a: 0, b: 0.5 });
  });

  it("game ends at the target with a single leader; a tie plays on", () => {
    expect(gameWinner(new Map([["a", 9], ["b", 4]]), cfg)).toBeNull();
    expect(gameWinner(new Map([["a", 11], ["b", 4]]), cfg)).toBe("a");
    expect(gameWinner(new Map([["a", 11], ["b", 11]]), cfg)).toBeNull();
  });

  it("half points: a tie at 10.5 plays on, 10.5 against 10 wins, 9.5 is not there yet", () => {
    expect(gameWinner(new Map([["a", 10.5], ["b", 10.5]]), cfg)).toBeNull();
    expect(gameWinner(new Map([["a", 10.5], ["b", 10]]), cfg)).toBe("a");
    expect(gameWinner(new Map([["a", 9.5]]), cfg)).toBeNull();
  });
});
