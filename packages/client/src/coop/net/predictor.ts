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
 * offset that fades, no faster than MAX_FADE_SPEED. A rider's offset joins its carrier's the same
 * way, so a pile stays together on screen; offsets never stretch a rope link, sink a thing into
 * what it stands on or draw a box into a wall. A correction larger than SNAP_DISTANCE (a restart,
 * a reconnection) is not smoothed.
 *
 * Which own inputs a snapshot already covers comes from the server's ack (its last stamp
 * received from this client), so an input stuck on the way (an upstream stall) is replayed when
 * it can arrive instead of being taken as applied; a hidden tab's coopIdle is replayed too.
 *
 * What cannot be undone is the server's alone: the copy never steps into a death, a restart or
 * the win. It stops just before such a step and waits for the next snapshot (the server may not
 * agree); while the server's own world is in a death freeze or won, the copy is that world.
 */
import { COOP, CoopWorld, HELD_BITS, PRESS_BITS, COOP_HZ, type CoopController, type CoopWorldState } from "@game/shared/coop";
import { captureFrame, copyFrame, lerpFrame, newFrame, type FrameBox, type PropFrame } from "../render/propFrame";

export type DrawBox = FrameBox;

/** Offsets fade by half every this long, seconds... */
const HALF_LIFE = 0.06;
/**
 * ...but a thing's offset shrinks no faster than this, cells per second: a large correction (a
 * friend's jump learnt a round trip late) glides there instead of jumping a cell in two frames.
 */
const MAX_FADE_SPEED = 8;
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

/** One of this client's input changes. */
interface OwnInput {
  /** Its stamp: the tick the server applies it at when it gets there in time. */
  tick: number;
  bits: number;
  /** When it should reach the server, server ticks (from the shortest round trip; -Infinity: at once). */
  arrives: number;
  /** The first tick the replay may apply it at: its stamp, or later if it cannot be there by then. */
  at: number;
  /** Not an input sent: the server forgetting this player's keys and queue there (coopIdle). */
  forget?: boolean;
}

/** A forget is kept this long after it should have reached the server, ticks (jitter). */
const FORGET_KEEP = 12;

