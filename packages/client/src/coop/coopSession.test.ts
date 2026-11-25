/**
 * The co-op room's logic (CoopSession), with a fake clock and network: lobby, the role of
 * Ruben, the intro, levels run by the server's world, inputs, snapshots, pauses and restarts.
 */
import { describe, expect, it } from "vitest";
import {
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_RESTART,
  BIT_RIGHT,
  COOP_HZ,
  COOP_INTRO_MAX_MS,
  COOP_LEVEL_LEAD_MS,
  COOP_PROTOCOL_VERSION,
  COOP_SILENT_MS,
  CoopSession,
  decodeWorld,
  sandboxLevel,
  type CoopServerMessage,
  type CoopSessionIO,
} from "@game/shared/coop";
import { INTRO_DURATION_S } from "./intro/introContract";

class FakeIO implements CoopSessionIO {
  t = 1_000_000;
  sent: Array<{ to: string; msg: CoopServerMessage }> = [];
  seed = 0.42;
  private timers: Array<{ at: number; fn: () => void; every?: number; id: number }> = [];
  private nextId = 1;

  now() {
    return this.t;
  }
  send(to: string, msg: CoopServerMessage) {
    this.sent.push({ to, msg });
  }
  broadcast(msg: CoopServerMessage) {
    this.sent.push({ to: "*", msg });
  }
  random() {
    return this.seed;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, id });
    return () => {
      this.timers = this.timers.filter((x) => x.id !== id);
    };
  }
  setInterval(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, every: ms, id });
    return () => {
      this.timers = this.timers.filter((x) => x.id !== id);
    };
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = this.timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.t = next.at;
      if (next.every) next.at += next.every;
      else this.timers = this.timers.filter((x) => x !== next);
      next.fn();
    }
    this.t = end;
  }
  last<T extends CoopServerMessage["type"]>(type: T, to?: string): Extract<CoopServerMessage, { type: T }> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const s = this.sent[i]!;
      if (s.msg.type === type && (to === undefined || s.to === to || s.to === "*")) return s.msg as Extract<CoopServerMessage, { type: T }>;
    }
    return undefined;
  }
  all<T extends CoopServerMessage["type"]>(type: T): Array<Extract<CoopServerMessage, { type: T }>> {
    return this.sent.filter((s) => s.msg.type === type).map((s) => s.msg as Extract<CoopServerMessage, { type: T }>);
  }
}

function room(names: string[]): { io: FakeIO; s: CoopSession; ids: string[] } {
  const io = new FakeIO();
  const s = new CoopSession(io, "ABCD", [sandboxLevel]);
  const ids = names.map((n, i) => {
    const id = `p${i}`;
    expect(s.addPlayer(id, n, COOP_PROTOCOL_VERSION)).toBeNull();
    return id;
  });
  return { io, s, ids };
}

/** Start level 0 directly and run up to tick 0. */
function playing(names: string[]) {
  const r = room(names);
  r.s.handle(r.ids[0]!, { type: "coopPlay", index: 0 });
  r.io.advance(COOP_LEVEL_LEAD_MS);
  return r;
}

/** The world of the last snapshot. */
function lastWorld(io: FakeIO) {
  const snap = io.last("coopSnap")!;
  return { tick: snap.tick, state: decodeWorld(snap.world) };
}

/** Body index (place in the rope chain) of a player in the current level. */
function seatOf(io: FakeIO, id: string): number {
  return io.last("coopLevel")!.seats.findIndex((x) => x.id === id);
}

/** Current server tick for this session. */
function tickNow(io: FakeIO): number {
  const lvl = io.last("coopLevel")!;
  return Math.floor(((io.t - lvl.startsAt) * COOP_HZ) / 1000);
}

