/**
 * Round scoring with push-kills (decided 2026-11-25): a kill is worth 1 to the trap's owner,
 * 2 if the owner pushed the victim into it themselves; a pusher who doesn't own the trap
 * gets nothing. At most killCap victims count, the most valuable first.
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_CONFIG as cfg, DEFAULT_MOVEMENT, parseLevel, scoreRound, TIMING, type RaceResult } from "@game/shared";
import { LocalPlayer } from "./sim/localPlayer";

const r = (playerId: string, finishTime: number | null, killedBy: string | null = null, pushedBy: string | null = null): RaceResult => ({
  playerId,
  finishTime,
  killedBy,
  pushedBy,
});
const line = (results: RaceResult[], id: string) => scoreRound(results, cfg).lines.find((l) => l.playerId === id)!;

describe("scoring with push-kills", () => {
  it("a plain kill is worth 1", () => {
    expect(line([r("a", 10), r("b", null, "a"), r("c", 12)], "a")).toMatchObject({ kills: 1, pushKills: 0, total: 4 });
  });

  it("pushing someone into your own trap is worth 2", () => {
    expect(line([r("a", 10), r("b", null, "a", "a"), r("c", 12)], "a")).toMatchObject({ kills: 2, pushKills: 1, total: 5 });
  });

  it("pushing someone into another player's trap: 1 for the owner, nothing for the pusher", () => {
    const res = [r("a", 10), r("b", null, "c", "a"), r("c", null)];
    expect(line(res, "c")).toMatchObject({ kills: 1, pushKills: 0, total: 1 });
    expect(line(res, "a")).toMatchObject({ kills: 0, pushKills: 0, total: 4 });
  });

  it("the cap counts the most valuable victims first", () => {
    // Three victims for a: one plain, two pushed in by a. Only two count: the two push-kills.
    const res = [r("a", 10), r("b", null, "a"), r("c", null, "a", "a"), r("d", null, "a", "a"), r("e", 12)];
    expect(line(res, "a")).toMatchObject({ kills: 4, pushKills: 2, total: 7 });
    // One push-kill and two plain kills: 2 + 1.
    const mixed = [r("a", 10), r("b", null, "a"), r("c", null, "a"), r("d", null, "a", "a"), r("e", 12)];
    expect(line(mixed, "a")).toMatchObject({ kills: 3, pushKills: 1, total: 6 });
  });

  it("a push into someone else's trap never uses up the pusher's own cap", () => {
    const res = [r("a", 10), r("b", null, "a", "a"), r("c", null, "a"), r("d", null, "e", "a"), r("e", null)];
    expect(line(res, "a")).toMatchObject({ kills: 3, pushKills: 1 });
    expect(line(res, "e")).toMatchObject({ kills: 1, pushKills: 0 });
  });

  it("dying in your own trap scores nothing, even when pushed in", () => {
    const res = [r("a", null, "a", "b"), r("b", 10), r("c", null)];
    expect(line(res, "a")).toMatchObject({ kills: 0, total: 0 });
    expect(line(res, "b")).toMatchObject({ kills: 0, total: 4 });
  });

  it("map objects and pits score nothing for anyone", () => {
    // killedBy null: the session sets it for map objects (no owner) and falls.
    const res = [r("a", 10), r("b", null, null, "a"), r("c", null)];
    expect(scoreRound(res, cfg).lines.map((l) => [l.playerId, l.kills, l.total])).toEqual([
      ["a", 0, 4],
      ["b", 0, 0],
      ["c", 0, 0],
    ]);
  });

  it("everyone or nobody finished: nobody scores, push-kills included", () => {
    const everyone = scoreRound([r("a", 10), r("b", 11)], cfg);
    expect(everyone.verdict).toBe("everyone-finished");
    const nobody = scoreRound([r("a", null), r("b", null, "a", "a")], cfg);
    expect(nobody.verdict).toBe("nobody-finished");
    expect(nobody.lines.every((l) => l.total === 0 && l.kills === 0 && l.pushKills === 0)).toBe(true);
  });

  it("a result without pushedBy reads as a plain kill", () => {
    const res: RaceResult[] = [{ playerId: "a", finishTime: 10, killedBy: null }, { playerId: "b", finishTime: null, killedBy: "a" }];
    expect(line(res, "a")).toMatchObject({ kills: 1, pushKills: 0 });
  });
});

describe("push credit on the victim's machine", () => {
  const level = parseLevel({ name: "flat", rows: ["..........", "S........F", "##########"] });
  const idle = () => ({ left: false, right: false, jumpPressed: false, jumpHeld: false });

  it("credits the last pusher for TIMING.pushCredit, and forgets it on reset", () => {
    const p = new LocalPlayer(level, level, DEFAULT_MOVEMENT);
    expect(p.creditedPusher()).toBeNull();
    p.pushedBy("a");
    p.pushedBy("b"); // only the latest push counts
    p.advance(TIMING.pushCredit / 1000 - 0.1, idle, []);
    expect(p.creditedPusher()).toBe("b");
    p.advance(0.2, idle, []);
    expect(p.creditedPusher()).toBeNull();
    p.pushedBy("a");
    p.reset();
    expect(p.creditedPusher()).toBeNull();
  });
});