export class CoopPredictor {
  /** Tick of the predicted world (0 before the first snapshot). */
  tick = 0;
  /**
   * The size of this client's own correction at each snapshot, cells, while `record` is on (for
   * tests and the bench; the screen leaves it off, or the list would grow for the whole level).
   */
  readonly corrections: number[] = [];
  record = false;
  /** The copy stopped before a step only the server decides (a death, a restart, the win). */
  waiting = false;
  private base: Base | null = null;
  private dirty = false;
  /** This client's input changes the server had not applied at the base tick, in sending order. */
  private inputs: OwnInput[] = [];
  /** This client's held bits at the base tick, as the server applies them. */
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
  /** Scratch for fade: each node's pile base, and each rider's offset minus its base's (x, y). */
  private bases: number[] = [];
  private diffs: number[] = [];

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
   * The authoritative world at `tick`, with every seat's held bits at that tick, the input changes
   * the server already holds for later ticks (the others' are replayed exactly) and, when the
   * server says it, each seat's last stamp it received (`ack`).
   */
  onSnapshot(
    tick: number,
    state: CoopWorldState,
    held: readonly number[],
    pending: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [],
    ack?: readonly number[],
  ): void {
    if (this.base && tick <= this.base.tick) return;
    this.base = { tick, state, held: held.slice(), pending: pending.map((q) => q.map(([t, b]) => [t, b] as [number, number])) };
    this.dirty = true;
    // Which own inputs the server had applied by `tick`: those it received (stamped up to its ack;
    // without one, those that had time to get there) and no longer holds. They are a prefix of
    // the inputs (TCP keeps them in order, the server applies its queue in order).
    const queued = new Set((pending[this.me] ?? []).map(([t]) => t));
    const acked = ack?.[this.me];
    const received = (input: OwnInput) => queued.has(input.tick) || (acked !== undefined ? input.tick <= acked : input.arrives <= tick + 1);
    let lastHeld: number | null = null;
    let k = 0;
    for (; k < this.inputs.length; k++) {
      const input = this.inputs[k]!;
      // A forget is done once it surely got there, or once the server received an input sent after it.
      const applied = input.forget
        ? tick >= input.at + FORGET_KEEP || this.inputs.some((later, j) => j > k && !later.forget && acked !== undefined && later.tick <= acked)
        : received(input) && !queued.has(input.tick) && input.tick <= tick;
      if (!applied) break;
      if (!input.forget) lastHeld = input.bits & HELD_BITS;
    }
    this.inputs.splice(0, k);
    // The others: those the server holds apply from their stamp (one per step from the next tick
    // if it is past, as the server does); those still on the way, when they can get there.
    for (const input of this.inputs) {
      if (input.forget) continue;
      input.at = received(input) ? input.tick : Math.max(input.tick, Math.ceil(input.arrives), tick + 1);
    }
    // The server's word on the keys held when it gives its ack (it also knows when it forgot them:
    // a hidden tab, a silent player); else what the inputs it applied leave.
    if (acked !== undefined) this.heldAtBase = (held[this.me] ?? 0) & HELD_BITS;
    else if (lastHeld !== null) this.heldAtBase = lastHeld;
  }

  /**
   * This client sent `bits` for `tick` (stamped with the predicted tick), in sending order;
   * `arrives` is when it should reach the server, server ticks (default: at once).
   */
  addInput(tick: number, bits: number, arrives = -Infinity): void {
    const at = Math.max(tick, Math.ceil(arrives));
    this.inputs.push({ tick, bits, arrives, at });
    // Already simulated past it (the server's clock ran ahead): the next advance replays it.
    if (at <= this.tick && this.base) this.dirty = true;
    if (this.inputs.length > MAX_INPUTS) {
      const drop = this.inputs.length - MAX_INPUTS;
      this.inputs.splice(0, drop);
      this.applied = Math.max(0, this.applied - drop);
    }
  }

  /**
   * The tab was hidden: the server forgets this player's queue and held keys when the coopIdle
   * reaches it (`arrives`, server ticks). Inputs that would apply later never will; the keys are
   * none from then on (the window lost the focus, so none is held when it comes back).
   */
  forgetOwnInputs(arrives: number): void {
    const at = Math.max(this.base ? this.base.tick + 1 : 1, Math.ceil(arrives));
    this.inputs = this.inputs.filter((input) => input.at < at);
    this.inputs.push({ tick: at, bits: 0, arrives, at, forget: true });
    this.applied = Math.min(this.applied, this.inputs.length - 1);
    if (this.base) this.dirty = true;
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

  /**
   * Draw the latest snapshot as it is: the copy back at it, no offset (the server's world waits for
   * a dropped player, so there is nothing to predict). A later advanceTo replays from there.
   */
  showBase(): void {
    if (!this.base) return;
    this.dirty = false;
    this.reset();
    this.target = this.base.tick;
    zero(this.off);
  }

  /**
   * Fade the drawing offsets by `dt` seconds. A rider keeps its offset relative to the bottom of
   * its pile, and that difference fades the same way, so a pile comes together on screen without
   * a jump. Then what the offsets may not do: stretch a rope link past what it is in the world,
   * draw a thing standing on its support lower than it, or draw a box into a solid cell.
   */
  fade(dt: number): void {
    const k = Math.pow(0.5, dt / HALF_LIFE);
    const step = MAX_FADE_SPEED * dt;
    const o = this.off;
    const w = this.world;
    const n = w.bodies.length;
    const bases = this.bases;
    bases.length = w.nodeCount;
    const diffs = this.diffs;
    for (let node = 0; node < w.nodeCount; node++) {
      const base = (bases[node] = this.pileBase(node));
      if (base === node) continue;
      const [bx, by] = this.offsetOf(base, n);
      const [rx, ry] = this.offsetOf(node, n);
      diffs[2 * node] = rx - bx;
      diffs[2 * node + 1] = ry - by;
    }
    for (const b of o.bodies) fadeVec(b, k, step);
    fadePairs(o.crates, k, step);
    fadePairs(o.movers, k, step);
    for (const list of [o.seesaws, o.balances, o.gates]) for (let i = 0; i < list.length; i++) list[i] = shrink(list[i]! * k);
    this.holdLinks();
    for (let node = 0; node < w.nodeCount; node++) if (bases[node] === node) this.clampToTerrain(node, n, true);
    const v = { x: 0, y: 0 };
    for (let node = 0; node < w.nodeCount; node++) {
      const base = bases[node]!;
      if (base === node) continue;
      v.x = diffs[2 * node]!;
      // Never drawn sunk into what carries it.
      v.y = Math.min(0, diffs[2 * node + 1]!);
      fadeVec(v, k, step);
      const [bx, by] = this.offsetOf(base, n);
      this.setOffset(node, n, bx + v.x, by + v.y);
      this.clampToTerrain(node, n, false);
    }
    this.holdRiderLinks(bases, n);
  }

  /** How long link k is drawn when both ends' offsets are scaled by `s`, along its path (its wrap points stay put). */
  private drawnLink(k: number, s: number): number {
    const w = this.world;
    const a = w.bodies[w.chain[k]!]!;
    const b = w.bodies[w.chain[k + 1]!]!;
    const oa = this.off.bodies[w.chain[k]!]!;
    const ob = this.off.bodies[w.chain[k + 1]!]!;
    const ax = a.cx + s * oa.x;
    const ay = a.cy + s * oa.y;
    const bx = b.cx + s * ob.x;
    const by = b.cy + s * ob.y;
    const p = w.rope[k]?.points ?? [];
    if (p.length === 0) return Math.hypot(bx - ax, by - ay);
    let len = Math.hypot(p[0]! - ax, p[1]! - ay) + Math.hypot(bx - p[p.length - 2]!, by - p[p.length - 1]!);
    for (let i = 2; i < p.length; i += 2) len += Math.hypot(p[i]! - p[i - 2]!, p[i + 1]! - p[i - 1]!);
    return len;
  }

  /**
   * A rider takes its carrier's offset after the links are held, which can pull a link of the
   * rider's longer than the world has it: then both ends' whole piles (bases and riders, crates
   * included) shrink their offsets by a common share until the link fits. A common share keeps
   * every rider on its carrier as drawn (it shrinks their difference too).
   */
  private holdRiderLinks(bases: readonly number[], n: number): void {
    const w = this.world;
    for (let k = 0; k + 1 < w.chain.length; k++) {
      const ia = w.chain[k]!;
      const ib = w.chain[k + 1]!;
      if (bases[ia] === ia && bases[ib] === ib) continue;
      if (!this.off.bodies[ia] || !this.off.bodies[ib]) continue;
      const room = Math.max(w.rope[k]?.length ?? 0, COOP.ropeLength);
      if (this.drawnLink(k, 1) <= room) continue;
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (this.drawnLink(k, mid) <= room) lo = mid;
        else hi = mid;
      }
      for (let node = 0; node < w.nodeCount; node++) {
        if (bases[node] !== bases[ia] && bases[node] !== bases[ib]) continue;
        const [x, y] = this.offsetOf(node, n);
        this.setOffset(node, n, x * lo, y * lo);
      }
    }
  }

  /** A rope link is drawn between the drawn bodies: their offsets never make it longer than it is in the world (or than the rope, slack). */
  private holdLinks(): void {
    const w = this.world;
    const chain = w.chain;
    const o = this.off.bodies;
    for (let k = 0; k + 1 < chain.length; k++) {
      const a = w.bodies[chain[k]!]!;
      const b = w.bodies[chain[k + 1]!]!;
      const oa = o[chain[k]!];
      const ob = o[chain[k + 1]!];
      if (!oa || !ob) continue;
      const points = w.rope[k]?.points ?? [];
      if (points.length > 0) {
        this.holdWrapped(a, b, oa, ob, points, w.rope[k]!.length);
        continue;
      }
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const ex = oa.x - ob.x;
      const ey = oa.y - ob.y;
      const room = Math.max(Math.hypot(dx, dy), COOP.ropeLength);
      if (Math.hypot(dx + ex, dy + ey) <= room) continue;
      // The share t of their difference that keeps the link at `room`: |d + t e| = room.
      const ee = ex * ex + ey * ey;
      const de = dx * ex + dy * ey;
      const t = Math.max(0, (-de + Math.sqrt(Math.max(0, de * de - ee * (dx * dx + dy * dy - room * room)))) / ee);
      const mx = (oa.x + ob.x) / 2;
      const my = (oa.y + ob.y) / 2;
      oa.x = mx + (t * ex) / 2;
      oa.y = my + (t * ey) / 2;
      ob.x = mx - (t * ex) / 2;
      ob.y = my - (t * ey) / 2;
    }
  }

  /**
   * A link wrapped around terrain corners is drawn through them: the drawn path (each drawn end to
   * its corner, plus the corners' part) is never longer than in the world (or than the rope's rest
   * length, slack). A shift of both ends together changes it too, so both offsets shrink by a common
   * share until it fits.
   */
  private holdWrapped(a: CoopController, b: CoopController, oa: { x: number; y: number }, ob: { x: number; y: number }, points: readonly number[], worldLength: number): void {
    const room = Math.max(worldLength, COOP.ropeLength);
    const last = points.length - 2;
    let interior = 0;
    for (let i = 2; i < points.length; i += 2) interior += Math.hypot(points[i]! - points[i - 2]!, points[i + 1]! - points[i - 1]!);
    const drawn = (s: number) =>
      Math.hypot(a.cx + s * oa.x - points[0]!, a.cy + s * oa.y - points[1]!) + interior + Math.hypot(b.cx + s * ob.x - points[last]!, b.cy + s * ob.y - points[last + 1]!);
    if (drawn(1) <= room) return;
    // The drawn length is convex in the share and fits at 0 (the world's own path): bisect.
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (drawn(mid) <= room) lo = mid;
      else hi = mid;
    }
    oa.x *= lo;
    oa.y *= lo;
    ob.x *= lo;
    ob.y *= lo;
  }

