/**
 * Client prediction of the co-op world (step B of the plan).
 *
 * The server runs the authoritative world; without prediction a player sees their own keys act
 * a round trip (plus interpolation) late. With it, this client runs a copy of the world a little
 * ahead of the server: its own inputs apply at once, the other players keep the keys the server
 * last reported them holding. Every snapshot is a correction: the copy is reloaded from it and
 * replayed up to the predicted tick with the inputs this client sent meanwhile.
 *
 * The inputs are stamped with the predicted tick, which runs ahead of the server's by the one-way
 * latency plus a small margin, so they usually reach the server before it simulates that tick and
 * the server applies them exactly where this client did: then replaying changes nothing for this
 * client's own body. What it cannot know (another player's jump, a late input) shows up as a
 * correction, drawn smoothly: each body is drawn at its predicted place plus an offset that fades.
 */
import { COOP_HZ, CoopWorld, HELD_BITS, PRESS_BITS, type CoopLevel, type CoopPlayer, type CoopWorldState } from "@game/shared/coop";

export interface DrawBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Offsets fade by half every this long, seconds. */
const HALF_LIFE = 0.06;
/** A correction larger than this is a teleport (a restart, a reconnection): no smoothing, cells. */
const SNAP_DISTANCE = 3;
/** Inputs kept ahead of the latest snapshot, at most. */
const MAX_INPUTS = 600;
/** Margin added to the one-way latency so inputs reach the server before it needs them, ms (the plan's 25 ms). */
export const INPUT_MARGIN_MS = 25;

/**
 * How many ticks ahead of the server this client predicts (and stamps its inputs): half the round
 * trip plus INPUT_MARGIN_MS, plus one tick for rounding.
 */
export function predictionLead(rttMs: number): number {
  return Math.ceil(((rttMs / 2 + INPUT_MARGIN_MS) * COOP_HZ) / 1000) + 1;
}

export class CoopPredictor {
  readonly world: CoopWorld;
  /** Tick of the predicted world (0 before the first snapshot). */
  tick = 0;
  /** The size of this client's own correction at each snapshot, cells (for tests and the bench). */
  readonly corrections: number[] = [];
  private base: { tick: number; state: CoopWorldState; held: number[]; pending: Array<Array<[number, number]>> } | null = null;
  private dirty = false;
  /** This client's input changes, [tick, bits], in tick order; presses count on their tick only. */
  private inputs: Array<[number, number]> = [];
  /** This client's held bits at the base tick (from the inputs already covered by the server). */
  private heldAtBase = 0;
  /** How many of `inputs` the predicted world has applied, and the held bits after them. */
  private applied = 0;
  private heldNow = 0;
  private offsets: Array<{ x: number; y: number }>;

  constructor(
    level: CoopLevel,
    players: readonly CoopPlayer[],
    /** This client's body index. */
    readonly me: number,
  ) {
    this.world = new CoopWorld(level, players);
    this.offsets = players.map(() => ({ x: 0, y: 0 }));
  }

  /**
   * The authoritative world at `tick`, with every seat's held bits at that tick and the input
   * changes the server already holds for later ticks (the others' are replayed exactly).
   */
  onSnapshot(tick: number, state: CoopWorldState, held: readonly number[], pending: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = []): void {
    if (this.base && tick <= this.base.tick) return;
    this.base = { tick, state, held: held.slice(), pending: pending.map((q) => q.map(([t, b]) => [t, b] as [number, number])) };
    this.dirty = true;
    // Inputs up to the snapshot are part of it: keep only the held state they leave. (A late
    // change applied after its tick on the server is replayed here at its tick: a correction.)
    while (this.inputs.length > 0 && this.inputs[0]![0] <= tick) this.heldAtBase = this.inputs.shift()![1] & HELD_BITS;
  }

  /** This client sent `bits` for `tick` (stamped with the predicted tick), in sending order. */
  addInput(tick: number, bits: number): void {
    this.inputs.push([tick, bits]);
    if (this.inputs.length > MAX_INPUTS) this.inputs.splice(0, this.inputs.length - MAX_INPUTS);
  }

