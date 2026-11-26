/**
 * Network bench of the co-op mode (step A: the server runs the world, clients draw snapshots):
 * a CoopSession and simulated clients over a fake network with latency, jitter and TCP-like
 * stalls (messages held, then delivered in order, never dropped). Every message goes through
 * msgpack, the codec Colyseus uses, so binary snapshots must survive it.
 *
 * Checks: no input press is ever lost, the snapshot rate and size stay within budget. The
 * prediction (step B) has its own bench: coopPredictBench.test.ts.
 */
import { describe, expect, it } from "vitest";
import {
  BIT_JUMP,
  BIT_JUMP_PRESS,
  COOP_HZ,
  COOP_LEVEL_LEAD_MS,
  COOP_PROTOCOL_VERSION,
  CoopSession,
  decodeWorld,
  sandboxLevel,
  type CoopServerMessage,
} from "@game/shared/coop";
import { Net, type Link } from "./benchNet";

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
      expect(s.addPlayer(id, id, COOP_PROTOCOL_VERSION)).toBeNull();
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
    const epoch = (level as Extract<CoopServerMessage, { type: "coopLevel" }>).epoch;
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
          net.up(id, { type: "coopIn", e: epoch, k: [[tickAt(t), BIT_JUMP | BIT_JUMP_PRESS]] });
          taps.set(id, taps.get(id)! + 1);
          pressedAt.set(id, t);
          lastBeat.set(id, t);
        } else if (pressedAt.has(id) && t - pressedAt.get(id)! === 60) {
          net.up(id, { type: "coopIn", e: epoch, k: [[tickAt(t), 0]] });
          lastBeat.set(id, t);
        } else if (t - (lastBeat.get(id) ?? -Infinity) >= 100) {
          net.up(id, { type: "coopIn", e: epoch, k: [[tickAt(t), 0]] });
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
