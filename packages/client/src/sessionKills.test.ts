/**
 * Trap kills the session must not drop: deaths reported just after the race closed (network
 * latency, TIMING.lateReport) and runs of players who reconnected during the race.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_GAME_CONFIG,
  GameSession,
  OBJECT_DEFS,
  POINTS,
  TIMING,
  type CardKind,
  type LevelDefinition,
  type ServerMessage,
  type SessionIO,
} from "@game/shared";
import { RoundKills, statusAfterOwnReport, statusFromCountdown } from "./sim/raceResume";

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
  count(type: ServerMessage["type"]): number {
    return this.sent.filter((s) => s.msg.type === type).length;
  }
}

const openField: LevelDefinition = {
  name: "open",
  rows: ["....................", "....................", "S..................F", "####################"],
};

/**
 * Legal cells of the open field for a hand (the start zone covers x 0..3, the finish zone
 * x 17..19): objects in the air on row `y` from column x0, spikes (they can't float) on the
 * floor pointing up from column floorX.
 */
function spots(offer: readonly CardKind[], x0: number, floorX: number, y = 0) {
  let air = x0;
  let floor = floorX;
  return offer.map((kind) => (kind === "spikes" ? { kind, x: floor++, y: 2, dir: 3 as const } : { kind, x: air++, y }));
}

/** Players a, b, c in a running race (contact grace over); "a" placed traps in the air. */
function toRace() {
  const io = new FakeIO();
  const s = new GameSession(io, "ABCD", [openField]);
  for (const id of ["a", "b", "c"]) s.addPlayer(id, id.toUpperCase());
  s.handle("a", { type: "start" });
  io.advance(TIMING.carouselSpin + TIMING.carouselHold);
  for (const [id, x0, floorX] of [["a", 4, 14], ["b", 8, 15], ["c", 11, 16]] as const) {
    const offer = io.last("placement", id)!.offer;
    s.handle(id, { type: "placement", objects: spots(offer, x0, floorX), done: true });
  }
  const objects = io.last("countdown", "a")!.objects;
  for (const id of ["a", "b", "c"]) expect(io.last("countdown", id)!.refusedObjects).toEqual([]);
  const trap = objects.find((o) => o.ownerId === "a" && OBJECT_DEFS[o.kind].family === "kill");
  expect(trap).toBeDefined();
  io.advance(TIMING.countdown + TIMING.contactGrace);
  const raceLeft = DEFAULT_GAME_CONFIG.raceTime * 1000 - TIMING.contactGrace;
  return { io, s, aTrap: trap!.id, raceLeft };
}

const lineOf = (io: FakeIO, id: string) => io.last("score")!.lines.find((l) => l.playerId === id)!;

describe("trap kills the session must not drop", () => {
  it("a death on a trap reported just after the race end still counts", () => {
    const { io, s, aTrap, raceLeft } = toRace();
    s.handle("c", { type: "finished", time: 10 });
    io.advance(raceLeft + 100);
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false });
    expect(io.last("playerDied")).toMatchObject({ id: "b", killerOwner: "a" });
    io.advance(TIMING.raceEndPause);
    expect(io.last("score")!.verdict).toBe("scored");
    expect(lineOf(io, "a")).toMatchObject({ kills: 1, victims: 1 });
  });

  it("a death reported too long after the race end is ignored", () => {
    const { io, s, aTrap, raceLeft } = toRace();
    s.handle("c", { type: "finished", time: 10 });
    io.advance(raceLeft + TIMING.lateReport + 100);
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false });
    expect(io.count("playerDied")).toBe(0);
    io.advance(TIMING.raceEndPause);
    expect(lineOf(io, "a")).toMatchObject({ kills: 0, victims: 0 });
  });

  it("a player back during the race runs again, and their death in a trap counts", () => {
    const { io, s, aTrap } = toRace();
    s.setConnected("b", false);
    io.advance(500);
    s.setConnected("b", true);
    s.handle("b", { type: "pose", x: 2, y: 2, facing: 1, slide: false });
    io.advance(TIMING.ghostInterval);
    expect(io.last("ghosts")!.players.find((g) => g.id === "b")?.status).toBe("running");
    // b runs again, so the race goes on after a and c are done.
    s.handle("c", { type: "finished", time: 10 });
    s.handle("a", { type: "died", killerId: null, x: 4, y: 5, fell: true });
    io.advance(TIMING.raceEndPause);
    expect(io.last("score")).toBeUndefined();
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false });
    expect(io.last("playerDied")).toMatchObject({ id: "b", killerOwner: "a" });
    io.advance(TIMING.raceEndPause);
    expect(lineOf(io, "a")).toMatchObject({ kills: 1, total: 1 });
  });

  it("a dropped player's death that arrives once the race ended early still counts", () => {
    const { io, s, aTrap } = toRace();
    s.setConnected("b", false);
    s.handle("a", { type: "finished", time: 10 });
    s.handle("c", { type: "finished", time: 11 });
    // Nobody running any more: the race is over before raceEndsAt.
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false });
    expect(io.last("playerDied")).toMatchObject({ id: "b", killerOwner: "a" });
    io.advance(TIMING.raceEndPause);
    expect(lineOf(io, "a")).toMatchObject({ finish: 2, first: 1, kills: 1, total: 4 });
  });

  it("the late window counts from when the race closed early, not from raceEndsAt", () => {
    const { io, s, aTrap } = toRace();
    s.setConnected("b", false);
    s.handle("a", { type: "finished", time: 10 });
    s.handle("c", { type: "finished", time: 11 });
    io.advance(TIMING.lateReport + 100);
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false });
    expect(io.count("playerDied")).toBe(0);
  });

  it("a fall credits nobody, even when it names a trap", () => {
    const { io, s, aTrap } = toRace();
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 5, fell: true });
    expect(io.last("playerDied")).toMatchObject({ id: "b", killerOwner: null });
    s.handle("c", { type: "died", killerId: 9999, x: 4, y: 1, fell: false });
    expect(io.last("playerDied")).toMatchObject({ id: "c", killerOwner: null });
  });
});

