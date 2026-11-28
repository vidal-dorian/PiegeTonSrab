/**
 * Golden test: the race mode's character controller and reach graphs must stay bit-identical.
 *
 * The co-op mode subclasses CharacterController (packages/shared/src/coop), which needed some
 * private members to become protected and a few small extractions. Those edits must not change a
 * single bit of the race mode: the server's placement check (PathGuard) and the client preview both
 * run the real controller. The values below were recorded on the untouched controller (main,
 * 4aec1cb). The two scenarios springWallRun and vineDropRun were added after a review showed that no
 * scenario covered the spring's jump-buffer clear or the vine-drop reset on landing; their values were
 * recorded on a git-archive copy of 4aec1cb as well. Every step of every scenario feeds the exact float64 bits of the body's state into a
 * hash, so any change in arithmetic or order shows up.
 *
 * Re-recorded when main was merged into the co-op branch (main 03bb9fe: turned springs, solid
 * spikes), on a git-archive copy of 03bb9fe with this file dropped in, never on the merged tree:
 * every trajectory kept its value; La Jungle's reach graph changed (its spikes are solid blocks
 * now); the two "turned springs and spikes" scenarios were added to cover main's sideways and
 * downward spring throws, which the hooks the co-op controller overrides (moveX, moveY) now carry.
 *
 * To re-record after an intended change of the race mode (from packages/client):
 *   GOLDEN_RECORD=1 npx vitest run controllerGolden --silent=false --reporter=verbose
 */
import { describe, expect, it } from "vitest";
import {
  buildReachGraph,
  CharacterController,
  DEFAULT_MOVEMENT,
  parseLevel,
  prepareObjects,
  RACE_LEVELS,
  testLevel,
  vinesOf,
  withSolidObjects,
  type LevelDefinition,
  type PlacedObject,
  type StepInput,
} from "@game/shared";
import { SIM_HZ } from "./config";

const DT = 1 / SIM_HZ;
/** The client tsconfig has no Node types: read the environment without them. */
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const RECORD = env.GOLDEN_RECORD === "1";

/** 32-bit FNV-1a over raw bytes. */
class Fnv {
  h = 0x811c9dc5;
  private view = new DataView(new ArrayBuffer(8));
  byte(b: number): void {
    this.h ^= b & 0xff;
    this.h = Math.imul(this.h, 0x01000193) >>> 0;
  }
  float(x: number): void {
    this.view.setFloat64(0, x);
    for (let i = 0; i < 8; i++) this.byte(this.view.getUint8(i));
  }
  int(n: number): void {
    this.view.setInt32(0, n);
    for (let i = 0; i < 4; i++) this.byte(this.view.getUint8(i));
  }
  hex(): string {
    return this.h.toString(16).padStart(8, "0");
  }
}

/** Small seeded generator (mulberry32), so scenarios are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inputs that change every few steps: runs, taps and full jumps, stops, drops. */
function inputStream(seed: number): () => StepInput {
  const r = rng(seed);
  let left = false;
  let right = false;
  let jumpHeld = false;
  let down = false;
  let left_ = 0;
  return () => {
    let jumpPressed = false;
    if (left_ <= 0) {
      left_ = 4 + Math.floor(r() * 40);
      const d = r();
      left = d < 0.35;
      right = d > 0.6;
      const j = r();
      jumpPressed = j < 0.45;
      jumpHeld = jumpPressed && r() < 0.7;
      down = r() < 0.08;
    }
    left_--;
    return { left, right, jumpHeld, jumpPressed, down };
  };
}

/** Coverage counters, printed when recording, to check the scenarios exercise what they should. */
const coverage = { wallSlide: 0, swing: 0, airborne: 0, stunned: 0, sideThrows: 0, downThrows: 0 };

function hashState(f: Fnv, c: CharacterController): void {
  if (c.wallSliding) coverage.wallSlide++;
  if (c.swing) coverage.swing++;
  if (!c.grounded) coverage.airborne++;
  if (c.stunTimer > 0) coverage.stunned++;
  f.float(c.x);
  f.float(c.y);
  f.float(c.vx);
  f.float(c.vy);
  f.int(c.grounded ? 1 : 0);
  f.int(c.wallSide);
  f.int(c.wallSliding ? 1 : 0);
  f.int(c.facing);
  f.float(c.stunTimer);
  f.int(c.bounceCount);
  if (c.swing) {
    f.float(c.swing.angle);
    f.float(c.swing.omega);
    f.float(c.swing.length);
  }
}

