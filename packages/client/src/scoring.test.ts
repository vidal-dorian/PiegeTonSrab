/**
 * Round scoring with push-kills (decided 2026-11-25): a kill is worth 1 to the trap's owner,
 * 2 if the owner pushed the victim into it themselves; a pusher who doesn't own the trap
 * gets nothing. The killCap most valuable victims count at full value; a trap kill is never
 * worth less than POINTS.minKill (0.5): victims past the cap, and every victim in a round
 * nobody finished. Self-kills, map objects and pits stay at 0.
 */
import { describe, expect, it } from "vitest";
import {
  createRng,
  DEFAULT_GAME_CONFIG as cfg,
  DEFAULT_MOVEMENT,
  killPoints,
  parseLevel,
  POINTS,
  scoreRound,
  TIMING,
  type RaceResult,
} from "@game/shared";
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

  it("the cap counts the most valuable victims first at full value, the rest 0.5", () => {
    // Three victims for a: one plain, two pushed in by a. The two push-kills count in full.
    const res = [r("a", 10), r("b", null, "a"), r("c", null, "a", "a"), r("d", null, "a", "a"), r("e", 12)];
    expect(line(res, "a")).toMatchObject({ kills: 4.5, pushKills: 2, victims: 3, total: 7.5 });
    // One push-kill and two plain kills: 2 + 1 + 0.5.
    const mixed = [r("a", 10), r("b", null, "a"), r("c", null, "a"), r("d", null, "a", "a"), r("e", 12)];
    expect(line(mixed, "a")).toMatchObject({ kills: 3.5, pushKills: 1, victims: 3, total: 6.5 });
  });

  it("3 plain victims while someone else finishes too: 1 + 1 + 0.5", () => {
    const res = [r("a", 10), r("b", null, "a"), r("c", null, "a"), r("d", null, "a"), r("e", 12)];
    expect(line(res, "a")).toMatchObject({ kills: 2.5, victims: 3, pushKills: 0, total: 5.5 });
  });

  it("4 push-kills by the only finisher: 2 + 2 + 0.5 + 0.5", () => {
    const res = [r("a", 10), r("b", null, "a", "a"), r("c", null, "a", "a"), r("d", null, "a", "a"), r("e", null, "a", "a")];
    expect(line(res, "a")).toMatchObject({ kills: 5, pushKills: 2, victims: 4, total: 9 });
  });

  it("1 push-kill and 2 plain kills: the push counts in full, the 0.5 goes to a plain kill", () => {
    const res = [r("a", 10), r("b", null, "a"), r("c", null, "a", "a"), r("d", null, "a"), r("e", 12)];
    expect(line(res, "a")).toMatchObject({ kills: 3.5, pushKills: 1, victims: 3 });
  });

  it("nobody finished: every trap kill is worth 0.5, pushed or not, and no race points", () => {
    const res = [r("a", null), r("b", null, "a", "a"), r("c", null, "a"), r("d", null, "a"), r("e", null)];
    const s = scoreRound(res, cfg);
    expect(s.verdict).toBe("nobody-finished");
    expect(line(res, "a")).toMatchObject({ finish: 0, first: 0, onlyOne: 0, kills: 1.5, pushKills: 0, victims: 3, total: 1.5 });
    for (const id of ["b", "c", "d", "e"]) expect(line(res, id)).toMatchObject({ kills: 0, victims: 0, total: 0 });
  });

  it("a trap kill always gives its owner at least 0.5; self-kills and map objects give 0", () => {
    const rng = createRng(1234);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)]!;
    for (let round = 0; round < 500; round++) {
      const ids = ["a", "b", "c", "d", "e"].slice(0, 2 + Math.floor(rng() * 4));
      const results = ids.map((id): RaceResult => {
        if (rng() < 0.3) return r(id, 5 + rng() * 30);
        return r(id, null, pick([...ids, null]), pick([...ids, null, null]));
      });
      const s = scoreRound(results, cfg);
      for (const l of s.lines) {
        const victims = results.filter((v) => v.killedBy === l.playerId && v.playerId !== l.playerId);
        expect(l.victims).toBe(victims.length);
        expect(l.kills).toBeGreaterThanOrEqual(POINTS.minKill * victims.length);
        if (victims.length === 0) expect(l.kills).toBe(0);
      }
    }
  });

  it("killPoints, used by the kill notices, gives what scoreRound gives", () => {
    const scored = [r("a", 10), r("b", null, "a"), r("c", null, "a", "a"), r("d", null, "a"), r("e", 12)];
    const nobody = scored.map((v) => (v.playerId === "a" || v.playerId === "e" ? r(v.playerId, null) : v));
    for (const [res, none] of [[scored, false], [nobody, true]] as const) {
      const victims = res.filter((v) => v.killedBy === "a");
      const k = killPoints(victims, "a", cfg, none);
      expect(k).toEqual({ points: line(res, "a").kills, pushKills: line(res, "a").pushKills });
    }
    expect(killPoints([], "a", cfg, false)).toEqual({ points: 0, pushKills: 0 });
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

  it("everyone finished: nobody scores; nobody finished: a push-kill is worth 0.5", () => {
    const everyone = scoreRound([r("a", 10), r("b", 11)], cfg);
    expect(everyone.verdict).toBe("everyone-finished");
    expect(everyone.lines.every((l) => l.total === 0)).toBe(true);
    const res = [r("a", null), r("b", null, "a", "a")];
    expect(scoreRound(res, cfg).verdict).toBe("nobody-finished");
    expect(line(res, "a")).toMatchObject({ kills: 0.5, pushKills: 0, total: 0.5 });
    expect(line(res, "b")).toMatchObject({ kills: 0, total: 0 });
  });

  it("a result without pushedBy reads as a plain kill", () => {
    const res: RaceResult[] = [{ playerId: "a", finishTime: 10, killedBy: null }, { playerId: "b", finishTime: null, killedBy: "a" }];
    expect(line(res, "a")).toMatchObject({ kills: 1, pushKills: 0 });
  });
});

