/**
 * The co-op room's logic (CoopSession), with a fake clock and network: lobby, the role of
 * Ruben, the intro, levels run by the server's world, inputs, snapshots, pauses and restarts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_LEFT,
  BIT_RESTART,
  BIT_RIGHT,
  COOP_HZ,
  COOP_INTRO_MAX_MS,
  COOP_LEVEL_LEAD_MS,
  COOP_PROTOCOL_VERSION,
  COOP_RECONNECT_SECONDS,
  COOP_SILENT_MS,
  CoopSession,
  decodeWorld,
  encodeInput,
  sandboxLevel,
  type CoopClientMessage,
  type CoopServerMessage,
  type CoopSessionIO,
} from "@game/shared/coop";
import { COOP_KEYS, InputSource } from "../input";
import { INTRO_DURATION_S } from "./intro/introContract";
import { CoopInputSender } from "./net/inputSender";

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
  /**
   * The event loop was blocked for `ms`: time jumps, then every timer that was due fires once
   * at the new time (as Colyseus' clock does: one call per late interval, not one per period).
   */
  stall(ms: number) {
    this.t += ms;
    for (const x of this.timers) if (x.at < this.t) x.at = this.t;
    this.advance(0);
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

/** The epoch of the current level's clock (inputs echo it). */
function epochOf(io: FakeIO): number {
  return io.last("coopLevel")!.epoch;
}

/** Every 100 ms for `ms`, each of `ids` sends a heartbeat on the current clock. */
function beat(r: { io: FakeIO; s: CoopSession }, ids: readonly string[], ms: number): void {
  for (let t = 0; t < ms; t += 100) {
    for (const id of ids) r.s.handle(id, { type: "coopIn", e: epochOf(r.io), k: [] });
    r.io.advance(100);
  }
}

/** Held bits of a player in the last snapshot. */
function heldOf(io: FakeIO, id: string): number {
  return io.last("coopSnap")!.held[seatOf(io, id)]!;
}

/** Everybody gets through the door (the world's win, without walking there). */
function clearLevel(s: CoopSession): void {
  const raw = s as unknown as { world: unknown; cleared(world: unknown): void };
  raw.cleared(raw.world);
}

describe("co-op lobby", () => {
  it("refuses an old client version and a sixth player", () => {
    const io = new FakeIO();
    const s = new CoopSession(io, "ABCD", [sandboxLevel]);
    expect(s.addPlayer("old", "Old", COOP_PROTOCOL_VERSION - 1)).toMatch(/recharge la page/);
    for (let i = 0; i < 5; i++) expect(s.addPlayer(`p${i}`, `P${i}`, COOP_PROTOCOL_VERSION)).toBeNull();
    expect(s.addPlayer("p5", "P5", COOP_PROTOCOL_VERSION)).toMatch(/plein/);
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
    s.handle("p1", { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 1, BIT_RIGHT]] });
    // Keep the input alive with heartbeats.
    for (let i = 0; i < 5; i++) {
      io.advance(100);
      s.handle("p1", { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 1, BIT_RIGHT]] });
    }
    expect(lastWorld(io).state.bodies[alice]!.x).toBeGreaterThan(x0 + 2);
  });

  it("never loses a quick tap, even when its release arrives in the same message", () => {
    const { io, s } = playing(["Léo", "Alice"]);
    const t = tickNow(io);
    // Late burst: press and release for ticks already past.
    s.handle("p0", { type: "coopIn", e: epochOf(io), k: [[t - 5, BIT_JUMP | BIT_JUMP_PRESS], [t - 4, 0]] });
    io.advance(60);
    const world = lastWorld(io).state;
    expect(world.bodies[seatOf(io, "p0")]!.grounded).toBe(false);
  });

  it("a silent player touches nothing after a quarter of a second", () => {
    const { io, s } = playing(["Léo", "Alice"]);
    s.handle("p1", { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 1, BIT_RIGHT]] });
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
        for (const id of ids) s.handle(id, { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 1, BIT_RESTART]] });
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
    expect(s.addPlayer("p2", "Bob", COOP_PROTOCOL_VERSION)).toBeNull();
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

