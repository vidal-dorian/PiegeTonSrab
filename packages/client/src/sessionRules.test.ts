/**
 * Session rules decided 2026-11-26: turned spikes and springs, spikes that must lean on a
 * block (applied hand by hand with supportFirst), dead players' blocks that may never land in
 * a protected zone nor shut a living player in, and no stomps in the start zone.
 */
import { describe, expect, it } from "vitest";
import {
  BLOCK_CLEARANCE,
  bodyInSpawnZone,
  DEFAULT_MOVEMENT,
  GameSession,
  parseLevel,
  SPAWN_CONTACT_MARGIN,
  TIMING,
  type CardKind,
  type LevelDefinition,
  type ServerMessage,
  type SessionIO,
} from "@game/shared";

/** Fake clock and network: timers run when the test advances time (same as session.test.ts). */
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
  all<T extends ServerMessage["type"]>(type: T): Array<Extract<ServerMessage, { type: T }>> {
    return this.sent.filter((s) => s.msg.type === type).map((s) => s.msg as Extract<ServerMessage, { type: T }>);
  }
}

/** S at (0, 2), F at (19, 2): the start zone covers x 0..3, the finish zone x 17..19. */
const openField: LevelDefinition = {
  name: "open",
  rows: ["....................", "....................", "S..................F", "####################"],
};

/** A game on `level` with these players, at the start of the first placement. */
function toPlacement(level: LevelDefinition, ids: string[]) {
  const io = new FakeIO();
  const s = new GameSession(io, "ABCD", [level]);
  for (const id of ids) s.addPlayer(id, id.toUpperCase());
  s.handle(ids[0]!, { type: "start" });
  io.advance(TIMING.carouselSpin + TIMING.carouselHold);
  return { io, s };
}

/** The draw is random: give a player the hand a test needs (the session only checks choices against it). */
function deal(s: GameSession, id: string, offer: CardKind[]) {
  (s as unknown as { players: Map<string, { offer: CardKind[] }> }).players.get(id)!.offer = offer;
}

/** A race on `level` where nobody placed anything, contact grace over. */
function toRace(level: LevelDefinition, ids: string[]) {
  const { io, s } = toPlacement(level, ids);
  for (const id of ids) s.handle(id, { type: "placement", objects: [], done: true });
  io.advance(TIMING.countdown + TIMING.contactGrace);
  return { io, s };
}

