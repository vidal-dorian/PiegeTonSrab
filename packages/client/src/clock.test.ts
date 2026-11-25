import { describe, expect, it } from "vitest";
import { CLOCK_WINDOW_MS, ClockSync, MAX_USEFUL_RTT_MS } from "./net/clock";
import { skipWhileOffline } from "./net/link";

/** A pong for a ping sent at local time `sent`, answered by a server whose clock reads local + `skew`, `oneWay` ms each way. */
function pong(clock: ClockSync, sent: number, oneWay: number, skew: number): boolean {
  return clock.addSample(sent, sent + 2 * oneWay, sent + oneWay + skew);
}

describe("ClockSync", () => {
  it("uses the fallback until the first pong, then the server's clock", () => {
    const clock = new ClockSync();
    expect(clock.synced).toBe(false);
    expect(clock.serverNow(1000, 42)).toBe(42);
    pong(clock, 1000, 20, 60_000);
    expect(clock.synced).toBe(true);
    expect(clock.rtt).toBe(40);
    // Symmetric route: exact.
    expect(clock.serverNow(2000, 0)).toBe(62_000);
  });

  it("keeps the shortest round trip among recent samples", () => {
    const clock = new ClockSync();
    pong(clock, 0, 50, 1000); // rtt 100
    pong(clock, 2000, 10, 1000); // rtt 20: best
    pong(clock, 4000, 40, 1000); // rtt 80
    expect(clock.rtt).toBe(20);
    expect(clock.serverNow(5000, 0)).toBe(6000);
  });

  it("follows the server again after this machine's clock and the route changed (old best sample expires)", () => {
    const clock = new ClockSync();
    pong(clock, 0, 2, 1000); // excellent sample, rtt 4
    // The two clocks drift 3 s apart; every later sample has a longer round trip.
    for (let t = 2000; t <= CLOCK_WINDOW_MS + 4000; t += 2000) pong(clock, t, 30, 4000);
    const now = CLOCK_WINDOW_MS + 5000;
    expect(clock.serverNow(now, 0)).toBe(now + 4000);
    expect(clock.rtt).toBe(60);
  });

  it("before the window expires, the better sample still wins", () => {
    const clock = new ClockSync();
    pong(clock, 0, 2, 1000);
    pong(clock, 2000, 30, 4000);
    expect(clock.serverNow(3000, 0)).toBe(4000);
  });

  it("keeps the last estimate through a long gap without pongs (dropped connection)", () => {
    const clock = new ClockSync();
    pong(clock, 0, 10, 500);
    pong(clock, 2000, 15, 500);
    expect(clock.serverNow(10 * CLOCK_WINDOW_MS, 0)).toBe(10 * CLOCK_WINDOW_MS + 500);
    expect(clock.synced).toBe(true);
  });

  it("ignores samples that say nothing about the clock", () => {
    const clock = new ClockSync();
    expect(clock.addSample(100, 50, 0)).toBe(false); // negative round trip
    expect(clock.addSample(0, MAX_USEFUL_RTT_MS + 1, 0)).toBe(false); // server stalled
    expect(clock.addSample(Number.NaN, 10, 0)).toBe(false);
    expect(clock.addSample(0, 10, Number.NaN)).toBe(false);
    expect(clock.synced).toBe(false);
  });
});

describe("messages kept while offline", () => {
  it("drops poses and pings, keeps everything that changes the game", () => {
    expect(skipWhileOffline({ type: "pose", x: 1, y: 2, facing: 1, slide: false })).toBe(true);
    expect(skipWhileOffline({ type: "ping", c: 0 })).toBe(true);
    expect(skipWhileOffline({ type: "died", killerId: null, x: 0, y: 0, fell: true, pushedBy: null })).toBe(false);
    expect(skipWhileOffline({ type: "finished", time: 12 })).toBe(false);
    expect(skipWhileOffline({ type: "vine", id: 3, hold: false })).toBe(false);
    expect(skipWhileOffline({ type: "placement", objects: [], done: true })).toBe(false);
  });
});
