import { describe, expect, it } from "vitest";
import {
  buildReachGraph,
  DEFAULT_MOVEMENT,
  erasureKeepsPath,
  GameSession,
  MAX_PLAYERS,
  parseLevel,
  TIMING,
  type LevelDefinition,
  type CardKind,
  type ServerMessage,
  type SessionIO,
} from "@game/shared";
import { PLAYER_COLORS } from "./render/playerColors";

/** Fake clock and network: timers run when the test advances time. */
class FakeIO implements SessionIO {
  t = 1_000_000;
  sent: Array<{ to: string; msg: ServerMessage }> = [];
  private timers: Array<{ at: number; fn: () => void; every?: number; id: number }> = [];
  private nextId = 1;

  now() { return this.t; }
  send(to: string, msg: ServerMessage) { this.sent.push({ to, msg }); }
  broadcast(msg: ServerMessage) { this.sent.push({ to: "*", msg }); }
  seed = 0.42;
  random() { return this.seed; }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, id });
    return () => { this.timers = this.timers.filter((x) => x.id !== id); };
  }
  setInterval(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.push({ at: this.t + ms, fn, every: ms, id });
    return () => { this.timers = this.timers.filter((x) => x.id !== id); };
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
  last<T extends ServerMessage["type"]>(type: T, to?: string): Extract<ServerMessage, { type: T }> | undefined {
    for (let i = this.sent.length - 1; i >= 0; i--) {
      const s = this.sent[i]!;
      if (s.msg.type === type && (to === undefined || s.to === to || s.to === "*")) return s.msg as Extract<ServerMessage, { type: T }>;
    }
    return undefined;
  }
}

/**
 * Two lanes to the finish, 2 cells high each, joined at both ends (steps help climb up).
 * A saw in either lane alone leaves the other one; saws in both cut the path.
 */
const twoLanes: LevelDefinition = {
  name: "two lanes",
  rows: [
    "####################",
    "#..................#",
    "#..................#",
    "#...############...#",
    "#..................#",
    "#S.#............#.F#",
    "####################",
  ],
};
const UPPER_SAW = { x: 9, y: 2 };
const LOWER_SAW = { x: 9, y: 5 };
const openField: LevelDefinition = {
  name: "open",
  rows: ["....................", "....................", "S..................F", "####################"],
};

function setup(level: LevelDefinition = openField) {
  const io = new FakeIO();
  const s = new GameSession(io, "ABCD", [level]);
  return { io, s };
}

function toPlacement(io: FakeIO, s: GameSession, ids: string[]) {
  s.handle(ids[0]!, { type: "start" });
  expect(io.last("gameStart")).toBeDefined();
  io.advance(TIMING.carouselSpin + TIMING.carouselHold);
}

