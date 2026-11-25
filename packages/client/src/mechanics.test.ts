/**
 * Build step 5 objects (cannon, spring, vine), the random draw and contacts between players.
 */
import { describe, expect, it } from "vitest";
import {
  bodiesOverlap,
  buildReachGraph,
  contactWith,
  cannonBalls,
  cannonFirstShot,
  CANNON_BALL_SPEED,
  CANNON_PERIOD,
  CharacterController,
  DEFAULT_MOVEMENT,
  drawOffer,
  createRng,
  findKiller,
  footprintCells,
  GameSession,
  OBJECT_KINDS,
  parseLevel,
  PathGuard,
  placementKeepsPath,
  prepareObjects,
  TIMING,
  vinesOf,
  withSolidObjects,
  type LevelDefinition,
  type PlacedObject,
  type ServerMessage,
  type SessionIO,
  type StepInput,
} from "@game/shared";

const tuning = { ...DEFAULT_MOVEMENT };
const DT = 1 / 120;
const idle: StepInput = { left: false, right: false, jumpHeld: false, jumpPressed: false };

function run(c: CharacterController, seconds: number, input: StepInput = idle): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) c.step(DT, input);
}

describe("cannon", () => {
  const corridor = parseLevel({
    name: "corridor",
    rows: ["####################", "#..................#", "#S................F#", "####################"],
  });

  it("measures its line of fire up to the first solid cell", () => {
    const [right] = prepareObjects(corridor, [{ id: 1, kind: "cannon", x: 5, y: 1, dir: 0 }]);
    expect(right!.range).toBe(13); // cells 6..18, the wall is at x = 19
    const [left] = prepareObjects(corridor, [
      { id: 1, kind: "cannon", x: 5, y: 1, dir: 2 },
      { id: 2, kind: "platform", x: 2, y: 1 },
    ]);
    expect(left!.range).toBe(2); // cells 4 and 3, stopped by the platform
  });

  it("fires on a fixed schedule: balls are a pure function of the round clock", () => {
    const [cannon] = prepareObjects(corridor, [{ id: 3, kind: "cannon", x: 5, y: 1, dir: 0 }]);
    const first = cannonFirstShot(cannon!);
    expect(cannonBalls(cannon!, first - 0.01)).toEqual([]);
    const [ball] = cannonBalls(cannon!, first + 0.5);
    expect(ball!.x).toBeCloseTo(5.5 + 0.5 + 0.5 * CANNON_BALL_SPEED);
    expect(ball!.y).toBeCloseTo(1.5);
    // Same time, same answer: nothing accumulates.
    expect(cannonBalls(cannon!, first + 0.5)).toEqual(cannonBalls(cannon!, first + 0.5));
    // The ball breaks on the wall before the next one leaves.
    const flight = 13 / CANNON_BALL_SPEED;
    expect(cannonBalls(cannon!, first + flight + 0.05)).toEqual([]);
    expect(cannonBalls(cannon!, first + CANNON_PERIOD + 0.01)).toHaveLength(1);
  });

  it("its balls kill, and the kill goes to the cannon", () => {
    const [cannon] = prepareObjects(corridor, [{ id: 4, kind: "cannon", x: 5, y: 1, dir: 0, ownerId: "a" }]);
    const t = cannonFirstShot(cannon!) + 0.5;
    const ball = cannonBalls(cannon!, t)[0]!;
    const box = { x: ball.x - 0.3, y: ball.y - 0.3, w: 0.6, h: 0.6 };
    expect(findKiller([cannon!], box, 0, t)?.id).toBe(4);
    expect(findKiller([cannon!], { ...box, x: box.x + 3 }, 0, t)).toBeNull();
  });

  it("its whole line of fire counts for the reachability check, so its direction matters", () => {
    // A cannon in the top row, over the only lane: pointing down it covers the lane.
    const down: PlacedObject = { id: 5, kind: "cannon", x: 10, y: 1, dir: 1 };
    const up: PlacedObject = { id: 6, kind: "cannon", x: 10, y: 1, dir: 3 };
    const graph = buildReachGraph(corridor, [], tuning);
    expect(placementKeepsPath(corridor, [], down, tuning, graph)).toBe(false);
    expect(placementKeepsPath(corridor, [], up, tuning, graph)).toBe(true);
    const [prepared] = prepareObjects(corridor, [down]);
    expect(footprintCells(prepared!, corridor.width)).toEqual([1 * 20 + 10, 2 * 20 + 10]);
  });
});

