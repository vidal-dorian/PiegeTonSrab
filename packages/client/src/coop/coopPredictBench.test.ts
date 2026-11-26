/**
 * Bench of the online co-op screen's prediction (step B), end to end: a real CoopSession on a
 * fake clock, a fake network (latency, jitter, TCP stalls, msgpack), and three PredictingClients
 * running the screen's PredictedPlay (clock estimated from pings, inputs stamped with the
 * predicted tick through CoopInputSender, a frame every 16.7 ms).
 *
 * Thresholds (the plan's, at 50 ms one way): no input lost, and 95 % of each player's own-body
 * corrections under 0.1 cell, over the seconds while keys change. Then the cases around it: TCP
 * stalls (both ways, downlink only, past the copy's 1.75 s full-speed window), this screen's own
 * link dead (silent or reported lost), a press stuck in a stalled upstream, a pause and resume, a
 * level change, a death and restart decided by the server, a tab hidden while a key is held, what
 * the drawing offsets may not do (sink, walls, rope links), a remote player hauling this player on
 * the rope, this player riding a remote player's head; and the replay's cost.
 */
import { describe, expect, it } from "vitest";
import {
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_LEFT,
  BIT_RIGHT,
  COOP,
  COOP_HZ,
  COOP_LEVELS,
  COOP_PROTOCOL_VERSION,
  CoopSession,
  CoopWorld,
  parseCoopLevel,
  sandboxLevel,
  type CoopLevelDef,
} from "@game/shared/coop";
import { countServerPresses, Net, PredictingClient, predictionVerdict, quantile, rng, type Link } from "./benchNet";
import { PREDICT_BY_DEFAULT, STALE_EASE_TICKS, STALE_FULL_TICKS } from "./net/predictedPlay";
import { CoopPredictor } from "./net/predictor";

/** A flat floor, 46 cells wide: hauling and riding. */
const flatLevel: CoopLevelDef = {
  id: "bench-flat",
  name: "Plat",
  quote: "",
  rows: [
    "##############################################",
    ...Array.from({ length: 8 }, () => "#............................................#"),
    "#.S..........................................#",
    "##############################################",
    "##############################################",
  ],
};

/** The same floor with spikes 7 cells right of the spawn: whoever walks right dies. */
const spikeLevel: CoopLevelDef = {
  ...flatLevel,
  id: "bench-spikes",
  rows: flatLevel.rows.map((r, y) => (y === 9 ? "#.S.......^^^................................#" : r)),
};

const IDS = ["p0", "p1", "p2"];

interface Room {
  net: Net;
  session: CoopSession;
  clients: PredictingClient[];
  presses: ReturnType<typeof countServerPresses>;
  /** Run `ms` of the fake clock; `each` runs every ms after the clients' frames. */
  run(ms: number, each?: (t: number) => void): void;
  /** Clients whose screen does not run (a hidden tab: no frame, no message read). */
  frozen: Set<string>;
  client(id: string): PredictingClient;
}

function room(opts: {
  latency: number;
  jitter: number;
  levels?: CoopLevelDef[];
  /** TCP stalls of a player's link, both ways ([from, to] server times)... */
  stalls?: Record<string, Array<[number, number]>>;
  /** ...or of its upstream only (its inputs are held, its snapshots keep coming)... */
  upStalls?: Record<string, Array<[number, number]>>;
  /** ...or of its downstream only (no snapshot reaches it, its inputs still reach the server). */
  downStalls?: Record<string, Array<[number, number]>>;
  seed?: number;
}): Room {
  const links = new Map<string, Link>();
  for (const id of IDS) {
    const stalls = opts.stalls?.[id] ?? [];
    links.set(`up:${id}`, { latency: opts.latency, jitter: opts.jitter, stalls: [...stalls, ...(opts.upStalls?.[id] ?? [])] });
    links.set(`down:${id}`, { latency: opts.latency, jitter: opts.jitter, stalls: [...stalls, ...(opts.downStalls?.[id] ?? [])] });
  }
  const levels = opts.levels ?? [sandboxLevel];
  const net = new Net(links, opts.seed ?? 7);
  const session = new CoopSession(net, "ABCD", levels);
  net.session = session;
  const clients = IDS.map((id, i) => new PredictingClient(id, net, levels, -100_000 * (i + 1)));
  for (const id of IDS) {
    expect(session.addPlayer(id, id, COOP_PROTOCOL_VERSION)).toBeNull();
    net.clients.push(id);
  }
  const presses = countServerPresses(session);
  const frozen = new Set<string>();
  const r: Room = {
    net,
    session,
    clients,
    presses,
    frozen,
    run(ms, each) {
      net.advance(ms, (t) => {
        presses.watch();
        for (const c of clients) if (!frozen.has(c.id)) c.tick();
        each?.(t);
      });
    },
    client: (id) => clients.find((c) => c.id === id)!,
  };
  // Clocks sync in the lobby, then the host starts the first level (its 1.5 s lead included).
  r.run(1000);
  net.up("p0", { type: "coopPlay", index: 0 });
  r.run(1700);
  return r;
}

