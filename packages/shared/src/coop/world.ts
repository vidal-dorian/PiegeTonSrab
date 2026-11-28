/**
 * The co-op world: every player's body, the rope between them and the level with its things
 * (props.ts), advanced in fixed steps from everyone's inputs. The same class runs on the server
 * (the referee: deaths, victory, titles), on every client (display, prediction), in the dev tool
 * and in the test bots.
 *
 * One step, in this order:
 * 1. Somebody inside the door who presses ↓ comes out.
 * 2. Platforms, seesaws and balances move (props.moveKinematic).
 * 3. Bodies and crates ("nodes") move bottom-up (whoever stands on someone moves after them):
 *    each is first carried by what it stands on, then takes its own step.
 * 4. The rope wraps the terrain corners the bodies swept and pulls the chain back together
 *    (rope.ts); a hauled body climbs over a lip; Ruben slides off any friend he landed on; the rope
 *    wraps what those moves swept.
 * 5. Weights are measured; a hard landing on a seesaw fires it; plates, gates, the key, the door,
 *    terminals... react (props.interact).
 * 6. Deaths: a body in a hazard or below the level freezes the world for a moment, then the whole
 *    level restarts for everyone. Everybody inside the door: the level is won.
 *
 * Determinism: no Math.sin/cos/random/Date in here, arrays in a fixed order (body index = place
 * in the chain), so the same inputs give the same bits on every machine (see detMath.ts).
 *
 * The referee's bookkeeping (who caused which death, the end-of-level titles) is not part of the
 * saved state: only the server's world, which never loads a snapshot, keeps it meaningfully.
 */
import { isSolidCell } from "../level";
import { HAZARD_INSET } from "../movement/tuning";
import { boxHitsHazard, hazardsOf } from "../objects";
import { boxesOverlap, EPS, OBJECT_COLLIDER_BASE, spansOverlap, type BoxCollider, type CoopSpace, type Support } from "./colliders";
import { CoopController, MANTLE_REACH, MANTLE_WRAP_REACH, type CoopBodyState } from "./coopController";
import { COOP, COOP_DT, COOP_MOVEMENT, DEATH_FREEZE_STEPS, RESTART_HOLD_STEPS } from "./coopTuning";
import { Fnv32 } from "./detMath";
import { decodeInput, type CoopInput } from "./inputBits";
import type { CoopLevel } from "./levelFormat";
import { CoopProps, crateLaunchSpeed, sweepY, type CoopCrate, type PropEvent, type PropsHost } from "./props";
import { measureRope, placeWraps, solveRope, sweepRope, type RopeHost, type RopeLinkState, type RopeWraps } from "./rope";

export interface CoopPlayer {
  /** Shown above the body. */
  name: string;
  isRuben: boolean;
}

export type DeathCause = "fall" | "hazard" | "deadline";

/** Why a death is someone's fault: they took the floor away, pulled the rope, let go of a plate, fired the seesaw. */
export type BlameWhy = "self" | "ground" | "rope" | "plate" | "switch" | "catapult";

export type CoopEvent =
  | {
      kind: "death";
      victim: number;
      cause: DeathCause;
      x: number;
      y: number;
      /** Who caused it (the victim itself when it was its own fault). */
      blame: number;
      why: BlameWhy;
      /** The victim carried the key. */
      withKey: boolean;
    }
  /** The level restarts: after a death (by -1), or R held by enough players (by: the first holder). */
  | { kind: "restart"; attempt: number; by: number }
  | { kind: "squash"; body: number; by: number }
  | { kind: "win" }
  | PropEvent;

export interface CoopWorldState {
  tick: number;
  /** Steps since the current attempt started. */
  levelTick: number;
  attempt: number;
  dying: number;
  victim: number;
  won: boolean;
  bodies: CoopBodyState[];
  /** Friends Ruben was overlapping at the end of the step (to report a squash only once). */
  squashing: boolean[];
  /** Bodies inside the door. */
  inside: boolean[];
  /** The props' state (props.ts save/load). */
  props: number[];
  /** Steps R has been held by enough players (restart at RESTART_HOLD_STEPS). */
  restartHeld: number;
  /** Each link's wrap points around the terrain (rope.ts RopeWraps), in chain order. */
  ropeWraps: number[][];
}

/** What the referee counts for the end-of-level titles, per body, over every attempt. */
export interface CoopStats {
  /** Deaths of others this body caused. */
  caused: number[];
  /** Deaths that were this body's own fault. */
  own: number[];
  /** Friends caught on the rope (they hung from this body and got back on their feet). */
  catches: number[];
  /** Seconds with someone standing on this body's head. */
  carried: number[];
  /** Seconds hanging from the rope. */
  hung: number[];
  /** Seconds standing on plates. */
  plates: number[];
  /** Died carrying the key. */
  kamikaze: number[];
  /** Who opened the door in the winning attempt (-1 none), who entered it first. */
  opener: number;
  firstIn: number;
}

const NO_INPUT_BITS = 0;
const NO_COLLIDERS: readonly BoxCollider[] = [];
/** A death is blamed on whoever took the floor away up to this long before, seconds. */
const GROUND_BLAME_S = 1.5;
/** ... or on whoever pulled the victim by the rope (at least ROPE_BLAME_CELLS) up to this long before. */
const ROPE_BLAME_S = 1;
const ROPE_BLAME_CELLS = 0.3;
/**
 * A body hauled against a wall climbs over the lip unless the rope pulls it down more steeply than
 * this (drop per cell across, about 27°) and by more than COOP.hangHeight.
 */
const MANTLE_MAX_DROP = 0.5;
/** Hanging at least this long, then standing again, counts as a catch for the anchor, seconds. */
const CATCH_MIN_S = 0.4;
/** On a non-slip floor's end, an idle anchor's slide stops with this much of its feet still on it, cells. */
const GRIP_FOOTING = 0.1;