describe("GameSession", () => {
  it("has one player colour per seat", () => {
    expect(PLAYER_COLORS.length).toBe(MAX_PLAYERS);
  });

  it("lobby: colours, host, full room, only the host starts", () => {
    const { io, s } = setup();
    for (const id of ["a", "b", "c", "d", "e"]) expect(s.addPlayer(id, `  ${id.toUpperCase()}  `)).toBeNull();
    expect(s.addPlayer("f", "F")).toMatch(/plein \(5 joueurs\)/);
    const lobby = io.last("lobby")!.lobby;
    expect(lobby.hostId).toBe("a");
    expect(lobby.players.map((p) => [p.name, p.color])).toEqual([["A", 0], ["B", 1], ["C", 2], ["D", 3], ["E", 4]]);
    s.handle("b", { type: "start" });
    expect(io.last("gameStart")).toBeUndefined();
    s.handle("a", { type: "start" });
    expect(io.last("gameStart")).toBeDefined();
    expect(s.addPlayer("f", "F")).toMatch(/commencé/);
  });

  it("plays a full round: placement, race, kill and score", () => {
    const { io, s } = setup();
    s.addPlayer("a", "Alice");
    s.addPlayer("b", "Bob");
    toPlacement(io, s, ["a", "b"]);
    const pa = io.last("placement", "a")!;
    const pb = io.last("placement", "b")!;
    expect(pa.needed).toBe(3);
    // Objects are drawn, not chosen: exactly as many as must be placed.
    expect(pa.offer).toHaveLength(3);

    // Each player places their first three offered objects in the air.
    s.handle("a", { type: "placement", objects: pa.offer.slice(0, 3).map((kind, i) => ({ kind, x: 3 + i, y: 0 })), done: true });
    expect(io.last("placedStatus")!.done).toEqual(["a"]);
    s.handle("b", { type: "placement", objects: pb.offer.slice(0, 3).map((kind, i) => ({ kind, x: 10 + i, y: 0 })), done: true });

    const cd = io.last("countdown", "a")!;
    expect(cd.objects).toHaveLength(6);
    expect(cd.objects.filter((o) => o.ownerId === "a")).toHaveLength(3);

    io.advance(TIMING.countdown);
    s.handle("a", { type: "pose", x: 5, y: 2, facing: 1, slide: false });
    io.advance(TIMING.ghostInterval);
    expect(io.last("ghosts")!.players.map((g) => g.id)).toEqual(["a"]);

    const aliceObject = cd.objects.find((o) => o.ownerId === "a")!;
    s.handle("b", { type: "died", killerId: aliceObject.id, x: 4, y: 2, fell: false });
    s.handle("a", { type: "finished", time: 12.5 });
    io.advance(TIMING.raceEndPause);

    const score = io.last("score")!;
    const alice = score.lines.find((l) => l.playerId === "a")!;
    expect(alice).toMatchObject({ finish: 2, first: 1, onlyOne: 1, kills: 1, total: 5 });
    expect(score.totals).toEqual({ a: 5, b: 0 });
  });

  /** Players a..d in the race, with three objects placed by "a" and three by "c". */
  function toRaceWithTraps(ids: string[]) {
    const { io, s } = setup();
    for (const id of ids) s.addPlayer(id, id.toUpperCase());
    toPlacement(io, s, ids);
    const place = (id: string, x0: number) => {
      const offer = io.last("placement", id)!.offer;
      s.handle(id, { type: "placement", objects: offer.map((kind, i) => ({ kind, x: x0 + i, y: 0 })), done: true });
    };
    place("a", 3);
    place("c", 12);
    io.advance(35_000 + TIMING.placementGrace);
    const objects = io.last("countdown", "a")!.objects;
    io.advance(TIMING.countdown);
    return { io, s, aTrap: objects.find((o) => o.ownerId === "a")!.id, cTrap: objects.find((o) => o.ownerId === "c")!.id };
  }

  it("push-kills: checks who pushed, tells everyone and scores 2 for a push into your own trap", () => {
    const { io, s, aTrap, cTrap } = toRaceWithTraps(["a", "b", "c", "d"]);
    io.advance(TIMING.contactGrace);
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false, pushedBy: "a" });
    expect(io.last("playerDied")).toMatchObject({ id: "b", killerOwner: "a", pushedBy: "a" });
    // Naming yourself as the pusher counts as nobody.
    s.handle("c", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false, pushedBy: "c" });
    expect(io.last("playerDied")).toMatchObject({ id: "c", killerOwner: "a", pushedBy: null });
    // Pushed by "a" into c's trap: the kill is c's, "a" gets nothing for it.
    s.handle("d", { type: "died", killerId: cTrap, x: 13, y: 1, fell: false, pushedBy: "a" });
    expect(io.last("playerDied")).toMatchObject({ id: "d", killerOwner: "c", pushedBy: "a" });
    s.handle("a", { type: "finished", time: 20 });
    io.advance(TIMING.raceEndPause);
    const score = io.last("score")!;
    expect(score.lines.find((l) => l.playerId === "a")).toMatchObject({ finish: 2, first: 1, onlyOne: 1, kills: 3, pushKills: 1, total: 7 });
    expect(score.lines.find((l) => l.playerId === "c")).toMatchObject({ kills: 1, pushKills: 0, total: 1 });
    expect(score.totals).toEqual({ a: 7, b: 0, c: 1, d: 0 });
  });

  it("push-kills: unknown pushers, pits and the start grace give no push credit", () => {
    const { io, s, aTrap } = toRaceWithTraps(["a", "b", "c", "d"]);
    // Nobody can push anybody while everyone still overlaps on the start cell.
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false, pushedBy: "a" });
    expect(io.last("playerDied")).toMatchObject({ id: "b", killerOwner: "a", pushedBy: null });
    io.advance(TIMING.contactGrace);
    s.handle("c", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false, pushedBy: "nobody" });
    expect(io.last("playerDied")).toMatchObject({ id: "c", killerOwner: "a", pushedBy: null });
    // A fall out of the level is nobody's trap, pushed or not.
    s.handle("d", { type: "died", killerId: null, x: 4, y: 5, fell: true, pushedBy: "a" });
    expect(io.last("playerDied")).toMatchObject({ id: "d", killerOwner: null, pushedBy: null });
    s.handle("a", { type: "finished", time: 20 });
    io.advance(TIMING.raceEndPause);
    expect(io.last("score")!.lines.find((l) => l.playerId === "a")).toMatchObject({ kills: 2, pushKills: 0, total: 6 });
  });

  it("the two-lanes level works as intended", () => {
    const level = parseLevel(twoLanes);
    const saw = (id: number, c: { x: number; y: number }) => ({ id, kind: "saw" as const, ...c });
    expect(buildReachGraph(level, [], DEFAULT_MOVEMENT).reachable).toBe(true);
    expect(buildReachGraph(level, [saw(1, UPPER_SAW)], DEFAULT_MOVEMENT).reachable).toBe(true);
    expect(buildReachGraph(level, [saw(1, LOWER_SAW)], DEFAULT_MOVEMENT).reachable).toBe(true);
    expect(buildReachGraph(level, [saw(1, UPPER_SAW), saw(2, LOWER_SAW)], DEFAULT_MOVEMENT).reachable).toBe(false);
  });

  it("refuses the placement that, combined with another player's, cuts the path", () => {
    // The draw is random and imposed: pick a game seed where both hands hold a saw or spikes.
    const isTrap = (k: CardKind) => k === "saw" || k === "spikes";
    let io!: FakeIO;
    let s!: GameSession;
    for (let i = 1; i < 100; i++) {
      ({ io, s } = setup(twoLanes));
      io.seed = i / 100;
      s.addPlayer("a", "A");
      s.addPlayer("b", "B");
      toPlacement(io, s, ["a", "b"]);
      if (io.last("placement", "a")!.offer.some(isTrap) && io.last("placement", "b")!.offer.some(isTrap)) break;
    }
    // Each player puts a killing object in one lane and the rest in harmless cells of the top-left corner.
    const choose = (offer: CardKind[], lane: { x: number; y: number }, spareX: number) => {
      const killer = offer.findIndex((k) => k === "saw" || k === "spikes");
      expect(killer, `offer ${offer.join(",")} has no trap`).toBeGreaterThanOrEqual(0);
      const kinds = [offer[killer]!, ...offer.filter((_, i) => i !== killer).slice(0, 2)];
      return kinds.map((kind, i) => (i === 0 ? { kind, ...lane } : { kind, x: spareX + i, y: 1 }));
    };
    s.handle("a", { type: "placement", objects: choose(io.last("placement", "a")!.offer, UPPER_SAW, 3), done: true });
    s.handle("b", { type: "placement", objects: choose(io.last("placement", "b")!.offer, LOWER_SAW, 12), done: true });
    expect(io.last("countdown", "a")!.refused).toBe(0);
    expect(io.last("countdown", "a")!.refusedObjects).toEqual([]);
    expect(io.last("countdown", "b")!.refused).toBe(1);
    // The refused object is named, with the reason, so the player is told which one and why.
    const bKiller = io.last("placement", "b")!.offer.find(isTrap)!;
    expect(io.last("countdown", "b")!.refusedObjects).toEqual([{ kind: bKiller, reason: "path" }]);
    expect(io.last("countdown", "b")!.unplaced).toBe(0);
  });

  it("a validated player may hold fewer objects than needed; nobody waits for the timer", () => {
    const { io, s } = setup();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    toPlacement(io, s, ["a", "b"]);
    const pa = io.last("placement", "a")!;
    // "a" keeps one object (the others had no room, or were discarded); "b" places nothing.
    s.handle("a", { type: "placement", objects: [{ kind: pa.offer[0]!, x: 4, y: 0 }], done: true });
    expect(io.last("placedStatus")!.done).toEqual(["a"]);
    expect(io.last("countdown")).toBeUndefined();
    s.handle("b", { type: "placement", objects: [], done: true });
    // Everyone validated: the countdown starts at once, not after 35 s.
    const cd = io.last("countdown", "a")!;
    expect(cd).toBeDefined();
    expect(cd.objects.filter((o) => o.ownerId === "a")).toHaveLength(1);
    expect(cd.objects.filter((o) => o.ownerId === "b")).toHaveLength(0);
    // Validating with fewer objects is a choice, not a timeout.
    expect(io.last("countdown", "a")!.unplaced).toBe(0);
    expect(io.last("countdown", "b")!.unplaced).toBe(0);
  });

  it("refuses more objects than needed, and validated choices can't change", () => {
    const { io, s } = setup();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    toPlacement(io, s, ["a", "b"]);
    const pa = io.last("placement", "a")!;
    const tooMany = [...pa.offer, pa.offer[0]!].map((kind, i) => ({ kind, x: 3 + i, y: 0 }));
    s.handle("a", { type: "placement", objects: tooMany, done: true });
    expect(io.last("placedStatus")!.done).toEqual([]);
    s.handle("a", { type: "placement", objects: [], done: true });
    s.handle("a", { type: "placement", objects: pa.offer.map((kind, i) => ({ kind, x: 3 + i, y: 0 })), done: false });
    io.advance(35_000 + TIMING.placementGrace);
    expect(io.last("countdown", "a")!.objects.filter((o) => o.ownerId === "a")).toHaveLength(0);
  });

  it("tells who ran out of time how many objects they never placed, and names cells already taken", () => {
    const { io, s } = setup();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    toPlacement(io, s, ["a", "b"]);
    const pa = io.last("placement", "a")!;
    const pb = io.last("placement", "b")!;
    // "b" validates first with an object on (5, 0); "a" put one on the same cell and one
    // elsewhere, but never validated.
    s.handle("b", { type: "placement", objects: [{ kind: pb.offer[0]!, x: 5, y: 0 }], done: true });
    s.handle("a", {
      type: "placement",
      objects: [
        { kind: pa.offer[0]!, x: 5, y: 0 },
        { kind: pa.offer[1]!, x: 8, y: 0 },
      ],
      done: false,
    });
    io.advance(35_000 + TIMING.placementGrace);
    const ca = io.last("countdown", "a")!;
    expect(ca.unplaced).toBe(1);
    expect(ca.refusedObjects).toEqual([{ kind: pa.offer[0]!, reason: "taken" }]);
    expect(ca.refused).toBe(1);
    expect(ca.objects.filter((o) => o.ownerId === "a")).toHaveLength(1);
    const cb = io.last("countdown", "b")!;
    expect(cb.unplaced).toBe(0);
    expect(cb.refusedObjects).toEqual([]);
  });

  it("dead players place one block, never next to a living player", () => {
    const { io, s } = setup();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    toPlacement(io, s, ["a", "b"]);
    for (const id of ["a", "b"]) s.handle(id, { type: "placement", objects: [], done: false });
    io.advance(30_000 + 5_000 + TIMING.placementGrace);
    io.advance(TIMING.countdown);
    s.handle("a", { type: "pose", x: 5.1, y: 1.1, facing: 1, slide: false });
    s.handle("b", { type: "block", x: 8, y: 1 });
    expect(io.last("blockRefused", "b")!.reason).toMatch(/morts/);
    s.handle("b", { type: "died", killerId: null, x: 1, y: 1, fell: true });
    s.handle("b", { type: "block", x: 6, y: 1 });
    expect(io.last("blockRefused", "b")!.reason).toMatch(/près/);
    s.handle("b", { type: "block", x: 12, y: 1 });
    expect(io.last("blockRefused", "b")!.reason).toMatch(/Doucement/); // one request per 500 ms
    io.advance(TIMING.blockThrottle);
    s.handle("b", { type: "block", x: 12, y: 1 });
    const block = io.last("block")!;
    expect(block.block).toMatchObject({ kind: "platform", x: 12, y: 1, ownerId: "b" });
    io.advance(TIMING.blockThrottle);
    s.handle("b", { type: "block", x: 14, y: 1 });
    expect(io.last("blockRefused", "b")!.reason).toMatch(/seul/);
  });

  it("no eraser in the first round, then erasers remove other players' objects only", () => {
    const io = new FakeIO();
    // Always offer an eraser once something can be erased, so the test does not depend on luck.
    const s = new GameSession(io, "ABCD", [openField]);
    (s as unknown as { cfg: { eraserChance: number } }).cfg.eraserChance = 1;
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    toPlacement(io, s, ["a", "b"]);
    const place = (id: string, x0: number) => {
      const offer = io.last("placement", id)!.offer;
      expect(offer).not.toContain("eraser");
      s.handle(id, { type: "placement", objects: offer.slice(0, 3).map((kind, i) => ({ kind, x: x0 + i, y: 0 })), done: true });
    };
    place("a", 3);
    place("b", 10);
    const placed = io.last("countdown", "a")!.objects;
    // Nobody finishes: straight to the next round.
    io.advance(TIMING.countdown);
    for (const id of ["a", "b"]) s.handle(id, { type: "died", killerId: null, x: 1, y: 1, fell: true });
    io.advance(TIMING.raceEndPause + 5_000);

    const offerA = io.last("placement", "a")!.offer;
    const offerB = io.last("placement", "b")!.offer;
    expect(offerA.filter((k) => k === "eraser")).toHaveLength(1);
    expect(offerB.filter((k) => k === "eraser")).toHaveLength(1);
    const bobs = placed.find((o) => o.ownerId === "b")!;
    const alices = placed.find((o) => o.ownerId === "a")!;
    // A erases one of B's objects; B tries to erase one of its own (refused).
    // Round 2 still needs 3 cards: the eraser plus two objects in harmless cells.
    const rest = (offer: CardKind[], x0: number) =>
      offer.filter((k) => k !== "eraser").slice(0, 2).map((kind, i) => ({ kind, x: x0 + i, y: 1 }));
    s.handle("a", { type: "placement", objects: [{ kind: "eraser", x: bobs.x, y: bobs.y }, ...rest(offerA, 3)], done: true });
    s.handle("b", { type: "placement", objects: [{ kind: "eraser", x: bobs.x + 1, y: bobs.y }, ...rest(offerB, 10)], done: true });
    const cd = io.last("countdown", "a")!;
    expect(cd.objects.some((o) => o.id === bobs.id)).toBe(false);
    expect(cd.objects.some((o) => o.id === alices.id)).toBe(true);
    expect(cd.objects).toHaveLength(6 - 1 + 4);
    expect(cd.refusedObjects).toEqual([]);
    expect(io.last("countdown", "b")!.refusedObjects).toEqual([{ kind: "eraser", reason: "gone" }]);
  });

  it("an eraser cannot remove the platform the path to the finish needs", () => {
    // The finish sits on a ledge 8 rows above the floor: too high to reach without a step.
    const row = (r: string) => "#" + r.padEnd(14, ".") + "#";
    const rows = ["#".repeat(16), row(""), row(""), row("..........F"), row("........####")];
    for (let i = 0; i < 7; i++) rows.push(row(""));
    rows.push(row("S"), "#".repeat(16));
    const level = parseLevel({ name: "ledge", rows });
    const step = { id: 1, kind: "platform" as const, x: 6, y: rows.length - 6, ownerId: "b" };
    const saw = { id: 2, kind: "saw" as const, x: 3, y: 2, ownerId: "b" };
    expect(buildReachGraph(level, [], DEFAULT_MOVEMENT).reachable).toBe(false);
    expect(buildReachGraph(level, [step, saw], DEFAULT_MOVEMENT).reachable).toBe(true);
    expect(erasureKeepsPath(level, [step, saw], step, DEFAULT_MOVEMENT)).toBe(false);
    expect(erasureKeepsPath(level, [step, saw], saw, DEFAULT_MOVEMENT)).toBe(true);
  });

  it("a player leaving during the race ends it when nobody else is running", () => {
    const { io, s } = setup();
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    toPlacement(io, s, ["a", "b"]);
    io.advance(35_000 + TIMING.placementGrace + TIMING.countdown);
    s.handle("a", { type: "died", killerId: null, x: 1, y: 1, fell: true });
    s.removePlayer("b");
    io.advance(TIMING.raceEndPause);
    expect(io.last("score")!.verdict).toBe("nobody-finished");
  });

  it("a player reconnecting on the end screen gets the end screen again, not a new game start", () => {
    const { io, s } = setup();
    s.addPlayer("a", "Alice");
    s.addPlayer("b", "Bob");
    toPlacement(io, s, ["a", "b"]);
    // Jump to the end of the game: Alice reached the target.
    const internals = s as unknown as { scores: Map<string, number>; afterScore(): void };
    internals.scores.set("a", 10);
    internals.afterScore();
    const over = io.last("over")!;
    expect(over.winner).toBe("a");
    s.setConnected("b", false);
    io.sent = [];
    s.setConnected("b", true);
    const toB = io.sent.filter((m) => m.to === "b").map((m) => m.msg.type);
    expect(toB).toEqual(["lobby", "over"]);
    expect(io.sent.find((m) => m.to === "b" && m.msg.type === "over")!.msg).toEqual(over);
  });

  describe("coming back into a running game", () => {
    const KEY_A = "aaaaaaaa-key";
    /** Alice, Bob and Chloé in a race; Alice placed three objects and has 4 points. */
    function raceWithAlice() {
      const { io, s } = setup();
      s.addPlayer("a", "Alice", KEY_A);
      s.addPlayer("b", "Bob", "bbbbbbbb-key");
      s.addPlayer("c", "Chloé", "cccccccc-key");
      toPlacement(io, s, ["a", "b", "c"]);
      const offer = io.last("placement", "a")!.offer;
      s.handle("a", { type: "placement", objects: offer.map((kind, i) => ({ kind, x: 3 + i, y: 0 })), done: true });
      s.handle("b", { type: "placement", objects: [], done: true });
      s.handle("c", { type: "placement", objects: [], done: true });
      (s as unknown as { scores: Map<string, number> }).scores.set("a", 4);
      io.advance(TIMING.countdown);
      return { io, s };
    }

    it("after a reload (same browser key), the player gets their seat, score and objects back", () => {
      const { io, s } = raceWithAlice();
      // Alice's page reloads: her old connection is gone for good, a new one joins.
      s.removePlayer("a");
      expect(s.addPlayer("a2", "Alice", KEY_A)).toBeNull();
      const lobby = io.last("lobby")!.lobby;
      // She had left for good, so Bob became the host; he stays the host.
      expect(lobby.hostId).toBe("b");
      expect(lobby.players.find((p) => p.id === "a2")).toMatchObject({ name: "Alice", color: 0, connected: true });
      expect(lobby.players.some((p) => p.id === "a")).toBe(false);
      // Brought up to date like after a reconnection: running again in this race.
      const cd = io.last("countdown", "a2")!;
      expect(cd.status).toBe("running");
      expect(cd.objects.filter((o) => o.ownerId === "a2")).toHaveLength(3);
      expect(cd.objects.some((o) => o.ownerId === "a")).toBe(false);
      // Her traps still score for her.
      s.handle("b", { type: "died", killerId: cd.objects.find((o) => o.ownerId === "a2")!.id, x: 4, y: 2, fell: false });
      expect(io.last("playerDied")!.killerOwner).toBe("a2");
      s.handle("a2", { type: "finished", time: 10 });
      s.handle("c", { type: "died", killerId: null, x: 0, y: 0, fell: true });
      io.advance(TIMING.raceEndPause);
      const totals = io.last("score")!.totals;
      expect(Object.keys(totals).sort()).toEqual(["a2", "b", "c"]);
      expect(totals.a2).toBeGreaterThan(4);
      // The old connection's late events name nobody any more.
      s.removePlayer("a");
      s.setConnected("a", false);
      expect(io.last("lobby")!.lobby.players.find((p) => p.id === "a2")!.connected).toBe(true);
    });

    it("with the same browser key, even before the old connection is seen dead", () => {
      const { io, s } = raceWithAlice();
      expect(s.addPlayer("a2", "Alice", KEY_A)).toBeNull();
      expect(io.last("countdown", "a2")!.status).toBe("running");
      // Never seen gone: still the host, under the new id.
      expect(io.last("lobby")!.lobby.hostId).toBe("a2");
    });

    it("from another device: the same pseudo takes back a disconnected player's place, not a connected one's", () => {
      const { io, s } = raceWithAlice();
      expect(s.addPlayer("x", "bob", "xxxxxxxx-key")).toMatch(/commencé.*même pseudo/);
      s.setConnected("b", false);
      expect(s.addPlayer("x", "  BOB ", "xxxxxxxx-key")).toBeNull();
      expect(io.last("lobby")!.lobby.players.find((p) => p.id === "x")).toMatchObject({ name: "Bob", color: 1 });
      // A stranger is still refused.
      expect(s.addPlayer("y", "Zoé", "yyyyyyyy-key")).toMatch(/commencé/);
    });

    it("a reloaded page on the end screen gets the end screen, with the scores under its new id", () => {
      const { io, s } = raceWithAlice();
      const internals = s as unknown as { scores: Map<string, number>; afterScore(): void };
      internals.scores.set("a", 10);
      internals.afterScore();
      s.removePlayer("a");
      io.sent = [];
      expect(s.addPlayer("a2", "Alice", KEY_A)).toBeNull();
      const over = io.sent.find((m) => m.to === "a2" && m.msg.type === "over")!.msg as Extract<ServerMessage, { type: "over" }>;
      expect(over.winner).toBe("a2");
      expect(over.totals.a2).toBe(10);
      expect(io.sent.some((m) => m.to === "a2" && m.msg.type === "gameStart")).toBe(false);
    });
  });
});
