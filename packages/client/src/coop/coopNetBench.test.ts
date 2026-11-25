/**
 * Network bench of the co-op mode (step A: the server runs the world, clients draw snapshots):
 * a CoopSession and simulated clients over a fake network with latency, jitter and TCP-like
 * stalls (messages held, then delivered in order, never dropped). Every message goes through
 * msgpack, the codec Colyseus uses, so binary snapshots must survive it.
 *
 * Checks: no input press is ever lost, the snapshot rate and size stay within budget.
 */
import { pack, unpack } from "msgpackr";
import { describe, expect, it } from "vitest";
import {
  BIT_JUMP,
  BIT_JUMP_PRESS,
  COOP_HZ,
  COOP_LEVEL_LEAD_MS,
  CoopSession,
  decodeWorld,
  sandboxLevel,
  type CoopClientMessage,
  type CoopServerMessage,
  type CoopSessionIO,
} from "@game/shared/coop";

/** Deterministic pseudo-random numbers for jitter. */
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

interface Link {
  /** One-way delay, ms. */
  latency: number;
  jitter: number;
  /** [from, to] server times during which messages are held (a TCP stall), then released in order. */
  stalls: Array<[number, number]>;
}

class Net implements CoopSessionIO {
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
  private jitter = rng(7);

  constructor(private links: Map<string, Link>) {}

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

describe("co-op network bench (server world, snapshots)", () => {
  it("loses no jump press through latency, jitter and stalls, within the bandwidth budget", () => {
    const ids = ["p0", "p1", "p2", "p3", "p4"];
    const links = new Map<string, Link>();
    const latencies = [10, 25, 50, 75, 40];
    ids.forEach((id, i) => {
      const stalls: Array<[number, number]> = i === 3 ? [[1_004_000, 1_004_400], [1_007_000, 1_007_300]] : [];
      links.set(`up:${id}`, { latency: latencies[i]!, jitter: 15, stalls });
      links.set(`down:${id}`, { latency: latencies[i]!, jitter: 15, stalls: i === 4 ? [[1_005_000, 1_005_350]] : [] });
    });
    const net = new Net(links);
    const s = new CoopSession(net, "ABCD", [sandboxLevel]);
    net.session = s;
    for (const id of ids) {
      expect(s.addPlayer(id, id)).toBeNull();
      net.clients.push(id);
    }
    net.up("p0", { type: "coopPlay", index: 0 });
    net.advance(200);
    const level = net.inbox.get("p0")!.find((m) => m.type === "coopLevel")!;
    expect(level).toBeDefined();
    net.advance(COOP_LEVEL_LEAD_MS);

    // Every player taps jump every 1.2 s (staggered), each tap a press then a release 60 ms later,
    // stamped with the client's estimate of the server tick (here exact: same clock).
    const taps = new Map<string, number>(ids.map((id) => [id, 0]));
    const startsAt = (level as Extract<CoopServerMessage, { type: "coopLevel" }>).startsAt;
    const tickAt = (t: number) => Math.floor(((t - startsAt) * COOP_HZ) / 1000) + 1;
    const lastBeat = new Map<string, number>();
    const pressedAt = new Map<string, number>();
    const period = new Map<string, number>();
    net.advance(10_000, (t) => {
      ids.forEach((id, i) => {
        // A new 1.2 s period started for this player (staggered by 200 ms): tap.
        const k = Math.floor((t - startsAt - i * 200) / 1200);
        const newPeriod = k !== (period.get(id) ?? k);
        period.set(id, k);
        if (newPeriod && t - startsAt > 300 && t - startsAt < 9_000) {
          net.up(id, { type: "coopIn", k: [[tickAt(t), BIT_JUMP | BIT_JUMP_PRESS]] });
          taps.set(id, taps.get(id)! + 1);
          pressedAt.set(id, t);
          lastBeat.set(id, t);
        } else if (pressedAt.has(id) && t - pressedAt.get(id)! === 60) {
          net.up(id, { type: "coopIn", k: [[tickAt(t), 0]] });
          lastBeat.set(id, t);
        } else if (t - (lastBeat.get(id) ?? -Infinity) >= 100) {
          net.up(id, { type: "coopIn", k: [[tickAt(t), 0]] });
          lastBeat.set(id, t);
        }
      });
    });

    // Count each body's jumps in the snapshots one client received (after the codec).
    const snaps = net.inbox.get("p1")!.filter((m): m is Extract<CoopServerMessage, { type: "coopSnap" }> => m.type === "coopSnap");
    const seats = (level as Extract<CoopServerMessage, { type: "coopLevel" }>).seats;
    for (const id of ids) {
      const seat = seats.findIndex((x) => x.id === id);
      let jumps = 0;
      let wasGrounded = true;
      for (const m of snaps) {
        const b = decodeWorld(m.world).bodies[seat]!;
        if (wasGrounded && !b.grounded && b.vy < 0) jumps++;
        wasGrounded = b.grounded;
      }
      expect(taps.get(id), `${id}: taps sent`).toBeGreaterThanOrEqual(6);
      expect(jumps, `${id}: jumps seen vs taps sent`).toBe(taps.get(id));
    }

    // Snapshots: about 30 per second, and under 60 KB/s per client with 5 players.
    const seconds = 11.5;
    for (const id of ids) {
      const perSecond = net.snapsTo.get(id)! / seconds;
      expect(perSecond).toBeGreaterThan(25);
      expect(perSecond).toBeLessThan(34);
      expect(net.bytesTo.get(id)! / seconds).toBeLessThan(60_000);
    }
  });
});