describe("team-size variants on the server", () => {
  it("the server's world is parsed for the team that plays (\"W\" weights and variants)", () => {
    const def = {
      id: "w",
      name: "w",
      rows: ["##########", "#........#", "#S.......#", "####aa####", "##########"],
      legend: { a: { kind: "plate" as const, need: "W" as const, link: "L" } },
    };
    const msgs: CoopServerMessage[] = [];
    const io: CoopSessionIO = {
      now: () => 0,
      send: () => undefined,
      broadcast: (m) => msgs.push(m),
      setTimeout: () => () => undefined,
      setInterval: () => () => undefined,
      random: () => 0,
    };
    const s = new CoopSession(io, "ABCD", [def]);
    s.addPlayer("a", "a", COOP_PROTOCOL_VERSION);
    s.addPlayer("b", "b", COOP_PROTOCOL_VERSION);
    s.addPlayer("c", "c", COOP_PROTOCOL_VERSION);
    s.handle("a", { type: "coopPlay", index: 0 });
    const world = (s as unknown as { world: { props: { plates: Array<{ need: number }> } } }).world;
    expect(world.props.plates[0]!.need).toBe(4); // 3 players: two friends and Ruben
  });
});

describe("co-op inputs across clock changes (level epochs)", () => {
  it("keys sent during a pause neither replay nor hold back the player's inputs after the resume", () => {
    const r = playing(["Léo", "Alice", "Bob"]);
    const { io, s } = r;
    beat(r, r.ids, 500);
    s.setConnected("p2", false);
    const before = io.last("coopLevel")!;
    beat(r, ["p0", "p1"], 5000);
    // Léo taps Right while waiting, stamped on the clock he still has (it kept running).
    const stamp = Math.ceil(((io.t - before.startsAt) * COOP_HZ) / 1000) + 1;
    s.handle("p0", { type: "coopIn", e: before.epoch, k: [[stamp, BIT_RIGHT], [stamp + 24, 0]] });
    beat(r, ["p0", "p1"], 4800);
    s.setConnected("p2", true);
    const x0 = lastWorld(io).state.bodies[seatOf(io, "p0")]!.x;
    // Back on the new clock, Léo holds Left: it applies at once, and the stale Right never does.
    s.handle("p0", { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 1, BIT_LEFT]] });
    beat(r, r.ids, 300);
    expect(heldOf(io, "p0")).toBe(BIT_LEFT);
    let maxX = x0;
    for (let i = 0; i < 60; i++) {
      beat(r, r.ids, 100);
      maxX = Math.max(maxX, lastWorld(io).state.bodies[seatOf(io, "p0")]!.x);
    }
    expect(maxX).toBeLessThan(x0 + 0.01);
    // The resume set tick 0 again: a new epoch.
    expect(epochOf(io)).not.toBe(before.epoch);
  });

  it("an input stamped on the old clock, in flight when the level is rebuilt, is dropped", () => {
    const r = playing(["Léo", "Alice", "Bob"]);
    const { io, s } = r;
    beat(r, r.ids, 20_000);
    const old = io.last("coopLevel")!;
    const staleStamp = tickNow(io) + 6;
    s.removePlayer("p2");
    // Sent before Léo got the new coopLevel: it arrives 30 ms after the rebuild.
    io.advance(30);
    s.handle("p0", { type: "coopIn", e: old.epoch, k: [[staleStamp, 0]] });
    beat(r, ["p0", "p1"], COOP_LEVEL_LEAD_MS + 200);
    s.handle("p0", { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 1, BIT_RIGHT]] });
    beat(r, ["p0", "p1"], 300);
    expect(heldOf(io, "p0")).toBe(BIT_RIGHT);
    expect(io.last("coopSnap")!.pending[seatOf(io, "p0")]).toEqual([]);
    expect(epochOf(io)).not.toBe(old.epoch);
  });

  it("each snapshot acks the last stamp received from each player, on this level's clock", () => {
    const r = playing(["Léo", "Alice"]);
    const { io, s } = r;
    beat(r, r.ids, 300);
    expect(io.last("coopSnap")!.ack).toEqual([0, 0]);
    const stamp = tickNow(io) + 30;
    s.handle("p1", { type: "coopIn", e: epochOf(io), k: [[stamp - 1, BIT_RIGHT], [stamp, 0]] });
    beat(r, r.ids, 100);
    // Still queued (its stamp is ahead) and acked; a far stamp is acked as sent, not as clamped.
    expect(io.last("coopSnap")!.ack[seatOf(io, "p1")]).toBe(stamp);
    expect(io.last("coopSnap")!.ack[seatOf(io, "p0")]).toBe(0);
    s.handle("p0", { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 10 * COOP_HZ, BIT_RIGHT]] });
    beat(r, r.ids, 100);
    expect(io.last("coopSnap")!.ack[seatOf(io, "p0")]).toBeGreaterThan(tickNow(io) + 9 * COOP_HZ);
    // A new clock (here the level started again) acks nothing yet.
    s.handle(r.ids[0]!, { type: "coopPlay", index: 0 });
    io.advance(COOP_LEVEL_LEAD_MS);
    beat(r, r.ids, 200);
    expect(io.last("coopSnap")!.ack).toEqual([0, 0]);
  });

  it("a stamp far ahead of the clock applies at most half a second later", () => {
    const r = playing(["Léo", "Alice"]);
    const { io, s } = r;
    beat(r, r.ids, 300);
    s.handle("p1", { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 10 * COOP_HZ, BIT_RIGHT]] });
    beat(r, r.ids, 700);
    expect(heldOf(io, "p1")).toBe(BIT_RIGHT);
  });

  it("inputs outside a level are ignored", () => {
    const r = room(["Léo", "Alice"]);
    const { io, s } = r;
    const queueOf = (id: string) => (s as unknown as { players: Map<string, { queue: unknown[] }> }).players.get(id)!.queue;
    s.handle("p1", { type: "coopIn", e: 0, k: [[1, BIT_RIGHT]] });
    expect(queueOf("p1")).toEqual([]);
    s.handle("p0", { type: "coopPlay", index: 0 });
    s.handle("p0", { type: "coopBack" });
    s.handle("p1", { type: "coopIn", e: epochOf(io), k: [[1, BIT_LEFT]] });
    expect(queueOf("p1")).toEqual([]);
  });

  it("a server stall that moves tick 0 sends the new clock, and inputs stamped on it apply at once", () => {
    // Alice plays Ruben: last in the chain, nothing blocks her on the right.
    const r = room(["Léo", "Alice"]);
    r.s.handle("p1", { type: "coopRuben", playerId: "p1" });
    r.s.handle("p0", { type: "coopPlay", index: 0 });
    r.io.advance(COOP_LEVEL_LEAD_MS);
    const { io, s } = r;
    beat(r, r.ids, 500);
    const levels = io.all("coopLevel").length;
    const old = io.last("coopLevel")!;
    io.stall(5000);
    expect(io.all("coopLevel")).toHaveLength(levels + 1);
    const moved = io.last("coopLevel")!;
    expect(moved.epoch).not.toBe(old.epoch);
    expect(moved.startsAt).toBeGreaterThan(old.startsAt);
    // The clock the clients get matches the world again (once it caught up, a snapshot later).
    io.advance(50);
    expect(Math.abs(tickNow(io) - lastWorld(io).tick)).toBeLessThanOrEqual(6);
    s.handle("p1", { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 1, BIT_RIGHT]] });
    beat(r, r.ids, 200);
    expect(heldOf(io, "p1")).toBe(BIT_RIGHT);
  });

  it("a short silence does not erase a held key: the player goes on when heard again", () => {
    const r = room(["Léo", "Alice"]);
    r.s.handle("p1", { type: "coopRuben", playerId: "p1" });
    r.s.handle("p0", { type: "coopPlay", index: 0 });
    r.io.advance(COOP_LEVEL_LEAD_MS);
    const { io, s } = r;
    s.handle("p1", { type: "coopIn", e: epochOf(io), k: [[tickNow(io) + 1, BIT_RIGHT]] });
    beat(r, r.ids, 400);
    expect(heldOf(io, "p1")).toBe(BIT_RIGHT);
    // A 300 ms hitch: nothing from anyone. Meanwhile Alice touches nothing.
    io.advance(COOP_SILENT_MS + 50);
    expect(heldOf(io, "p1")).toBe(0);
    const x1 = lastWorld(io).state.bodies[seatOf(io, "p1")]!.x;
    // Her heartbeats come back; her client still holds Right (and sends no new change).
    beat(r, r.ids, 1000);
    expect(heldOf(io, "p1")).toBe(BIT_RIGHT);
    expect(lastWorld(io).state.bodies[seatOf(io, "p1")]!.x).toBeGreaterThan(x1 + 1);
  });
});

