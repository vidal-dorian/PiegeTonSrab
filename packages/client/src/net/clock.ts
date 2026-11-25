/**
 * Estimate of the server's clock, from ping/pong round trips.
 *
 * The estimate runs on the monotonic clock (performance.now), not on Date.now: the wall
 * clock of a player's machine can be stepped (time sync, a user changing it), and that
 * would shift every race deadline on that machine. Before this, such a step could leave a
 * player stuck on "Prêt ?" while the others raced, or show "Temps écoulé" at the start.
 *
 * The monotonic clock has its own jump: on macOS, iOS, Linux and Android it does not count
 * the time the device sleeps (closed lid, locked phone), while the server's clock does.
 * The server's clock can be stepped too. So samples are checked against each other: with
 * both clocks running steadily, the true offset lies within rtt / 2 of every sample's
 * offset, so two samples whose ranges don't overlap prove that a clock jumped in between.
 * Then the older samples are dropped and the estimate restarts from the new one.
 *
 * Each pong gives one sample: server time ≈ s + rtt / 2 at the moment it arrives. The
 * sample with the shortest round trip has the least uncertainty, so that one is used, but
 * only among the recent samples (a sliding window), so that a change of route shows.
 * Pure (no timers, no network), so it can be unit-tested.
 */
export interface ClockSample {
  /** Round trip, milliseconds. */
  rtt: number;
  /** server time - local monotonic time, milliseconds. */
  offset: number;
  /** Local monotonic time the sample was taken, milliseconds. */
  at: number;
}

/** Samples older than this are dropped, milliseconds (pings go out every 2 s: about 10 samples). */
export const CLOCK_WINDOW_MS = 20_000;
/** A round trip longer than this says nothing useful about the clock (server stalled, lag spike). */
export const MAX_USEFUL_RTT_MS = 2_000;
/** Slack on the consistency check, for clock granularity, milliseconds. */
export const JUMP_MARGIN_MS = 50;

export class ClockSync {
  private samples: ClockSample[] = [];
  private best: ClockSample | null = null;
  /** How many clock jumps were detected (tests, console). */
  jumps = 0;

  /**
   * Record a pong. `sentAt` and `receivedAt` are local monotonic times (performance.now),
   * `serverTime` the server's clock when it answered. Returns whether the sample was kept.
   */
  addSample(sentAt: number, receivedAt: number, serverTime: number): boolean {
    const rtt = receivedAt - sentAt;
    if (!Number.isFinite(rtt) || !Number.isFinite(serverTime) || rtt < 0 || rtt > MAX_USEFUL_RTT_MS) return false;
    const sample = { rtt, offset: serverTime + rtt / 2 - receivedAt, at: receivedAt };
    this.prune(receivedAt);
    if (this.best && Math.abs(sample.offset - this.best.offset) > (sample.rtt + this.best.rtt) / 2 + JUMP_MARGIN_MS) {
      // A clock jumped (device sleep, time step): what was measured before no longer holds.
      this.jumps++;
      this.samples = [];
      this.best = null;
    }
    this.samples.push(sample);
    this.prune(receivedAt);
    return true;
  }

  /** Server time now, given the local monotonic time `localNow`. Before any sample: `fallback`. */
  serverNow(localNow: number, fallback: number): number {
    this.prune(localNow);
    return this.best ? localNow + this.best.offset : fallback;
  }

  /** Whether at least one sample was ever taken. */
  get synced(): boolean {
    return this.best !== null;
  }

  /** Current estimate's round trip, or null before any sample. */
  get rtt(): number | null {
    return this.best?.rtt ?? null;
  }

  /**
   * Drop samples that left the window and pick the best of the rest. The newest sample is
   * always kept, so a long gap without pongs (a dropped connection) keeps the last estimate
   * instead of losing it.
   */
  private prune(localNow: number): void {
    if (this.samples.length === 0) return;
    const newest = this.samples[this.samples.length - 1]!;
    // Called every frame: nothing to do unless a sample left the window or none is picked yet.
    if (this.best && localNow - this.samples[0]!.at <= CLOCK_WINDOW_MS && this.samples.includes(this.best) && this.best.rtt <= newest.rtt) {
      return;
    }
    this.samples = this.samples.filter((s) => s === newest || localNow - s.at <= CLOCK_WINDOW_MS);
    this.best = this.samples.reduce((a, b) => (b.rtt <= a.rtt ? b : a));
  }
}