describe("placement of turned objects", () => {
  it("spikes and springs keep their direction; a missing or bad one gets the kind's default", () => {
    const { io, s } = toPlacement(openField, ["a"]);
    deal(s, "a", ["spring", "spikes", "cannon"]);
    s.handle("a", {
      type: "placement",
      objects: [
        { kind: "spring", x: 8, y: 0, dir: 0 },
        { kind: "spikes", x: 12, y: 2 }, // no direction: up, on the floor
        { kind: "cannon", x: 5, y: 0, dir: 7 as never },
      ],
      done: true,
    });
    const cd = io.last("countdown", "a")!;
    expect(cd.refusedObjects).toEqual([]);
    const placed = cd.objects.filter((o) => o.ownerId === "a");
    expect(placed.map((o) => [o.kind, o.dir])).toEqual([
      ["spring", 0],
      ["cannon", 2],
      ["spikes", 3], // applied last: it needs a support
    ]);
  });

  for (const order of [
    ["spikes", "platform", "saw"],
    ["platform", "spikes", "saw"],
  ] as const) {
    it(`spikes leaning on the same hand's platform are accepted (hand ${order.join(", ")})`, () => {
      const { io, s } = toPlacement(openField, ["a"]);
      deal(s, "a", [...order]);
      const cells = {
        platform: { x: 8, y: 0 },
        spikes: { x: 9, y: 0, dir: 0 as const }, // pointing right, against the platform
        saw: { x: 13, y: 0 },
      };
      s.handle("a", { type: "placement", objects: order.map((kind) => ({ kind, ...cells[kind] })), done: true });
      const cd = io.last("countdown", "a")!;
      expect(cd.refusedObjects).toEqual([]);
      expect(cd.objects.find((o) => o.kind === "spikes")).toMatchObject({ x: 9, y: 0, dir: 0, ownerId: "a" });
      expect(cd.objects.filter((o) => o.ownerId === "a")).toHaveLength(3);
    });
  }

  it("spikes in mid-air are refused with the reason 'support'", () => {
    const { io, s } = toPlacement(openField, ["a"]);
    deal(s, "a", ["spikes", "spikes", "saw"]);
    s.handle("a", {
      type: "placement",
      objects: [
        { kind: "spikes", x: 9, y: 0, dir: 0 },
        { kind: "spikes", x: 12, y: 2, dir: 3 },
        { kind: "saw", x: 8, y: 0 }, // a saw is no support
      ],
      done: true,
    });
    const cd = io.last("countdown", "a")!;
    expect(cd.refusedObjects).toEqual([{ kind: "spikes", reason: "support" }]);
    expect(cd.refused).toBe(1);
    expect(cd.objects.filter((o) => o.ownerId === "a").map((o) => [o.kind, o.x])).toEqual([
      ["saw", 8],
      ["spikes", 12],
    ]);
  });

  it("spikes leaning on another player's object that was refused get the reason 'support'", () => {
    const { io, s } = toPlacement(openField, ["a", "b", "c"]);
    deal(s, "a", ["platform"]);
    deal(s, "b", ["spikes"]);
    deal(s, "c", ["saw"]);
    // Applied in the order players validated: c's saw takes (9, 0) first, so a's platform is
    // refused, and b's spikes (pointing right from (10, 0)) are left leaning on a saw.
    s.handle("c", { type: "placement", objects: [{ kind: "saw", x: 9, y: 0 }], done: true });
    io.advance(100);
    s.handle("a", { type: "placement", objects: [{ kind: "platform", x: 9, y: 0 }], done: true });
    io.advance(100);
    s.handle("b", { type: "placement", objects: [{ kind: "spikes", x: 10, y: 0, dir: 2 }], done: true });
    expect(io.last("countdown", "a")!.refusedObjects).toEqual([{ kind: "platform", reason: "taken" }]);
    expect(io.last("countdown", "b")!.refusedObjects).toEqual([{ kind: "spikes", reason: "support" }]);
    expect(io.last("countdown", "c")!.refusedObjects).toEqual([]);
    expect(io.last("countdown", "b")!.objects.map((o) => o.kind)).toEqual(["saw"]);
  });

  it("spikes against a block another player's eraser removes first get the reason 'support'", () => {
    const { io, s } = toPlacement(openField, ["a", "b"]);
    deal(s, "b", ["platform"]);
    s.handle("b", { type: "placement", objects: [{ kind: "platform", x: 9, y: 0 }], done: true });
    s.handle("a", { type: "placement", objects: [], done: true });
    const platform = io.last("countdown", "a")!.objects.find((o) => o.kind === "platform")!;
    // Nobody finishes: straight to round 2.
    io.advance(TIMING.countdown);
    for (const id of ["a", "b"]) s.handle(id, { type: "died", killerId: null, x: 5, y: 1, fell: true });
    io.advance(TIMING.raceEndPause + 5_000);
    expect(io.last("placement", "a")!.round).toBe(2);
    deal(s, "a", ["eraser"]);
    deal(s, "b", ["spikes"]);
    // b validates first, but erasers always go before objects.
    s.handle("b", { type: "placement", objects: [{ kind: "spikes", x: 10, y: 0, dir: 0 }], done: true });
    io.advance(100);
    s.handle("a", { type: "placement", objects: [{ kind: "eraser", x: 9, y: 0 }], done: true });
    const cd = io.last("countdown", "b")!;
    expect(cd.refusedObjects).toEqual([{ kind: "spikes", reason: "support" }]);
    expect(io.last("countdown", "a")!.refusedObjects).toEqual([]);
    expect(cd.objects.some((o) => o.id === platform.id)).toBe(false);
  });

  it("objects in a protected zone are refused as 'invalid'", () => {
    const { io, s } = toPlacement(openField, ["a"]);
    deal(s, "a", ["saw", "platform", "saw"]);
    s.handle("a", {
      type: "placement",
      objects: [
        { kind: "saw", x: 3, y: 0 }, // start zone
        { kind: "platform", x: 17, y: 0 }, // finish zone
        { kind: "saw", x: 4, y: 0 }, // just outside the start zone
      ],
      done: true,
    });
    const cd = io.last("countdown", "a")!;
    expect(cd.refusedObjects).toEqual([
      { kind: "saw", reason: "invalid" },
      { kind: "platform", reason: "invalid" },
    ]);
    expect(cd.objects.filter((o) => o.ownerId === "a").map((o) => o.x)).toEqual([4]);
  });
});

