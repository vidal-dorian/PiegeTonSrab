/**
 * Estimate of the server's clock, from ping/pong round trips.
 *
 * Runs on performance.now (it does not jump when the computer's wall clock is adjusted) and keeps
 * a sliding window of recent samples, trusting the one with the shortest round trip: after a
 * network change the estimate follows instead of sticking to an old best sample forever.
 */
const WINDOW = 12;

interface Sample {
  rtt: number;
  /** serverTime - localTime when the sample was taken, milliseconds. */
  offset: number;
}

export class ServerClock {
  private samples: Sample[] = [];
  private offset = 0;

  constructor(private localNow: () => number = () => performance.now()) {}

  /** A pong arrived: `sentAt` is the local time of the ping, `serverTime` the server's reply. */
  sample(sentAt: number, serverTime: number): void {
    const now = this.localNow();
    const rtt = Math.max(0, now - sentAt);
    this.samples.push({ rtt, offset: serverTime + rtt / 2 - now });
    if (this.samples.length > WINDOW) this.samples.shift();
    let best = this.samples[0]!;
    for (const s of this.samples) if (s.rtt < best.rtt) best = s;
    this.offset = best.offset;
  }

  get synced(): boolean {
    return this.samples.length > 0;
  }

  /** Smallest recent round trip, milliseconds (Infinity before the first sample). */
  get rtt(): number {
    return this.samples.reduce((m, s) => Math.min(m, s.rtt), Infinity);
  }

  /**
   * A typical recent round trip: the 75th percentile of the window's samples, milliseconds
   * (Infinity before the first sample). Unlike `rtt` (the best one, right for the clock), it
   * grows with the jitter, which is what makes a predicted screen correct itself.
   */
  get recentRtt(): number {
    if (this.samples.length === 0) return Infinity;
    const sorted = this.samples.map((s) => s.rtt).sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(0.75 * sorted.length))]!;
  }

  now(): number {
    return this.localNow() + this.offset;
  }
}