export class CoopWorld implements CoopSpace, RopeHost, PropsHost {
  readonly bodies: CoopController[] = [];
  readonly props: CoopProps;
  /** Rope links after the last step. */
  readonly rope: RopeLinkState[] = [];
  /** Body indices in rope order (index order: friends in seat order, Ruben last). */
  readonly chain: number[] = [];
  /** Each link's wrap points around the terrain corners (history: saved with the world). */
  ropeWraps: RopeWraps[] = [];
  /** Steps since the level started (all attempts included). */
  tick = 0;
  /** Steps since the current attempt started (the platforms' clock). */
  levelTick = 0;
  /** 1 for the first try; each death or restart adds one. */
  attempt = 1;
  /** Steps left of the death freeze; 0 while playing. */
  dying = 0;
  /** Who died, during the freeze; -1 otherwise. */
  victim = -1;
  /** Everybody went through the door: the world stops. */
  won = false;
  /** Steps R has been held by enough players; the level restarts at RESTART_HOLD_STEPS. */
  restartHeld = 0;
  /** Bodies inside the door: fixed points of the rope, out of the game until they come out. */
  inside: boolean[] = [];
  /** What happened during the last step (deaths, squashes, the key...), for effects and the referee. */
  events: CoopEvent[] = [];
  readonly stats: CoopStats;

  /** One solid box per body, kept in step with the bodies, then the props' colliders. */
  readonly colliders: BoxCollider[] = [];
  private inputs: CoopInput[] = [];
  private pendingRestart = false;
  private squashing: boolean[] = [];
  /** Nodes (bodies, then crates) in bottom-up order. */
  private order: number[] = [];
  /** Each body's y before its own step, this step (the haul speed counts every rise from there). */
  private startY: number[] = [];
  /** ... and its x (the rope never moves a friend back past it: bodies never push each other). */
  private startX: number[] = [];
  /** ... and its x when the step began, before its support carried it. */
  private beginX: number[] = [];
  /** Body centres when the step began, then before the rope's solve: where the rope's wraps sweep from. */
  private ropeX: number[] = [];
  private ropeY: number[] = [];
  /** Weight of each node (with what it carries), and what stands on each collider (by index). */
  private weights: number[] = [];
  private loads: number[] = [];
  /** Loads counting only what stands (no hanging friends), for the plates that ask for it. */
  private standingLoads: number[] = [];
  private standers: number[][] = [];
  // Referee bookkeeping (not saved).
  private groundLost: Array<{ by: number; why: BlameWhy; tick: number } | null> = [];
  private ropePull: Array<{ by: number; tick: number; total: number } | null> = [];
  private launchedBy: Array<{ by: number; tick: number } | null> = [];
  private prevSupport: Array<Support | null> = [];
  private hangSince: number[] = [];
  /** Who each body hangs from after the last step (-1: not hanging), and the last one it hung from. */
  private holder: number[] = [];
  private lastHolder: number[] = [];
  private lastSwitchBy = -1;
  private lastCrackBy = -1;

  constructor(
    readonly level: CoopLevel,
    readonly players: readonly CoopPlayer[],
  ) {
    const n = players.length;
    if (n < 1 || n > COOP.maxPlayers) throw new Error(`co-op world needs 1 to ${COOP.maxPlayers} players`);
    players.forEach((p, i) => {
      const b = new CoopController(level.collision, COOP_MOVEMENT);
      b.index = i;
      b.isRuben = p.isRuben;
      b.space = this;
      this.bodies.push(b);
      this.chain.push(i);
      this.colliders.push({ id: i, x: 0, y: 0, w: b.width, h: b.height, mode: "solid", dx: 0, dy: 0, body: i, node: i, off: false });
      this.squashing.push(false);
      this.inside.push(false);
    });
    for (let k = 0; k + 1 < n; k++) this.ropeWraps.push([]);
    this.props = new CoopProps(level, n);
    this.colliders.push(...this.props.colliders);
    const zeros = () => new Array<number>(n).fill(0);
    this.stats = { caused: zeros(), own: zeros(), catches: zeros(), carried: zeros(), hung: zeros(), plates: zeros(), kamikaze: zeros(), opener: -1, firstIn: -1 };
    this.groundLost = new Array(n).fill(null);
    this.ropePull = new Array(n).fill(null);
    this.launchedBy = new Array(n).fill(null);
    this.prevSupport = new Array(n).fill(null);
    this.hangSince = new Array<number>(n).fill(-1);
    this.holder = new Array<number>(n).fill(-1);
    this.spawnAll();
  }

  get crates(): readonly CoopCrate[] {
    return this.props.crates;
  }

  /** Bodies and crates. */
  get nodeCount(): number {
    return this.bodies.length + this.props.crates.length;
  }

  // --- CoopSpace -----------------------------------------------------------------------

  ridesOn(rider: number, base: number): boolean {
    let cur = rider;
    for (let guard = 0; guard <= this.nodeCount; guard++) {
      const s = this.supportOf(cur);
      if (!s || s.kind !== "collider") return false;
      const owner = this.colliderById(s.id)?.node ?? -1;
      if (owner < 0) return false;
      if (owner === base) return true;
      cur = owner;
    }
    return false;
  }

  canStandOn(lander: number, _body: number): boolean {
    // Nobody can carry Ruben: he lives at the gym.
    return !this.bodies[lander]!.isRuben;
  }

  hasRiderNow(i: number): boolean {
    for (let node = 0; node < this.nodeCount; node++) {
      if (node === i) continue;
      const s = this.supportOf(node);
      if (s && s.kind === "collider" && s.id === i) return true;
    }
    return false;
  }

  // --- RopeHost ---------------------------------------------------------------------------

  isFixed(i: number): boolean {
    return this.inside[i] === true;
  }