/** The countdown a player got last (the one resync sends on a reconnection). */
const countdownTo = (io: FakeIO, id: string) => {
  for (let i = io.sent.length - 1; i >= 0; i--) {
    const s = io.sent[i]!;
    if (s.to === id && s.msg.type === "countdown") return s.msg;
  }
  throw new Error(`no countdown sent to ${id}`);
};

describe("rejoining in the middle of a race", () => {
  it("a player who died before dropping is told so, and resumes watching", () => {
    const { io, s, aTrap } = toRace();
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false });
    s.setConnected("b", false);
    s.setConnected("b", true);
    const cd = countdownTo(io, "b");
    expect(cd.status).toBe("dead");
    expect(statusFromCountdown(cd.status)).toBe("dead");
  });

  it("a player who dropped while running is told to run again", () => {
    const { io, s } = toRace();
    s.setConnected("b", false);
    s.setConnected("b", true);
    expect(statusFromCountdown(countdownTo(io, "b").status)).toBe("running");
  });

  it("a death sent while offline that reaches the session after the rejoin ends the restarted run", () => {
    const { io, s, aTrap } = toRace();
    s.setConnected("b", false);
    s.setConnected("b", true);
    let mine = statusFromCountdown(countdownTo(io, "b").status);
    expect(mine).toBe("running");
    // The network layer flushes the death it buffered while b was offline: the session takes it...
    s.handle("b", { type: "died", killerId: aTrap, x: 4, y: 1, fell: false });
    const died = io.last("playerDied")!;
    expect(died).toMatchObject({ id: "b", killerOwner: "a" });
    // ...and b's client, still running its new run, stops too instead of racing for nothing.
    mine = statusAfterOwnReport(mine, "dead");
    expect(mine).toBe("dead");
    // A report we sent ourselves changes nothing.
    expect(statusAfterOwnReport("finished", "finished")).toBe("finished");
  });

  it("the countdown lists the round's trap deaths, so the kill notices match the score past killCap", () => {
    const io = new FakeIO();
    const s = new GameSession(io, "ABCD", [openField]);
    const ids = ["a", "b", "c", "d", "e"];
    for (const id of ids) s.addPlayer(id, id.toUpperCase());
    s.handle("a", { type: "start" });
    io.advance(TIMING.carouselSpin + TIMING.carouselHold);
    // Two objects each: rows 0 and 1 of x 4..11, spikes side by side on the floor at x 12..16
    // (one floor cell per player, so two spikes never leave a one-cell gap to land in).
    for (const [i, id] of ids.entries()) {
      const offer = io.last("placement", id)!.offer;
      s.handle(id, { type: "placement", objects: spots(offer, 4 + (i % 3) * 3, 12 + i, i < 3 ? 0 : 1), done: true });
    }
    const objects = io.last("countdown", "a")!.objects;
    for (const id of ids) expect(io.last("countdown", id)!.refusedObjects).toEqual([]);
    const cTrap = objects.find((o) => o.ownerId === "c" && OBJECT_DEFS[o.kind].family === "kill")!;
    expect(cTrap).toBeDefined();
    io.advance(TIMING.countdown + TIMING.contactGrace);
    // a and b die in c's trap (killCap victims), then d drops and comes back.
    s.handle("a", { type: "died", killerId: cTrap.id, x: 4, y: 1, fell: false });
    s.handle("b", { type: "died", killerId: cTrap.id, x: 4, y: 1, fell: false });
    s.setConnected("d", false);
    s.setConnected("d", true);
    const kills = new RoundKills();
    kills.reset(countdownTo(io, "d").deaths);
    // e dies in c's trap: past killCap, worth POINTS.minKill on d's screen as in the score.
    s.handle("e", { type: "died", killerId: cTrap.id, x: 4, y: 1, fell: false });
    const died = io.last("playerDied")!;
    const gain = kills.add({ id: died.id, killerOwner: died.killerOwner!, pushedBy: died.pushedBy });
    s.handle("c", { type: "finished", time: 10 });
    s.handle("d", { type: "finished", time: 11 });
    io.advance(TIMING.raceEndPause);
    expect(lineOf(io, "c")).toMatchObject({ kills: 2.5, victims: 3 });
    expect(gain).toBe(POINTS.minKill);
  });
});