describe("spring", () => {
  // The finish is on a floating ledge 6 cells up, far from any wall: too high to jump or
  // climb to, fine with a spring.
  const ledge: LevelDefinition = {
    name: "ledge",
    rows: [
      "##############################",
      "#............................#",
      "#............................#",
      "#...............F............#",
      "#.............######.........#",
      "#............................#",
      "#............................#",
      "#............................#",
      "#............................#",
      "#S...........................#",
      "##############################",
    ],
  };
  const W = 30;

  it("throws a character landing on it up to the spring height", () => {
    const level = withSolidObjects(parseLevel(ledge), [{ id: 1, kind: "spring", x: 5, y: 9 }]);
    const c = new CharacterController(level, tuning);
    c.x = 5.1;
    c.y = 6;
    let top = c.y;
    for (let i = 0; i < 240; i++) {
      c.step(DT, idle);
      top = Math.min(top, c.y);
    }
    expect(c.bounceCount).toBeGreaterThanOrEqual(1);
    expect(c.lastBounceCell).toBe(9 * W + 5);
    // Landed on the spring top (y = 9) and went up about springHeight cells.
    expect(9 - (top + tuning.bodyHeight)).toBeGreaterThan(tuning.springHeight - 0.3);
  });

  it("is used by the reachability check, and is never a place to stand", () => {
    const level = parseLevel(ledge);
    expect(buildReachGraph(level, [], tuning).reachable).toBe(false);
    const spring: PlacedObject = { id: 1, kind: "spring", x: 12, y: 9 };
    const graph = buildReachGraph(level, [spring], tuning);
    expect(graph.reachable).toBe(true);
    expect(graph.edges.has(8 * W + 12)).toBe(false);
  });
});

describe("vine", () => {
  const room = parseLevel({
    name: "room",
    rows: [
      "####################",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#..................#",
      "#S.................#",
      "####################",
    ],
  });
  const vineObj: PlacedObject = { id: 9, kind: "vine", x: 8, y: 1 };

  it("hangs a rope below its anchor, shortened by what is under it", () => {
    const [v] = prepareObjects(room, [vineObj]);
    expect(v!.range).toBe(4);
    const [short] = prepareObjects(room, [vineObj, { id: 2, kind: "platform", x: 8, y: 4 }]);
    expect(short!.range).toBe(2);
    expect(vinesOf([v!])[0]).toMatchObject({ id: 9, ax: 8.5, ay: 2 });
  });

  it("is grabbed in mid-air keeping the momentum, swings, and jump lets go upwards", () => {
    const objects = prepareObjects(room, [vineObj]);
    const level = withSolidObjects(room, objects);
    const vines = vinesOf(objects);
    const c = new CharacterController(level, tuning);
    c.x = 7.8;
    c.y = 3.5;
    c.vx = 6;
    c.vy = 0;
    c.grounded = false;
    const grabbed = c.tryGrabVine(vines, () => true);
    expect(grabbed?.id).toBe(9);
    expect(c.swing).not.toBeNull();
    expect(c.swing!.omega).toBeGreaterThan(0); // moving right keeps swinging right
    run(c, 0.3);
    expect(c.swing).not.toBeNull();
    const ropeEnd = Math.hypot(c.x + tuning.bodyWidth / 2 - 8.5, c.y + tuning.bodyHeight / 2 - 2);
    expect(ropeEnd).toBeCloseTo(c.swing!.length, 5);
    c.step(DT, { ...idle, jumpPressed: true, jumpHeld: true });
    expect(c.swing).toBeNull();
    expect(c.vy).toBeLessThan(0);
    // Can't grab it again straight away.
    expect(c.tryGrabVine(vines, () => true)).toBeNull();
  });

  it("is not grabbed when another player holds it", () => {
    const objects = prepareObjects(room, [vineObj]);
    const c = new CharacterController(withSolidObjects(room, objects), tuning);
    c.x = 8.1;
    c.y = 3.5;
    c.grounded = false;
    expect(c.tryGrabVine(vinesOf(objects), () => false)).toBeNull();
  });
});

