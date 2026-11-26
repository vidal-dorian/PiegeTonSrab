/**
 * Test support for the co-op network benches (coopNetBench.test.ts, coopPredictBench.test.ts):
 * a fake network with latency, jitter and TCP-like stalls (messages held, then delivered in
 * order, never dropped) between a real CoopSession and simulated clients, on a fake clock. Every
 * message goes through msgpack, the codec Colyseus uses, so binary snapshots must survive it.
 *
 * PredictingClient is the online co-op screen without Phaser: the same PredictedPlay the screen
 * runs, its server clock estimated from ping/pong over the fake network, frames at 60 per second,
 * and the messages handled the way CoopScene handles them (a coopLevel starts the screen over).
 */
import { pack, unpack } from "msgpackr";
import { BIT_JUMP_PRESS, COOP_HZ, CoopWorld, decodeWorld, parseCoopLevel, type CoopClientMessage, type CoopLevelDef, type CoopServerMessage, type CoopSession, type CoopSessionIO } from "@game/shared/coop";
import { PredictedPlay } from "./net/predictedPlay";
import { ServerClock } from "./net/serverClock";

/** Deterministic pseudo-random numbers for jitter. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Link {
  /** One-way delay, ms. */
  latency: number;
  jitter: number;
  /** [from, to] server times during which messages are held (a TCP stall), then released in order. */
  stalls: Array<[number, number]>;
}

export type LevelMessage = Extract<CoopServerMessage, { type: "coopLevel" }>;
export type SnapMessage = Extract<CoopServerMessage, { type: "coopSnap" }>;

export class Net implements CoopSessionIO {
  t = 1_000_000;
  private timers: Array<{ at: number; fn: () => void; every?: number; id: number }> = [];
  private nextId = 1;
  /** Messages in flight: delivery time, receiver, payload (already msgpack-encoded). */
  private flight: Array<{ at: number; to: string; bytes: Uint8Array; order: number }> = [];
  private order = 0;
  private lastArrival = new Map<string, number>();
  bytesTo = new Map<string, number>();
  snapsTo = new Map<string, number>();
  inbox = new Map<string, CoopServerMessage[]>();
  session!: CoopSession;
  private jitter: () => number;

  constructor(
    readonly links: Map<string, Link>,
    seed = 7,
  ) {
    this.jitter = rng(seed);
  }

  now() {
    return this.t;
  }
  /** CoopSessionIO.random (drawing Ruben by lot): fixed. */
  random() {
    return 0.1;
  }

  /** Arrival time on a link: latency + jitter, held by stalls, never before the previous message (in order). */
  private arrival(key: string): number {
    const l = this.links.get(key)!;
    let at = this.t + l.latency + this.jitter() * l.jitter;
    for (const [from, to] of l.stalls) if (at >= from && at < to) at = to;
    at = Math.max(at, this.lastArrival.get(key) ?? 0);
    this.lastArrival.set(key, at);
    return at;
  }

  send(to: string, msg: CoopServerMessage) {
    const bytes = pack(msg);
    this.bytesTo.set(to, (this.bytesTo.get(to) ?? 0) + bytes.length);
    if (msg.type === "coopSnap") this.snapsTo.set(to, (this.snapsTo.get(to) ?? 0) + 1);
    this.flight.push({ at: this.arrival(`down:${to}`), to, bytes, order: this.order++ });
  }
  broadcast(msg: CoopServerMessage) {
    for (const id of this.clients) this.send(id, msg);
  }
  clients: string[] = [];