/** How often random keys change, as chances per 8 ms: the direction, and a jump tap. */
interface KeyModel {
  change: number;
  jump: number;
}
/** The plan's bench: a new direction every ~200 ms, a jump every ~0.8 s, for every player. */
const STRESS: KeyModel = { change: 0.04, jump: 0.01 };
/** Calmer: a new direction every ~400 ms, a jump every ~1.6 s. */
const CALM: KeyModel = { change: 0.02, jump: 0.005 };
/** Runs pooled per latency (each run's keys and jitter differ)... */
const SEEDS = [1, 2, 3, 4];
/**
 * ...and for the run that decides PREDICT_BY_DEFAULT (50 ms, keys every ~200 ms), twice as many:
 * with 4 the verdict flipped in 2 of 6 equally valid seed sets.
 */
const VERDICT_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
/**
 * Every test here simulates seconds of a room: a latency run takes 1-3 s on a quiet machine, and
 * several times that when the machine is shared (vitest's default 5 s is not enough then).
 */
const LONG = 60_000;

/**
 * Random keys for these players, every 8 ms: walk left or right or stop, and tap jump (held 70 ms).
 * Returns a function to call every ms.
 */
function randomKeys(clients: PredictingClient[], seed: number, model: KeyModel = CALM): (t: number) => void {
  const r = rng(seed);
  const jumpUntil = new Map<PredictingClient, number>();
  return (t) => {
    if (t % 8 !== 0) return;
    for (const c of clients) {
      let dir = c.keys & (BIT_LEFT | BIT_RIGHT);
      if (r() < model.change) dir = r() < 0.45 ? BIT_RIGHT : r() < 0.8 ? BIT_LEFT : 0;
      let jump = c.keys & BIT_JUMP;
      if ((jumpUntil.get(c) ?? 0) <= t) jump = 0;
      if (r() < model.jump && !jump) {
        jump = BIT_JUMP;
        c.press |= BIT_JUMP_PRESS;
        jumpUntil.set(c, t + 70);
      }
      c.keys = dir | jump;
    }
  };
}

function stopKeys(clients: PredictingClient[]): void {
  for (const c of clients) {
    c.keys = 0;
    c.press = 0;
  }
}

/** Every press sent on an epoch reached the server's world on that epoch, for every player. */
function expectNoPressLost(r: Room): number {
  let total = 0;
  for (const c of r.clients) {
    for (const [epoch, sent] of c.pressesSent) {
      const applied = r.presses.counts.get(epoch)?.[c.seat] ?? 0;
      expect(applied, `${c.id}: presses applied on epoch ${epoch}`).toBe(sent);
      total += sent;
    }
  }
  return total;
}

/** Once nobody moves, each screen draws what the server has (offsets faded, same places). */
function expectSettled(r: Room): void {
  const server = (r.session as unknown as { world: CoopWorld }).world;
  for (const c of r.clients) {
    const play = c.play!;
    expect(play.predictor.waiting).toBe(false);
    const drawn = play.frame().bodies;
    server.bodies.forEach((b, i) => {
      expect(Math.abs(drawn[i]!.x - b.x), `${c.id}: body ${i} x`).toBeLessThan(0.01);
      expect(Math.abs(drawn[i]!.y - b.y), `${c.id}: body ${i} y`).toBeLessThan(0.01);
    });
  }
}

/**
 * The drawn own body of `c` at each of its frames (a frame moves the predicted clock), to call
 * every ms: `moves` the distance from the previous frame, `frozen` the frames it did not move.
 */
function ownMotion(c: PredictingClient): { sample: () => void; moves: number[]; frozen: number } {
  let clock = Number.NaN;
  let last: { x: number; y: number } | null = null;
  const out = {
    moves: [] as number[],
    frozen: 0,
    sample: () => {
      const play = c.play!;
      if (play.predictedTick === clock) return;
      clock = play.predictedTick;
      const b = play.frame().bodies[c.seat]!;
      if (last) {
        const d = Math.hypot(b.x - last.x, b.y - last.y);
        out.moves.push(d);
        if (d < 1e-6) out.frozen++;
      }
      last = { x: b.x, y: b.y };
    },
  };
  return out;
}

function p95(values: readonly number[]): number {
  return quantile(values, 0.95);
}

const fmt = (v: number) => v.toFixed(3);