describe("contacts between players", () => {
  const flat = parseLevel({ name: "flat", rows: ["..........", "..........", "S.........", "##########"] });

  it("a stomp bounce is higher with jump held, like a jump", () => {
    const heights = [true, false].map((held) => {
      const c = new CharacterController(flat, tuning);
      c.launch(tuning.stompBounceHeight, true);
      const y0 = c.y;
      let top = c.y;
      for (let i = 0; i < 120; i++) {
        c.step(DT, { ...idle, jumpHeld: held });
        top = Math.min(top, c.y);
      }
      return y0 - top;
    });
    expect(heights[0]).toBeCloseTo(tuning.stompBounceHeight, 0);
    expect(heights[1]).toBeLessThan(heights[0]! - 1);
  });

  it("a stomped player is stunned: no jump, slow run, until the stun ends", () => {
    const c = new CharacterController(flat, tuning);
    c.slam(tuning.stompSlamSpeed, tuning.stunTime);
    c.step(DT, { ...idle, jumpPressed: true, jumpHeld: true });
    expect(c.vy).toBe(0);
    run(c, 0.3, { ...idle, right: true });
    expect(c.vx).toBeLessThanOrEqual(tuning.runSpeed * tuning.stunSpeedFactor + 1e-9);
    run(c, tuning.stunTime);
    c.step(DT, { ...idle, jumpPressed: true, jumpHeld: true });
    expect(c.vy).toBeLessThan(0);
  });

  it("a shove sets the speed and holds it for a moment", () => {
    const c = new CharacterController(flat, tuning);
    c.shove(-tuning.shoveSpeed, tuning.shoveLock);
    c.step(DT, { ...idle, right: true });
    expect(c.vx).toBe(-tuning.shoveSpeed);
  });
});

describe("level characters and the draw", () => {
  it("objects drawn in a map become level objects nobody owns", () => {
    const level = parseLevel({ name: "chars", rows: ["S.T.V.<>*^AU=F", "##############"] });
    expect(level.initialObjects.map((o) => [o.kind, o.x, o.dir])).toEqual([
      ["spring", 2, undefined],
      ["vine", 4, undefined],
      ["cannon", 6, 2],
      ["cannon", 7, 0],
      ["saw", 8, undefined],
      ["spikes", 9, undefined],
      ["cannon", 10, 3],
      ["cannon", 11, 1],
      ["platform", 12, undefined],
    ]);
    expect(level.initialObjects.every((o) => o.id < 0 && o.ownerId === undefined)).toBe(true);
    expect(level.solid.filter(Boolean)).toHaveLength(14);
  });

  it("draws exactly the number asked, never the same object three times", () => {
    const rng = createRng(1234);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const hand = drawOffer(rng, 3);
      expect(hand).toHaveLength(3);
      for (const k of hand) seen.add(k);
      for (const k of OBJECT_KINDS) expect(hand.filter((h) => h === k).length).toBeLessThanOrEqual(2);
    }
    expect([...seen].sort()).toEqual([...OBJECT_KINDS].sort());
  });
});

// --- Session: stomps and vines -------------------------------------------------------------

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
  all<T extends ServerMessage["type"]>(type: T): Array<Extract<ServerMessage, { type: T }>> {
    return this.sent.filter((s) => s.msg.type === type).map((s) => s.msg as Extract<ServerMessage, { type: T }>);
  }
  lastTo<T extends ServerMessage["type"]>(type: T, to: string): Extract<ServerMessage, { type: T }> | undefined {
    const m = this.sent.filter((s) => s.msg.type === type && (s.to === to || s.to === "*")).pop();
    return m?.msg as Extract<ServerMessage, { type: T }> | undefined;
  }
}

const field: LevelDefinition = {
  name: "field",
  rows: ["....................", "........V...........", "....................", "S..................F", "####################"],
};

function raceWith(ids: string[]) {
  const io = new FakeIO();
  const s = new GameSession(io, "ABCD", [field]);
  for (const id of ids) s.addPlayer(id, id);
  s.handle(ids[0]!, { type: "start" });
  io.advance(TIMING.carouselSpin + TIMING.carouselHold);
  // Nobody places anything: the placement ends with its timer.
  io.advance(35_000 + TIMING.placementGrace + TIMING.countdown);
  return { io, s };
}