describe("co-op lobby", () => {
  it("refuses an old client version and a sixth player", () => {
    const io = new FakeIO();
    const s = new CoopSession(io, "ABCD", [sandboxLevel]);
    expect(s.addPlayer("old", "Old", COOP_PROTOCOL_VERSION - 1)).toMatch(/recharge la page/);
    for (let i = 0; i < 5; i++) expect(s.addPlayer(`p${i}`, `P${i}`)).toBeNull();
    expect(s.addPlayer("p5", "P5")).toMatch(/plein/);
  });

  it("gives seats in arrival order and the host role to the first", () => {
    const { io } = room(["Léo", "Alice", "Bob"]);
    const lobby = io.last("coopLobby")!.lobby;
    expect(lobby.mode).toBe("coop");
    expect(lobby.hostId).toBe("p0");
    expect(lobby.players.map((p) => p.color)).toEqual([0, 1, 2]);
  });

  it("Ruben: claimed by oneself (last press wins), given by the host, freed by Ruben or the host", () => {
    const { io, s } = room(["Léo", "Alice", "Bob"]);
    s.handle("p1", { type: "coopRuben", playerId: "p1" });
    expect(io.last("coopLobby")!.lobby.rubenId).toBe("p1");
    s.handle("p2", { type: "coopRuben", playerId: "p2" });
    expect(io.last("coopLobby")!.lobby.rubenId).toBe("p2");
    // A non-host cannot give the role to someone else.
    s.handle("p1", { type: "coopRuben", playerId: "p0" });
    expect(io.last("coopLobby")!.lobby.rubenId).toBe("p2");
    s.handle("p0", { type: "coopRuben", playerId: "p1" });
    expect(io.last("coopLobby")!.lobby.rubenId).toBe("p1");
    s.handle("p1", { type: "coopRuben", playerId: null });
    expect(io.last("coopLobby")!.lobby.rubenId).toBeNull();
  });

  it("the intro casts a player named Ruben when nobody picked the role, else draws one by lot", () => {
    const named = room(["Léo", "rubén", "Bob"]);
    named.s.handle("p0", { type: "coopStart" });
    const cast = named.io.last("coopIntro")!.cast;
    expect(cast.ruben).toMatchObject({ id: "p1", drawnByLot: false });
    expect(cast.friends.map((f) => f.id)).toEqual(["p0", "p2"]);

    const lot = room(["Léo", "Alice", "Bob"]);
    lot.io.seed = 0.7;
    lot.s.handle("p0", { type: "coopStart" });
    expect(lot.io.last("coopIntro")!.cast.ruben).toMatchObject({ id: "p2", drawnByLot: true });
  });

  it("the first level starts when everyone finished the intro, or at the time limit", () => {
    const all = room(["Léo", "Alice"]);
    all.s.handle("p0", { type: "coopStart" });
    all.s.handle("p0", { type: "coopIntroDone" });
    expect(all.io.last("coopLevel")).toBeUndefined();
    all.s.handle("p1", { type: "coopIntroDone" });
    expect(all.io.last("coopLevel")).toMatchObject({ index: 0, levelId: sandboxLevel.id });

    const late = room(["Léo", "Alice"]);
    late.s.handle("p0", { type: "coopStart" });
    late.s.handle("p0", { type: "coopIntroDone" });
    late.io.advance(COOP_INTRO_MAX_MS);
    expect(late.io.last("coopLevel")).toBeDefined();
  });
});

