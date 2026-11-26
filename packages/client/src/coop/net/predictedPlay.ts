/**
 * The predicted side of the online co-op screen (step B), without Phaser or the DOM so the network
 * bench runs it as the screen does: a CoopPredictor that draws the world ahead of the server, the
 * CoopInputSender that stamps this player's keys with the predicted tick, and the server's latest
 * world for what only the server decides (the HUD's key, door, attempt and restart count).
 *
 * The predicted clock is the server's clock plus the lead (half the round trip plus a margin,
 * predictor.ts). It never runs backwards: it runs a little faster or slower to follow the lead,
 * and jumps forward only when far behind. Each step of it reads the keys once and stamps them for
 * that step, so the copy applies them exactly where the server will when they arrive in time.
 */
import { BIT_RESTART, COOP_HZ, CoopWorld, type CoopClientMessage, type CoopWorldState } from "@game/shared/coop";
import type { PropFrame } from "../render/propFrame";
import { CoopInputSender } from "./inputSender";
import { CoopPredictor, predictionLead } from "./predictor";

/**
 * Whether a player's screen predicts unless the address says otherwise. The plan turns it on only
 * if the bench passes its thresholds (coopPredictBench.test.ts checks this matches its verdict).
 */
export const PREDICT_BY_DEFAULT = false;

/** Whether this screen predicts: ?predict=1 turns it on, ?predict=0 off, else PREDICT_BY_DEFAULT. */
export function predictionWanted(search: string): boolean {
  const v = new URLSearchParams(search).get("predict");
  return v === null || v === "" ? PREDICT_BY_DEFAULT : v !== "0";
}

/** The round trip assumed before the first pong, ms. */
const DEFAULT_RTT_MS = 100;
/** Further than this from where it should be, ticks, the predicted clock jumps forward instead of catching up. */
const JUMP_TICKS = 24;
/** The predicted clock runs at most this much faster to follow the lead... */
const SLEW = 0.2;
/** ...and slows down by this much per tick it is ahead (it stops when far ahead: never backwards). */
const SLOW_PER_TICK = 0.05;
/** Steps simulated (and keys read) per frame at most, after a frozen tab or a clock jump. */
const MAX_STEPS_PER_FRAME = 60;
/**
 * Without a snapshot, the copy runs on at full speed this long past where it normally is (the
 * lead plus a one-way trip past the newest snapshot), ticks: 1.75 s, so a stall of a second and a
 * half (the server still running, this player's inputs maybe still reaching it) is drawn as
 * smoothly as any other moment...
 */
export const STALE_FULL_TICKS = Math.round(COOP_HZ * 1.75);
/**
 * ...then it slows down (its speed divided by e every this many ticks, 250 ms), so it never goes
 * more than STALE_FULL_TICKS + STALE_EASE_TICKS (2 s) past: a link that went silent for good does
 * not play the whole team on for the reconnection window. A link the transport reports lost
 * (`setLinkLost`) holds the copy at once.
 */
export const STALE_EASE_TICKS = Math.round(COOP_HZ * 0.25);
/**
 * Once held back (a silence past STALE_FULL_TICKS, a lost link), the copy catches up with the
 * clock at most this much faster than it (1.5 times the speed): bodies speed up for a moment
 * instead of jumping up to MAX_STEPS_PER_FRAME steps in one frame.
 */
const CATCH_UP = 0.5;

export interface PredictedPlayIO {
  send(msg: CoopClientMessage): void;
  /** The server tick now (fractional), on this level's clock. */
  serverTick(): number;
  /** Shortest recent round trip to the server, ms (Infinity before the first). */
  rtt(): number;
}

export class PredictedPlay {
  readonly predictor: CoopPredictor;
  readonly sender: CoopInputSender;
  /** The server's latest world (the HUD reads it; deaths, restarts and the win come from it). */
  readonly authority: CoopWorld;
  /** Each seat's held bits in the latest snapshot. */
  private held: number[] = [];
  /** The predicted clock, ticks (NaN until the first frame). */
  private clock = Number.NaN;
  /** The last tick whose keys were read and stamped. */
  private sampled = 0;
  private newest = -1;
  private paused = false;
  /** The transport says the link is lost (reconnecting): the copy holds where it is. */
  private linkLost = false;
  /** The copy was held back behind the clock and is catching up (CATCH_UP), with its step budget. */
  private catchingUp = false;
  private catchUpBudget = 0;

  constructor(
    /** The world to draw: the predictor runs it. */
    world: CoopWorld,
    /** The server's latest state goes in this one (same level and team). */
    authority: CoopWorld,
    me: number,
    /** The coopLevel's epoch, echoed in every input. */
    epoch: number,
    private io: PredictedPlayIO,
  ) {
    this.predictor = new CoopPredictor(world, me);
    this.authority = authority;
    this.sender = new CoopInputSender((msg) => io.send(msg), epoch, () => io.serverTick());
  }

  get world(): CoopWorld {
    return this.predictor.world;
  }

  /** Ticks ahead of the server the copy runs (and the keys are stamped). */
  get lead(): number {
    return predictionLead(this.rttMs());
  }

  private rttMs(): number {
    const rtt = this.io.rtt();
    return Number.isFinite(rtt) ? rtt : DEFAULT_RTT_MS;
  }