describe("session: contacts and vines", () => {
  it("map objects are in the level from the first placement", () => {
    const io = new FakeIO();
    const s = new GameSession(io, "ABCD", [field]);
    s.addPlayer("a", "a");
    s.handle("a", { type: "start" });
    io.advance(TIMING.carouselSpin + TIMING.carouselHold);
    const objects = io.lastTo("placement", "a")!.objects;
    expect(objects).toEqual([expect.objectContaining({ kind: "vine", x: 8, y: 1, range: 2 })]);
  });

  it("relays a plausible stomp, refuses early, far, repeated or dead ones", () => {
    const { io, s } = raceWith(["a", "b", "c"]);
    s.handle("a", { type: "pose", x: 5, y: 2, facing: 1, slide: false });
    s.handle("b", { type: "pose", x: 5, y: 3, facing: 1, slide: false });
    s.handle("c", { type: "pose", x: 15, y: 3, facing: 1, slide: false });
    s.handle("a", { type: "stomp", victim: "b" });
    expect(io.all("stomped")).toHaveLength(0); // everyone starts together: no contact at first
    io.advance(TIMING.contactGrace);
    s.handle("a", { type: "stomp", victim: "b" });
    expect(io.all("stomped")).toEqual([{ type: "stomped", by: "a", victim: "b" }]);
    s.handle("a", { type: "stomp", victim: "b" });
    expect(io.all("stomped")).toHaveLength(1); // cooldown
    s.handle("a", { type: "stomp", victim: "c" });
    expect(io.all("stomped")).toHaveLength(1); // too far
    s.handle("b", { type: "died", killerId: null, x: 5, y: 3, fell: true });
    io.advance(TIMING.stompCooldown);
    s.handle("a", { type: "stomp", victim: "b" });
    expect(io.all("stomped")).toHaveLength(1); // victim is dead
    s.handle("a", { type: "stomp", victim: "a" });
    expect(io.all("stomped")).toHaveLength(1);
  });

  it("one player holds a vine at a time and dying lets go", () => {
    const { io, s } = raceWith(["a", "b"]);
    const vineId = io.lastTo("countdown", "a")!.objects.find((o) => o.kind === "vine")!.id;
    s.handle("a", { type: "vine", id: vineId, hold: true });
    expect(io.all("vine").pop()).toEqual({ type: "vine", id: vineId, holder: "a" });
    s.handle("b", { type: "vine", id: vineId, hold: true });
    expect(io.sent.at(-1)).toEqual({ to: "b", msg: { type: "vine", id: vineId, holder: "a" } });
    s.handle("a", { type: "died", killerId: null, x: 8, y: 3, fell: false });
    expect(io.all("vine").pop()).toEqual({ type: "vine", id: vineId, holder: null });
    s.handle("b", { type: "vine", id: vineId, hold: true });
    expect(io.all("vine").pop()).toEqual({ type: "vine", id: vineId, holder: "b" });
    s.handle("b", { type: "vine", id: 12345, hold: true });
    expect(io.all("vine").pop()).toEqual({ type: "vine", id: vineId, holder: "b" });
  });

  it("keeps a cannon's direction from the placement", () => {
    const io = new FakeIO();
    const s = new GameSession(io, "ABCD", [field]);
    s.addPlayer("a", "a");
    s.handle("a", { type: "start" });
    io.advance(TIMING.carouselSpin + TIMING.carouselHold);
    const hand = io.lastTo("placement", "a")!.offer;
    const objects = hand.map((kind, i) => ({ kind, x: 3 + i * 2, y: 0, dir: 3 as const }));
    s.handle("a", { type: "placement", objects, done: true });
    const placed = io.lastTo("countdown", "a")!.objects.filter((o) => o.ownerId === "a");
    for (const o of placed) {
      if (o.kind === "cannon") expect(o).toMatchObject({ dir: 3, range: expect.any(Number) });
      else expect(o.dir).toBeUndefined();
    }
  });
});

describe("contact detection", () => {
  const w = 0.8;
  const h = 0.9;
  const other = { x: 5, y: 5 };

  it("a fall onto the head is a stomp, from the side it is a bump", () => {
    expect(contactWith({ x: 5.2, y: 4.15 }, 4.05, 6, other, w, h, false)).toBe("stomp");
    // Rising into someone is never a stomp.
    expect(contactWith({ x: 5.2, y: 4.15 }, 4.25, -6, other, w, h, false)).toBe("bump");
    expect(contactWith({ x: 4.5, y: 5 }, 5, 0, other, w, h, false)).toBe("bump");
    expect(contactWith({ x: 3.9, y: 5 }, 5, 0, other, w, h, false)).toBeNull();
  });

  it("a bump only fires when the touch starts", () => {
    expect(contactWith({ x: 4.5, y: 5 }, 5, 0, other, w, h, true)).toBeNull();
    expect(bodiesOverlap({ x: 4.5, y: 5 }, other, w, h)).toBe(true);
  });

  it("feet already deep inside the other body do not stomp", () => {
    expect(contactWith({ x: 5.2, y: 4.7 }, 4.6, 6, other, w, h, false)).toBe("bump");
  });
});

