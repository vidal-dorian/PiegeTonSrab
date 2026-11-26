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
 * correction, drawn smoothly: everything that moves is drawn at its predicted place plus an
 * offset that fades. A rider is drawn with the offset of what carries it, so a pile never comes
 * apart on screen; a correction larger than SNAP_DISTANCE (a restart, a reconnection) is not
 * smoothed.
 *
 * What cannot be undone is the server's alone: the copy never steps into a death, a restart or
 * the win. It stops just before such a step and waits for the next snapshot (the server may not
 * agree); while the server's own world is in a death freeze or won, the copy is that world.
 */
import { CoopWorld, HELD_BITS, PRESS_BITS, COOP_HZ, type CoopWorldState } from "@game/shared/coop";
import { captureFrame, copyFrame, lerpFrame, newFrame, type FrameBox, type PropFrame } from "../render/propFrame";

export type DrawBox = FrameBox;

/** Offsets fade by half every this long, seconds. */
const HALF_LIFE = 0.06;
/** A correction larger than this is a teleport (a restart, a reconnection): no smoothing, cells. */
export const SNAP_DISTANCE = 3;
/** Inputs kept ahead of the latest snapshot, at most. */
const MAX_INPUTS = 600;
/** Margin added to the one-way latency so inputs reach the server before it needs them, ms (the plan's 25 ms). */
export const INPUT_MARGIN_MS = 25;
/**
 * The longest lead, ticks (300 ms). The server brings stamps more than half a second ahead of its
 * clock back to it (COOP_STAMP_AHEAD): a client predicting that far would see its keys land late.
 */
export const MAX_LEAD = Math.round(COOP_HZ * 0.3);

/**
 * How many ticks ahead of the server this client predicts (and stamps its inputs): half the round
 * trip plus INPUT_MARGIN_MS, plus one tick for rounding, at most MAX_LEAD.
 */
export function predictionLead(rttMs: number): number {
  return Math.min(MAX_LEAD, Math.ceil(((rttMs / 2 + INPUT_MARGIN_MS) * COOP_HZ) / 1000) + 1);
}

interface Base {
  tick: number;
  state: CoopWorldState;
  held: number[];
  pending: Array<Array<[number, number]>>;
}

export class CoopPredictor {
  /** Tick of the predicted world (0 before the first snapshot). */
  tick = 0;
  /** The size of this client's own correction at each snapshot, cells (for tests and the bench). */
  readonly corrections: number[] = [];
  /** The copy stopped before a step only the server decides (a death, a restart, the win). */
  waiting = false;
  private base: Base | null = null;
  private dirty = false;
  /** This client's input changes, [tick, bits], in tick order; presses count on their tick only. */
  private inputs: Array<[number, number]> = [];
  /** This client's held bits at the base tick (from the inputs already covered by the server). */
  private heldAtBase = 0;
  /** How many of `inputs` the predicted world has applied, and the held bits after them. */
  private applied = 0;
  private heldNow = 0;
  /** The other players' changes applied so far in this replay (index into base.pending) and their held bits. */
  private others: Array<{ k: number; held: number }> = [];
  /** The world before and after the last step (frames blend between them), and the drawn frame. */
  private prev = newFrame();
  private cur = newFrame();
  private out = newFrame();
  private scratch = newFrame();
  /** What the corrections moved, fading: added to the frame (same layout as a PropFrame). */
  private off = newFrame();
  /** The tick the last advanceTo asked for. */
  private target = 0;

  constructor(
    /** The world this client draws (predicted). */
    readonly world: CoopWorld,
    /** This client's body index. */
    readonly me: number,
  ) {
    captureFrame(world, this.cur);
    copyFrame(this.cur, this.prev);
    captureFrame(world, this.off);
    zero(this.off);
  }

  /** A snapshot arrived since the copy started. */
  get synced(): boolean {
    return this.base !== null;
  }

  /**
   * The authoritative world at `tick`, with every seat's held bits at that tick and the input
   * changes the server already holds for later ticks (the others' are replayed exactly).
   */
  onSnapshot(tick: number, state: CoopWorldState, held: readonly number[], pending: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = []): void {
    if (this.base && tick <= this.base.tick) return;
    this.base = { tick, state, held: held.slice(), pending: pending.map((q) => q.map(([t, b]) => [t, b] as [number, number])) };
    this.dirty = true;
    // Inputs up to the snapshot are part of it: keep only the held state they leave. Those the
    // server still holds (they reached it late) apply one per step from the next tick there, the
    // way the replay applies a late change.
    const late = new Set((pending[this.me] ?? []).filter(([t]) => t <= tick).map(([t]) => t));
    const keep: Array<[number, number]> = [];
    for (const input of this.inputs) {
      if (input[0] > tick || late.has(input[0])) keep.push(input);
      else this.heldAtBase = input[1] & HELD_BITS;
    }
    this.inputs = keep;
  }

