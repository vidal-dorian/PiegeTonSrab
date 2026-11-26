/**
 * What a co-op client sends of its player's keys: a [tick, bits] change when the keys change (or
 * a press happens), and an empty coopIn as a heartbeat so the server knows the player is there.
 *
 * Every message carries the epoch of the coopLevel whose clock stamped it: when tick 0 moves (a
 * resume, a rebuild, a stall), the server drops what was stamped on the old clock. While the world
 * waits for a dropped player the keys are read but not sent (heartbeats only): their stamps would
 * belong to a clock that moves when the world goes on.
 */
import { HELD_BITS, PRESS_BITS, type CoopClientMessage } from "@game/shared/coop";

/** An input is sent at least this often, so the server knows the player is there, ms. */
export const HEARTBEAT_MS = 100;

export class CoopInputSender {
  private lastHeld = 0;
  private pending: Array<[number, number]> = [];
  private lastStamp = 0;
  private lastSentAt = -Infinity;
  private paused = false;

  constructor(
    private send: (msg: CoopClientMessage) => void,
    /** The coopLevel's epoch, echoed in every input. */
    private epoch: number,
    /** The server tick now (fractional), on this level's clock. */
    private serverTick: () => number,
  ) {}

  /** The held keys the server was told about (this player's own R shows at once). */
  get held(): number {
    return this.lastHeld;
  }

  /**
   * This step's keys; queue a change (or a press) for the server, stamped for tick `at` (the
   * predicted step they belong to, step B) or, without it, the server's next step (step A).
   * Stamps strictly increase: the server applies one change per step, so two changes on one tick
   * would land a step apart. Returns the stamp of the change queued, or null when none was.
   */
  sample(bits: number, at?: number): number | null {
    // Paused: the keys are consumed (no press replays later) and nothing counts as sent, so
    // whatever is held when the world goes on is sent then.
    if (this.paused) return null;
    const held = bits & HELD_BITS;
    if ((bits & PRESS_BITS) === 0 && held === this.lastHeld) return null;
    const stamp = Math.max(at ?? this.applyTick(), this.lastStamp + 1);
    this.lastStamp = stamp;
    this.pending.push([stamp, bits]);
    this.lastHeld = held;
    return stamp;
  }

  /** Step A: inputs are applied as soon as the server gets them. */
  private applyTick(): number {
    return Math.max(1, Math.ceil(this.serverTick()) + 1);
  }

  /** Send the changes queued, or a heartbeat when one is due. `now` is local time, ms. */
  flush(now: number): void {
    if (this.pending.length === 0 && now - this.lastSentAt < HEARTBEAT_MS) return;
    // With no change, an empty message only says "still here" (it must not take a change's step).
    this.send({ type: "coopIn", e: this.epoch, k: this.pending });
    this.pending = [];
    this.lastSentAt = now;
  }

  /** The world waits for someone (true) or goes on (false). */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    // Changes not sent yet belong to the clock before the pause, and the server forgets every
    // held key when the world goes on: nothing counts as sent.
    this.pending = [];
    this.lastHeld = 0;
  }

  /** The tab was hidden: the server touches nothing until the next input. */
  idle(): void {
    this.send({ type: "coopIdle" });
    this.lastHeld = 0;
  }
}