/** Random play on the test level, with the pushes other players can give mixed in. */
function randomRun(seed: number, steps: number, pushes: boolean): string {
  const level = parseLevel(testLevel);
  const c = new CharacterController(level, { ...DEFAULT_MOVEMENT });
  const next = inputStream(seed);
  const f = new Fnv();
  for (let i = 0; i < steps; i++) {
    if (pushes) {
      if (i % 500 === 250) c.launch(DEFAULT_MOVEMENT.stompBounceHeight, i % 1000 === 250);
      if (i % 700 === 350) c.slam(DEFAULT_MOVEMENT.stompSlamSpeed, DEFAULT_MOVEMENT.stunTime);
      if (i % 300 === 150) c.shove((i % 600 === 150 ? 1 : -1) * DEFAULT_MOVEMENT.shoveSpeed, DEFAULT_MOVEMENT.shoveLock);
    }
    c.step(DT, next());
    if (c.fellOut) c.respawn();
    hashState(f, c);
  }
  return f.hex();
}

/** Random play starting at the bottom of the test level's wall-jump shaft: wall slides and wall jumps. */
function shaftRun(seed: number, steps: number): string {
  const level = parseLevel(testLevel);
  const c = new CharacterController(level, { ...DEFAULT_MOVEMENT });
  const next = inputStream(seed);
  const f = new Fnv();
  c.standInCell(44, 15);
  for (let i = 0; i < steps; i++) {
    c.step(DT, next());
    if (c.fellOut) c.standInCell(44, 15);
    hashState(f, c);
  }
  return f.hex();
}

const VINE_ROOM: LevelDefinition = {
  name: "vine room",
  rows: [
    "####################",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#S.................#",
    "####################",
  ],
};

/** Random play in a room with two vines, grabbing every step like LocalPlayer does. */
function vineRun(seed: number, steps: number): string {
  const room = parseLevel(VINE_ROOM);
  const placed: PlacedObject[] = [
    { id: 9, kind: "vine", x: 8, y: 1 },
    { id: 10, kind: "vine", x: 13, y: 1 },
    { id: 11, kind: "spring", x: 4, y: 8 },
  ];
  const objects = prepareObjects(room, placed);
  const c = new CharacterController(withSolidObjects(room, objects), { ...DEFAULT_MOVEMENT });
  const vines = vinesOf(objects);
  const next = inputStream(seed);
  const f = new Fnv();
  for (let i = 0; i < steps; i++) {
    if (i % 400 === 200) c.launch(DEFAULT_MOVEMENT.stompBounceHeight, true);
    c.step(DT, next());
    if (!c.swing) c.tryGrabVine(vines, (id) => id !== 10 || i % 2 === 0);
    hashState(f, c);
  }
  return f.hex();
}

const NO_INPUT: StepInput = { left: false, right: false, jumpHeld: false, jumpPressed: false, down: false };

/** A spring in each bottom corner, against the wall. */
const SPRING_WALL_ROOM: LevelDefinition = {
  name: "springs against the walls",
  rows: [
    "##########",
    "#........#",
    "#........#",
    "#........#",
    "#........#",
    "#........#",
    "#........#",
    "#........#",
    "#...S....#",
    "##########",
  ],
};

/**
 * Falling straight onto a spring next to a wall (0.1 cell from it, not touching it), with a jump
 * pressed just before landing, then steering towards the wall, nowhere or away. The launch uses up
 * the buffered jump: reaching the wall right after it must not wall-jump.
 */
function springWallRun(): string {
  const room = parseLevel(SPRING_WALL_ROOM);
  const placed: PlacedObject[] = [
    { id: 1, kind: "spring", x: 1, y: 8 },
    { id: 2, kind: "spring", x: 8, y: 8 },
  ];
  const c = new CharacterController(withSolidObjects(room, prepareObjects(room, placed)), { ...DEFAULT_MOVEMENT });
  const f = new Fnv();
  const springTop = 8;
  for (const side of [-1, 1]) {
    for (const steer of [side, 0, -side]) {
      for (const lead of [0.05, 0.3, 0.6, 1.2]) {
        c.standInCell(side < 0 ? 1 : 8, 2);
        const bounces = c.bounceCount;
        let pressed = false;
        let launched = false;
        for (let i = 0; i < 180; i++) {
          const input = { ...NO_INPUT };
          if (launched) {
            input.left = steer < 0;
            input.right = steer > 0;
          } else if (!pressed && c.vy > 0 && springTop - (c.y + DEFAULT_MOVEMENT.bodyHeight) <= lead) {
            input.jumpPressed = true;
            input.jumpHeld = true;
            pressed = true;
          }
          c.step(DT, input);
          if (c.bounceCount !== bounces) launched = true;
          hashState(f, c);
        }
      }
    }
  }
  return f.hex();
}

