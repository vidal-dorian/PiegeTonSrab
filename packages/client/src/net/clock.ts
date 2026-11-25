/**
 * Estimate of the server's clock, from ping/pong round trips.
 *
 * The estimate runs on the monotonic clock (performance.now), never on Date.now: the wall
 * clock of a player's machine can jump (time sync, sleep, a user changing it), and a jump
 * would shift every race deadline on that machine. Before this, one jump could leave a
 * player stuck on "Prêt ?" while the others raced, or show "Temps écoulé" at the start.
 *
 * Each pong gives one sample: server time ≈ s + rtt / 2 at the moment it arrives. The
 * sample with the shortest round trip has the least uncertainty, so that one is used, but
 * only among the recent samples (a sliding window): an old excellent sample can no longer
 * hide that the clocks moved apart, or that the route to the server changed.
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

export class ClockSync {
  private samples: ClockSample[] = [];
  private best: ClockSample | null = null;

  /**
   * Record a pong. `sentAt` and `receivedAt` are local monotonic times (performance.now),
   * `serverTime` the server's clock when it answered. Returns whether the sample was kept.
   */
  addSample(sentAt: number, receivedAt: number, serverTime: number): boolean {
    const rtt = receivedAt - sentAt;
    if (!Number.isFinite(rtt) || !Number.isFinite(serverTime) || rtt < 0 || rtt > MAX_USEFUL_RTT_MS) return false;
    this.samples.push({ rtt, offset: serverTime + rtt / 2 - receivedAt, at: receivedAt });
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