  /** A client sends a message to the server. */
  up(from: string, msg: CoopClientMessage) {
    const bytes = pack(msg);
    this.flight.push({ at: this.arrival(`up:${from}`), to: `server:${from}`, bytes, order: this.order++ });
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

  /** Advance time, firing timers and delivering messages in order. */
  advance(ms: number, onTick?: (t: number) => void) {
    const end = this.t + ms;
    while (this.t < end) {
      const step = Math.min(end, this.t + 1);
      for (;;) {
        const timer = this.timers.filter((x) => x.at <= step).sort((a, b) => a.at - b.at)[0];
        const msg = this.flight.filter((x) => x.at <= step).sort((a, b) => a.at - b.at || a.order - b.order)[0];
        if (!timer && !msg) break;
        if (msg && (!timer || msg.at <= timer.at)) {
          this.flight = this.flight.filter((x) => x !== msg);
          this.t = Math.max(this.t, msg.at);
          const decoded = unpack(msg.bytes);
          if (msg.to.startsWith("server:")) this.session.handle(msg.to.slice(7), decoded as CoopClientMessage);
          else {
            const list = this.inbox.get(msg.to) ?? [];
            list.push(decoded as CoopServerMessage);
            this.inbox.set(msg.to, list);
          }
        } else if (timer) {
          this.t = Math.max(this.t, timer.at);
          if (timer.every) timer.at += timer.every;
          else this.timers = this.timers.filter((x) => x !== timer);
          timer.fn();
        }
      }
      this.t = step;
      onTick?.(this.t);
    }
  }
}

/** Frames per second of a simulated screen. */
const FPS = 60;

/**
 * One player's screen in a room, predicting (step B), without Phaser. `keys` is what this player
 * holds now, `press` the presses to give the next step (bits of PRESS_BITS).
 */
export class PredictingClient {
  play: PredictedPlay | null = null;
  level: LevelMessage | null = null;
  readonly clock: ServerClock;
  keys = 0;
  press = 0;
  /** Every own-body correction, cells, over every level this client played. */
  readonly corrections: number[] = [];
  /** Presses sent, by epoch. */
  readonly pressesSent = new Map<number, number>();
  /** Every coopIn sent: epoch, changes, local time. */
  readonly sent: Array<{ e: number; k: Array<[number, number]>; at: number }> = [];
  /** Builds of the predicted play (one per coopLevel). */
  builds = 0;
  paused = false;
  private read = 0;
  private lastFrame = 0;
  private nextPing = 0;
  private pings = 0;

  constructor(
    readonly id: string,
    readonly net: Net,
    private levels: readonly CoopLevelDef[],
    /** This computer's clock minus the server's, ms (the clock estimate must find it). */
    private skew = -123_456,
  ) {
    this.clock = new ServerClock(() => this.local());
  }

  local(): number {
    return this.net.t + this.skew;
  }

  get seat(): number {
    return this.level ? this.level.seats.findIndex((s) => s.id === this.id) : -1;
  }

  serverTick(): number {
    return this.level ? ((this.clock.now() - this.level.startsAt) * COOP_HZ) / 1000 : 0;
  }

  /** Called every ms of the fake clock: messages, pings, then a frame when one is due. */
  tick(): void {
    const inbox = this.net.inbox.get(this.id) ?? [];
    for (; this.read < inbox.length; this.read++) this.handle(inbox[this.read]!);
    const now = this.local();
    if (now >= this.nextPing) {
      this.net.up(this.id, { type: "ping", c: now });
      this.pings++;
      // A burst to sync the clock quickly, then one every second (as the online link does).
      this.nextPing = now + (this.pings < 6 ? 120 : 1000);
    }
    if (this.lastFrame === 0) this.lastFrame = now;
    if (now - this.lastFrame >= 1000 / FPS) {
      const dt = (now - this.lastFrame) / 1000;
      this.lastFrame = now;
      this.play?.advance(dt, () => this.take(), now);
    }
  }

  private take(): number {
    const bits = this.keys | this.press;
    this.press = 0;
    return bits;
  }

  private handle(msg: CoopServerMessage): void {
    switch (msg.type) {
      case "pong":
        this.clock.sample(msg.c, msg.s);
        return;
      case "coopLevel":
        this.start(msg);
        return;
      case "coopSnap":
        this.play?.onSnapshot(msg.tick, decodeWorld(msg.world), msg.held, msg.pending, msg.ack);
        return;
      case "coopPause":
        this.paused = msg.waitingFor !== null;
        this.play?.setPaused(this.paused);
        return;
      default:
        return;
    }
  }