describe("review fixes", () => {
  const w = 0.8;
  const h = 0.9;

  it("the victim of a stomp sees no bump from the body landing on its head", () => {
    expect(contactWith({ x: 5, y: 10 }, 10, 0, { x: 5.1, y: 9.2 }, w, h, false)).toBeNull();
  });

  it("a stunned player can neither grab a vine nor jump off one", () => {
    const room = parseLevel({ name: "r", rows: ["##########", "#........#", "#........#", "#........#", "#........#", "#........#", "#S.......#", "##########"] });
    const objects = prepareObjects(room, [{ id: 1, kind: "vine", x: 4, y: 1 }]);
    const c = new CharacterController(withSolidObjects(room, objects), tuning);
    c.x = 4.1;
    c.y = 3.5;
    c.grounded = false;
    c.slam(0, 0.5);
    expect(c.tryGrabVine(vinesOf(objects), () => true)).toBeNull();
    c.stunTimer = 0;
    expect(c.tryGrabVine(vinesOf(objects), () => true)).not.toBeNull();
    c.stunTimer = 0.5;
    c.step(DT, { ...idle, jumpPressed: true, jumpHeld: true });
    expect(c.swing).not.toBeNull();
  });

  it("a vine rope stops above the floor, and a vine with one free cell has none", () => {
    const room = parseLevel({ name: "r", rows: ["##########", "#........#", "#........#", "#S.......#", "##########"] });
    const [low] = prepareObjects(room, [{ id: 1, kind: "vine", x: 4, y: 1 }]);
    expect(low!.range).toBe(2);
    expect(vinesOf([low!])[0]!.length + tuning.bodyHeight / 2).toBeLessThanOrEqual(2);
    const [tiny] = prepareObjects(room, [{ id: 2, kind: "vine", x: 4, y: 2 }]);
    expect(tiny!.range).toBe(1);
    expect(vinesOf([tiny!])).toEqual([]);
  });

  it("the race guard keeps cannon lines as measured at the start: a block does not make a line safe", () => {
    // Cannon above a shelf points down through route A; route B is a tunnel under the shelf.
    const def: LevelDefinition = {
      name: "frozen",
      rows: [
        "####################",
        "#.........U........#",
        "#..................#",
        "#..................#",
        "#..................#",
        "#..................#",
        "#..................#",
        "#.......#####......#",
        "#S.................F",
        "####################",
      ],
    };
    const level = parseLevel(def);
    const objects = prepareObjects(level, level.initialObjects);
    const guard = new PathGuard(level, objects, tuning, { frozenRanges: true });
    // Shield right under the cannon: accepted (it only adds a solid cell).
    expect(guard.tryAdd({ id: 1, kind: "platform", x: 10, y: 2 })).toBe(true);
    // Closing the tunnel would be fine if the shield stopped balls, but in the race it does not.
    const closesTunnel = { id: 2, kind: "platform" as const, x: 10, y: 8 };
    const really = buildReachGraph(level, [...objects, { id: 1, kind: "platform", x: 10, y: 2 }, closesTunnel], tuning, true).reachable;
    expect(guard.tryAdd(closesTunnel)).toBe(really);
  });

  it("a dead player's block may not shut a living player in", () => {
    // A 1-high corridor: a block behind a player doesn't shut them in, a block ahead does.
    const level = parseLevel({ name: "lane", rows: ["##############", "#S..........F#", "##############"] });
    const W = level.width;
    const guard = new PathGuard(level, [], tuning, { frozenRanges: true });
    const player = 1 * W + 8;
    const behind = { id: 1, kind: "platform" as const, x: 4, y: 1 };
    const ahead = { id: 2, kind: "platform" as const, x: 10, y: 1 };
    expect(guard.keepsPathFrom([player], behind)).toBe(true);
    expect(guard.keepsPathFrom([player], ahead)).toBe(false);
    // A cell the graph never reached (inside a wall, mid-air) is ignored.
    expect(guard.keepsPathFrom([0], ahead)).toBe(true);
  });
});