/** A room for the turned objects (main, 2026-11-26): springs on both walls, the floor and the ceiling, and solid spikes. */
const TURNED_ROOM: LevelDefinition = {
  name: "turned springs and spikes",
  rows: [
    "####################",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#..................#",
    "#S.................#",
    "####################",
  ],
};

/**
 * Random play among springs facing right, left, down and up and spikes (solid blocks) on the floor
 * and a wall: covers the sideways throw (moveX), the throw down from a ceiling spring (moveY) and
 * standing on spikes.
 */
function turnedRun(seed: number, steps: number): string {
  const room = parseLevel(TURNED_ROOM);
  const placed: PlacedObject[] = [
    { id: 1, kind: "spring", x: 1, y: 7, dir: 0 },
    { id: 2, kind: "spring", x: 1, y: 5, dir: 0 },
    { id: 3, kind: "spring", x: 18, y: 7, dir: 2 },
    { id: 4, kind: "spring", x: 18, y: 4, dir: 2 },
    { id: 5, kind: "spring", x: 6, y: 1, dir: 1 },
    { id: 6, kind: "spring", x: 14, y: 1, dir: 1 },
    { id: 7, kind: "spring", x: 6, y: 8, dir: 3 },
    { id: 8, kind: "spring", x: 14, y: 8 },
    { id: 9, kind: "spikes", x: 10, y: 8, dir: 3 },
    { id: 10, kind: "spikes", x: 11, y: 8 },
    { id: 11, kind: "spikes", x: 1, y: 2, dir: 0 },
  ];
  const c = new CharacterController(withSolidObjects(room, prepareObjects(room, placed)), { ...DEFAULT_MOVEMENT });
  const next = inputStream(seed);
  const f = new Fnv();
  for (let i = 0; i < steps; i++) {
    const bounces = c.bounceCount;
    c.step(DT, next());
    if (c.bounceCount !== bounces) {
      if (c.vy > 0) coverage.downThrows++;
      else if (Math.abs(c.vx) > DEFAULT_MOVEMENT.runSpeed) coverage.sideThrows++;
    }
    if (c.fellOut) c.respawn();
    hashState(f, c);
  }
  return f.hex();
}

/** A vine (rope 3.5 cells from y = 3) that reaches down near the floor: the floor is within its reach. */
const SHORT_VINE_ROOM: LevelDefinition = {
  name: "short vine room",
  rows: [
    "############",
    "#..........#",
    "#..........#",
    "#..........#",
    "#..........#",
    "#..........#",
    "#S.........#",
    "############",
  ],
};

/**
 * Jump into the vine from below, hang (pumping or not), let go with Down, land, and jump straight back
 * up at once: landing makes the dropped vine grabbable again, though the body never left its reach.
 */
function vineDropRun(): string {
  const room = parseLevel(SHORT_VINE_ROOM);
  const objects = prepareObjects(room, [{ id: 9, kind: "vine", x: 5, y: 2 }]);
  const c = new CharacterController(withSolidObjects(room, objects), { ...DEFAULT_MOVEMENT });
  const vines = vinesOf(objects);
  const f = new Fnv();
  const rounds: Array<[pump: number, pumpSteps: number]> = [[0, 0], [1, 0], [1, 30], [1, 70], [-1, 0], [-1, 30], [-1, 70]];
  for (const [pump, pumpSteps] of rounds) {
    c.standInCell(5, 5);
    let phase: "jump" | "hang" | "drop" | "fall" | "rejump" | "done" = "jump";
    let t = 0;
    for (let i = 0; i < 260; i++) {
      let input = NO_INPUT;
      if (phase === "jump" || phase === "rejump") input = { ...NO_INPUT, jumpPressed: t === 0, jumpHeld: true };
      else if (phase === "hang") input = { ...NO_INPUT, left: pump < 0 && t % 40 < 20, right: pump > 0 && t % 40 < 20 };
      else if (phase === "drop") input = { ...NO_INPUT, down: true };
      c.step(DT, input);
      if (!c.swing) c.tryGrabVine(vines, () => true);
      hashState(f, c);
      t++;
      if (phase === "jump" && c.swing) {
        phase = "hang";
        t = 0;
      } else if (phase === "hang" && t > pumpSteps) {
        phase = "drop";
        t = 0;
      } else if (phase === "drop") {
        phase = "fall";
        t = 0;
      } else if (phase === "fall" && c.grounded) {
        phase = "rejump";
        t = 0;
      } else if (phase === "rejump" && c.swing) {
        phase = "done";
        t = 0;
      }
    }
  }
  return f.hex();
}