describe("co-op room roles and reconnections", () => {
  it("refuses a client that sends no version", () => {
    const io = new FakeIO();
    const s = new CoopSession(io, "ABCD", [sandboxLevel]);
    expect(s.addPlayer("old", "Vieux", undefined)).toMatch(/recharge la page/);
    expect(s.addPlayer("new", "Neuf", COOP_PROTOCOL_VERSION)).toBeNull();
  });

  it("the host leaving while the others reconnect leaves a host: the first one back", () => {
    const lobby = room(["Léo", "Alice"]);
    lobby.s.setConnected("p1", false);
    lobby.s.removePlayer("p0");
    lobby.s.setConnected("p1", true);
    expect(lobby.io.last("coopLobby")!.lobby.hostId).toBe("p1");
    lobby.s.handle("p1", { type: "coopStart" });
    expect(lobby.io.last("coopLobby")!.lobby.phase).toBe("intro");

    const level = playing(["Léo", "Alice", "Bob"]);
    level.s.setConnected("p1", false);
    level.s.setConnected("p2", false);
    level.s.removePlayer("p0");
    expect(level.io.last("coopLobby")!.lobby.hostId).not.toBe("");
    level.s.setConnected("p2", true);
    expect(level.io.last("coopLobby")!.lobby.hostId).toBe("p2");
    level.s.handle("p2", { type: "coopBack" });
    expect(level.io.last("coopLobby")!.lobby.phase).toBe("lobby");
  });

  it("a dropped player inside their reconnection window stays in a rebuilt team, and the level waits for them", () => {
    const r = playing(["Léo", "Alice", "Bob"]);
    const { io, s } = r;
    beat(r, r.ids, 500);
    const droppedAt = io.t;
    s.setConnected("p1", false);
    beat(r, ["p0", "p2"], 2000);
    s.removePlayer("p2");
    expect(io.last("coopLevel")!.seats.map((x) => x.id)).toEqual(["p0", "p1"]);
    // The wait started when Alice dropped, not at the rebuild.
    expect(io.last("coopPause")).toMatchObject({ waitingFor: "p1", until: droppedAt + COOP_RECONNECT_SECONDS * 1000 });
    const frozen = lastWorld(io).tick;
    beat(r, ["p0"], 3000);
    expect(lastWorld(io).tick).toBe(frozen);
    s.setConnected("p1", true);
    expect(io.last("coopPause")).toMatchObject({ waitingFor: null });
    expect(io.last("coopLevel")!.seats.map((x) => x.id)).toEqual(["p0", "p1"]);
    beat(r, ["p0", "p1"], COOP_LEVEL_LEAD_MS + 500);
    expect(lastWorld(io).tick).toBeGreaterThan(50);
  });

  it("a player who drops at the end of the intro plays the first level: it starts waiting for them", () => {
    const r = room(["Léo", "Alice"]);
    const { io, s } = r;
    s.handle("p0", { type: "coopStart" });
    io.advance(80_000);
    s.handle("p0", { type: "coopIntroDone" });
    s.setConnected("p1", false);
    expect(io.last("coopLevel")!.seats.map((x) => x.id).sort()).toEqual(["p0", "p1"]);
    expect(io.last("coopPause")).toMatchObject({ waitingFor: "p1" });
    s.setConnected("p1", true);
    expect(io.last("coopPause")).toMatchObject({ waitingFor: null });
    expect(decodeWorld(io.last("coopSnap")!.world).bodies).toHaveLength(2);
  });

  it("a player who missed the end-of-level card gets it again when they reconnect", () => {
    const r = playing(["Léo", "Alice"]);
    const { io, s } = r;
    io.advance(500);
    // Chloé joins and watches; her connection drops just before the team clears the level.
    expect(s.addPlayer("p2", "Chloé", COOP_PROTOCOL_VERSION)).toBeNull();
    s.setConnected("p2", false);
    clearLevel(s);
    const card = io.last("coopCleared")!;
    const mark = io.sent.length;
    s.setConnected("p2", true);
    const toChloe = io.sent.slice(mark).filter((m) => m.to === "p2").map((m) => m.msg);
    expect(toChloe.map((m) => m.type)).toEqual(["coopLobby", "coopCleared"]);
    expect(toChloe[1]).toEqual(card);
    // Once the next level started, there is no card to send.
    s.handle("p0", { type: "coopPlay", index: 0 });
    s.setConnected("p2", false);
    const mark2 = io.sent.length;
    s.setConnected("p2", true);
    expect(io.sent.slice(mark2).some((m) => m.msg.type === "coopCleared")).toBe(false);
  });

  it("the story replayed from the select phase reaches the players still on the card: the lobby first", () => {
    const r = playing(["Léo", "Alice"]);
    const { io, s } = r;
    clearLevel(s);
    // Chloé joins between levels (the lobby screen), Alice blips, Léo leaves: Chloé is the host.
    expect(s.addPlayer("p2", "Chloé", COOP_PROTOCOL_VERSION)).toBeNull();
    s.setConnected("p1", false);
    s.removePlayer("p0");
    s.setConnected("p1", true);
    expect(io.last("coopLobby")!.lobby.hostId).toBe("p2");
    const mark = io.sent.length;
    s.handle("p2", { type: "coopStart" });
    const after = io.sent.slice(mark).map((m) => m.msg);
    const lobbyAt = after.findIndex((m) => m.type === "coopLobby" && m.lobby.phase === "intro");
    const introAt = after.findIndex((m) => m.type === "coopIntro");
    expect(lobbyAt).toBeGreaterThanOrEqual(0);
    expect(introAt).toBeGreaterThan(lobbyAt);
  });
});