describe("co-op level run by the server", () => {
  it("puts Ruben last in the rope chain", () => {
    const { s, io } = room(["Léo", "Alice", "Bob"]);
    s.handle("p0", { type: "coopRuben", playerId: "p1" });
    s.handle("p0", { type: "coopPlay", index: 0 });
    const seats = io.last("coopLevel")!.seats;
    expect(seats.map((x) => x.id)).toEqual(["p0", "p2", "p1"]);
    expect(seats.map((x) => x.isRuben)).toEqual([false, false, true]);
  });

  it("follows the clock and sends about 30 snapshots per second", () => {
    const { io } = playing(["Léo", "Alice"]);
    const before = io.all("coopSnap").length;
    io.advance(1000);
    const snaps = io.all("coopSnap").length - before;
    expect(snaps).toBeGreaterThanOrEqual(28);
    expect(snaps).toBeLessThanOrEqual(32);
    expect(lastWorld(io).tick).toBeGreaterThanOrEqual(tickNow(io) - 2);
  });

  it("applies a player's inputs at their tick, and a late input as soon as it arrives", () => {
    // Alice plays Ruben: last in the chain, so nothing blocks her on the right.
    const r = room(["Léo", "Alice"]);
    r.s.handle("p1", { type: "coopRuben", playerId: "p1" });
    r.s.handle("p0", { type: "coopPlay", index: 0 });
    r.io.advance(COOP_LEVEL_LEAD_MS);
    const { io, s } = r;
    const alice = seatOf(io, "p1");
    expect(alice).toBe(1);
    const x0 = lastWorld(io).state.bodies[alice]!.x;
    s.handle("p1", { type: "coopIn", k: [[tickNow(io) + 1, BIT_RIGHT]] });
    // Keep the input alive with heartbeats.
    for (let i = 0; i < 5; i++) {
      io.advance(100);
      s.handle("p1", { type: "coopIn", k: [[tickNow(io) + 1, BIT_RIGHT]] });
    }
    expect(lastWorld(io).state.bodies[alice]!.x).toBeGreaterThan(x0 + 2);
  });

  it("never loses a quick tap, even when its release arrives in the same message", () => {
    const { io, s } = playing(["Léo", "Alice"]);
    const t = tickNow(io);
    // Late burst: press and release for ticks already past.
    s.handle("p0", { type: "coopIn", k: [[t - 5, BIT_JUMP | BIT_JUMP_PRESS], [t - 4, 0]] });
    io.advance(60);
    const world = lastWorld(io).state;
    expect(world.bodies[seatOf(io, "p0")]!.grounded).toBe(false);
  });

  it("a silent player touches nothing after a quarter of a second", () => {
    const { io, s } = playing(["Léo", "Alice"]);
    s.handle("p1", { type: "coopIn", k: [[tickNow(io) + 1, BIT_RIGHT]] });
    io.advance(COOP_SILENT_MS + 200);
    const i = seatOf(io, "p1");
    const x1 = lastWorld(io).state.bodies[i]!.x;
    io.advance(500);
    expect(lastWorld(io).state.bodies[i]!.x).toBeCloseTo(x1, 6);
  });

  it("R held by half the team for 1.5 s restarts the level", () => {
    const { io, s } = playing(["Léo", "Alice", "Bob", "Chloé"]);
    const hold = (ids: string[], ms: number) => {
      for (let t = 0; t < ms; t += 100) {
        for (const id of ids) s.handle(id, { type: "coopIn", k: [[tickNow(io) + 1, BIT_RESTART]] });
        io.advance(100);
      }
    };
    hold(["p0"], 2000);
    expect(lastWorld(io).state.attempt).toBe(1);
    hold(["p0", "p2"], 2000);
    const restarts = io.all("coopSnap").flatMap((m) => m.events).filter((e) => e.kind === "restart");
    expect(restarts.length).toBeGreaterThanOrEqual(1);
    expect(restarts[0]).toMatchObject({ by: "Léo" });
    expect(lastWorld(io).state.attempt).toBeGreaterThanOrEqual(2);
  });

  it("waits for a dropped player, then goes on; a player who leaves restarts the level without them", () => {
    const { io, s } = playing(["Léo", "Alice", "Bob"]);
    io.advance(500);
    s.setConnected("p1", false);
    expect(io.last("coopPause")).toMatchObject({ waitingFor: "p1" });
    const frozen = lastWorld(io).tick;
    io.advance(2000);
    expect(lastWorld(io).tick).toBe(frozen);
    s.setConnected("p1", true);
    expect(io.last("coopPause")).toMatchObject({ waitingFor: null });
    io.advance(500);
    expect(lastWorld(io).tick).toBeGreaterThan(frozen + 50);

    s.removePlayer("p2");
    const level = io.last("coopLevel")!;
    expect(level.seats.map((x) => x.id)).not.toContain("p2");
    expect(decodeWorld(io.last("coopSnap")!.world).bodies).toHaveLength(2);
  });

  it("a player joining during a level waits for the next level and sees the current one", () => {
    const { io, s } = playing(["Léo", "Alice"]);
    expect(s.addPlayer("p2", "Bob")).toBeNull();
    expect(io.last("coopLobby")!.lobby.players.find((p) => p.id === "p2")!.waiting).toBe(true);
    expect(io.last("coopLevel", "p2")).toBeDefined();
    expect(decodeWorld(io.last("coopSnap")!.world).bodies).toHaveLength(2);
    s.handle("p0", { type: "coopPlay", index: 0 });
    expect(io.last("coopLevel")!.seats.map((x) => x.id)).toContain("p2");
  });

  it("the host takes everyone back to the lobby", () => {
    const { io, s } = playing(["Léo", "Alice"]);
    s.handle("p1", { type: "coopBack" });
    expect(io.last("coopLobby")!.lobby.phase).toBe("level");
    s.handle("p0", { type: "coopBack" });
    expect(io.last("coopLobby")!.lobby.phase).toBe("lobby");
  });
});

describe("intro timing", () => {
  it("the server waits for the intro its length plus 10 s", () => {
    expect(COOP_INTRO_MAX_MS).toBe((INTRO_DURATION_S + 10) * 1000);
  });
});