  /**
   * A pile's base standing on something is never drawn lower than it (`base`; a rider is kept off
   * its carrier by its own offset), and no box is drawn into a solid cell: the offset gives up
   * what goes in of its vertical part, else of its horizontal part, else all of it.
   */
  private clampToTerrain(node: number, n: number, base: boolean): void {
    let [ox, oy] = this.offsetOf(node, n);
    if (ox === 0 && oy === 0) return;
    const w = this.world;
    if (base && oy > 0 && w.supportOf(node)) oy = 0;
    let x: number, y: number, bw: number, bh: number;
    if (node < n) {
      const b = w.bodies[node]!;
      [x, y, bw, bh] = [b.x, b.y, b.width, b.height];
    } else {
      const c = w.crates[node - n]!;
      [x, y, bw, bh] = [c.x, c.y, c.collider.w, c.collider.h];
    }
    const hits = (dx: number, dy: number) => boxInTerrain(w, x + dx, y + dy, bw, bh);
    if (hits(ox, oy)) {
      // Keep as much of the offset as fits (up to the cell's face), so the box stops there.
      if (!hits(ox, 0)) oy *= fits((f) => !hits(ox, f * oy));
      else if (!hits(0, oy)) ox *= fits((f) => !hits(f * ox, oy));
      else ox = oy = 0;
    }
    this.setOffset(node, n, ox, oy);
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
        if (a && b && this.record) this.corrections.push(Math.hypot(a.x - b.x, a.y - b.y));
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
    if (input && input.at <= next) {
      this.applied++;
      this.heldNow = input.bits & HELD_BITS;
      mine = this.heldNow | (input.bits & PRESS_BITS);
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

/** An offset fades by `k`, shrinking by at most `step` cells. */
function fadeVec(v: { x: number; y: number }, k: number, step: number): void {
  const len = Math.hypot(v.x, v.y);
  const left = Math.max(len * k, len - step);
  const s = len < 1e-4 || left < 1e-4 ? 0 : left / len;
  v.x *= s;
  v.y *= s;
}

function fadePairs(list: number[], k: number, step: number): void {
  const v = { x: 0, y: 0 };
  for (let i = 0; i + 1 < list.length; i += 2) {
    v.x = list[i]!;
    v.y = list[i + 1]!;
    fadeVec(v, k, step);
    list[i] = v.x;
    list[i + 1] = v.y;
  }
}

/** The largest share in [0, 1] that is `ok` (ok(0) holds), to a sixty-fourth. */
function fits(ok: (f: number) => boolean): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 6; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Whether a box overlaps a solid cell of the level (a hair of overlap is contact, not overlap). */
function boxInTerrain(w: CoopWorld, x: number, y: number, bw: number, bh: number): boolean {
  const e = 1e-3;
  for (let cy = Math.floor(y + e); cy <= Math.floor(y + bh - e); cy++) for (let cx = Math.floor(x + e); cx <= Math.floor(x + bw - e); cx++) if (w.solidCell(cx, cy)) return true;
  return false;
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
