import { describe, expect, it } from "vitest";
import type { ServerMessage } from "@game/shared";
import { CLOCK_WINDOW_MS, ClockSync, MAX_USEFUL_RTT_MS } from "./net/clock";
import { BaseLink, skipWhileOffline } from "./net/link";

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

  it("an old excellent sample expires: a slower route shows after the window", () => {
    const clock = new ClockSync();
    // The route gets slower and asymmetric (40 ms out, 20 back): samples stay consistent
    // with the first one (within their round trips), so no jump is detected.
    clock.addSample(0, 4, 2 + 1000); // rtt 4, offset 1000
    for (let t = 2000; t <= CLOCK_WINDOW_MS + 4000; t += 2000) clock.addSample(t, t + 60, t + 40 + 1000);
    expect(clock.jumps).toBe(0);
    // The fast sample left the window: the newer ones are used (offset 1000 + 40 - 30 = 1010).
    expect(clock.rtt).toBe(60);
    const now = CLOCK_WINDOW_MS + 5000;
    expect(clock.serverNow(now, 0)).toBe(now + 1010);
  });

  it("within the window, a sample with a shorter round trip wins", () => {
    const clock = new ClockSync();
    clock.addSample(0, 4, 2 + 1000); // rtt 4, offset 1000
    clock.addSample(2000, 2060, 2040 + 1000); // rtt 60, offset 1010, consistent
    expect(clock.serverNow(3000, 0)).toBe(4000);
  });

  it("device sleep: the monotonic clock stops, the server's does not; the estimate follows at the next pong", () => {
    const clock = new ClockSync();
    for (let t = 0; t <= 8000; t += 2000) pong(clock, t, 5, 1000);
    expect(clock.serverNow(9000, 0)).toBe(10_000);
    // The laptop sleeps 15 s: performance.now resumes where it stopped, the server moved on.
    // Even with a slower round trip than the old best, the first pong after wake-up wins.
    pong(clock, 10_000, 40, 1000 + 15_000);
    expect(clock.jumps).toBe(1);
    expect(clock.serverNow(10_100, 0)).toBe(10_100 + 16_000);
  });

  it("a step of the server's clock (time sync) is followed at once too", () => {
    const clock = new ClockSync();
    pong(clock, 0, 2, 1000);
    pong(clock, 2000, 30, -2000);
    expect(clock.jumps).toBe(1);
    expect(clock.serverNow(3000, 0)).toBe(1000);
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
    expect(skipWhileOffline({ type: "vine", id: 3, hold: true })).toBe(true);
    expect(skipWhileOffline({ type: "stomp", victim: "b" })).toBe(true);
    expect(skipWhileOffline({ type: "block", x: 3, y: 4 })).toBe(false);
    expect(skipWhileOffline({ type: "placement", objects: [], done: true })).toBe(false);
  });
});

/** BaseLink with its delivery exposed, as a network would call it. */
class TestLink extends BaseLink {
  push(msg: ServerMessage): void {
    this.deliver(msg);
  }
}
const lobby = (n: number): ServerMessage => ({ type: "error", message: `m${n}` });

describe("message queue between scenes", () => {
  it("keeps messages while nobody listens and hands them over in order", () => {
    const link = new TestLink();
    link.push(lobby(1));
    link.push(lobby(2));
    const got: string[] = [];
    link.setHandler((m) => got.push((m as { message: string }).message));
    link.push(lobby(3));
    expect(got).toEqual(["m1", "m2", "m3"]);
  });

  it("a handler that lets go in the middle of the backlog leaves the rest to the next one", () => {
    const link = new TestLink();
    for (let i = 1; i <= 5; i++) link.push(lobby(i));
    const first: string[] = [];
    link.setHandler((m) => {
      const text = (m as { message: string }).message;
      first.push(text);
      // Like GameScene on gameStart: detach, the restarted scene takes over.
      if (text === "m2") link.setHandler(null);
    });
    expect(first).toEqual(["m1", "m2"]);
    link.push(lobby(6));
    const second: string[] = [];
    link.setHandler((m) => second.push((m as { message: string }).message));
    expect(second).toEqual(["m3", "m4", "m5", "m6"]);
  });
});