  /** This client sent `bits` for `tick` (stamped with the predicted tick), in sending order. */
  addInput(tick: number, bits: number): void {
    this.inputs.push([tick, bits]);
    // Already simulated past it (the server's clock ran ahead): the next advance replays it.
    if (tick <= this.tick && this.base) this.dirty = true;
    if (this.inputs.length > MAX_INPUTS) {
      const drop = this.inputs.length - MAX_INPUTS;
      this.inputs.splice(0, drop);
      this.applied = Math.max(0, this.applied - drop);
    }
  }

  /**
   * Bring the predicted world to `target` (an integer tick), replaying from the latest snapshot if
   * one arrived. Returns false before the first snapshot.
   */
  advanceTo(target: number): boolean {
    const base = this.base;
    if (!base) return false;
    this.target = target;
    if (this.dirty) this.reconcile();
    this.run(Math.max(target, base.tick));
    return true;
  }

  /** Fade the drawing offsets by `dt` seconds; a rider takes the offset of what carries it. */
  fade(dt: number): void {
    const k = Math.pow(0.5, dt / HALF_LIFE);
    const o = this.off;
    for (const b of o.bodies) {
      b.x = shrink(b.x * k);
      b.y = shrink(b.y * k);
    }
    for (const list of [o.crates, o.seesaws, o.balances, o.movers, o.gates]) for (let i = 0; i < list.length; i++) list[i] = shrink(list[i]! * k);
    const w = this.world;
    const n = w.bodies.length;
    for (let node = 0; node < w.nodeCount; node++) {
      const base = this.pileBase(node);
      if (base === node) continue;
      const [bx, by] = this.offsetOf(base, n);
      this.setOffset(node, n, bx, by);
    }
  }

  /**
   * What to draw: the predicted world blended between its last two steps (`frac` of a step past
   * the last but one), plus the fading correction offsets.
   */
  frame(frac = 1): PropFrame {
    // Stopped short of the target (waiting for the server): the last state as it is.
    const k = this.tick >= this.target ? frac : 1;
    const out = lerpFrame(this.prev, this.cur, k, this.out);
    const o = this.off;
    out.bodies.forEach((b, i) => {
      b.x += o.bodies[i]?.x ?? 0;
      b.y += o.bodies[i]?.y ?? 0;
    });
    addList(out.crates, o.crates);
    addList(out.movers, o.movers);
    addList(out.seesaws, o.seesaws);
    addList(out.balances, o.balances);
    addList(out.gates, o.gates);
    for (let i = 0; i < out.seesaws.length; i++) out.seesaws[i] = Math.min(1, Math.max(-1, out.seesaws[i]!));
    for (let i = 0; i < out.gates.length; i++) out.gates[i] = Math.min(1, Math.max(0, out.gates[i]!));
    return out;
  }

  /** Where to draw each body (the frame's bodies). */
  boxes(): DrawBox[] {
    return this.frame().bodies;
  }

  /** The current offset of body `i`, cells (tests). */
  offset(i: number): { x: number; y: number } {
    const b = this.off.bodies[i];
    return { x: b?.x ?? 0, y: b?.y ?? 0 };
  }

  /** A new snapshot: reload, replay to where the copy was, and keep what moved as offsets. */
  private reconcile(): void {
    this.dirty = false;
    const base = this.base!;
    const before = copyFrame(this.cur, this.scratch);
    const wasTick = this.tick;
    const wasAttempt = this.world.attempt;
    const had = this.cur.bodies.length > 0 && wasTick > 0;
    this.reset();
    this.run(Math.max(wasTick, base.tick));
    if (had && wasAttempt === this.world.attempt) {
      // Same tick: a true correction (else the snapshot overtook the copy, or the copy stopped
      // earlier before a death: the difference is time too, smoothed all the same).
      if (wasTick === this.tick) {
        const a = before.bodies[this.me];
        const b = this.cur.bodies[this.me];
        if (a && b) this.corrections.push(Math.hypot(a.x - b.x, a.y - b.y));
      }
      this.addCorrection(before, this.cur);
    } else zero(this.off);
  }

  /** The predicted world back at the base. */
  private reset(): void {
    const base = this.base!;
    this.world.load(base.state);
    this.tick = base.tick;
    this.applied = 0;
    this.heldNow = this.heldAtBase;
    this.waiting = false;
    this.others = this.world.bodies.map((_, i) => ({ k: 0, held: (base.held[i] ?? 0) & HELD_BITS }));
    captureFrame(this.world, this.cur);
    copyFrame(this.cur, this.prev);
  }

  /** The server's world is in a death freeze or won: only its next snapshots move it. */
  private get final(): boolean {
    const s = this.base!.state;
    return s.dying > 0 || s.won;
  }

  /** Step to `target`, stopping before a step that only the server may take. */
  private run(target: number): void {
    if (this.final || this.waiting) return;
    const attempt = this.base!.state.attempt;
    let stepped = false;
    while (this.tick < target) {
      if (this.tick === target - 1) captureFrame(this.world, this.prev);
      const from = this.tick;
      this.stepOnce();
      const w = this.world;
      if (w.dying > 0 || w.won || w.attempt !== attempt) {
        // Never shown: back to the step before, until the server says.
        this.stopAt(from);
        return;
      }
      stepped = true;
    }
    if (stepped) captureFrame(this.world, this.cur);
  }

