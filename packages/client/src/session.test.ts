import { describe, expect, it } from "vitest";
import {
  buildReachGraph,
  DEFAULT_MOVEMENT,
  erasureKeepsPath,
  GameSession,
  parseLevel,
  TIMING,
  type LevelDefinition,
  type CardKind,
  type ServerMessage,
  type SessionIO,
} from "@game/shared";

/** Fake clock and network: timers run when the test advances time. */
class FakeIO implements SessionIO {
  t = 1_000_000;
  sent: Array<{ to: string; msg: ServerMessage }> = [];
  private timers: Array<{ at: number; fn: () => void; every?: number; id: number }> = [];
  private nextId = 1;

  now() { return this.t; }
  send(to: string, msg: ServerMessage) { this.sent.push({ to, msg }); }
  broadcast(msg: ServerMessage) { this.sent.push({ to: "*", msg }); }
  random() { return 0.42; }
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
  it("lobby: colours, host, full room, only the host starts", () => {
    const { io, s } = setup();
    for (const id of ["a", "b", "c", "d"]) expect(s.addPlayer(id, `  ${id.toUpperCase()}  `)).toBeNull();
    expect(s.addPlayer("e", "E")).toMatch(/plein/);
    const lobby = io.last("lobby")!.lobby;
    expect(lobby.hostId).toBe("a");
    expect(lobby.players.map((p) => [p.name, p.color])).toEqual([["A", 0], ["B", 1], ["C", 2], ["D", 3]]);
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
    expect(pa.offer).toHaveLength(5);

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

  it("the two-lanes level works as intended", () => {
    const level = parseLevel(twoLanes);
    const saw = (id: number, c: { x: number; y: number }) => ({ id, kind: "saw" as const, ...c });
    expect(buildReachGraph(level, [], DEFAULT_MOVEMENT).reachable).toBe(true);
    expect(buildReachGraph(level, [saw(1, UPPER_SAW)], DEFAULT_MOVEMENT).reachable).toBe(true);
    expect(buildReachGraph(level, [saw(1, LOWER_SAW)], DEFAULT_MOVEMENT).reachable).toBe(true);
    expect(buildReachGraph(level, [saw(1, UPPER_SAW), saw(2, LOWER_SAW)], DEFAULT_MOVEMENT).reachable).toBe(false);
  });

  it("refuses the placement that, combined with another player's, cuts the path", () => {
    const { io, s } = setup(twoLanes);
    s.addPlayer("a", "A");
    s.addPlayer("b", "B");
    toPlacement(io, s, ["a", "b"]);
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
    expect(io.last("countdown", "b")!.refused).toBe(1);
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
    const block = io.last("block")!;
    expect(block.block).toMatchObject({ kind: "platform", x: 12, y: 1, ownerId: "b" });
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
    expect(cd.eraseRefused).toBe(0);
    expect(io.last("countdown", "b")!.eraseRefused).toBe(1);
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
});