describe("dead players' blocks", () => {
  /** Dead players drop blocks one request at a time (TIMING.blockThrottle apart). */
  function blockFrom(io: FakeIO, s: GameSession, id: string, x: number, y: number): string | "placed" {
    io.advance(TIMING.blockThrottle);
    const before = io.all("block").length;
    s.handle(id, { type: "block", x, y });
    if (io.all("block").length > before) return "placed";
    return io.last("blockRefused", id)!.reason;
  }

  it("are refused in the start zone and the finish zone, accepted just outside", () => {
    const { io, s } = toRace(openField, ["a", "b", "c"]);
    s.handle("a", { type: "pose", x: 10.1, y: 2.1, facing: 1, slide: false });
    for (const id of ["b", "c"]) s.handle(id, { type: "died", killerId: null, x: 9, y: 4, fell: true });
    const zone = "Pas dans la zone de départ ni près de l'arrivée.";
    expect(blockFrom(io, s, "b", 0, 0)).toBe(zone);
    expect(blockFrom(io, s, "b", 3, 2)).toBe(zone);
    expect(blockFrom(io, s, "b", 17, 0)).toBe(zone);
    expect(blockFrom(io, s, "b", 19, 1)).toBe(zone);
    expect(blockFrom(io, s, "b", 19, 2)).toBe(zone); // the flag itself
    expect(blockFrom(io, s, "b", 4, 0)).toBe("placed");
    expect(blockFrom(io, s, "c", 16, 0)).toBe("placed");
  });

  it(`are refused within ${BLOCK_CLEARANCE} cells of a living player's body`, () => {
    expect(BLOCK_CLEARANCE).toBe(2);
    const { io, s } = toRace(openField, ["a", "b", "c", "d"]);
    // a stands at (10, 2): body x 10.1..10.9, y 2.1..3.
    s.handle("a", { type: "pose", x: 10.1, y: 2.1, facing: 1, slide: false });
    for (const id of ["b", "c", "d"]) s.handle(id, { type: "died", killerId: null, x: 9, y: 4, fell: true });
    const near = "Trop près d'un joueur.";
    expect(blockFrom(io, s, "b", 8, 0)).toBe(near);
    expect(blockFrom(io, s, "b", 12, 1)).toBe(near);
    expect(blockFrom(io, s, "b", 10, 0)).toBe(near);
    expect(blockFrom(io, s, "b", 7, 0)).toBe("placed");
    expect(blockFrom(io, s, "c", 13, 1)).toBe("placed");
    // A dead player's pose is ignored: d's block can go right where b says it is.
    s.handle("b", { type: "pose", x: 15.1, y: 1.1, facing: 1, slide: false });
    expect(blockFrom(io, s, "d", 15, 0)).toBe("placed");
  });

  it("are refused when they would shut in a player in mid-air, where they will land", () => {
    // Top floor from S to a pit at the far right that falls onto the flag. A hole at x 10
    // drops into a closed chamber whose only way out is the tunnel along row 8 to the flag.
    const chamber: LevelDefinition = {
      name: "chamber",
      rows: [
        "........................",
        "........................",
        "S.......................",
        "##########.###########..",
        "#..............#######..",
        "#..............#######..",
        "#..............#######..",
        "#..............#######..",
        "#.....................F.",
        "########################",
      ],
    };
    const { io, s } = toRace(chamber, ["a", "b", "c"]);
    for (const id of ["b", "c"]) s.handle(id, { type: "died", killerId: null, x: 9, y: 12, fell: true });
    // a was standing on the top floor at (9, 2), and is now in the air right above the hole.
    s.handle("a", { type: "pose", x: 9.1, y: 2.1, facing: 1, slide: false });
    s.handle("a", { type: "pose", x: 10.1, y: 1.0, facing: 1, slide: false });
    // A block in the tunnel, far from a: the finish stays reachable from S and from where a
    // last stood, but not from the chamber floor a is about to land on.
    expect(blockFrom(io, s, "b", 17, 8)).toBe("Enfermerait un joueur.");
    // Back on the top floor, the same block is fine: a can still take the top route.
    s.handle("a", { type: "pose", x: 5.1, y: 2.1, facing: 1, slide: false });
    expect(blockFrom(io, s, "c", 17, 8)).toBe("placed");
  });

  it("are refused when they would close a dead end a running player is about to enter", () => {
    // The way to the flag goes over the roof; the 1-high tunnel under it (x 12..19) is a
    // dead end. A block at its mouth, 3 cells ahead of a running player, turns solid after
    // TIMING.blockDelay: by then the player is inside.
    const tunnel: LevelDefinition = {
      name: "tunnel",
      rows: [
        "............................",
        "............########........",
        "S...................#......F",
        "############################",
      ],
    };
    const { io, s } = toRace(tunnel, ["a", "b", "c"]);
    for (const id of ["b", "c"]) s.handle(id, { type: "died", killerId: null, x: 9, y: 12, fell: true });
    s.handle("a", { type: "pose", x: 9.1, y: 2.1, facing: 1, slide: false });
    expect(blockFrom(io, s, "b", 12, 2)).toBe("Enfermerait un joueur.");
    // Far from the tunnel, the same block can't catch anyone in time.
    s.handle("a", { type: "pose", x: 4.1, y: 2.1, facing: 1, slide: false });
    expect(blockFrom(io, s, "c", 12, 2)).toBe("placed");
  });

  it("keep a wider berth around a player the path graph can't place (in the air over a pit)", () => {
    // A pit in the floor at x 8..11 that falls out of the level.
    const pit: LevelDefinition = {
      name: "pit",
      rows: ["....................", "....................", "S..................F", "########....########"],
    };
    const { io, s } = toRace(pit, ["a", "b", "c"]);
    for (const id of ["b", "c"]) s.handle(id, { type: "died", killerId: null, x: 9, y: 5, fell: true });
    // Over the pit: falling straight down lands nowhere. Body x 9.1..9.9.
    s.handle("a", { type: "pose", x: 9.1, y: 1.0, facing: 1, slide: false });
    // 3 and 4 cells away: outside BLOCK_CLEARANCE, inside the wider clearance.
    expect(blockFrom(io, s, "b", 13, 0)).toBe("Trop près d'un joueur.");
    expect(blockFrom(io, s, "b", 5, 0)).toBe("Trop près d'un joueur.");
    expect(blockFrom(io, s, "b", 14, 0)).toBe("placed");
  });
});