  /** Replay from the base to `tick` (those steps already ran without a death) and wait there. */
  private stopAt(tick: number): void {
    this.reset();
    while (this.tick < tick) {
      if (this.tick === tick - 1) captureFrame(this.world, this.prev);
      this.stepOnce();
    }
    captureFrame(this.world, this.cur);
    this.waiting = true;
  }

  /**
   * One step. This client's inputs are applied the way the server applies them: a change at its
   * tick, or at the first step after it if it is late, and at most one change per step.
   */
  private stepOnce(): void {
    const next = this.tick + 1;
    let mine = this.heldNow;
    const input = this.inputs[this.applied];
    if (input && input[0] <= next) {
      this.applied++;
      this.heldNow = input[1] & HELD_BITS;
      mine = this.heldNow | (input[1] & PRESS_BITS);
    }
    const bits = this.world.bodies.map((_, i) => (i === this.me ? mine : this.otherBits(i, next)));
    this.world.step(bits);
    this.tick = next;
  }

  /** Body i's bits at tick `next`: its held keys, and the changes the server already had for it. */
  private otherBits(i: number, next: number): number {
    const o = this.others[i]!;
    const q = this.base!.pending[i] ?? [];
    const change = q[o.k];
    if (change && change[0] <= next) {
      o.k++;
      o.held = change[1] & HELD_BITS;
      return o.held | (change[1] & PRESS_BITS);
    }
    return o.held;
  }

  /** The bottom of the pile node `node` stands in (itself when it stands on no body or crate). */
  private pileBase(node: number): number {
    const w = this.world;
    let cur = node;
    for (let guard = 0; guard < w.nodeCount; guard++) {
      const s = w.supportOf(cur);
      if (!s || s.kind !== "collider") break;
      const owner = w.colliderById(s.id)?.node ?? -1;
      if (owner < 0 || owner === node) break;
      cur = owner;
    }
    return cur;
  }

  private offsetOf(node: number, n: number): [number, number] {
    if (node < n) return [this.off.bodies[node]?.x ?? 0, this.off.bodies[node]?.y ?? 0];
    const c = 2 * (node - n);
    return [this.off.crates[c] ?? 0, this.off.crates[c + 1] ?? 0];
  }

  private setOffset(node: number, n: number, x: number, y: number): void {
    if (node < n) {
      const b = this.off.bodies[node];
      if (b) {
        b.x = x;
        b.y = y;
      }
    } else {
      const c = 2 * (node - n);
      if (c + 1 < this.off.crates.length) {
        this.off.crates[c] = x;
        this.off.crates[c + 1] = y;
      }
    }
  }

  /** The drawn things stay where they were: what the correction moved goes into the offsets. */
  private addCorrection(before: PropFrame, after: PropFrame): void {
    const o = this.off;
    after.bodies.forEach((b, i) => {
      const a = before.bodies[i];
      const d = o.bodies[i] ?? (o.bodies[i] = { x: 0, y: 0, w: 0, h: 0 });
      if (!a) return;
      d.x += a.x - b.x;
      d.y += a.y - b.y;
      if (Math.abs(d.x) > SNAP_DISTANCE || Math.abs(d.y) > SNAP_DISTANCE) {
        d.x = 0;
        d.y = 0;
      }
    });
    addPairs(o.crates, before.crates, after.crates);
    addPairs(o.movers, before.movers, after.movers);
    addDiff(o.seesaws, before.seesaws, after.seesaws);
    addDiff(o.balances, before.balances, after.balances);
    addDiff(o.gates, before.gates, after.gates);
  }
}

function shrink(v: number): number {
  return Math.abs(v) < 1e-4 ? 0 : v;
}

function zero(f: PropFrame): void {
  for (const b of f.bodies) {
    b.x = 0;
    b.y = 0;
  }
  for (const list of [f.crates, f.seesaws, f.balances, f.movers, f.gates]) list.fill(0);
}

function addList(out: number[], off: readonly number[]): void {
  for (let i = 0; i < out.length; i++) out[i] = out[i]! + (off[i] ?? 0);
}

/** Pairs of coordinates: like the bodies, a pair that moved farther than SNAP_DISTANCE snaps. */
function addPairs(off: number[], before: readonly number[], after: readonly number[]): void {
  addDiff(off, before, after);
  for (let i = 0; i + 1 < off.length; i += 2) {
    if (Math.abs(off[i]!) > SNAP_DISTANCE || Math.abs(off[i + 1]!) > SNAP_DISTANCE) {
      off[i] = 0;
      off[i + 1] = 0;
    }
  }
}

function addDiff(off: number[], before: readonly number[], after: readonly number[]): void {
  if (off.length !== after.length) {
    off.length = after.length;
    off.fill(0);
  }
  for (let i = 0; i < after.length; i++) off[i] = off[i]! + ((before[i] ?? after[i]!) - after[i]!);
}
