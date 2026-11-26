/**
 * Bench of the online co-op screen's prediction (step B), end to end: a real CoopSession on a
 * fake clock, a fake network (latency, jitter, TCP stalls, msgpack), and three PredictingClients
 * running the screen's PredictedPlay (clock estimated from pings, inputs stamped with the
 * predicted tick through CoopInputSender, a frame every 16.7 ms).
 *
 * Thresholds (the plan's, at 50 ms one way): no input lost, and 95 % of each player's own-body
 * corrections under 0.1 cell. Then the cases around it: a TCP stall, a pause and resume, a level
 * change, a death and restart decided by the server, a remote player hauling this player on the
 * rope, this player riding a remote player's head; and the replay's cost.
 */
import { describe, expect, it } from "vitest";
import {
  BIT_JUMP,
  BIT_JUMP_PRESS,
  BIT_LEFT,
  BIT_RIGHT,
  COOP,
  COOP_LEVELS,
  COOP_PROTOCOL_VERSION,
  CoopSession,
  CoopWorld,
  parseCoopLevel,
  sandboxLevel,
  type CoopLevelDef,
} from "@game/shared/coop";
import { countServerPresses, Net, PredictingClient, quantile, rng, type Link } from "./benchNet";
import { PREDICT_BY_DEFAULT } from "./net/predictedPlay";
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
  client(id: string): PredictingClient;
}

function room(opts: { latency: number; jitter: number; levels?: CoopLevelDef[]; stalls?: Record<string, Array<[number, number]>>; seed?: number }): Room {
  const links = new Map<string, Link>();
  for (const id of IDS) {
    const stalls = opts.stalls?.[id] ?? [];
    links.set(`up:${id}`, { latency: opts.latency, jitter: opts.jitter, stalls });
    links.set(`down:${id}`, { latency: opts.latency, jitter: opts.jitter, stalls });
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
  const r: Room = {
    net,
    session,
    clients,
    presses,
    run(ms, each) {
      net.advance(ms, (t) => {
        presses.watch();
        for (const c of clients) c.tick();
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
/** Runs pooled per latency (each run's keys and jitter differ). */
const SEEDS = [1, 2, 3, 4];

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

function p95(values: readonly number[]): number {
  return quantile(values, 0.95);
}

const fmt = (v: number) => v.toFixed(3);

describe("co-op prediction bench (step B, the screen's PredictedPlay end to end)", () => {
  const results: string[] = [];

  /** Every player's own-body corrections over SEEDS runs of 10 s of random keys at this latency. */
  function latencyRun(latency: number, jitter: number, model: KeyModel): { corr: number[]; presses: number; lead: number } {
    const corr: number[] = [];
    let presses = 0;
    let lead = 0;
    for (const seed of SEEDS) {
      const r = room({ latency, jitter, seed: latency * 10 + seed });
      r.run(10_000, randomKeys(r.clients, seed * 7 + latency, model));
      stopKeys(r.clients);
      r.run(1500);
      presses += expectNoPressLost(r);
      for (const c of r.clients) corr.push(...c.allCorrections());
      expectSettled(r);
      lead = r.clients[0]!.play!.lead;
    }
    return { corr, presses, lead };
  }

  function describeRun(label: string, run: { corr: number[]; presses: number; lead: number }): string {
    const { corr } = run;
    const over = corr.filter((x) => x > 0.1).length / corr.length;
    return `${label}: ${run.presses} presses, none lost; own corrections p95 ${fmt(p95(corr))}, p99 ${fmt(quantile(corr, 0.99))}, ${(100 * over).toFixed(1)} % over 0.1 cell (${corr.length} snapshots); lead ${run.lead} ticks`;
  }

  // The plan's bench: three players changing keys every ~200 ms. The prediction is on by default
  // only if 95 % of the own body's corrections stay under 0.1 cell at 50 ms here.
  it.each([
    [20, 5, 0.1],
    [50, 10, 0.2],
    [100, 20, 0.8],
  ])("at %i ms one way (+%i jitter), keys every ~200 ms: no input lost, own corrections p95 under %f cell", (latency, jitter, bound) => {
    const run = latencyRun(latency, jitter, STRESS);
    expect(run.presses).toBeGreaterThan(100);
    const q = p95(run.corr);
    expect(q).toBeLessThan(bound);
    if (latency === 50) expect(q < 0.1, `p95 ${q} at 50 ms decides PREDICT_BY_DEFAULT`).toBe(PREDICT_BY_DEFAULT);
    results.push(describeRun(`${latency} ms (+${jitter}), keys every ~200 ms`, run));
  });

  it("at 50 ms one way (+10 jitter), keys every ~400 ms: own corrections p95 under 0.1 cell", () => {
    const run = latencyRun(50, 10, CALM);
    expect(p95(run.corr)).toBeLessThan(0.1);
    results.push(describeRun("50 ms (+10), keys every ~400 ms", run));
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

/** Ruben's seat in the bench rooms (drawn by lot: p0). */
function hookSeat(r: Room): number {
  return r.client("p0").seat;
}