/** Fingerprint of a reach graph: every edge (from, to, cells), sorted. */
function graphFingerprint(def: LevelDefinition): string {
  const level = parseLevel(def);
  const objects = prepareObjects(level, level.initialObjects);
  const g = buildReachGraph(level, objects, { ...DEFAULT_MOVEMENT });
  const f = new Fnv();
  f.int(g.reachable ? 1 : 0);
  f.int(g.start);
  for (const from of [...g.edges.keys()].sort((a, b) => a - b)) {
    const edges = g.edges.get(from)!.map((e) => ({ to: e.to, cells: [...e.cells].sort((a, b) => a - b) }));
    edges.sort((a, b) => a.to - b.to || a.cells.length - b.cells.length || a.cells.join().localeCompare(b.cells.join()));
    f.int(from);
    f.int(edges.length);
    for (const e of edges) {
      f.int(e.to);
      f.int(e.cells.length);
      for (const cell of e.cells) f.int(cell);
    }
  }
  return f.hex();
}

/** Recorded on the untouched controller (main, 4aec1cb), then on main 03bb9fe (see the header). */
const GOLDEN = {
  trajectories: {
    "random 1": "e5ee565f",
    "random 2": "e2bcb313",
    "random 3 + pushes": "2d179d51",
    "random 4 + pushes": "7426a7b5",
    "wall-jump shaft 5": "f02861d4",
    "wall-jump shaft 6": "e8419a8e",
    "vines 7": "71ef6049",
    "vines 8": "fd755a37",
    "spring by a wall + buffered jump": "4190e915",
    "vine drop, land, jump back": "fb7422e7",
    "turned springs and spikes 9": "58682cc8",
    "turned springs and spikes 10": "3a95fec4",
  } as Record<string, string>,
  graphs: {
    "Le Parc": "896e8cf3",
    "La Tour": "068d346d",
    "La Grotte": "496356dd",
    "Les Toits": "33756b46",
    "L'Usine": "e2e91672",
    "Le Puits": "0aa70a58",
    "Le Grand Huit": "ba13d252",
    "Le Labyrinthe": "ff6f8d47",
    "La Jungle": "54efc4d3",
    "Le Pont": "0b55eb1f",
    "Test du personnage": "fa4f093e",
  } as Record<string, string>,
};

const TRAJECTORIES: Record<string, () => string> = {
  "random 1": () => randomRun(1, 6000, false),
  "random 2": () => randomRun(2, 6000, false),
  "random 3 + pushes": () => randomRun(3, 6000, true),
  "random 4 + pushes": () => randomRun(4, 6000, true),
  "wall-jump shaft 5": () => shaftRun(5, 4000),
  "wall-jump shaft 6": () => shaftRun(6, 4000),
  "vines 7": () => vineRun(7, 6000),
  "vines 8": () => vineRun(8, 6000),
  "spring by a wall + buffered jump": springWallRun,
  "vine drop, land, jump back": vineDropRun,
  "turned springs and spikes 9": () => turnedRun(9, 6000),
  "turned springs and spikes 10": () => turnedRun(10, 6000),
};

describe("race-mode controller golden values", () => {
  it("every trajectory is bit-identical to the recorded one", () => {
    const got: Record<string, string> = {};
    for (const [name, run] of Object.entries(TRAJECTORIES)) got[name] = run();
    if (RECORD) {
      console.log("GOLDEN trajectories", JSON.stringify(got, null, 2), "coverage", JSON.stringify(coverage));
      return;
    }
    expect(got).toEqual(GOLDEN.trajectories);
  });

  it("every race map's reach graph is identical to the recorded one", () => {
    const got: Record<string, string> = {};
    for (const def of [...RACE_LEVELS, testLevel]) got[def.name] = graphFingerprint(def);
    if (RECORD) {
      console.log("GOLDEN graphs", JSON.stringify(got, null, 2));
      return;
    }
    expect(got).toEqual(GOLDEN.graphs);
  }, 60_000);
});