  /** When a message sent now should reach the server, server ticks. */
  private arrival(): number {
    return this.io.serverTick() + (this.rttMs() / 2) * (COOP_HZ / 1000);
  }

  /** The predicted tick now (fractional). */
  get predictedTick(): number {
    return this.clock;
  }

  onSnapshot(tick: number, state: CoopWorldState, held: readonly number[], pending: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, ack?: readonly number[]): void {
    if (tick <= this.newest) return;
    this.newest = tick;
    this.authority.load(state);
    this.held = held.slice();
    this.predictor.onSnapshot(tick, state, held, pending, ack);
    if (this.paused) this.predictor.showBase();
  }

  /**
   * One frame of `dt` seconds: move the predicted clock, read and stamp the keys of each step it
   * passes (`take` reads one step's bits), bring the copy there and send. `now` is local time, ms.
   */
  advance(dt: number, take: (() => number) | null, now: number): void {
    if (this.paused) {
      // Nothing advances; the keys are read so that no press replays later, and only heartbeats go.
      take?.();
      this.sender.flush(now);
      return;
    }
    const want = this.io.serverTick() + this.lead;
    if (Number.isNaN(this.clock) || want - this.clock > JUMP_TICKS) this.clock = want;
    else {
      const rate = 1 + Math.max(-1, Math.min(SLEW, (want - this.clock) * SLOW_PER_TICK));
      this.clock += dt * COOP_HZ * rate;
    }
    const n = Math.floor(this.clock);
    if (take && n >= 1) {
      this.sampled = Math.max(this.sampled, n - MAX_STEPS_PER_FRAME, 0);
      const arrives = this.arrival();
      while (this.sampled < n) {
        const s = ++this.sampled;
        const bits = take();
        const stamp = this.sender.sample(bits, s);
        if (stamp !== null) this.predictor.addInput(stamp, bits, arrives);
      }
      this.sender.flush(now);
    }
    const limit = this.staleLimit(n);
    let target = Math.min(n, this.predictor.tick + MAX_STEPS_PER_FRAME, limit);
    if (limit < n) this.catchingUp = true;
    if (this.catchingUp) {
      this.catchUpBudget = Math.min(this.catchUpBudget + dt * COOP_HZ * (1 + CATCH_UP), MAX_STEPS_PER_FRAME);
      const steps = Math.floor(this.catchUpBudget);
      this.catchUpBudget -= steps;
      target = Math.min(target, this.predictor.tick + steps);
    }
    this.predictor.advanceTo(Math.max(this.predictor.tick, target));
    // Caught up (or stopped before a step only the server decides: its snapshot moves it on).
    if (this.predictor.tick >= n || this.predictor.waiting) {
      this.catchingUp = false;
      this.catchUpBudget = 0;
    }
    this.predictor.fade(dt);
  }

  /**
   * How far the copy may run this frame without newer snapshots, ticks: up to the clock `n` while
   * snapshots come, eased to a stop STALE_FULL_TICKS past where it normally is (the lead plus a
   * one-way trip past the newest snapshot), and not at all while the link is lost.
   */
  private staleLimit(n: number): number {
    if (this.linkLost) return this.predictor.tick;
    const normal = this.newest + this.lead + Math.ceil((this.rttMs() / 2) * (COOP_HZ / 1000));
    const over = n - normal - STALE_FULL_TICKS;
    if (over <= 0) return n;
    return Math.floor(normal + STALE_FULL_TICKS + STALE_EASE_TICKS * (1 - Math.exp(-over / STALE_EASE_TICKS)));
  }

  /** What to draw this frame. */
  frame(): PropFrame {
    const c = this.clock;
    // Held back behind the clock (no snapshot for a while): the copy's last state as it is.
    const behind = this.predictor.tick < Math.floor(c);
    return this.predictor.frame(Number.isNaN(c) || behind ? 1 : c - Math.floor(c));
  }

  /**
   * The world waits for a dropped player (true) or goes on (false): nothing advances meanwhile,
   * and the screen draws the server's world as its latest snapshot has it (the copy's guess past
   * it, keys the server will forget on the resume included, is dropped).
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
    this.sender.setPaused(paused);
    if (paused) this.predictor.showBase();
  }

  /**
   * The transport lost the link and is reconnecting (true), or got it back (false). While lost,
   * the copy holds where it is, drawn as it is (no snapshot can come, and the server stops the
   * world for this player soon); keys are read and stamped as usual. Back, it catches up smoothly
   * (a resume's coopLevel starts the screen over anyway).
   */
  setLinkLost(lost: boolean): void {
    this.linkLost = lost;
  }

  /**
   * The tab was hidden: the server touches nothing until the next input. The copy forgets this
   * player's keys from when the server does (the input source drops them with the focus).
   */
  idle(): void {
    this.sender.idle();
    this.predictor.forgetOwnInputs(this.arrival());
  }

  /** Bodies holding R: the server's word, and this player's own R at once. */
  restartHolders(me: number): number[] {
    const out = this.held.flatMap((bits, i) => ((bits & BIT_RESTART) !== 0 ? [i] : []));
    if (me >= 0 && (this.sender.held & BIT_RESTART) !== 0 && !out.includes(me)) out.push(me);
    return out.sort((x, y) => x - y);
  }
}