describe("co-op prediction bench (step B, the screen's PredictedPlay end to end)", { timeout: LONG }, () => {
  const results: string[] = [];

  interface LatencyRun {
    /** Every player's corrections, pooled. */
    corr: number[];
    /** The same by run and player: runs[seed][client]. */
    runs: number[][][];
    presses: number;
    lead: number;
  }

  /**
   * Every player's own-body corrections over `seeds` runs of 10 s of random keys at this latency:
   * only the snapshots of those 10 s (before the keys start and once they stop, every correction
   * is 0 and would only dilute the share).
   */
  function latencyRun(latency: number, jitter: number, model: KeyModel, seeds: readonly number[] = SEEDS): LatencyRun {
    const corr: number[] = [];
    const runs: number[][][] = [];
    let presses = 0;
    let lead = 0;
    for (const seed of seeds) {
      const r = room({ latency, jitter, seed: latency * 10 + seed });
      const from = r.clients.map((c) => c.allCorrections().length);
      r.run(10_000, randomKeys(r.clients, seed * 7 + latency, model));
      const run = r.clients.map((c, i) => c.allCorrections().slice(from[i]));
      runs.push(run);
      for (const list of run) corr.push(...list);
      stopKeys(r.clients);
      r.run(1500);
      presses += expectNoPressLost(r);
      expectSettled(r);
      lead = r.clients[0]!.play!.lead;
    }
    return { corr, runs, presses, lead };
  }

  function describeRun(label: string, run: LatencyRun): string {
    const { corr } = run;
    const over = corr.filter((x) => x > 0.1).length / corr.length;
    const each = predictionVerdict(run.runs).perPlayer.map(fmt).join(" / ");
    return `${label}: ${run.presses} presses, none lost; own corrections p95 ${fmt(p95(corr))} pooled, ${each} per player, p99 ${fmt(quantile(corr, 0.99))}, ${(100 * over).toFixed(1)} % over 0.1 cell (${corr.length} snapshots, ${run.runs.length} runs); lead ${run.lead} ticks`;
  }

  // The plan's bench: three players changing keys every ~200 ms. The prediction is on by default
  // only if 95 % of each player's own-body corrections stay under 0.1 cell at 50 ms here, and
  // both halves of the runs say the same (else the seeds are too few to decide).
  it.each([
    [20, 5, 0.1],
    [50, 10, 0.2],
    [100, 20, 0.8],
  ])("at %i ms one way (+%i jitter), keys every ~200 ms: no input lost, own corrections p95 under %f cell (pooled)", (latency, jitter, bound) => {
    const run = latencyRun(latency, jitter, STRESS, latency === 50 ? VERDICT_SEEDS : SEEDS);
    expect(run.presses).toBeGreaterThan(100);
    const q = p95(run.corr);
    expect(q).toBeLessThan(bound);
    if (latency === 50) {
      const v = predictionVerdict(run.runs);
      expect(v.stable, `per-player p95 ${v.perPlayer.map(fmt).join(" / ")}, halves ${v.halves.join(" / ")}: too close to call, add seeds`).toBe(true);
      expect(v.on, `worst player's p95 ${fmt(v.worst)} at 50 ms decides PREDICT_BY_DEFAULT`).toBe(PREDICT_BY_DEFAULT);
    }
    results.push(describeRun(`${latency} ms (+${jitter}), keys every ~200 ms`, run));
  });

  it("at 50 ms one way (+10 jitter), keys every ~400 ms: each player's own corrections p95 under 0.1 cell", () => {
    const run = latencyRun(50, 10, CALM);
    expect(predictionVerdict(run.runs).worst).toBeLessThan(0.1);
    results.push(describeRun("50 ms (+10), keys every ~400 ms", run));
  });

  it("judges each player's corrections, not the pool, and says when the runs are too few to decide", () => {
    const calm = Array.from({ length: 100 }, () => 0);
    // 7 % of one player's corrections over 0.1 cell: 3.5 % of the pool, whose p95 passes.
    const rough = Array.from({ length: 100 }, (_, i) => (i < 7 ? 0.3 : 0));
    const runs = [
      [calm, rough],
      [calm, rough],
    ];
    expect(p95(runs.flat(2))).toBeLessThan(0.1);
    const v = predictionVerdict(runs);
    expect(v.perPlayer).toEqual([0, 0.3]);
    expect(v.on).toBe(false);
    expect(v.stable).toBe(true);
    // One half passes, the other not: too close to call.
    const mixed = predictionVerdict([
      [calm, calm],
      [calm, rough],
    ]);
    expect(mixed.halves).toEqual([true, false]);
    expect(mixed.stable).toBe(false);
  });

  it("goes through a 300 ms TCP stall of one player", () => {
    const t0 = 1_000_000 + 2700;
    const stall: Array<[number, number]> = [[t0 + 4000, t0 + 4300]];
    const r = room({ latency: 50, jitter: 10, stalls: { p1: stall } });
    const c = r.client("p1");
    const keys = randomKeys(r.clients, 11);
    let before = 0;
    r.run(4000, keys);
    before = c.allCorrections().length;
    r.run(6000, keys);
    stopKeys(r.clients);
    r.run(1500);
    expectNoPressLost(r);
    const corr = c.allCorrections();
    // Around the stall the copy guessed 300 ms of the others' keys and its own came late: large
    // corrections then, smoothed or snapped; after it, the usual.
    const after = corr.slice(before + 30);
    expect(p95(after)).toBeLessThan(0.1);
    expect(c.builds).toBe(1);
    expectSettled(r);
    results.push(`stall 300 ms (p1): corrections p95 ${fmt(p95(corr))} over the run, max ${fmt(Math.max(...corr))}; after it ${fmt(p95(after))}`);
  });

  it("stops while the world waits for a dropped player, and starts over on the resume", () => {
    const r = room({ latency: 50, jitter: 10 });
    const c = r.client("p1");
    const keys = randomKeys(r.clients, 5);
    r.run(3000, keys);
    // No key change in flight when the world stops (the resume forgets queued inputs by design).
    stopKeys(r.clients);
    r.run(400);
    r.session.setConnected("p2", false);
    r.run(200);
    expect(c.paused).toBe(true);
    const tick = c.play!.predictor.tick;
    const clock = c.play!.predictedTick;
    const sentBefore = c.sent.length;
    // Keys pressed while paused are read but never sent, and nothing advances.
    r.run(2000, keys);
    expect(c.play!.predictor.tick).toBe(tick);
    expect(c.play!.predictedTick).toBe(clock);
    const during = c.sent.slice(sentBefore);
    expect(during.length).toBeGreaterThan(10);
    expect(during.every((m) => m.k.length === 0)).toBe(true);
    stopKeys(r.clients);
    const epoch = c.level!.epoch;
    r.session.setConnected("p2", true);
    r.run(300);
    // The resume is a new coopLevel (a new epoch): the screen and its predictor start over.
    expect(c.builds).toBe(2);
    expect(c.level!.epoch).toBeGreaterThan(epoch);
    expect(c.paused).toBe(false);
    r.run(3000, keys);
    stopKeys(r.clients);
    r.run(1500);
    expectNoPressLost(r);
    expect(c.sent.filter((m) => m.e === c.level!.epoch && m.k.length > 0).length).toBeGreaterThan(3);
    expect(p95(c.allCorrections())).toBeLessThan(0.1);
    expectSettled(r);
  });

  it("draws the server's frozen world while it waits for a dropped player, even mid-jump", () => {
    const r = room({ latency: 50, jitter: 10, levels: [flatLevel] });
    const server = (r.session as unknown as { world: CoopWorld }).world;
    const jumper = r.client("p0");
    const watchers = r.clients.filter((c) => c.id !== "p2");
    for (const c of r.clients) c.keys = BIT_RIGHT;
    r.run(1000);
    // A jump pressed just before another player's link drops: the server never applies it (the
    // resume forgets queued inputs), so no screen may show it.
    jumper.press |= BIT_JUMP_PRESS;
    jumper.keys |= BIT_JUMP;
    r.run(40);
    r.session.setConnected("p2", false);
    r.run(200);
    const frozenAt = server.tick;
    const floorY = server.bodies[jumper.seat]!.y;
    let worstVsSnapshot = 0;
    let worstVsServer = 0;
    for (let k = 0; k < 20; k++) {
      r.run(100);
      expect(server.tick).toBe(frozenAt);
      for (const c of watchers) {
        const play = c.play!;
        expect(c.paused).toBe(true);
        const drawn = play.frame().bodies;
        play.authority.bodies.forEach((b, i) => {
          worstVsSnapshot = Math.max(worstVsSnapshot, Math.abs(drawn[i]!.x - b.x), Math.abs(drawn[i]!.y - b.y));
        });
        server.bodies.forEach((b, i) => {
          worstVsServer = Math.max(worstVsServer, Math.abs(drawn[i]!.x - b.x), Math.abs(drawn[i]!.y - b.y));
        });
      }
    }
    // Exactly the latest snapshot (as step A draws it), a few steps of walking from the server's.
    expect(worstVsSnapshot).toBeLessThan(1e-9);
    expect(worstVsServer).toBeLessThan(0.2);
    stopKeys(r.clients);
    r.session.setConnected("p2", true);
    r.run(2000);
    expect(Math.min(server.bodies[jumper.seat]!.y, floorY)).toBe(floorY);
    expectSettled(r);
    results.push(`paused mid-jump: screens drawn ${fmt(worstVsSnapshot)} from the latest snapshot, ${fmt(worstVsServer)} from the server's frozen world`);
  });

  it("draws a downlink stall of 500 ms or 1.5 s without a stop or a jump (the server runs, inputs still go up)", () => {
    // Everyone holds Right on a flat floor; p1's snapshots are held (its inputs are not). The
    // copy must keep running on its own keys meanwhile: a cap of 250 ms past the newest snapshot
    // froze the own body for 15 / 73 frames and then jumped it 1.3 / 7.8 cells in one frame.
    const line: string[] = [];
    for (const ms of [500, 1500]) {
      const t0 = 1_000_000 + 2700 + 1500;
      const r = room({ latency: 50, jitter: 0, levels: [flatLevel], downStalls: { p1: [[t0, t0 + ms]] } });
      const c = r.client("p1");
      const server = (r.session as unknown as { world: CoopWorld }).world;
      for (const k of r.clients) k.keys = BIT_RIGHT;
      r.run(t0 - r.net.t - 300);
      const motion = ownMotion(c);
      const x0 = server.bodies[c.seat]!.x;
      r.run(300 + ms + 600, () => motion.sample());
      // The server kept running this player (its inputs got there).
      expect(server.bodies[c.seat]!.x - x0).toBeGreaterThan((7 * (ms + 600)) / 1000);
      expect(motion.frozen, `${ms} ms`).toBe(0);
      const largest = Math.max(...motion.moves);
      // Walking is 7 cells/s, 0.117 a frame: nothing on top of it but a small correction's glide.
      expect(largest, `${ms} ms`).toBeLessThan(0.2);
      expect(c.builds).toBe(1);
      stopKeys(r.clients);
      r.run(1500);
      expectSettled(r);
      line.push(`${ms} ms: own largest move ${fmt(largest)} a frame, ${motion.frozen} frozen frames`);
    }
    results.push(`downlink stall (p1, all walking): ${line.join("; ")}`);
  });

  it("goes through a 400 ms TCP stall both ways without stopping the drawing", () => {
    const t0 = 1_000_000 + 2700 + 1500;
    const r = room({ latency: 50, jitter: 10, levels: [flatLevel], stalls: { p1: [[t0, t0 + 400]] } });
    const c = r.client("p1");
    for (const k of r.clients) k.keys = BIT_RIGHT;
    r.run(t0 - r.net.t - 300);
    const motion = ownMotion(c);
    r.run(300 + 400 + 600, () => motion.sample());
    expect(motion.frozen).toBe(0);
    // The server did not move this silent player for the last 150 ms of the stall: that correction glides.
    expect(Math.max(...motion.moves)).toBeLessThan(0.3);
    stopKeys(r.clients);
    r.run(1500);
    expectSettled(r);
    results.push(`TCP stall 400 ms both ways (p1, all walking): own largest move ${fmt(Math.max(...motion.moves))} a frame, ${motion.frozen} frozen frames`);
  });

  it("stops at most 2 s past the newest snapshot when its own link goes silent, at once when it is reported lost", () => {
    const line: string[] = [];
    for (const reported of [false, true]) {
      const t0 = 1_000_000 + 2700 + 1000;
      const stall: Array<[number, number]> = [[t0, t0 + 5000]];
      const r = room({ latency: 50, jitter: 10, levels: [flatLevel], stalls: { p1: stall } });
      const server = (r.session as unknown as { world: CoopWorld }).world;
      const me = r.client("p1");
      const walker = r.clients.find((c) => c.seat === 2)!;
      walker.keys = BIT_RIGHT;
      r.run(t0 - r.net.t);
      // The transport reported the drop (Colyseus onDrop: the socket closed).
      if (reported) me.play!.setLinkLost(true);
      r.run(150);
      // The server sees the drop and pauses; this screen hears nothing until the link comes back.
      r.session.setConnected("p1", false);
      const frozen = server.bodies.map((b) => b.x);
      let ahead = 0;
      let drawnOff = 0;
      let at3s: number[] = [];
      for (let k = 0; k < 45; k++) {
        r.run(100);
        const play = me.play!;
        ahead = Math.max(ahead, play.predictor.tick - play.authority.tick);
        const drawn = play.frame().bodies;
        frozen.forEach((x, i) => (drawnOff = Math.max(drawnOff, Math.abs(drawn[i]!.x - x))));
        if (k === 30) at3s = drawn.map((b) => b.x);
        // Bounded: nothing moves on this screen any more after 3 s (it used to run on for the
        // whole silence: 580 ticks, 15 cells after 4 s, and the reconnection window is 30 s).
        if (k > 30) drawn.forEach((b, i) => expect(b.x, `${reported}: body ${i} at ${k / 10} s`).toBe(at3s[i]));
      }
      const play = me.play!;
      if (reported) {
        // Held where it was when the link was reported lost: the lead, a one-way trip and a snapshot's
        // interval past the newest.
        expect(ahead).toBeLessThanOrEqual(play.lead + 16);
        expect(drawnOff).toBeLessThan(2);
      } else {
        // At most the lead, a one-way trip (under 10 ticks here) and 2 s past the newest snapshot.
        expect(ahead).toBeLessThanOrEqual(play.lead + 10 + STALE_FULL_TICKS + STALE_EASE_TICKS);
        // Nobody drawn farther than 2 s of walking (7 cells/s) and the lead from the frozen world.
        expect(drawnOff).toBeLessThan(((STALE_FULL_TICKS + STALE_EASE_TICKS + play.lead + 10) / COOP_HZ) * 7);
      }
      walker.keys = 0;
      r.run(t0 + 5000 - r.net.t);
      if (reported) play.setLinkLost(false);
      r.session.setConnected("p1", true);
      r.run(2500);
      expect(me.builds).toBeGreaterThan(1);
      expectSettled(r);
      line.push(`${reported ? "reported lost" : "silent"}: copy at most ${ahead} ticks past the newest snapshot, drawn at most ${fmt(drawnOff)} from the frozen world`);
    }
    results.push(`own link dead 5 s: ${line.join("; ")}`);
  });

  it("eases to a stop after 1.75 s without a snapshot, then catches up without a jump", () => {
    // A 2 s downlink stall: past the full-speed window the copy slows down to a stop, then the
    // snapshots come back (a correction, smoothed) and it catches up with the clock at 1.5 times
    // its speed. Catching up in one frame (up to MAX_STEPS_PER_FRAME steps) moved the own body
    // 0.85 cell in a frame.
    const t0 = 1_000_000 + 2700 + 1500;
    const ms = 2000;
    const r = room({ latency: 50, jitter: 0, levels: [flatLevel], downStalls: { p1: [[t0, t0 + ms]] } });
    const c = r.client("p1");
    for (const k of r.clients) k.keys = BIT_RIGHT;
    r.run(t0 - r.net.t - 300);
    const motion = ownMotion(c);
    let behind = 0;
    let caughtUp = -1;
    r.run(300 + ms + 1500, (t) => {
      motion.sample();
      const play = c.play!;
      const gap = Math.floor(play.predictedTick) - play.predictor.tick;
      behind = Math.max(behind, gap);
      if (t > t0 + ms && behind > 0 && caughtUp < 0 && gap <= 0) caughtUp = t - (t0 + ms);
    });
    // It was held back, and caught up within a second of the stall's end.
    expect(behind).toBeGreaterThan(10);
    expect(caughtUp).toBeGreaterThan(0);
    expect(caughtUp).toBeLessThan(1000);
    const largest = Math.max(...motion.moves);
    expect(largest).toBeLessThan(0.3);
    expect(c.builds).toBe(1);
    stopKeys(r.clients);
    r.run(1500);
    expectSettled(r);
    results.push(`downlink stall 2 s (p1, all walking): held at most ${behind} ticks behind the clock, caught up ${caughtUp} ms after, own largest move ${fmt(largest)} a frame, ${motion.frozen} frozen frames`);
  });

  it("rebuilds the predictor on a level change", () => {
    const r = room({ latency: 50, jitter: 10, levels: [sandboxLevel, flatLevel] });
    const keys = randomKeys(r.clients, 9);
    r.run(3000, keys);
    stopKeys(r.clients);
    r.run(400);
    r.net.up("p0", { type: "coopPlay", index: 1 });
    r.run(1800);
    for (const c of r.clients) {
      expect(c.builds).toBe(2);
      expect(c.level!.levelId).toBe("bench-flat");
      expect(c.play!.world.level.def.id).toBe("bench-flat");
    }
    r.run(4000, keys);
    stopKeys(r.clients);
    r.run(1500);
    expectNoPressLost(r);
    for (const c of r.clients) expect(p95(c.allCorrections())).toBeLessThan(0.1);
    expectSettled(r);
  });

  it("shows a death and a restart only when the server decides them", () => {
    const r = room({ latency: 50, jitter: 10, levels: [spikeLevel] });
    const shownDeath: string[] = [];
    const waited = new Set<string>();
    let restartSeen = 0;
    const attempts = new Map<string, number>();
    const check = () => {
      // Everyone walks right until the server's world dies (once).
      if (r.clients.some((c) => c.play!.authority.dying > 0)) stopKeys(r.clients);
      for (const c of r.clients) {
        const play = c.play!;
        const w = play.world;
        if (play.predictor.waiting) waited.add(c.id);
        // The drawn world dies, restarts or wins only as the server's latest word (a restart
        // snapshot is taken on the next frame: until then the drawn world is the attempt before).
        if (w.dying > 0 && play.authority.dying === 0 && play.authority.attempt === w.attempt) shownDeath.push(`${c.id} dying at ${w.tick}`);
        if (w.attempt > play.authority.attempt) shownDeath.push(`${c.id} attempt ${w.attempt} before the server`);
        if (w.won && !play.authority.won) shownDeath.push(`${c.id} won before the server`);
        const was = attempts.get(c.id) ?? 1;
        if (w.attempt !== was) {
          attempts.set(c.id, w.attempt);
          restartSeen++;
          // A restart snaps: everyone at the spawn, no offset carried over.
          const me = c.seat;
          expect(play.predictor.offset(me)).toEqual({ x: 0, y: 0 });
        }
      }
    };
    for (const c of r.clients) c.keys = BIT_RIGHT;
    r.run(4000, check);
    stopKeys(r.clients);
    r.run(2500, check);
    expect(shownDeath).toEqual([]);
    // Every screen ran into the death ahead of the server and waited for it.
    expect([...waited].sort()).toEqual(IDS);
    expect(restartSeen).toBe(3);
    for (const c of r.clients) {
      expect(c.play!.authority.attempt).toBe(2);
      expect(c.play!.world.attempt).toBe(2);
    }
    expectSettled(r);
  });

  it("forgets this player's keys with the server when the tab is hidden while a key is held", () => {
    for (const hiddenMs of [0, 1000]) {
      const r = room({ latency: 50, jitter: 10, levels: [flatLevel] });
      const c = r.clients.find((k) => k.seat === 2)!;
      const server = (r.session as unknown as { world: CoopWorld }).world;
      r.run(1000);
      c.keys = BIT_RIGHT;
      r.run(250);
      // Hidden: the screen sends coopIdle, the window's blur clears the keys, frames stop.
      c.play!.idle();
      c.keys = 0;
      r.frozen.add(c.id);
      r.run(hiddenMs);
      r.frozen.delete(c.id);
      const before = c.allCorrections().length;
      r.run(4000);
      // Back with no key held: after a correction or two, the copy is the server's again.
      const corr = c.allCorrections().slice(before);
      // Small on the way back too: the copy forgets the keys when the coopIdle reaches the server
      // (without that replay, a 1.2-cell correction after a short hide).
      expect(Math.max(0, ...corr), `hidden ${hiddenMs} ms: largest correction`).toBeLessThan(0.5);
      expect(corr.slice(-60).every((x) => x < 0.01), `hidden ${hiddenMs} ms: ${corr.slice(-60).map(fmt).join(" ")}`).toBe(true);
      const drawn = c.play!.frame().bodies[c.seat]!;
      expect(Math.abs(drawn.x - server.bodies[c.seat]!.x)).toBeLessThan(0.01);
      expectSettled(r);
    }
  });

  it("draws one jump for a press stuck in a stalled upstream (snapshots still coming)", () => {
    const t0 = 1_000_000 + 2700 + 1000;
    const stall: Array<[number, number]> = [[t0, t0 + 300]];
    const r = room({ latency: 50, jitter: 0, levels: [flatLevel], upStalls: { p2: stall } });
    const c = r.client("p2");
    const server = (r.session as unknown as { world: CoopWorld }).world;
    r.run(t0 - r.net.t + 100);
    const floor = c.play!.world.bodies[c.seat]!.y;
    c.press |= BIT_JUMP_PRESS;
    c.keys = BIT_JUMP;
    const heights: number[] = [];
    /** The copy's own height (no offset): the fading offsets can smooth a fall back and a second jump into one descent. */
    const copy: number[] = [];
    let serverPeak = 0;
    r.run(900, (t) => {
      if (t === t0 + 170) c.keys = 0;
      if (t % 16 !== 0) return;
      heights.push(floor - c.play!.frame().bodies[c.seat]!.y);
      copy.push(floor - c.play!.world.bodies[c.seat]!.y);
      serverPeak = Math.max(serverPeak, floor - server.bodies[c.seat]!.y);
    });
    // The copy leaves the floor once: it never lands while the press is still on its way to the
    // server, then takes off again when the server applies it.
    const takeoffs = copy.filter((h, i) => i > 0 && copy[i - 1]! < 0.01 && h > 0.1).length + (copy[0]! > 0.1 ? 1 : 0);
    expect(takeoffs, `copy: ${copy.map(fmt).join(" ")}`).toBe(1);
    // One arc: up to its peak, then down to the floor and no lower (no fall back mid-air waiting for
    // the server, no second jump once it applies the press).
    const top = heights.indexOf(Math.max(...heights));
    const peak = heights[top]!;
    expect(serverPeak).toBeGreaterThan(0.5);
    expect(peak).toBeGreaterThan(0.5);
    for (let i = top + 1; i < heights.length; i++) expect(heights[i]!, `frame ${i}: ${heights.map(fmt).join(" ")}`).toBeLessThan(heights[i - 1]! + 0.02);
    expect(Math.min(...heights)).toBeGreaterThan(-0.01);
    expectNoPressLost(r);
    results.push(`press in a 300 ms upstream stall: drawn jump peak ${fmt(peak)} (server ${fmt(serverPeak)}), one arc, never below the floor`);
  });

  it("never draws a body into what it stands on or into a wall, nor a rope link longer than the world's", () => {
    let frames = 0;
    let sink = 0;
    let riders = 0;
    let riderSink = 0;
    let wall = 0;
    const links: number[] = [];
    for (const def of [sandboxLevel, COOP_LEVELS.find((l) => l.id === "coop04")!]) {
      const r = room({ latency: 50, jitter: 10, levels: [def], seed: 31 });
      const keys = randomKeys(r.clients, 13, STRESS);
      r.run(8000, (t) => {
        keys(t);
        if (t % 16 !== 0) return;
        for (const c of r.clients) {
          const play = c.play!;
          if (!play.predictor.synced) continue;
          frames++;
          const frame = play.frame();
          const f = frame.bodies;
          const w = play.world;
          const n = w.bodies.length;
          w.bodies.forEach((b, i) => {
            const s = w.supportOf(i);
            const carrier = s && s.kind !== "terrain" ? (w.colliderById(s.id)?.node ?? -1) : -1;
            // Standing on the floor or on an object that is no body or crate: drawn no lower than the copy has it.
            if (s && carrier < 0) sink = Math.max(sink, f[i]!.y - b.y);
            // Riding a body or a crate: drawn no lower on it than the copy has it.
            if (carrier >= 0) {
              riders++;
              const [drawnY, worldY] = carrier < n ? [f[carrier]!.y, w.bodies[carrier]!.y] : [frame.crates[2 * (carrier - n) + 1]!, w.crates[carrier - n]!.y];
              riderSink = Math.max(riderSink, f[i]!.y - drawnY - (b.y - worldY));
            }
            wall = Math.max(wall, depthInTerrain(w, f[i]!));
          });
          const chain = w.chain;
          for (let k = 0; k + 1 < chain.length; k++) {
            const a = f[chain[k]!]!;
            const b = f[chain[k + 1]!]!;
            const wa = w.bodies[chain[k]!]!;
            const wb = w.bodies[chain[k + 1]!]!;
            links.push(Math.hypot(a.x - b.x, a.y - b.y) - Math.max(Math.hypot(wa.x - wb.x, wa.y - wb.y), COOP.ropeLength));
          }
        }
      });
    }
    expect(frames).toBeGreaterThan(2500);
    expect(sink).toBeLessThan(0.02);
    expect(riders).toBeGreaterThan(500);
    expect(riderSink).toBeLessThan(0.02);
    // The frame blends the last two steps: a hair into a cell at most.
    expect(wall).toBeLessThan(0.1);
    // Riders follow their carrier, which may pull a link a little: rarely, and by little.
    expect(quantile(links, 0.999)).toBeLessThan(0.1);
    results.push(`stress keys, sandbox and coop04: bases sunk at most ${fmt(sink)}, riders into their carrier at most ${fmt(riderSink)} (${riders} rider frames), boxes into walls at most ${fmt(wall)}, links over the world's p99.9 ${fmt(quantile(links, 0.999))} max ${fmt(Math.max(...links))}`);
  });

  it("keeps this player's corrections small while a remote player hauls it on the rope", () => {
    const r = room({ latency: 50, jitter: 10, levels: [flatLevel] });
    // Seats: p1, p2, then Ruben (p0, drawn by lot): p0 at the right end of the chain hauls p2.
    const me = r.client("p2");
    const hauler = r.client("p0");
    const server = (r.session as unknown as { world: CoopWorld }).world;
    const startX = server.bodies[me.seat]!.x;
    const before = me.allCorrections().length;
    let worstLink = 0;
    hauler.keys = BIT_RIGHT;
    let stretched = 0;
    r.run(4000, () => {
      // The rope is drawn between the drawn bodies: its links look no longer than in the world
      // drawn (a hauled link stays stretched there while the hauler's budget holds it back).
      const f = me.play!.frame().bodies;
      const w = me.play!.world;
      const chain = w.chain;
      for (let k = 0; k + 1 < chain.length; k++) {
        const a = f[chain[k]!]!;
        const b = f[chain[k + 1]!]!;
        const wa = w.bodies[chain[k]!]!;
        const wb = w.bodies[chain[k + 1]!]!;
        const world = Math.hypot(wa.x - wb.x, wa.y - wb.y);
        stretched = Math.max(stretched, world - COOP.ropeLength);
        worstLink = Math.max(worstLink, Math.hypot(a.x - b.x, a.y - b.y) - Math.max(world, COOP.ropeLength));
      }
    });
    stopKeys(r.clients);
    r.run(1500);
    expect(server.bodies[me.seat]!.x - startX).toBeGreaterThan(10);
    const corr = me.allCorrections().slice(before);
    expect(p95(corr)).toBeLessThan(0.1);
    expect(worstLink).toBeLessThan(0.1);
    expectSettled(r);
    results.push(`hauled (p2 by p0): corrections p95 ${fmt(p95(corr))}, max ${fmt(Math.max(...corr))}; drawn links at most ${fmt(worstLink)} longer than the world's (stretched up to ${fmt(stretched)} there)`);
  });

  it("draws this player riding a remote player's head on it, whatever the corrections", () => {
    const r = room({ latency: 50, jitter: 10, levels: [flatLevel] });
    const me = r.client("p1");
    const carrier = r.client("p2");
    const server = (r.session as unknown as { world: CoopWorld }).world;
    // p1 stands on p2's head, Ruben (p0) a few cells away.
    const floor = 10;
    const h = server.bodies[0]!.height;
    server.placeBody(carrier.seat, 9, floor - h);
    server.placeBody(me.seat, 9, floor - 2 * h);
    server.placeBody(hookSeat(r), 12, floor - h);
    r.run(1500);
    const keys = randomKeys([carrier], 21, { change: 0.02, jump: 0 });
    let riding = 0;
    let worst = 0;
    const before = me.allCorrections().length;
    r.run(6000, (t) => {
      keys(t);
      const play = me.play!;
      const w = play.world;
      if (!w.ridesOn(me.seat, carrier.seat)) return;
      riding++;
      // Drawn exactly where the predicted world has it, relative to its carrier.
      const f = play.frame().bodies;
      const rx = f[me.seat]!.x - f[carrier.seat]!.x;
      const ry = f[me.seat]!.y - f[carrier.seat]!.y;
      const wx = w.bodies[me.seat]!.x - w.bodies[carrier.seat]!.x;
      const wy = w.bodies[me.seat]!.y - w.bodies[carrier.seat]!.y;
      worst = Math.max(worst, Math.abs(rx - wx), Math.abs(ry - wy));
    });
    stopKeys(r.clients);
    r.run(1500);
    expect(server.ridesOn(me.seat, carrier.seat)).toBe(true);
    expect(riding).toBeGreaterThan(5000);
    // At most one step of blending between the last two steps (both on the head).
    expect(worst).toBeLessThan(0.05);
    // This player moves with its carrier, whose keys this screen learns a round trip late: its
    // corrections are the carrier's (no threshold), the carrier's own screen keeps the usual ones.
    const corr = me.allCorrections().slice(before);
    expect(p95(carrier.allCorrections())).toBeLessThan(0.1);
    expectSettled(r);
    results.push(`riding (p1 on p2): corrections p95 ${fmt(p95(corr))}, max ${fmt(Math.max(...corr))}; rider drawn off its carrier by at most ${fmt(worst)}`);
  });

  it("replays 20 steps of a 5-player level in under 2 ms (median)", () => {
    const line: string[] = [];
    for (const def of COOP_LEVELS) {
      const players = Array.from({ length: 5 }, (_, i) => ({ name: `p${i}`, isRuben: i === 4 }));
      const level = parseCoopLevel(def, 5);
      const server = new CoopWorld(level, players);
      const bits = [BIT_RIGHT, BIT_RIGHT | BIT_JUMP, 0, BIT_LEFT, BIT_RIGHT];
      for (let i = 0; i < 240; i++) server.step(bits);
      const predictor = new CoopPredictor(new CoopWorld(level, players), 0);
      const state = server.save();
      const held = bits.map((b) => b & ~BIT_JUMP_PRESS);
      let next = state.tick;
      /** The median of 50 replays (after 10 to warm up). */
      const measure = (): number => {
        const times: number[] = [];
        for (let run = 0; run < 60; run++) {
          // Each run: a new snapshot 1 tick later than the last, the copy 20 steps past it.
          const tick = ++next;
          predictor.onSnapshot(tick, { ...state, tick }, held, []);
          const t0 = performance.now();
          predictor.advanceTo(tick + 20);
          times.push(performance.now() - t0);
        }
        return quantile(times.slice(10), 0.5);
      };
      // A loaded machine (the other test files run meanwhile) gets a second chance.
      let median = measure();
      if (median >= 2) median = Math.min(median, measure());
      expect(median, def.id).toBeLessThan(2);
      line.push(`${def.id} ${median.toFixed(2)} ms`);
    }
    results.push(`replay of 20 steps, 5 players (median): ${line.join(", ")}`);
  });

  it("reports", () => {
    console.log(`co-op prediction bench:\n  ${results.join("\n  ")}`);
  });
});

/** How deep a box goes into the level's solid cells, cells (the shallower axis of the deepest cell). */
function depthInTerrain(w: CoopWorld, b: { x: number; y: number; w: number; h: number }): number {
  let worst = 0;
  for (let cy = Math.floor(b.y); cy <= Math.floor(b.y + b.h - 1e-6); cy++)
    for (let cx = Math.floor(b.x); cx <= Math.floor(b.x + b.w - 1e-6); cx++) {
      if (!w.solidCell(cx, cy)) continue;
      worst = Math.max(worst, Math.min(Math.min(b.x + b.w, cx + 1) - Math.max(b.x, cx), Math.min(b.y + b.h, cy + 1) - Math.max(b.y, cy)));
    }
  return worst;
}

/** Ruben's seat in the bench rooms (drawn by lot: p0). */
function hookSeat(r: Room): number {
  return r.client("p0").seat;
}