  /** A coopLevel: the screen starts over (a new level, a rebuild, a resume, a moved clock). */
  private start(msg: LevelMessage): void {
    if (this.play) this.corrections.push(...this.play.predictor.corrections);
    this.level = msg;
    this.paused = false;
    const def = this.levels.find((l) => l.id === msg.levelId) ?? this.levels[msg.index]!;
    const make = () =>
      new CoopWorld(
        parseCoopLevel(def, msg.seats.length),
        msg.seats.map((s) => ({ name: s.name, isRuben: s.isRuben })),
      );
    const epoch = msg.epoch;
    this.play = new PredictedPlay(make(), make(), this.seat, epoch, {
      send: (m) => {
        if (m.type === "coopIn") {
          this.sent.push({ e: m.e, k: m.k.map(([t, b]) => [t, b] as [number, number]), at: this.local() });
          const presses = m.k.filter(([, b]) => (b & BIT_JUMP_PRESS) !== 0).length;
          this.pressesSent.set(m.e, (this.pressesSent.get(m.e) ?? 0) + presses);
        }
        this.net.up(this.id, m);
      },
      serverTick: () => this.serverTick(),
      rtt: () => this.clock.rtt,
    });
    this.play.predictor.record = true;
    this.builds++;
  }

  /** Every own-body correction so far, this level's included. */
  allCorrections(): number[] {
    return [...this.corrections, ...(this.play?.predictor.corrections ?? [])];
  }
}

/** The server world's jump presses applied per seat, counted by epoch (the session's world and epoch are private). */
export function countServerPresses(session: CoopSession): { counts: Map<number, number[]>; watch: () => void } {
  const counts = new Map<number, number[]>();
  const s = session as unknown as { world: CoopWorld | null; epoch: number };
  const wrapped = new WeakSet<CoopWorld>();
  return {
    counts,
    /** Call often: wraps a new world's step. */
    watch: () => {
      const w = s.world;
      if (!w || wrapped.has(w)) return;
      wrapped.add(w);
      const step = w.step.bind(w);
      w.step = (bits: readonly number[]) => {
        const row = counts.get(s.epoch) ?? new Array<number>(bits.length).fill(0);
        bits.forEach((b, i) => {
          if ((b & BIT_JUMP_PRESS) !== 0) row[i] = (row[i] ?? 0) + 1;
        });
        counts.set(s.epoch, row);
        step(bits);
      };
    },
  };
}

/** The value at share `q` (0..1) of `values`. */
export function quantile(values: readonly number[], q: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

/**
 * The plan's rule for turning prediction on: 95 % of each player's own-body corrections under
 * `limit` cells. `runs[run][player]` holds the corrections; each player's are pooled over the
 * runs. `stable` says both halves of the runs (first and second) give the same verdict: when they
 * do not, the sample is too small to decide.
 */
export function predictionVerdict(runs: ReadonlyArray<ReadonlyArray<readonly number[]>>, limit = 0.1): { perPlayer: number[]; worst: number; on: boolean; halves: boolean[]; stable: boolean } {
  const judge = (part: ReadonlyArray<ReadonlyArray<readonly number[]>>) => {
    const players = Math.max(0, ...part.map((r) => r.length));
    const perPlayer = Array.from({ length: players }, (_, i) => quantile(part.flatMap((r) => r[i] ?? []), 0.95));
    const worst = Math.max(0, ...perPlayer);
    return { perPlayer, worst, on: worst < limit };
  };
  const all = judge(runs);
  const mid = Math.ceil(runs.length / 2);
  const halves = runs.length >= 2 ? [judge(runs.slice(0, mid)).on, judge(runs.slice(mid)).on] : [all.on];
  return { ...all, halves, stable: halves.every((h) => h === all.on) };
}