describe("no stomps in the start zone", () => {
  // S at (0, 3): the start zone covers x 0..3, rows 0..3.
  const field: LevelDefinition = {
    name: "field",
    rows: ["....................", "....................", "....................", "S..................F", "####################"],
  };

  it("a stomp is ignored when either body touches the zone, relayed outside it", () => {
    const { io, s } = toRace(field, ["a", "b"]);
    const stomp = (ax: number, bx: number) => {
      s.handle("a", { type: "pose", x: ax, y: 2.1, facing: 1, slide: false });
      s.handle("b", { type: "pose", x: bx, y: 3.1, facing: 1, slide: false });
      s.handle("a", { type: "stomp", victim: "b" });
      return io.all("stomped").length;
    };
    expect(stomp(1.1, 1.2)).toBe(0); // both on the pad
    expect(stomp(4.1, 3.5)).toBe(0); // the victim's body still overlaps x 3
    expect(stomp(3.5, 4.1)).toBe(0); // the stomper's does
    expect(stomp(4.05, 4.1)).toBe(1); // both just out
    expect(io.last("stomped")).toEqual({ type: "stomped", by: "a", victim: "b" });
    // Lag allowance: the server drops a stomp only for bodies clearly inside. A victim whose
    // pose here overlaps the edge by less than SPAWN_CONTACT_MARGIN may well have been out on
    // the stomper's screen (clients test with the body grown by the margin, so they never
    // send a stomp from where the server would drop it).
    io.advance(TIMING.stompCooldown);
    expect(stomp(4.1, 3.7)).toBe(2);
  });

  it("clients stay out of contacts a little longer than the server (SPAWN_CONTACT_MARGIN)", () => {
    const level = parseLevel(field);
    const m = DEFAULT_MOVEMENT;
    // Just outside the zone (x 4.1): out for the server, still in for a client.
    expect(bodyInSpawnZone(level, 4.1, 3.1, m.bodyWidth, m.bodyHeight, -SPAWN_CONTACT_MARGIN)).toBe(false);
    expect(bodyInSpawnZone(level, 4.1, 3.1, m.bodyWidth, m.bodyHeight, SPAWN_CONTACT_MARGIN)).toBe(true);
    // Every position a client counts as out, the server counts as out too.
    for (let x = 2; x < 6; x += 0.05) {
      if (!bodyInSpawnZone(level, x, 3.1, m.bodyWidth, m.bodyHeight, SPAWN_CONTACT_MARGIN)) {
        expect(bodyInSpawnZone(level, x, 3.1, m.bodyWidth, m.bodyHeight, -SPAWN_CONTACT_MARGIN)).toBe(false);
      }
    }
  });
});