describe("the client's inputs while the world waits (CoopInputSender)", () => {
  it("sends only heartbeats during a pause; after the resume nothing replays and its keys apply at once", () => {
    const r = playing(["Léo", "Alice", "Bob"]);
    const { io, s } = r;
    const fromLeo: CoopClientMessage[] = [];
    // A sender per level screen, as CoopScene starts over on every coopLevel.
    const senderFor = () => {
      const lvl = io.last("coopLevel")!;
      return new CoopInputSender(
        (m) => {
          fromLeo.push(m);
          s.handle("p0", m);
        },
        lvl.epoch,
        () => ((io.t - lvl.startsAt) * COOP_HZ) / 1000,
      );
    };
    let sender = senderFor();
    /** Run `ms` with Léo's keys from `keys(t)`, the others sending heartbeats. */
    const run = (ms: number, keys: (t: number) => number, others: string[]) => {
      for (let t = 0; t < ms; t += 10) {
        sender.sample(keys(t));
        sender.flush(io.t);
        if (t % 100 === 0) for (const id of others) s.handle(id, { type: "coopIn", e: epochOf(io), k: [] });
        io.advance(10);
      }
    };
    run(500, () => 0, ["p1", "p2"]);
    s.setConnected("p2", false);
    sender.setPaused(true);
    const mark = fromLeo.length;
    // Waiting for Bob, Léo fidgets: Right held, and four jumps.
    run(4000, (t) => BIT_RIGHT | (t % 900 < 100 ? BIT_JUMP : 0) | (t % 900 === 0 ? BIT_JUMP_PRESS : 0), ["p1"]);
    const during = fromLeo.slice(mark);
    expect(during.length).toBeGreaterThan(30);
    expect(during.every((m) => m.type === "coopIn" && m.k.length === 0)).toBe(true);
    s.setConnected("p2", true);
    sender = senderFor();
    const leo = seatOf(io, "p0");
    const y0 = lastWorld(io).state.bodies[leo]!.y;
    run(300, () => BIT_LEFT, ["p1", "p2"]);
    expect(heldOf(io, "p0")).toBe(BIT_LEFT);
    let minY = y0;
    for (let i = 0; i < 20; i++) {
      run(100, () => BIT_LEFT, ["p1", "p2"]);
      minY = Math.min(minY, lastWorld(io).state.bodies[leo]!.y);
    }
    // No jump from the pause ever replays.
    expect(minY).toBeGreaterThan(y0 - 0.05);
  });

  it("sends the keys still held once the pause lifts", () => {
    const sent: CoopClientMessage[] = [];
    let tick = 100;
    const sender = new CoopInputSender((m) => sent.push(m), 7, () => tick);
    sender.sample(BIT_RIGHT);
    sender.flush(0);
    expect(sent.pop()).toEqual({ type: "coopIn", e: 7, k: [[101, BIT_RIGHT]] });
    sender.setPaused(true);
    sender.sample(BIT_RIGHT | BIT_JUMP | BIT_JUMP_PRESS);
    sender.flush(200);
    expect(sent.pop()).toEqual({ type: "coopIn", e: 7, k: [] });
    sender.setPaused(false);
    tick = 300;
    sender.sample(BIT_RIGHT);
    sender.flush(400);
    expect(sent.pop()).toEqual({ type: "coopIn", e: 7, k: [[301, BIT_RIGHT]] });
  });
});