  /**
   * Bring the predicted world to `target` (an integer tick), replaying from the latest snapshot if
   * one arrived. Returns false before the first snapshot.
   */
  advanceTo(target: number): boolean {
    const base = this.base;
    if (!base) return false;
    if (this.dirty) {
      this.dirty = false;
      const was = this.tick > 0 ? this.world.bodies.map((b) => ({ x: b.x, y: b.y })) : null;
      const wasTick = this.tick;
      const wasAttempt = this.world.attempt;
      this.world.load(base.state);
      this.tick = base.tick;
      this.applied = 0;
      this.heldNow = this.heldAtBase;
      this.replay(Math.max(wasTick, base.tick));
      if (was && wasTick === this.tick && wasAttempt === this.world.attempt) {
        this.world.bodies.forEach((b, i) => {
          const dx = was[i]!.x - b.x;
          const dy = was[i]!.y - b.y;
          if (i === this.me) this.corrections.push(Math.sqrt(dx * dx + dy * dy));
          const o = this.offsets[i]!;
          o.x += dx;
          o.y += dy;
          if (Math.abs(o.x) > SNAP_DISTANCE || Math.abs(o.y) > SNAP_DISTANCE) {
            o.x = 0;
            o.y = 0;
          }
        });
      } else {
        for (const o of this.offsets) {
          o.x = 0;
          o.y = 0;
        }
      }
    }
    this.replay(Math.max(target, base.tick));
    return true;
  }

  /** Fade the drawing offsets by `dt` seconds. */
  fade(dt: number): void {
    const k = Math.pow(0.5, dt / HALF_LIFE);
    for (const o of this.offsets) {
      o.x *= k;
      o.y *= k;
      if (Math.abs(o.x) < 1e-4) o.x = 0;
      if (Math.abs(o.y) < 1e-4) o.y = 0;
    }
  }

  /** Where to draw each body: its predicted place plus the fading correction offset. */
  boxes(): DrawBox[] {
    return this.world.bodies.map((b, i) => ({ x: b.x + this.offsets[i]!.x, y: b.y + this.offsets[i]!.y, w: b.width, h: b.height }));
  }

  /**
   * Step to `target`. This client's inputs are applied the way the server applies them: a change
   * at its tick, or at the first step after it if it is late, and at most one change per step.
   */
  private replay(target: number): void {
    const base = this.base!;
    // Changes already applied before this.tick (the replay restarts from the base or goes on).
    let k = this.applied;
    let held = this.heldNow;
    while (this.tick < target) {
      const next = this.tick + 1;
      let mine = held;
      if (k < this.inputs.length && this.inputs[k]![0] <= next) {
        const bits = this.inputs[k++]![1];
        held = bits & HELD_BITS;
        mine = held | (bits & PRESS_BITS);
      }
      const bits = this.world.bodies.map((_, i) => (i === this.me ? mine : this.otherBits(i, next)));
      this.world.step(bits);
      this.tick = next;
    }
    this.applied = k;
    this.heldNow = held;
  }

  /** Other players' changes applied so far in the current replay (index into base.pending) and their held bits. */
  private others: Array<{ k: number; held: number; at: number; base: number }> = [];

  /** Body i's bits at tick `next`: its held keys, and the changes the server already had for it. */
  private otherBits(i: number, next: number): number {
    const base = this.base!;
    let o = this.others[i];
    if (!o || o.base !== base.tick || o.at >= next) {
      // A new replay from the base: start from the held keys at the base tick.
      o = { k: 0, held: (base.held[i] ?? 0) & HELD_BITS, at: base.tick, base: base.tick };
      this.others[i] = o;
    }
    o.at = next;
    const q = base.pending[i] ?? [];
    if (o.k < q.length && q[o.k]![0] <= next) {
      const bits = q[o.k++]![1];
      o.held = bits & HELD_BITS;
      return o.held | (bits & PRESS_BITS);
    }
    return o.held;
  }
}
