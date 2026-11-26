/**
 * The online drawing clock: how far behind the server's clock the co-op world is drawn.
 *
 * A snapshot of tick T exists on this client only from T plus the one-way latency, and snapshots
 * leave the server about 30 times a second, not every tick. A fixed delay is passed by the drawing
 * time as soon as the latency is more than a few ms: the frame then shows the newest snapshot as it
 * is (frozen, then a jump) instead of a blend.
 *
 * So the delay is measured from the arrivals: each snapshot that arrives says how far behind the
 * clock the newest one had fallen just before (the clock now minus the previous newest tick).
 * Drawing at least that far behind, the drawing time never passes the newest snapshot. The delay
 * follows a high quantile of the recent measures plus a margin, and changes slowly once settled
 * (the drawn world runs a few % slower or faster meanwhile, never backwards). Clock times are
 * server ticks as this client estimates them: an error in that estimate is in the measures too,
 * so it cancels out.
 */

/** The shortest delay, ticks (1.5 snapshot intervals: what a client next to the server needs). */
export const MIN_DRAW_DELAY = 6;
/** The longest delay, ticks (300 ms). A longer silence (a pause, a reconnection) is not measured. */
export const MAX_DRAW_DELAY = 36;
/** Measures kept: about 3 s of snapshots. */
const WINDOW = 90;
/** The delay covers this share of the recent measures (a rare late snapshot is not worth waiting for). */
const QUANTILE = 0.95;
/** Added to the measure, ticks: room for a snapshot a bit later than the recent ones. */
const MARGIN = 1;
/** The first measures set the delay at once (the level card is up); later ones move it slowly. */
const SETTLE_MEASURES = 8;
/** Once settled, the delay grows at most this many ticks per tick (the drawn world runs 10 % slower). */
const GROW_RATE = 0.1;
/** ...and shrinks at most this many ticks per tick (3 % faster). */
const SHRINK_RATE = 0.03;

export class PlayoutClock {
  private measures: number[] = [];
  private newest = -Infinity;
  private target = MIN_DRAW_DELAY;
  private delay = MIN_DRAW_DELAY;
  private lastNow = Number.NaN;

  /** Current drawing delay, ticks. */
  get delayTicks(): number {
    return this.delay;
  }

  /** A snapshot of `tick` arrived when the clock read `now` (server ticks). */
  arrive(now: number, tick: number): void {
    if (tick <= this.newest) return;
    if (this.newest > -Infinity) {
      const behind = now - this.newest;
      if (behind <= MAX_DRAW_DELAY) {
        this.measures.push(behind);
        if (this.measures.length > WINDOW) this.measures.shift();
        const sorted = [...this.measures].sort((x, y) => x - y);
        const q = sorted[Math.min(sorted.length - 1, Math.floor(QUANTILE * sorted.length))]!;
        this.target = Math.min(MAX_DRAW_DELAY, Math.max(MIN_DRAW_DELAY, q + MARGIN));
      }
    }
    this.newest = tick;
  }

  /** The tick to draw when the clock reads `now` (server ticks). */
  drawTick(now: number): number {
    if (this.measures.length < SETTLE_MEASURES || Number.isNaN(this.lastNow)) this.delay = this.target;
    else {
      const dt = Math.max(0, now - this.lastNow);
      const change = this.target - this.delay;
      this.delay += change > 0 ? Math.min(change, GROW_RATE * dt) : Math.max(change, -SHRINK_RATE * dt);
    }
    this.lastNow = now;
    return now - this.delay;
  }
}

/** The snapshots around `at` (sorted by tick): the last at or before it and the next (itself when none). */
export function bracket<T extends { tick: number }>(snaps: readonly T[], at: number): [T, T] {
  for (let i = snaps.length - 1; i >= 0; i--) {
    if (snaps[i]!.tick <= at) return [snaps[i]!, snaps[i + 1] ?? snaps[i]!];
  }
  return [snaps[0]!, snaps[0]!];
}