  inputDir(i: number): number {
    const inp = this.inputs[i];
    if (!inp || this.inside[i]) return 0;
    return (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  }

  stepStartY(i: number): number {
    return this.startY[i] ?? this.bodies[i]!.y;
  }

  stepStartX(i: number): number {
    return this.startX[i] ?? this.bodies[i]!.x;
  }

  stepBeginX(i: number): number {
    return this.beginX[i] ?? this.bodies[i]!.x;
  }

  pileBase(i: number): number {
    let base = i;
    for (let guard = 0; guard < this.bodies.length; guard++) {
      const s = this.supportOf(base);
      if (!s || s.kind !== "collider" || s.body < 0) break;
      base = s.body;
    }
    return base;
  }

  solidCell(cx: number, cy: number): boolean {
    return isSolidCell(this.level.collision, cx, cy);
  }

  ropeSolid(cx: number, cy: number): boolean {
    // All the fixed scenery: terrain plus the static solid race objects ("=" placed blocks,
    // springs), i.e. the bodies' own grid. The co-op things (gates, crates, shelves, platforms,
    // fragile floors) are colliders, not in this grid: the rope goes through them.
    return isSolidCell(this.level.collision, cx, cy);
  }

  slideRoom(i: number, dx: number): number {
    const grip = this.level.grip;
    if (grip.size === 0 || dx === 0) return dx;
    const b = this.bodies[i]!;
    if (!b.grounded || b.support?.kind !== "terrain") return dx;
    const w = this.level.width;
    const row = Math.round(b.y + b.height);
    const side = dx > 0 ? 1 : -1;
    // The floor cell furthest towards the slide under its feet: is it a non-slip floor's end?
    const lead = Math.floor(side > 0 ? b.x + b.width - 1e-6 : b.x);
    const tail = Math.floor(side > 0 ? b.x : b.x + b.width - 1e-6);
    let end = -1;
    for (let cx = lead; cx !== tail - side; cx -= side) {
      if (this.solidCell(cx, row)) {
        end = cx;
        break;
      }
    }
    if (end < 0 || end >= w || !grip.has(row * w + end) || this.solidCell(end + side, row)) return dx;
    // It slides on until only GRIP_FOOTING of its feet are left on that end, never further.
    const limit = (side > 0 ? end + 1 : end) + side * (b.width / 2 - GRIP_FOOTING);
    const room = Math.max(0, (limit - b.cx) * side);
    return side * Math.min(Math.abs(dx), room);
  }

  moveStack(i: number, dx: number, dy: number): { dx: number; dy: number } {
    // The base never rises further than its riders can follow (CoopController.moveY asks riderRoom),
    // so moving the base first, then whoever stands on it by what it achieved, never overlaps them.
    const got = this.bodies[i]!.moveBy(dx, dy);
    this.syncCollider(i);
    if (got.dx === 0 && got.dy === 0) return got;
    const n = this.bodies.length;
    for (const j of this.order) {
      if (j === i || !this.ridesOn(j, i)) continue;
      if (j < n) {
        this.bodies[j]!.moveBy(got.dx, got.dy);
        this.syncCollider(j);
      } else {
        this.props.moveCrate(this, this.props.crates[j - n]!, got.dx, got.dy);
      }
    }
    return got;
  }

  riderRoom(base: number, want: number): number {
    return this.pileRoomAbove(base, want, 0);
  }

  liftRoom(id: number, want: number): number {
    const lift = this.colliderById(id);
    if (!lift || lift.off) return want;
    let room = want;
    // Bodies (out of the door) and crates: the colliders that belong to a node.
    for (const c of this.colliders) {
      if (room <= 0) break;
      if (c.node < 0 || c.off) continue;
      const s = this.supportOf(c.node);
      if (s && s.kind === "collider" && s.id === id) {
        // It stands on the lift: the lift rises only as far as it (and its pile) can follow.
        room = Math.min(room, this.nodeRoom(c.node, room, 1));
        continue;
      }
      // Anything else just above it (landing on it, or just thrown off it): the lift stops under it.
      if (!spansOverlap(c.x, c.w, lift.x, lift.w) || boxesOverlap(c.x, c.y, c.w, c.h, lift)) continue;
      const gap = lift.y - (c.y + c.h);
      if (gap < -EPS || gap >= room) continue;
      room = Math.max(0, gap);
    }
    return Math.max(0, room);
  }

  /** How far everything standing directly or not on `base` can rise, at most `want`. */
  private pileRoomAbove(base: number, want: number, depth: number): number {
    let room = want;
    if (depth > this.nodeCount) return room;
    for (let node = 0; node < this.nodeCount && room > 0; node++) {
      if (node === base) continue;
      const s = this.supportOf(node);
      if (!s || s.kind !== "collider" || this.colliderById(s.id)?.node !== base) continue;
      room = Math.min(room, this.nodeRoom(node, room, depth + 1));
    }
    return Math.max(0, room);
  }

  /** How far node (a body or a crate) can rise with its pile, at most `want`: terrain, then solid things above. */
  private nodeRoom(node: number, want: number, depth: number): number {
    const n = this.bodies.length;
    const body = node < n ? this.bodies[node]! : null;
    const crate = body ? null : this.props.crates[node - n]!;
    const x = body ? body.x : crate!.x;
    const y = body ? body.y : crate!.y;
    const w = body ? body.width : crate!.w;
    const h = body ? body.height : crate!.h;
    let room = -sweepY(body ? this.level.collision : this.level.crateGrid, NO_COLLIDERS, -1, x, y, w, h, -want, -1);
    for (const c of this.colliders) {
      if (c.off || c.mode !== "solid" || c.node === node) continue;
      if (!spansOverlap(x, w, c.x, c.w) || boxesOverlap(x, y, w, h, c)) continue;
      const gap = y - (c.y + c.h);
      if (gap < -EPS || gap >= room) continue;
      if (c.node >= 0 && this.ridesOn(c.node, node)) continue;
      room = Math.max(0, gap);
    }
    return this.pileRoomAbove(node, room, depth);
  }

  onPull(i: number, by: number, dx: number, dy: number): void {
    // Holding a friend up is not pulling them into danger: only sideways or downward pulls count.
    const d = Math.sqrt(dx * dx + dy * dy);
    if (dy < 0.3 * d && Math.abs(dx) < 0.7 * d) return;
    const p = this.ropePull[i];
    if (p && p.by === by && this.tick - p.tick <= ROPE_BLAME_S / COOP_DT) {
      p.total += d;
      p.tick = this.tick;
    } else this.ropePull[i] = { by, tick: this.tick, total: d };
  }

  // --- PropsHost -----------------------------------------------------------------------------

  isInside(i: number): boolean {
    return this.inside[i] === true;
  }

  loadOn(id: number): number {
    return this.loads[this.colliderIndex(id)] ?? 0;
  }

  standingLoadOn(id: number): number {
    return this.standingLoads[this.colliderIndex(id)] ?? 0;
  }

  downPressed(i: number): boolean {
    return this.inputs[i]?.downPressed === true;
  }

  isGrounded(i: number): boolean {
    return this.bodies[i]!.grounded;
  }

  standersOn(id: number): number[] {
    return this.standers[this.colliderIndex(id)] ?? [];
  }

  launchNode(node: number, height: number, by: number): void {
    const n = this.bodies.length;
    if (node < n) {
      const b = this.bodies[node]!;
      b.launch(height, false);
      b.support = null;
      b.grounded = false;
      if (by >= 0 && by < n && by !== node) this.launchedBy[node] = { by, tick: this.tick };
    } else {
      const c = this.props.crates[node - n]!;
      c.vy = -crateLaunchSpeed(height);
      c.support = null;
    }
  }

  weightOf(node: number): number {
    return this.weights[node] ?? 0;
  }

  emit(e: PropEvent): void {
    this.events.push(e);
  }

  // --- Lifecycle -----------------------------------------------------------------------------

  /** Everyone back on the spawn cells, standing still; every prop as at the start. */
  spawnAll(): void {
    this.levelTick = 0;
    this.won = false;
    this.restartHeld = 0;
    this.props.reset();
    this.bodies.forEach((b, i) => {
      this.inside[i] = false;
      this.colliders[i]!.off = false;
      const s = this.level.spawns[i]!;
      b.placeInCell(s.x, s.y);
      this.syncCollider(i);
      const c = this.colliders[i]!;
      c.dx = 0;
      c.dy = 0;
      this.squashing[i] = false;
      this.groundLost[i] = null;
      this.ropePull[i] = null;
      this.launchedBy[i] = null;
      this.prevSupport[i] = null;
      this.hangSince[i] = -1;
      this.holder[i] = -1;
      this.lastHolder[i] = -1;
    });
    this.stats.opener = -1;
    this.stats.firstIn = -1;
    for (const w of this.ropeWraps) w.length = 0;
    measureRope(this.bodies, this.chain, this.ropeWraps, this.rope);
    this.order = this.bottomUp();
    for (const b of this.bodies) b.refreshContacts();
    for (const c of this.props.crates) c.support = this.props.crateSupport(this.level.crateGrid, this.colliders, c);
    this.computeLoads();
  }

  /** Put body i standing still with its top-left at (x, y) (tests, dev tools). */
  placeBody(i: number, x: number, y: number): void {
    const b = this.bodies[i]!;
    b.x = x;
    b.y = y;
    b.vx = 0;
    b.vy = 0;
    this.syncCollider(i);
    for (const o of this.bodies) o.refreshContacts();
    this.placeLinksOf(i);
    this.order = this.bottomUp();
    this.computeLoads();
  }

  /** Body i was put somewhere out of the blue: its links wrap the terrain as a rope put there would (no history). */
  private placeLinksOf(i: number): void {
    const k = this.chain.indexOf(i);
    for (const link of [k - 1, k]) {
      if (link < 0 || link + 1 >= this.chain.length) continue;
      const a = this.bodies[this.chain[link]!]!;
      const b = this.bodies[this.chain[link + 1]!]!;
      placeWraps(this, a.cx, a.cy, b.cx, b.cy, this.ropeWraps[link]!);
    }
    measureRope(this.bodies, this.chain, this.ropeWraps, this.rope);
  }

  /** Remember the body centres the rope's wraps will sweep from. */
  private markRope(): void {
    this.bodies.forEach((b, i) => {
      this.ropeX[i] = b.cx;
      this.ropeY[i] = b.cy;
    });
  }

  /** The level restarts for everyone (after a death: by -1; or R held by the team: the first holder). */
  restart(by = -1): void {
    this.attempt++;
    this.dying = 0;
    this.victim = -1;
    this.spawnAll();
    this.events.push({ kind: "restart", attempt: this.attempt, by });
  }

  /** The next step restarts the level instead of moving anyone (dev tools). */
  requestRestart(): void {
    this.pendingRestart = true;
  }

  /** Advance one step. `inputs[i]` is body i's input bits (inputBits.ts); missing means no input. */
  step(inputs: readonly number[]): void {
    this.events = [];
    this.tick++;
    if (this.won) return;
    const n = this.bodies.length;
    this.inputs = this.bodies.map((_, i) => decodeInput(inputs[i] ?? NO_INPUT_BITS));
    if (this.pendingRestart) {
      this.pendingRestart = false;
      this.restart();
      return;
    }
    if (this.dying > 0) {
      this.dying--;
      if (this.dying === 0) this.restart();
      return;
    }
    // R held long enough by one player (from 3 players: half the team) restarts the level.
    let holders = 0;
    let firstHolder = -1;
    this.inputs.forEach((inp, i) => {
      if (!inp.restart) return;
      holders++;
      if (firstHolder < 0) firstHolder = i;
    });
    this.restartHeld = holders >= (n >= 3 ? Math.ceil(n / 2) : 1) ? this.restartHeld + 1 : 0;
    if (this.restartHeld >= RESTART_HOLD_STEPS) {
      this.restart(firstHolder);
      return;
    }
    this.levelTick++;

    // ↓ inside the door: come back out.
    for (let i = 0; i < n; i++) {
      if (this.inside[i] && this.inputs[i]!.downPressed) {
        this.inside[i] = false;
        this.colliders[i]!.off = false;
        this.bodies[i]!.refreshContacts();
        this.events.push({ kind: "exit", body: i });
        // The press is used up: it must not send the body straight back in.
        this.inputs[i]!.downPressed = false;
      }
    }

    // Riders and the bottom-up order come from where everyone stood after the last step.
    for (const b of this.bodies) b.hasRider = false;
    for (let node = 0; node < this.nodeCount; node++) {
      const s = this.supportOf(node);
      if (!s || s.kind !== "collider") continue;
      const owner = this.colliderById(s.id)?.node ?? -1;
      if (owner >= 0 && owner < n) this.bodies[owner]!.hasRider = true;
    }
    this.order = this.bottomUp();
    for (const c of this.colliders) {
      c.dx = 0;
      c.dy = 0;
    }
    const wasGrounded = this.bodies.map((b) => b.grounded);
    for (let i = 0; i < n; i++) this.prevSupport[i] = this.bodies[i]!.support;
    this.markRope();

    this.props.moveKinematic(this);

    const stepped = new Array<boolean>(this.nodeCount).fill(false);
    for (const node of this.order) {
      stepped[node] = true;
      if (node < n) {
        this.stepBody(node);
        this.carryLateRiders(node, stepped);
      } else {
        const crate = this.props.crates[node - n]!;
        const x0 = crate.x;
        const y0 = crate.y;
        const s = crate.support;
        const carrier = s && s.kind === "collider" ? this.colliderById(s.id) : null;
        this.props.stepCrate(this, crate, carrier);
        crate.collider.dx = crate.x - x0;
        crate.collider.dy = crate.y - y0;
      }
    }

    // The rope wraps what the bodies' own moves swept, is solved, then wraps what the rope's pulls,
    // the mantle and Ruben's slide swept.
    sweepRope(this, this.chain, this.ropeWraps, this.ropeX, this.ropeY);
    this.markRope();
    solveRope(this, this.chain, this.ropeWraps, COOP_DT, this.rope);
    this.mantleHauled();
    for (let i = 0; i < n; i++) if (!this.inside[i]) this.bodies[i]!.refreshContacts();

    this.slideRubenOffFriends();
    sweepRope(this, this.chain, this.ropeWraps, this.ropeX, this.ropeY);
    measureRope(this.bodies, this.chain, this.ropeWraps, this.rope);
    this.updateRooted();
    this.computeLoads();

    // A hard landing on a seesaw's raised side fires it.
    const landings: Array<{ node: number; vy: number; support: number }> = [];
    for (let i = 0; i < n; i++) {
      const b = this.bodies[i]!;
      const s = b.support;
      if (!wasGrounded[i] && b.grounded && s && s.kind === "collider") landings.push({ node: i, vy: b.impactVy, support: s.id });
    }
    for (const c of this.props.crates) {
      const s = c.support;
      if (c.landed && s && s.kind === "collider") landings.push({ node: c.node, vy: c.impactVy, support: s.id });
    }
    if (landings.length > 0) this.props.catapults(this, landings);

    const before = this.events.length;
    this.props.interact(this);
    for (const e of this.events.slice(before)) {
      if (e.kind === "enter") this.enterDoor(e.body);
      else if (e.kind === "doorOpen") this.stats.opener = e.body;
      else if (e.kind === "switch") this.lastSwitchBy = e.body;
      else if (e.kind === "crack") this.lastCrackBy = this.heaviestOn(e.thing);
    }

    this.referee();
    this.checkDeaths();
    if (this.dying === 0 && this.inside.every((x) => x)) {
      this.won = true;
      this.events.push({ kind: "win" });
    }
  }

  // --- Internals -----------------------------------------------------------------------------

  private stepBody(i: number): void {
    const b = this.bodies[i]!;
    const c = this.colliders[i]!;
    this.startY[i] = b.y;
    this.startX[i] = b.x;
    this.beginX[i] = b.x;
    b.headCollider = -1;
    if (this.inside[i]) {
      c.dx = 0;
      c.dy = 0;
      return;
    }
    const x0 = b.x;
    const y0 = b.y;
    const s = b.support;
    let carrier: BoxCollider | null = null;
    if (s && s.kind === "collider") {
      carrier = this.colliderById(s.id);
      if (carrier && (carrier.dx !== 0 || carrier.dy !== 0)) b.moveBy(carrier.dx, carrier.dy);
    }
    // Carried head first into a solid thing (a lift under a switch block): that counts as a hit too.
    const carriedHead = b.headCollider;
    this.startY[i] = b.y;
    this.startX[i] = b.x;
    b.step(COOP_DT, this.inputs[i]!);
    if (b.headCollider < 0) b.headCollider = carriedHead;
    // Leaving a moving support keeps its horizontal speed (not its vertical one).
    if (carrier && carrier.dx !== 0) {
      const still = b.support && b.support.kind === "collider" && b.support.id === carrier.id;
      if (!still && !b.grounded) {
        const max = COOP.inheritMaxSpeed;
        b.vx = Math.max(-max, Math.min(max, b.vx + carrier.dx / COOP_DT));
      }
    }
    this.syncCollider(i);
    c.dx = b.x - x0;
    c.dy = b.y - y0;
  }

  /**
   * Nodes that landed on body i earlier in this step (they stepped before it) were not carried by
   * its own move: carry them now, so they stay on top instead of sinking into it.
   */
  private carryLateRiders(i: number, stepped: readonly boolean[]): void {
    const c = this.colliders[i]!;
    if (c.dx === 0 && c.dy === 0) return;
    const n = this.bodies.length;
    for (let j = 0; j < this.nodeCount; j++) {
      if (j === i || !stepped[j]) continue;
      const s = this.supportOf(j);
      if (!s || s.kind !== "collider" || s.id !== i) continue;
      if (j < n) {
        this.bodies[j]!.moveBy(c.dx, c.dy);
        this.syncCollider(j);
      } else this.props.moveCrate(this, this.props.crates[j - n]!, c.dx, c.dy);
    }
  }

  private enterDoor(i: number): void {
    const door = this.level.door;
    if (!door || this.inside[i]) return;
    const b = this.bodies[i]!;
    this.inside[i] = true;
    b.x = door.x + door.w / 2 - b.width / 2;
    b.y = door.y + door.h - b.height;
    b.vx = 0;
    b.vy = 0;
    b.support = null;
    b.hanging = false;
    b.headCollider = -1;
    this.syncCollider(i);
    this.colliders[i]!.off = true;
    // Teleported into the door: its links lie as a rope put there would.
    this.placeLinksOf(i);
    if (this.stats.firstIn < 0) this.stats.firstIn = i;
  }

  supportOf(node: number): Support | null {
    const n = this.bodies.length;
    if (node < n) return this.inside[node] ? null : this.bodies[node]!.support;
    return this.props.crates[node - n]?.support ?? null;
  }

  colliderIndex(id: number): number {
    return id < OBJECT_COLLIDER_BASE ? id : this.bodies.length + id - OBJECT_COLLIDER_BASE;
  }

  colliderById(id: number): BoxCollider | null {
    return this.colliders[this.colliderIndex(id)] ?? null;
  }

  private syncCollider(i: number): void {
    const b = this.bodies[i]!;
    const c = this.colliders[i]!;
    c.x = b.x;
    c.y = b.y;
  }

  /** Node indices sorted so that every node comes after the one it stands on (crates first at a level). */
  private bottomUp(): number[] {
    const count = this.nodeCount;
    const n = this.bodies.length;
    const depth = new Array<number>(count);
    for (let node = 0; node < count; node++) {
      let d = 0;
      let cur = node;
      for (let guard = 0; guard < count; guard++) {
        const s = this.supportOf(cur);
        if (!s || s.kind !== "collider") break;
        const owner = this.colliderById(s.id)?.node ?? -1;
        if (owner < 0) break;
        d++;
        cur = owner;
      }
      depth[node] = d;
    }
    const nodes = Array.from({ length: count }, (_, k) => k);
    return nodes.sort((a, b) => depth[a]! - depth[b]! || (a < n ? 1 : 0) - (b < n ? 1 : 0) || a - b);
  }

  /**
   * Weights: each node weighs itself (a friend 1, Ruben 2, a crate its weight) plus whatever stands
   * on it, plus the friends hanging from it on the rope. Then the load on each collider.
   */
  private computeLoads(): void {
    const n = this.bodies.length;
    const count = this.nodeCount;
    const riders: number[][] = Array.from({ length: count }, () => []);
    const hangers: number[][] = Array.from({ length: n }, () => []);
    this.standers = this.colliders.map(() => []);
    for (let node = 0; node < count; node++) {
      const s = this.supportOf(node);
      if (!s || s.kind !== "collider") continue;
      const idx = this.colliderIndex(s.id);
      this.standers[idx]?.push(node);
      const owner = this.colliders[idx]?.node ?? -1;
      if (owner >= 0) riders[owner]!.push(node);
    }
    // Hanging: from the highest taut neighbour that is at least hangHeight higher.
    for (let i = 0; i < n; i++) {
      this.holder[i] = -1;
      const b = this.bodies[i]!;
      if (b.grounded || this.inside[i]) continue;
      let best = -1;
      for (const l of this.rope) {
        if (!l.taut || (l.a !== i && l.b !== i)) continue;
        const j = l.a === i ? l.b : l.a;
        const a = this.bodies[j]!;
        if (a.cy > b.cy - COOP.hangHeight) continue;
        if (best < 0 || a.cy < this.bodies[best]!.cy) best = j;
      }
      if (best >= 0) {
        this.holder[i] = best;
        if (!this.inside[best]) hangers[best]!.push(i);
      }
    }
    const memo = new Array<number>(count).fill(-1);
    const visiting = new Array<boolean>(count).fill(false);
    const weigh = (node: number): number => {
      if (memo[node]! >= 0) return memo[node]!;
      if (visiting[node]) return 0;
      visiting[node] = true;
      let w = node < n ? (this.inside[node] ? 0 : this.bodies[node]!.mass) : this.props.crates[node - n]!.weight;
      for (const r of riders[node]!) w += weigh(r);
      if (node < n) for (const h of hangers[node]!) w += weigh(h);
      visiting[node] = false;
      memo[node] = w;
      return w;
    };
    this.weights = memo.map((_, k) => weigh(k));
    this.loads = this.colliders.map(() => 0);
    this.standers.forEach((list, idx) => {
      for (const node of list) this.loads[idx]! += this.weights[node]!;
    });
    if (!this.props.plates.some((p) => p.standing)) return;
    // The same without the friends hanging on the rope (plates with `standing`).
    const memoS = new Array<number>(count).fill(-1);
    const weighS = (node: number): number => {
      if (memoS[node]! >= 0) return memoS[node]!;
      if (visiting[node]) return 0;
      visiting[node] = true;
      let w = node < n ? (this.inside[node] ? 0 : this.bodies[node]!.mass) : this.props.crates[node - n]!.weight;
      for (const r of riders[node]!) w += weighS(r);
      visiting[node] = false;
      memoS[node] = w;
      return w;
    };
    this.standingLoads = this.colliders.map(() => 0);
    this.standers.forEach((list, idx) => {
      for (const node of list) this.standingLoads[idx]! += weighS(node);
    });
  }

  /** Index of the body that weighs most on a thing's collider (for the blame of a broken floor). */
  private heaviestOn(thing: number): number {
    const f = this.props.fragiles.find((x) => x.thing.index === thing);
    if (!f) return -1;
    let best = -1;
    let bestW = 0;
    for (const node of this.standersOn(f.collider.id)) {
      const w = this.weights[node]!;
      if (node < this.bodies.length && w > bestW) {
        bestW = w;
        best = node;
      }
    }
    return best;
  }

  /**
   * A pile is rooted when it rests on something solid. Standing on a body that is in the air
   * (it walked off a ledge) roots nothing: no jump from there, not even in coyote time.
   */
  private updateRooted(): void {
    const n = this.bodies.length;
    for (const node of this.bottomUp()) {
      if (node >= n) continue;
      const b = this.bodies[node]!;
      if (!b.grounded) continue; // keeps the last value: a coyote jump after leaving solid ground
      const s = b.support;
      if (!s || s.kind === "terrain") {
        b.rooted = true;
        continue;
      }
      const owner = this.colliderById(s.id)?.node ?? -1;
      if (owner < 0) b.rooted = true;
      else if (owner < n) {
        const base = this.bodies[owner]!;
        b.rooted = base.grounded && base.rooted;
      } else b.rooted = this.props.crates[owner - n]!.support !== null;
    }
  }

  /** The point of link k's path next to body i (its wrap point there, or the other end's centre). */
  private pivotOf(k: number, i: number): { x: number; y: number } {
    const l = this.rope[k]!;
    const p = l.points;
    if (p.length === 0) {
      const o = this.bodies[l.a === i ? l.b : l.a]!;
      return { x: o.cx, y: o.cy };
    }
    return l.a === i ? { x: p[0]!, y: p[1]! } : { x: p[p.length - 2]!, y: p[p.length - 1]! };
  }

  /**
   * A body the rope pulls sideways against a wall, towards its pivot (the corner it hangs over, or
   * the hauler) level with it, higher, or lower but far to the side, climbs over the lip
   * (CoopController.mantle) at the haul speed.
   */
  private mantleHauled(): void {
    this.rope.forEach((l, k) => {
      if (!l.taut) return;
      for (const [i, j] of [
        [l.a, l.b],
        [l.b, l.a],
      ] as const) {
        const b = this.bodies[i]!;
        const pivot = this.pivotOf(k, i);
        if (b.grounded || this.inside[i]) continue;
        const drop = pivot.y - b.cy;
        if (drop > COOP.hangHeight && drop > MANTLE_MAX_DROP * Math.abs(pivot.x - b.cx)) continue;
        // Only a hauled body climbs: someone up the rope walks away. One merely hanging near the lip does not.
        if (!this.haulsAway(j, k, 0)) continue;
        // Over a lip (the link wraps a corner), towards the corner; else towards an anchor well to the side.
        const wrapped = l.points.length > 0;
        const dx = pivot.x - b.cx;
        if (!wrapped && Math.abs(dx) < 0.3 * l.length) continue;
        const cap = b.isRuben ? COOP.riseCap.ruben : COOP.riseCap.friend;
        const rose = this.stepStartY(i) - b.y;
        const rise = b.mantleRise(dx > 0 ? 1 : -1, cap * COOP_DT - Math.max(0, rose), wrapped ? MANTLE_WRAP_REACH : MANTLE_REACH);
        if (rise > 0) {
          const got = this.moveStack(i, 0, -rise);
          if (got.dy < 0 && b.vy > 0) b.vy = 0;
        }
      }
    });
  }

  /**
   * Whether body j pulls link k away from its other end: it walks away from its pivot on that link
   * (or braces), or the friend it stands on does, or it is held by a taut link to a friend further
   * the same way who does (a pull through a friend standing still in the middle of the chain).
   */
  private haulsAway(j: number, k: number, depth: number): boolean {
    if (this.inside[j] || depth >= this.bodies.length) return false;
    const away = Math.sign(this.bodies[j]!.cx - this.pivotOf(k, j).x);
    if (away === 0) return false;
    if (this.inputDir(j) === away || this.inputDir(this.pileBase(j)) === away) return true;
    for (let k2 = 0; k2 < this.rope.length; k2++) {
      const l = this.rope[k2]!;
      if (k2 === k || !l.taut || (l.a !== j && l.b !== j)) continue;
      if (Math.sign(this.pivotOf(k2, j).x - this.bodies[j]!.cx) !== away) continue;
      if (this.haulsAway(l.a === j ? l.b : l.a, k2, depth + 1)) return true;
    }
    return false;
  }

  /**
   * Nobody can carry Ruben: if he lands on (or ends up inside) friends, they are squashed and he
   * slides off, all of them at once, towards the side that clears them soonest. Against a wall,
   * the friends get out of the way instead.
   */
  private slideRubenOffFriends(): void {
    this.bodies.forEach((r, ri) => {
      if (!r.isRuben || this.inside[ri]) return;
      const over: number[] = [];
      this.bodies.forEach((f, fi) => {
        if (fi === ri || this.inside[fi]) return;
        if (!boxesOverlap(r.x, r.y, r.width, r.height, this.colliders[fi]!)) {
          this.squashing[fi] = false;
          return;
        }
        over.push(fi);
        if (!this.squashing[fi]) {
          this.squashing[fi] = true;
          f.squashTimer = COOP.squashTime;
          this.events.push({ kind: "squash", body: fi, by: ri });
        }
      });
      if (over.length === 0) return;
      let clearRight = 0;
      let clearLeft = 0;
      for (const fi of over) {
        const f = this.bodies[fi]!;
        clearRight = Math.max(clearRight, f.x + f.width - r.x);
        clearLeft = Math.max(clearLeft, r.x + r.width - f.x);
      }
      const dir = clearRight < clearLeft ? 1 : clearLeft < clearRight ? -1 : r.facing;
      const clear = dir > 0 ? clearRight : clearLeft;
      const want = Math.min(clear + EPS, COOP.rubenSlideSpeed * COOP_DT);
      const got = r.moveBy(dir * want, 0);
      this.syncCollider(ri);
      const rest = want - Math.abs(got.dx);
      if (rest > EPS) {
        for (const fi of over) {
          this.bodies[fi]!.moveBy(-dir * rest, 0);
          this.syncCollider(fi);
        }
      }
    });
  }

  /** The referee's bookkeeping: floors taken away, catches, time carrying, hanging, on plates. */
  private referee(): void {
    const n = this.bodies.length;
    const plateIds = new Set(this.props.plates.map((p) => p.collider.id));
    for (let i = 0; i < n; i++) {
      if (this.inside[i]) continue;
      const b = this.bodies[i]!;
      // The floor went away from under a body that did not jump.
      const prev = this.prevSupport[i];
      if (prev && prev.kind === "collider" && !b.grounded && b.vy >= 0) {
        const c = this.colliderById(prev.id);
        // A friend who moved away from under this body (walking off a friend's head is one's own doing).
        if (c && c.node >= 0 && c.node < n && c.node !== i) {
          if (Math.abs(c.dx) > 1e-4 || c.dy > 1e-4) this.groundLost[i] = { by: c.node, why: "ground", tick: this.tick };
        } else if (c && c.off) {
          // A shelf swapped away (the switch), a gate opened (a plate let go, or one pressed for a
          // trapdoor that opens with its link), a floor broke.
          const shelf = this.props.shelves.some((x) => x.collider === c);
          const gate = this.props.gates.find((g) => g.collider === c);
          const switchedBy = gate ? (gate.inverted ? this.props.releasedBy : this.props.pressedBy).get(gate.link) : undefined;
          const by = shelf ? this.lastSwitchBy : gate ? (switchedBy ?? -1) : this.lastCrackBy;
          const why: BlameWhy = shelf ? "switch" : gate ? "plate" : "ground";
          if (by >= 0 && by !== i) this.groundLost[i] = { by, why, tick: this.tick };
        }
      }
      // Time counters.
      if (b.hanging) this.stats.hung[i]! += COOP_DT;
      const s = b.support;
      if (s && s.kind === "collider" && plateIds.has(s.id)) this.stats.plates[i]! += COOP_DT;
      // Catches: a friend hung from this body long enough, then stood again.
      if (this.holder[i]! >= 0 && b.hanging) {
        if (this.hangSince[i]! < 0) this.hangSince[i] = this.tick;
      } else if (b.grounded && this.hangSince[i]! >= 0) {
        const held = this.holderAtEnd(i);
        if ((this.tick - this.hangSince[i]!) * COOP_DT >= CATCH_MIN_S && held >= 0) this.stats.catches[held]! += 1;
        this.hangSince[i] = -1;
      } else if (b.grounded) this.hangSince[i] = -1;
    }
    for (let node = 0; node < n; node++) {
      const s = this.supportOf(node);
      if (!s || s.kind !== "collider") continue;
      const owner = this.colliderById(s.id)?.node ?? -1;
      if (owner >= 0 && owner < n) this.stats.carried[owner]! += COOP_DT;
    }
  }

  private holderAtEnd(i: number): number {
    if (this.holder[i]! >= 0) this.lastHolder[i] = this.holder[i]!;
    return this.lastHolder[i] ?? -1;
  }

  private checkDeaths(): void {
    const t = this.levelTick * COOP_DT;
    const n = this.bodies.length;
    for (const [i, b] of this.bodies.entries()) {
      if (this.inside[i]) continue;
      if (this.holder[i]! >= 0) this.lastHolder[i] = this.holder[i]!;
      let cause: DeathCause | null = null;
      const box = {
        x: b.x + HAZARD_INSET,
        y: b.y + HAZARD_INSET,
        w: b.width - 2 * HAZARD_INSET,
        h: b.height - 2 * HAZARD_INSET,
      };
      if (b.y > this.level.killY) cause = "fall";
      else {
        for (const obj of this.level.objects) {
          if (hazardsOf(obj, t).some((hz) => boxHitsHazard(box, hz, b.vy))) {
            cause = "hazard";
            break;
          }
        }
        cause ??= this.props.killsBox(box.x, box.y, box.w, box.h, this.levelTick);
      }
      if (!cause) continue;
      const { blame, why } = this.blameFor(i);
      const withKey = this.props.keyCarrier === i;
      this.dying = DEATH_FREEZE_STEPS;
      this.victim = i;
      if (blame !== i && blame >= 0 && blame < n) this.stats.caused[blame]! += 1;
      else this.stats.own[i]! += 1;
      if (withKey) this.stats.kamikaze[i]! += 1;
      this.events.push({ kind: "death", victim: i, cause, x: b.cx, y: b.cy, blame, why, withKey });
      return;
    }
  }

  /** Who a death is on: who took the floor away, fired the seesaw, pulled the rope; else the victim. */
  private blameFor(v: number): { blame: number; why: BlameWhy } {
    const now = this.tick;
    const g = this.groundLost[v];
    if (g && (now - g.tick) * COOP_DT <= GROUND_BLAME_S) return { blame: g.by, why: g.why };
    const l = this.launchedBy[v];
    if (l && l.by >= 0 && (now - l.tick) * COOP_DT <= GROUND_BLAME_S) return { blame: l.by, why: "catapult" };
    const r = this.ropePull[v];
    if (r && (now - r.tick) * COOP_DT <= ROPE_BLAME_S && r.total >= ROPE_BLAME_CELLS) return { blame: r.by, why: "rope" };
    return { blame: v, why: "self" };
  }

  // --- Snapshots -----------------------------------------------------------------------------

  save(): CoopWorldState {
    return {
      tick: this.tick,
      levelTick: this.levelTick,
      attempt: this.attempt,
      dying: this.dying,
      victim: this.victim,
      won: this.won,
      bodies: this.bodies.map((b) => b.save()),
      squashing: this.squashing.slice(),
      inside: this.inside.slice(),
      props: this.props.save(),
      restartHeld: this.restartHeld,
      ropeWraps: this.ropeWraps.map((w) => w.slice()),
    };
  }

  load(s: CoopWorldState): void {
    this.tick = s.tick;
    this.levelTick = s.levelTick;
    this.attempt = s.attempt;
    this.dying = s.dying;
    this.victim = s.victim;
    this.won = s.won;
    this.restartHeld = s.restartHeld;
    s.bodies.forEach((bs, i) => {
      this.bodies[i]!.load(bs);
      this.syncCollider(i);
    });
    this.squashing = s.squashing.slice();
    this.inside = s.inside.slice();
    this.inside.forEach((x, i) => {
      this.colliders[i]!.off = x;
    });
    this.props.load(s.props, this.levelTick);
    this.ropeWraps.forEach((w, k) => {
      w.length = 0;
      const saved = s.ropeWraps?.[k];
      if (saved) w.push(...saved);
    });
    measureRope(this.bodies, this.chain, this.ropeWraps, this.rope);
    this.order = this.bottomUp();
    this.computeLoads();
  }

  /** A hash of the whole state, to compare worlds bit for bit. */
  hash(): number {
    const f = new Fnv32();
    const s = this.save();
    f.num(s.tick);
    f.num(s.levelTick);
    f.num(s.attempt);
    f.num(s.dying);
    f.num(s.victim);
    f.bool(s.won);
    f.num(s.restartHeld);
    for (const b of s.bodies) {
      for (const v of Object.values(b)) f.num(typeof v === "boolean" ? (v ? 1 : 0) : v);
    }
    for (const q of s.squashing) f.bool(q);
    for (const q of s.inside) f.bool(q);
    for (const v of s.props) f.num(v);
    for (const w of s.ropeWraps) {
      f.num(w.length);
      for (const v of w) f.num(v);
    }
    return f.h;
  }
}

