/**
 * The co-op world: every player's body, the rope between them and the level, advanced in fixed
 * steps from everyone's inputs. The same class runs on the server (the referee: deaths, victory),
 * on every client (display, prediction), in the dev tool and in the test bots.
 *
 * One step, in this order:
 * 1. Bodies move bottom-up (whoever stands on someone moves after them): each is first carried
 *    by what it stands on, then takes its own step (run, jump, gravity, collisions).
 * 2. The rope pulls the chain back together (rope.ts).
 * 3. Ruben slides off any friend he landed on: nobody can carry him.
 * 4. Deaths: a body in a hazard or below the level freezes the world for a moment, then the whole
 *    level restarts for everyone.
 *
 * Determinism: no Math.sin/cos/random/Date in here, arrays in a fixed order (body index = place
 * in the chain), so the same inputs give the same bits on every machine (see detMath.ts).
 */
import { HAZARD_INSET } from "../movement/tuning";
import { boxHitsHazard, hazardsOf } from "../objects";
import { boxesOverlap, EPS, NO_BODY, type BoxCollider, type CoopSpace } from "./colliders";
import { CoopController, type CoopBodyState } from "./coopController";
import { COOP, COOP_DT, COOP_MOVEMENT, DEATH_FREEZE_STEPS } from "./coopTuning";
import { Fnv32 } from "./detMath";
import { decodeInput, type CoopInput } from "./inputBits";
import type { CoopLevel } from "./levelFormat";
import { solveRope, type RopeHost, type RopeLinkState } from "./rope";

export interface CoopPlayer {
  /** Shown above the body. */
  name: string;
  isRuben: boolean;
}

export type DeathCause = "fall" | "hazard";

export type CoopEvent =
  | { kind: "death"; victim: number; cause: DeathCause; x: number; y: number }
  | { kind: "restart"; attempt: number }
  | { kind: "squash"; body: number; by: number }
  | { kind: "land"; body: number; speed: number };

export interface CoopWorldState {
  tick: number;
  attempt: number;
  dying: number;
  victim: number;
  bodies: CoopBodyState[];
  /** Friends Ruben was overlapping at the end of the step (to report a squash only once). */
  squashing: boolean[];
}

const NO_INPUT_BITS = 0;

export class CoopWorld implements CoopSpace, RopeHost {
  readonly bodies: CoopController[] = [];
  /** Rope links after the last step. */
  readonly rope: RopeLinkState[] = [];
  /** Body indices in rope order (index order: friends in seat order, Ruben last). */
  readonly chain: number[] = [];
  /** Steps since the level started (all attempts included). */
  tick = 0;
  /** 1 for the first try; each death or restart adds one. */
  attempt = 1;
  /** Steps left of the death freeze; 0 while playing. */
  dying = 0;
  /** Who died, during the freeze; -1 otherwise. */
  victim = -1;
  /** What happened during the last step (deaths, squashes...), for effects and the referee. */
  events: CoopEvent[] = [];

  /** One solid box per body, kept in step with the bodies, then the objects' colliders. */
  readonly colliders: BoxCollider[] = [];
  private inputs: CoopInput[] = [];
  private pendingRestart = false;
  private squashing: boolean[] = [];
  private order: number[] = [];
  /** Each body's y before its own step, this step (the haul speed counts every rise from there). */
  private stepStartY: number[] = [];

  constructor(
    readonly level: CoopLevel,
    readonly players: readonly CoopPlayer[],
  ) {
    if (players.length < 1 || players.length > COOP.maxPlayers) throw new Error(`co-op world needs 1 to ${COOP.maxPlayers} players`);
    players.forEach((p, i) => {
      const b = new CoopController(level.collision, COOP_MOVEMENT);
      b.index = i;
      b.isRuben = p.isRuben;
      b.space = this;
      this.bodies.push(b);
      this.chain.push(i);
      this.colliders.push({ id: i, x: 0, y: 0, w: b.width, h: b.height, mode: "solid", dx: 0, dy: 0, body: i });
      this.squashing.push(false);
    });
    this.spawnAll();
  }

  // --- CoopSpace -----------------------------------------------------------------------

  ridesOn(rider: number, base: number): boolean {
    let cur = rider;
    for (let guard = 0; guard < this.bodies.length; guard++) {
      const s = this.bodies[cur]!.support;
      if (!s || s.kind !== "collider" || s.body === NO_BODY) return false;
      if (s.body === base) return true;
      cur = s.body;
    }
    return false;
  }

  canStandOn(lander: number, _body: number): boolean {
    // Nobody can carry Ruben: he lives at the gym.
    return !this.bodies[lander]!.isRuben;
  }

  // --- RopeHost ---------------------------------------------------------------------------

  isFixed(_i: number): boolean {
    return false;
  }

