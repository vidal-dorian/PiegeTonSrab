/**
 * The online drawing delay against the network (M3 review): snapshots leave the server like
 * CoopSession sends them (a 60 Hz callback, one when at least 32.3 ms passed since the last), reach
 * the client after a one-way latency plus jitter, and the client draws at 60 fps with OnlineDriver's
 * selection. A frame "with no blending" draws the newest snapshot as it is (frozen, then a jump).
 * With the old fixed 50 ms delay, that was 50 % of the frames at 20 ms one way and all of them
 * from 50 ms.
 */
import { describe, expect, it } from "vitest";
import { COOP_HZ } from "@game/shared/coop";
import { bracket, MAX_DRAW_DELAY, MIN_DRAW_DELAY, PlayoutClock } from "./net/playout";

const SNAP_MS = 1000 / 30;
const CALLBACK_MS = 1000 / 60;
const FRAME_MS = 1000 / 60;

interface Net {
  /** One-way latency at a send time, ms. */
  latency: (sentAt: number) => number;
  /** Extra random delay, 0 to this, ms. */
  jitter: number;
  /** Error of this client's estimate of the server clock, ms. */
  clockError?: number;
  /** The server sends nothing in this window (ms), e.g. a pause or a dropped connection. */
  silence?: [number, number];
  durationMs?: number;
}

interface Run {
  /** Share of the frames (after the first second) with nothing to blend towards, %. */
  noBlend: number;
  /** Frames whose drawing time went back. */
  backwards: number;
  /** Drawing delay, ticks, per frame. */
  delays: number[];
  /** Frames with no blending in each second. */
  perSecond: number[];
}

function simulate(net: Net, draw: (clock: PlayoutClock, now: number) => number): Run {
  const duration = net.durationMs ?? 20000;
  const sent: Array<{ t: number; tick: number }> = [];
  let last = -Infinity;
  for (let t = 0; t < duration; t += CALLBACK_MS) {
    if (net.silence && t >= net.silence[0] && t < net.silence[1]) continue;
    if (t - last >= SNAP_MS - 1) {
      last = t;
      sent.push({ t, tick: Math.floor((t * COOP_HZ) / 1000) });
    }
  }
  let seed = 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const arrivals = sent.map((s) => ({ ...s, at: s.t + net.latency(s.t) + rand() * net.jitter })).sort((x, y) => x.at - y.at);
  const est = (ms: number) => ((ms + (net.clockError ?? 0)) * COOP_HZ) / 1000;
  const clock = new PlayoutClock();
  const snaps: Array<{ tick: number }> = [];
  const run: Run = { noBlend: 0, backwards: 0, delays: [], perSecond: [] };
  let k = 0;
  let frames = 0;
  let frozen = 0;
  let prevAt = -Infinity;
  for (let now = 0; now < duration - 500; now += FRAME_MS) {
    // Messages are handled between frames, as they arrive.
    while (k < arrivals.length && arrivals[k]!.at <= now) {
      const { tick, at } = arrivals[k++]!;
      if (snaps.length > 0 && tick <= snaps[snaps.length - 1]!.tick) continue;
      clock.arrive(est(at), tick);
      snaps.push({ tick });
    }
    if (snaps.length === 0) continue;
    const at = draw(clock, est(now));
    const [a, b] = bracket(snaps, at);
    if (now >= 1000) {
      frames++;
      if (at < prevAt) run.backwards++;
      run.delays.push(clock.delayTicks);
      const second = Math.floor(now / 1000);
      run.perSecond[second] ??= 0;
      if (a === b) {
        frozen++;
        run.perSecond[second]!++;
      }
    }
    prevAt = at;
  }
  run.noBlend = (100 * frozen) / frames;
  return run;
}

const playout = (clock: PlayoutClock, now: number) => clock.drawTick(now);
const steady = (ms: number) => () => ms;

describe("the online drawing delay", () => {
  it("blends nearly every frame from 0 to 80 ms one way (jitter 0-10 ms)", () => {
    for (const latency of [0, 10, 20, 30, 50, 80]) {
      const run = simulate({ latency: steady(latency), jitter: 10 }, playout);
      expect(run.noBlend, `${latency} ms one way`).toBeLessThan(5);
      expect(run.backwards).toBe(0);
    }
  });

  it("the old fixed 50 ms delay did not (the scenario this guards)", () => {
    const fixed = (_clock: PlayoutClock, now: number) => now - 6;
    expect(simulate({ latency: steady(20), jitter: 10 }, fixed).noBlend).toBeGreaterThan(40);
    expect(simulate({ latency: steady(50), jitter: 10 }, fixed).noBlend).toBeGreaterThan(95);
  });

  it("stays as short as before next to the server, and grows with the latency", () => {
    const near = simulate({ latency: steady(0), jitter: 2 }, playout);
    const far = simulate({ latency: steady(80), jitter: 10 }, playout);
    expect(Math.max(...near.delays)).toBeLessThanOrEqual(MIN_DRAW_DELAY + 1.5);
    const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[xs.length >> 1]!;
    // 80 ms is 9.6 ticks, plus about one snapshot interval (4 ticks).
    expect(median(far.delays)).toBeGreaterThan(13);
    expect(median(far.delays)).toBeLessThan(17);
  });

  it("does not depend on the server clock estimate (25 ms off either way)", () => {
    for (const clockError of [-25, 25]) {
      expect(simulate({ latency: steady(40), jitter: 10, clockError }, playout).noBlend).toBeLessThan(5);
    }
  });

  it("holds up with a lot of jitter", () => {
    expect(simulate({ latency: steady(40), jitter: 40 }, playout).noBlend).toBeLessThan(5);
  });

  it("follows a latency change within a few seconds, smoothly", () => {
    const up = simulate({ latency: (t) => (t < 8000 ? 20 : 80), jitter: 10 }, playout);
    expect(up.backwards).toBe(0);
    expect(up.perSecond.slice(10).reduce((s, x) => s + x, 0)).toBe(0);
    // The delay never moves by more than 10 % of the elapsed time from one frame to the next.
    const ticksPerFrame = (FRAME_MS * COOP_HZ) / 1000;
    for (let i = 1; i < up.delays.length; i++) expect(Math.abs(up.delays[i]! - up.delays[i - 1]!)).toBeLessThanOrEqual(0.1 * ticksPerFrame + 1e-9);
    const down = simulate({ latency: (t) => (t < 8000 ? 80 : 20), jitter: 10 }, playout);
    expect(down.noBlend).toBeLessThan(5);
    expect(down.backwards).toBe(0);
    expect(down.delays[down.delays.length - 1]!).toBeLessThan(10);
  });

  it("a silence (pause, reconnection) is not taken for latency", () => {
    const run = simulate({ latency: steady(20), jitter: 10, silence: [6000, 9000] }, playout);
    expect(Math.max(...run.delays)).toBeLessThan(MAX_DRAW_DELAY / 2);
    expect(run.perSecond.slice(10).reduce((s, x) => s + x, 0)).toBe(0);
  });
});

describe("bracket", () => {
  const snaps = [{ tick: 4 }, { tick: 8 }, { tick: 12 }];
  it("picks the snapshots around the drawing time, or one alone outside them", () => {
    expect(bracket(snaps, 9).map((s) => s.tick)).toEqual([8, 12]);
    expect(bracket(snaps, 8).map((s) => s.tick)).toEqual([8, 12]);
    expect(bracket(snaps, 13).map((s) => s.tick)).toEqual([12, 12]);
    expect(bracket(snaps, 2).map((s) => s.tick)).toEqual([4, 4]);
  });
});