describe("a key held while the level screen starts over (keepHeldKeys)", () => {
  // No Phaser here: a "screen" is what CoopScene.create builds for this player on every
  // coopLevel, an input source taken from the carry and a sender on that level's clock.
  let win: EventTarget;
  beforeEach(() => {
    win = new EventTarget();
    vi.stubGlobal("window", win);
    vi.stubGlobal("navigator", { getGamepads: () => [] });
    vi.stubGlobal("HTMLInputElement", class {});
    vi.stubGlobal("HTMLTextAreaElement", class {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const key = (type: "keydown" | "keyup", code: string) =>
    win.dispatchEvent(Object.assign(new Event(type), { code, repeat: false }));

  it("a key held through a resume and a server stall is still sent, and its release too", () => {
    // Alice plays Ruben: last in the chain, nothing blocks her on the right.
    const r = room(["Léo", "Alice", "Bob"]);
    r.s.handle("p1", { type: "coopRuben", playerId: "p1" });
    r.s.handle("p0", { type: "coopPlay", index: 0 });
    r.io.advance(COOP_LEVEL_LEAD_MS);
    const { io, s } = r;
    let source: InputSource | null = null;
    let sender!: CoopInputSender;
    let screens = 0;
    const startScreen = () => {
      // CoopScene.create: the old screen's source is destroyed, a new one starts from the keys held.
      source?.destroy();
      source = new InputSource({ keys: COOP_KEYS, pad: "first", keepHeldKeys: true });
      const lvl = io.last("coopLevel")!;
      sender = new CoopInputSender((m) => s.handle("p1", m), lvl.epoch, () => ((io.t - lvl.startsAt) * COOP_HZ) / 1000);
      screens++;
    };
    startScreen();
    let read = io.sent.length;
    /** Run `ms` frames of 10 ms for Alice's screen, the others in `others` sending heartbeats. */
    const run = (ms: number, others: string[]) => {
      for (let t = 0; t < ms; t += 10) {
        for (; read < io.sent.length; read++) {
          const { to, msg } = io.sent[read]!;
          if (to !== "*" && to !== "p1") continue;
          if (msg.type === "coopLevel") startScreen();
          else if (msg.type === "coopPause") sender.setPaused(msg.waitingFor !== null);
        }
        // No auto-repeat: the OS repeats only the last key pressed, and she tapped jump since.
        source!.poll();
        sender.sample(encodeInput(source!.takeCoopInput()));
        sender.flush(io.t);
        if (t % 100 === 0) for (const id of others) s.handle(id, { type: "coopIn", e: epochOf(io), k: [] });
        io.advance(10);
      }
    };
    run(300, ["p0", "p2"]);
    key("keydown", "ArrowRight");
    run(500, ["p0", "p2"]);
    expect(heldOf(io, "p1")).toBe(BIT_RIGHT);

    // Bob drops: the world waits, Alice keeps Right down; Bob comes back.
    s.setConnected("p2", false);
    run(2000, ["p0"]);
    s.setConnected("p2", true);
    run(1000, ["p0", "p2"]);
    expect(screens).toBe(2);
    expect(heldOf(io, "p1")).toBe(BIT_RIGHT);

    // The server stalls: the clock moves and every screen starts over again.
    io.stall(5000);
    run(500, ["p0", "p2"]);
    expect(screens).toBe(3);
    expect(heldOf(io, "p1")).toBe(BIT_RIGHT);

    // She lets go: the body stops being pushed.
    key("keyup", "ArrowRight");
    run(300, ["p0", "p2"]);
    expect(heldOf(io, "p1")).toBe(0);
  });
});