  inputDir(i: number): number {
    const inp = this.inputs[i];
    if (!inp) return 0;
    return (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
  }

  stepRise(i: number): number {
    return Math.max(0, -this.colliders[i]!.dy);
  }

  moveStack(i: number, dx: number, dy: number): { dx: number; dy: number } {
    const base = this.bodies[i]!;
    const got = base.moveBy(dx, dy);
    this.syncCollider(i);
    if (got.dx !== 0 || got.dy !== 0) {
      // Whoever stands on it (directly or not) comes along, bottom-up.
      for (const j of this.order) {
        if (j !== i && this.ridesOn(j, i)) {
          this.bodies[j]!.moveBy(got.dx, got.dy);
          this.syncCollider(j);
        }
      }
    }
    return got;
  }

  // --- Lifecycle -----------------------------------------------------------------------------

  /** Everyone back on the spawn cells, standing still. */
  spawnAll(): void {
    this.bodies.forEach((b, i) => {
      const s = this.level.spawns[i]!;
      b.placeInCell(s.x, s.y);
      this.syncCollider(i);
      const c = this.colliders[i]!;
      c.dx = 0;
      c.dy = 0;
      this.squashing[i] = false;
    });
    this.rope.length = 0;
    this.order = this.bodies.map((_, i) => i);
    for (const b of this.bodies) b.refreshContacts();
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
    this.order = this.bottomUp();
  }

  /** The level restarts for everyone (after a death, or R held by the team). */
  restart(): void {
    this.attempt++;
    this.dying = 0;
    this.victim = -1;
    this.spawnAll();
    this.events.push({ kind: "restart", attempt: this.attempt });
  }

  /** The next step restarts the level instead of moving anyone (R held by the team). */
  requestRestart(): void {
    this.pendingRestart = true;
  }

  /** Advance one step. `inputs[i]` is body i's input bits (inputBits.ts); missing means no input. */
  step(inputs: readonly number[]): void {
    this.events = [];
    this.tick++;
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
    this.inputs = this.bodies.map((_, i) => decodeInput(inputs[i] ?? NO_INPUT_BITS));

    // Riders and the bottom-up order come from where everyone stood after the last step.
    for (const b of this.bodies) b.hasRider = false;
    for (const b of this.bodies) {
      const s = b.support;
      if (s && s.kind === "collider" && s.body !== NO_BODY) this.bodies[s.body]!.hasRider = true;
    }
    this.order = this.bottomUp();
    for (const c of this.colliders) {
      c.dx = 0;
      c.dy = 0;
    }

    for (const i of this.order) {
      const b = this.bodies[i]!;
      const x0 = b.x;
      const y0 = b.y;
      const s = b.support;
      let carrier: BoxCollider | null = null;
      if (s && s.kind === "collider") {
        carrier = this.colliderById(s.id);
        if (carrier && (carrier.dx !== 0 || carrier.dy !== 0)) b.moveBy(carrier.dx, carrier.dy);
      }
      this.stepStartY[i] = b.y;
      b.step(COOP_DT, this.inputs[i]!);
      // Leaving a moving support keeps its horizontal speed (not its vertical one).
      if (carrier && carrier.dx !== 0) {
        const still = b.support && b.support.kind === "collider" && b.support.id === carrier.id;
        if (!still && !b.grounded) {
          const max = COOP.inheritMaxSpeed;
          b.vx = Math.max(-max, Math.min(max, b.vx + carrier.dx / COOP_DT));
        }
      }
      this.syncCollider(i);
      const c = this.colliders[i]!;
      c.dx = b.x - x0;
      c.dy = b.y - y0;
    }

    solveRope(this, this.chain, COOP.ropeLength, COOP_DT, this.rope);
    this.mantleHauled();
    for (const b of this.bodies) b.refreshContacts();

    this.slideRubenOffFriends();
    this.updateRooted();
    this.checkDeaths();
  }

  // --- Internals -----------------------------------------------------------------------------

  private colliderById(id: number): BoxCollider | null {
    if (id >= 0 && id < this.bodies.length) return this.colliders[id]!;
    for (const c of this.colliders) if (c.id === id) return c;
    return null;
  }

  private syncCollider(i: number): void {
    const b = this.bodies[i]!;
    const c = this.colliders[i]!;
    c.x = b.x;
    c.y = b.y;
  }

  /** Body indices sorted so that every body comes after the one it stands on. */
  private bottomUp(): number[] {
    const depth = this.bodies.map((_, i) => {
      let d = 0;
      let cur = i;
      for (let guard = 0; guard < this.bodies.length; guard++) {
        const s = this.bodies[cur]!.support;
        if (!s || s.kind !== "collider" || s.body === NO_BODY) break;
        d++;
        cur = s.body;
      }
      return d;
    });
    return this.bodies.map((_, i) => i).sort((a, b) => depth[a]! - depth[b]! || a - b);
  }

  /**
   * A pile is rooted when it rests on something solid. Standing on a body that is in the air
   * (it walked off a ledge) roots nothing: no jump from there, not even in coyote time.
   */
  private updateRooted(): void {
    for (const i of this.bottomUp()) {
      const b = this.bodies[i]!;
      if (!b.grounded) continue; // keeps the last value: a coyote jump after leaving solid ground
      const s = b.support;
      if (!s || s.kind === "terrain" || s.body === NO_BODY) b.rooted = true;
      else {
        const base = this.bodies[s.body]!;
        b.rooted = base.grounded && base.rooted;
      }
    }
  }

  /**
   * A body the rope pulls sideways against a wall, with the hauler level with it or higher, climbs
   * over the lip (CoopController.mantle) at the haul speed.
   */
  private mantleHauled(): void {
    for (const l of this.rope) {
      if (!l.taut) continue;
      for (const [i, j] of [
        [l.a, l.b],
        [l.b, l.a],
      ] as const) {
        const b = this.bodies[i]!;
        const anchor = this.bodies[j]!;
        if (b.grounded || anchor.cy > b.cy + COOP.hangHeight) continue;
        const dx = anchor.cx - b.cx;
        if (Math.abs(dx) < 0.3 * l.length) continue;
        const cap = b.isRuben ? COOP.riseCap.ruben : COOP.riseCap.friend;
        const rose = (this.stepStartY[i] ?? b.y) - b.y;
        if (b.mantle(dx > 0 ? 1 : -1, cap * COOP_DT - Math.max(0, rose))) this.syncCollider(i);
      }
    }
  }

  /** Nobody can carry Ruben: if he lands on (or ends up inside) a friend, the friend is squashed and Ruben slides off. */
  private slideRubenOffFriends(): void {
    this.bodies.forEach((r, ri) => {
      if (!r.isRuben) return;
      this.bodies.forEach((f, fi) => {
        if (fi === ri) return;
        const fc = this.colliders[fi]!;
        const over = boxesOverlap(r.x, r.y, r.width, r.height, fc);
        if (!over) {
          this.squashing[fi] = false;
          return;
        }
        if (!this.squashing[fi]) {
          this.squashing[fi] = true;
          f.squashTimer = COOP.squashTime;
          this.events.push({ kind: "squash", body: fi, by: ri });
        }
        const dir = r.cx === f.cx ? r.facing : Math.sign(r.cx - f.cx);
        const overlap = dir > 0 ? f.x + f.width - r.x : r.x + r.width - f.x;
        const want = Math.min(overlap + EPS, COOP.rubenSlideSpeed * COOP_DT);
        const got = r.moveBy(dir * want, 0);
        this.syncCollider(ri);
        const rest = want - Math.abs(got.dx);
        if (rest > EPS) {
          // Ruben is against a wall: the friend gets out of the way instead.
          f.moveBy(-dir * rest, 0);
          this.syncCollider(fi);
        }
      });
    });
  }

  private checkDeaths(): void {
    const t = this.tick * COOP_DT;
    for (const [i, b] of this.bodies.entries()) {
      let cause: DeathCause | null = null;
      if (b.y > this.level.killY) cause = "fall";
      else {
        const box = {
          x: b.x + HAZARD_INSET,
          y: b.y + HAZARD_INSET,
          w: b.width - 2 * HAZARD_INSET,
          h: b.height - 2 * HAZARD_INSET,
        };
        for (const obj of this.level.objects) {
          if (hazardsOf(obj, t).some((hz) => boxHitsHazard(box, hz, b.vy))) {
            cause = "hazard";
            break;
          }
        }
      }
      if (cause) {
        this.dying = DEATH_FREEZE_STEPS;
        this.victim = i;
        this.events.push({ kind: "death", victim: i, cause, x: b.cx, y: b.cy });
        return;
      }
    }
  }

  // --- Snapshots -----------------------------------------------------------------------------

  save(): CoopWorldState {
    return {
      tick: this.tick,
      attempt: this.attempt,
      dying: this.dying,
      victim: this.victim,
      bodies: this.bodies.map((b) => b.save()),
      squashing: this.squashing.slice(),
    };
  }

  load(s: CoopWorldState): void {
    this.tick = s.tick;
    this.attempt = s.attempt;
    this.dying = s.dying;
    this.victim = s.victim;
    s.bodies.forEach((bs, i) => {
      this.bodies[i]!.load(bs);
      this.syncCollider(i);
    });
    this.squashing = s.squashing.slice();
    this.order = this.bottomUp();
  }

  /** A hash of the whole state, to compare worlds bit for bit. */
  hash(): number {
    const f = new Fnv32();
    const s = this.save();
    f.num(s.tick);
    f.num(s.attempt);
    f.num(s.dying);
    f.num(s.victim);
    for (const b of s.bodies) {
      for (const v of Object.values(b)) f.num(typeof v === "boolean" ? (v ? 1 : 0) : v);
    }
    for (const q of s.squashing) f.bool(q);
    return f.h;
  }
}