describe("push credit on the victim's machine", () => {
  const level = parseLevel({ name: "flat", rows: ["..........", "S........F", "##########"] });
  const idle = () => ({ left: false, right: false, jumpPressed: false, jumpHeld: false });

  it("credits the latest pusher for TIMING.pushCredit, unless the trap's owner pushed too; forgets on reset", () => {
    const p = new LocalPlayer(level, level, DEFAULT_MOVEMENT);
    expect(p.creditedPusher()).toBeNull();
    p.pushedBy("a");
    p.pushedBy("b");
    p.advance(TIMING.pushCredit / 1000 - 0.1, idle, []);
    expect(p.creditedPusher()).toBe("b");
    expect(p.creditedPusher("a")).toBe("a"); // a later push by b doesn't steal the owner's credit
    expect(p.creditedPusher("x")).toBe("b");
    expect(p.recentPushers()).toEqual(["a", "b"]);
    p.advance(0.2, idle, []);
    expect(p.creditedPusher()).toBeNull();
    expect(p.creditedPusher("a")).toBeNull();
    p.pushedBy("a");
    p.reset();
    expect(p.creditedPusher()).toBeNull();
  });

  it("a body landing on a map spike and a rival's spike at once dies in the rival's trap", () => {
    const tall = parseLevel({ name: "drop", rows: ["..........", "..........", "S........F", "##########"] });
    // Map spikes under the body's centre-left, A's spikes next to them.
    const objects = [
      { id: -1, kind: "spikes" as const, x: 0, y: 2 },
      { id: 5, kind: "spikes" as const, x: 1, y: 2, ownerId: "A" },
    ];
    const drop = (selfId: string) => {
      const p = new LocalPlayer(tall, tall, DEFAULT_MOVEMENT);
      p.selfId = selfId;
      p.controller.x = 0.5;
      p.controller.y = 0;
      p.controller.grounded = false;
      for (let i = 0; i < 200; i++) {
        const out = p.advance(1 / 60, idle, objects);
        if (out) return out.kind === "died" ? out.killer?.id : null;
      }
      return undefined;
    };
    expect(drop("B")).toBe(5);
    // Landing on your own trap and a map spike: the closest one (here the map's) gets it.
    expect(drop("A")).toBe(-1);
  });

  it("the credit window counts simulated time only, not a clock catch-up", () => {
    const p = new LocalPlayer(level, level, DEFAULT_MOVEMENT);
    p.advance(0.5, idle, []);
    p.pushedBy("a");
    p.catchUp(p.time + 1.0); // the tab froze for a second right after the push
    expect(p.creditedPusher()).toBe("a");
    p.advance(TIMING.pushCredit / 1000 - 0.1, idle, []);
    expect(p.creditedPusher()).toBe("a");
    p.advance(0.2, idle, []);
    expect(p.creditedPusher()).toBeNull();
  });
});
