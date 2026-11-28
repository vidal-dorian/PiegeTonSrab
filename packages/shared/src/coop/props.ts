/**
 * The things of a co-op level at run time ("props"): plates and gates, crates, seesaws and
 * balances, moving platforms, switch blocks and their shelves, Claude terminals, fragile floors,
 * spikes, Ruben's USB key and the door.
 *
 * Every prop that blocks or carries is a box collider in the world's list (colliders.ts), after
 * the bodies' own boxes. A step of the world (world.ts) goes:
 * 1. `moveKinematic`: platforms, seesaw and balance pans move (from the clock, or from the weights
 *    measured at the end of the previous step); whatever stands on them is then carried by the world.
 * 2. Bodies and crates move bottom-up (`stepCrate` for each crate), the rope pulls.
 * 3. `interact`: weights are measured; plates, gates, shelves, fragile floors, the key, the door
 *    and the terminals react. What they change takes effect from the next step.
 *
 * Determinism: fixed iteration orders (things are in reading order), only detMath functions.
 * save/load cover the whole state; weights are recomputed by the world after a load.
 */
import { cellSpan, isSolidCell, type Level } from "../level";
import { CONTACT_PROBE } from "../movement/controller";
import { deriveMovement } from "../movement/tuning";
import { boxesOverlap, EPS, NO_BODY, OBJECT_COLLIDER_BASE, spansOverlap, TERRAIN_SUPPORT, type BoxCollider, type Support } from "./colliders";
import { COOP, COOP_DT, COOP_MOVEMENT } from "./coopTuning";
import { dcos, dsin } from "./detMath";
import { resolveWeight, type CoopLevel, type CoopThing, type SpikeDir, type ThingDef } from "./levelFormat";

export const PROPS = {
  /** A plate stays pressed this long after its weight is gone, seconds. */
  plateHold: 0.15,
  /** Gate opening/closing animation speed (visual), per second. */
  gateAnim: 5,
  /** Crate push speed, cells/s (slower than walking: the pushers lean on it). */
  pushSpeed: 2.2,
  /** A pusher this close (or closer) to the crate or to the pusher in front of it counts, cells. */
  pushTouch: 0.06,
  /** Thickness of seesaw planks and balance pans, cells. */
  plankThickness: 0.3,
  /** Thickness of moving platforms, cells. */
  moverThickness: 0.4,
  /** Seesaw: how far each side goes up or down from level, cells; tilt speed (full travels per second). */
  seesawTravel: 0.75,
  seesawSpeed: 2.5,
  /** A catapult snaps the plank over at this speed (full travels per second). */
  seesawSnapSpeed: 14,
  /** Fall height onto the raised side that fires the catapult, cells. */
  catapultFall: 1.5,
  /** Launch height = catapultGain x fall height x falling weight / launched weight, cells, at most catapultMax. */
  catapultGain: 1.4,
  catapultMax: 8,
  /** Balance: cells of travel per unit of weight difference, most travel, pan speed (cells/s). */
  panStep: 1,
  panTravel: 2,
  panSpeed: 2.5,
  /** Linked moving platform speed, cells/s. */
  moverSpeed: 2.5,
  /** A switch block cannot be hit again within this long, seconds. */
  switchCooldown: 0.3,
  /** Terminals used "together" must all be used within this long, seconds. */
  togetherWindow: 1,
  /** ↓ takes the key from its carrier within this distance (centre to centre), cells. */
  keyReach: 1.5,
  /** A fragile floor breaks under this weight. */
  fragileWeight: 2,
  /** Spikes: depth of the deadly strip from the base of their cell, cells. */
  spikeDepth: 0.45,
} as const;

const DERIVED = deriveMovement(COOP_MOVEMENT);
const FALL_GRAVITY = DERIVED.gravity * COOP_MOVEMENT.fallGravityMultiplier;

/** Upward speed that throws a crate `height` cells up (crates fall with the players' fall gravity). */
export function crateLaunchSpeed(height: number): number {
  return Math.sqrt(2 * FALL_GRAVITY * height);
}
const TWO_PI = 6.283185307179586;
const DEG = 0.017453292519943295;

/** A crate: a box that falls, is pushed by a row of players strong enough, and can be stood on. */
export class CoopCrate {
  x: number;
  y: number;
  vy = 0;
  support: Support | null = null;
  /** Downward speed at the last landing (a hard landing fires a catapult). */
  impactVy = 0;
  /** Landed during the current step. */
  landed = false;
  /** Pushed this step: -1, 0 or 1 (drawing). */
  pushDir = 0;

  constructor(
    readonly thing: CoopThing,
    /** Index among the world's nodes (bodies first, then crates). */
    readonly node: number,
    readonly collider: BoxCollider,
    readonly need: number,
    readonly weight: number,
  ) {
    this.x = thing.x;
    this.y = thing.y;
  }

  get w(): number {
    return this.thing.w;
  }

  get h(): number {
    return this.thing.h;
  }

  home(): void {
    this.x = this.thing.x;
    this.y = this.thing.y;
    this.vy = 0;
    this.support = null;
    this.impactVy = 0;
    this.landed = false;
    this.pushDir = 0;
    this.sync();
  }

  sync(): void {
    this.collider.x = this.x;
    this.collider.y = this.y;
  }
}

export interface PlateState {
  thing: CoopThing;
  collider: BoxCollider;
  need: number;
  exact: boolean;
  /** Only what stands on it counts, not the friends hanging from it (PropsHost.standingLoadOn). */
  standing: boolean;
  link: string;
  hold: number;
  active: boolean;
  /** Weight on it after the last step. */
  load: number;
  /** Bodies standing on it after the last step (the referee's blame; not saved). */
  on: number[];
}

export interface GateState {
  thing: CoopThing;
  collider: BoxCollider;
  link: string;
  inverted: boolean;
  open: boolean;
  /** Wants to close but someone is in the way. */
  blocked: boolean;
  /** 0 closed .. 1 open (drawing). */
  anim: number;
}

export interface SeesawState {
  thing: CoopThing;
  left: BoxCollider;
  right: BoxCollider;
  cap: BoxCollider;
  travel: number;
  /** Tilt: +1 left side down, -1 right side down. */
  t: number;
  /** A catapult in progress: the side going down (+1 left, -1 right), 0 none. */
  snap: number;
  restTop: number;
  loadL: number;
  loadR: number;
}

export interface BalanceState {
  id: string;
  left: { thing: CoopThing; collider: BoxCollider };
  right: { thing: CoopThing; collider: BoxCollider };
  travel: number;
  step: number;
  /** + : left pan down. */
  offset: number;
  loadL: number;
  loadR: number;
}

export interface MoverState {
  thing: CoopThing;
  def: Extract<ThingDef, { kind: "mover" }>;
  collider: BoxCollider;
  /** Progress 0..1 along a linked path. */
  p: number;
  need: number | null;
  load: number;
}

export interface ShelfCell {
  thing: CoopThing;
  group: "A" | "B";
  collider: BoxCollider;
  /** Solid now (its group is active and it was free when it became so). */
  solid: boolean;
}

export interface TerminalState {
  thing: CoopThing;
  def: Extract<ThingDef, { kind: "terminal" }>;
  /** Level tick it was last used, or -1. */
  usedAt: number;
  /** Who used it last (for the effect when a "together" group completes), and whether it was Ruben. */
  usedBy: number;
}

export interface FragileState {
  thing: CoopThing;
  collider: BoxCollider;
  broken: boolean;
  load: number;
}

export interface SpikesState {
  thing: CoopThing;
  dir: SpikeDir;
}

/** What the props need from the world. */
export interface PropsHost {
  readonly level: CoopLevel;
  readonly bodies: ReadonlyArray<{
    x: number;
    y: number;
    width: number;
    height: number;
    cx: number;
    cy: number;
    isRuben: boolean;
    headCollider: number;
  }>;
  readonly colliders: readonly BoxCollider[];
  /** Ticks since the current attempt started. */
  readonly levelTick: number;
  /** Body i is inside the door. */
  isInside(i: number): boolean;
  /** Weight standing on the collider with this id after the last step. */
  loadOn(id: number): number;
  /** The same, counting only what stands on it (no friend hanging from someone on it). */
  standingLoadOn(id: number): number;
  /** Down was pressed this step by body i. */
  downPressed(i: number): boolean;
  /** Left/right input of body i this step. */
  inputDir(i: number): number;
  /** Whether body i stands on solid ground (not in the air). */
  isGrounded(i: number): boolean;
  /** Nodes (bodies, then crates) standing on the collider with this id. */
  standersOn(id: number): number[];
  /** Throw node upwards by `height` cells (`by`: the node whose fall fired it). */
  launchNode(node: number, height: number, by: number): void;
  /** Weight of a node with everything it carries. */
  weightOf(node: number): number;
  /** True if node `rider` stands, directly or through others, on node `base`. */
  ridesOn(rider: number, base: number): boolean;
  /** How far up (at most `want`, >= 0) everything standing on node `base` can follow it. */
  riderRoom(base: number, want: number): number;
  /**
   * How far a solid thing that is not a node (a seesaw side, a balance pan) can rise, at most
   * `want`: what stands on it must follow, and it stops under a body or crate it would run into.
   */
  liftRoom(id: number, want: number): number;
  emit(e: PropEvent): void;
}

export type PropEvent =
  | { kind: "key"; body: number; from: number }
  | { kind: "doorOpen"; body: number }
  | { kind: "enter"; body: number }
  | { kind: "exit"; body: number }
  | { kind: "terminal"; thing: number; body: number; inverted: boolean; waiting: boolean }
  | { kind: "switch"; body: number; active: "A" | "B" }
  | { kind: "crack"; thing: number }
  | { kind: "catapult"; thing: number; by: number; height: number }
  | { kind: "plate"; thing: number; active: boolean; body: number };

export class CoopProps {
  readonly colliders: BoxCollider[] = [];
  readonly crates: CoopCrate[] = [];
  readonly plates: PlateState[] = [];
  readonly gates: GateState[] = [];
  readonly seesaws: SeesawState[] = [];
  readonly balances: BalanceState[] = [];
  readonly movers: MoverState[] = [];
  readonly switches: Array<{ thing: CoopThing; collider: BoxCollider }> = [];
  readonly shelves: ShelfCell[] = [];
  readonly terminals: TerminalState[] = [];
  readonly fragiles: FragileState[] = [];
  readonly spikes: SpikesState[] = [];
  /** Links set by terminals (on/off), in a fixed order. */
  readonly latchLinks: string[] = [];
  latches: boolean[] = [];
  /** Active shelf group. */
  active: "A" | "B" = "A";
  switchCooldown = 0;
  /** Key: -1 at its place, a body index when carried, -2 in the door's lock. */
  keyCarrier = -1;
  doorOpen = false;
  /** Who opened the door (-1 nobody yet). */
  doorOpener = -1;
  /** Links currently on (plates or terminals). */
  readonly signals = new Map<string, boolean>();
  /** Last body to leave a plate of each link before it went off, or to set it off at a terminal (blame). */
  readonly releasedBy = new Map<string, number>();
  /** The body whose step onto a plate (or use of a terminal) last turned each link on (blame). */
  readonly pressedBy = new Map<string, number>();

  constructor(
    readonly level: CoopLevel,
    /** Number of bodies (crates are nodes after them). */
    readonly bodyCount: number,
  ) {
    const players = level.players;
    let nextId = OBJECT_COLLIDER_BASE;
    const make = (x: number, y: number, w: number, h: number, mode: "solid" | "top", node = -1): BoxCollider => {
      const c: BoxCollider = { id: nextId++, x, y, w, h, mode, dx: 0, dy: 0, body: NO_BODY, node, off: false };
      this.colliders.push(c);
      return c;
    };
    const pansByBalance = new Map<string, Array<{ thing: CoopThing; def: Extract<ThingDef, { kind: "pan" }> }>>();
    for (const t of level.things) {
      const d = t.def;
      switch (d.kind) {
        case "plate":
          this.plates.push({
            thing: t,
            collider: make(t.x, t.y, t.w, t.h, "solid"),
            need: resolveWeight(d.need, players),
            exact: d.exact === true,
            standing: d.standing === true,
            link: d.link,
            hold: 0,
            active: false,
            load: 0,
            on: [],
          });
          break;
        case "gate":
          this.gates.push({ thing: t, collider: make(t.x, t.y, t.w, t.h, "solid"), link: d.link, inverted: d.inverted === true, open: false, blocked: false, anim: 0 });
          break;
        case "crate": {
          const node = bodyCount + this.crates.length;
          const need = resolveWeight(d.need, players);
          const c = make(t.x, t.y, t.w, t.h, "solid", node);
          this.crates.push(new CoopCrate(t, node, c, need, d.weight === undefined ? need : resolveWeight(d.weight, players)));
          break;
        }
        case "seesaw": {
          const half = (t.w - 1) / 2;
          const k = PROPS.plankThickness;
          this.seesaws.push({
            thing: t,
            left: make(t.x, t.y, half, k, "solid"),
            right: make(t.x + half + 1, t.y, half, k, "solid"),
            cap: make(t.x + half, t.y, 1, k, "solid"),
            travel: d.travel ?? PROPS.seesawTravel,
            t: 0,
            snap: 0,
            restTop: t.y,
            loadL: 0,
            loadR: 0,
          });
          break;
        }
        case "pan": {
          const list = pansByBalance.get(d.balance) ?? [];
          list.push({ thing: t, def: d });
          pansByBalance.set(d.balance, list);
          break;
        }
        case "mover":
          this.movers.push({
            thing: t,
            def: d,
            collider: make(t.x, t.y, t.w, PROPS.moverThickness, "top"),
            p: 0,
            need: d.need === undefined ? null : resolveWeight(d.need, players),
            load: 0,
          });
          break;
        case "switch":
          this.switches.push({ thing: t, collider: make(t.x, t.y, t.w, t.h, "solid") });
          break;
        case "shelf":
          for (let y = t.y; y < t.y + t.h; y++) {
            for (let x = t.x; x < t.x + t.w; x++) {
              const solid = d.group === "A";
              const c = make(x, y, 1, 1, "solid");
              c.off = !solid;
              this.shelves.push({ thing: t, group: d.group, collider: c, solid });
            }
          }
          break;
        case "terminal":
          this.terminals.push({ thing: t, def: d, usedAt: -1, usedBy: -1 });
          if (!this.latchLinks.includes(d.link)) this.latchLinks.push(d.link);
          break;
        case "fragile":
          this.fragiles.push({ thing: t, collider: make(t.x, t.y, t.w, t.h, "solid"), broken: false, load: 0 });
          break;
        case "spikes":
          this.spikes.push({ thing: t, dir: d.dir });
          break;
        case "wall":
          break;
      }
    }
    for (const [id, pans] of pansByBalance) {
      if (pans.length !== 2) continue;
      pans.sort((a, b) => a.thing.x - b.thing.x);
      const [l, r] = pans as [(typeof pans)[0], (typeof pans)[0]];
      const k = PROPS.plankThickness;
      this.balances.push({
        id,
        left: { thing: l.thing, collider: make(l.thing.x, l.thing.y, l.thing.w, k, "solid") },
        right: { thing: r.thing, collider: make(r.thing.x, r.thing.y, r.thing.w, k, "solid") },
        travel: l.def.travel ?? PROPS.panTravel,
        step: l.def.step ?? PROPS.panStep,
        offset: 0,
        loadL: 0,
        loadR: 0,
      });
    }
    this.latches = this.latchLinks.map(() => false);
    this.reset();
  }

  /** Everything back as at the start of an attempt. */
  reset(): void {
    for (const p of this.plates) {
      p.hold = 0;
      p.active = false;
      p.load = 0;
      p.on = [];
    }
    this.latches = this.latchLinks.map(() => false);
    for (const t of this.terminals) {
      t.usedAt = -1;
      t.usedBy = -1;
    }
    this.computeSignals();
    for (const g of this.gates) {
      g.open = this.wantsOpen(g);
      g.blocked = false;
      g.anim = g.open ? 1 : 0;
      g.collider.off = g.open;
    }
    for (const c of this.crates) c.home();
    for (const s of this.seesaws) {
      s.t = 0;
      s.snap = 0;
      s.loadL = 0;
      s.loadR = 0;
    }
    for (const b of this.balances) {
      b.offset = 0;
      b.loadL = 0;
      b.loadR = 0;
    }
    for (const m of this.movers) {
      m.p = 0;
      m.load = 0;
    }
    this.active = "A";
    this.switchCooldown = 0;
    for (const s of this.shelves) {
      s.solid = s.group === "A";
      s.collider.off = !s.solid;
    }
    for (const f of this.fragiles) {
      f.broken = false;
      f.load = 0;
      f.collider.off = false;
    }
    this.keyCarrier = this.level.key ? -1 : -2;
    this.doorOpen = !this.level.key;
    this.doorOpener = -1;
    this.releasedBy.clear();
    this.pressedBy.clear();
    this.placeKinematic(0);
    for (const c of this.colliders) {
      c.dx = 0;
      c.dy = 0;
    }
  }

  // --- 1. Kinematic props --------------------------------------------------------------------

  /**
   * Move platforms, seesaws and balances for this step; their colliders record how far they moved.
   * The side of a seesaw or balance that goes up never goes through a body or a crate: it rises
   * only as far as what stands on it can follow (a ceiling above them) and stops under whatever it
   * would hit (someone landing on it), and the whole seesaw or balance stops with it.
   */
  moveKinematic(host: PropsHost): void {
    for (const s of this.seesaws) {
      // The heavier side goes down; equal weights on both sides bring the plank back level. An
      // empty plank keeps its tilt, and so does a tied one within a step of level: a body on the
      // middle cap with its feet over a pad stands on that pad at level and on the cap once the
      // pad is a step lower, so levelling that last step would flip the plank every step.
      const speed = s.snap !== 0 ? PROPS.seesawSnapSpeed : PROPS.seesawSpeed;
      const levels = s.loadL > 0 && Math.abs(s.t) > speed * COOP_DT;
      const target = s.snap !== 0 ? s.snap : s.loadL > s.loadR ? 1 : s.loadR > s.loadL ? -1 : levels ? 0 : s.t;
      let t = approach(s.t, target, speed * COOP_DT);
      // t up: the right side rises; t down: the left side does.
      const rise = s.travel * Math.abs(t - s.t);
      if (rise > 0) {
        const room = host.liftRoom(t > s.t ? s.right.id : s.left.id, rise);
        if (room < rise) t = s.t + ((t > s.t ? 1 : -1) * room) / s.travel;
      }
      s.t = t;
      if (s.snap !== 0 && s.t === s.snap) s.snap = 0;
    }
    for (const b of this.balances) {
      const target = clamp(b.step * (b.loadL - b.loadR), -b.travel, b.travel);
      let offset = approach(b.offset, target, PROPS.panSpeed * COOP_DT);
      // Offset up: the right pan rises; down: the left one does.
      const rise = Math.abs(offset - b.offset);
      if (rise > 0) {
        const room = host.liftRoom(offset > b.offset ? b.right.collider.id : b.left.collider.id, rise);
        if (room < rise) offset = b.offset + (offset > b.offset ? room : -room);
      }
      b.offset = offset;
    }
    for (const m of this.movers) {
      const d = m.def;
      if (d.arc || (d.link === undefined && m.need === null)) continue;
      const on = (d.link !== undefined && this.signals.get(d.link) === true) || (m.need !== null && m.load >= m.need);
      const len = Math.sqrt((d.dx ?? 0) * (d.dx ?? 0) + (d.dy ?? 0) * (d.dy ?? 0));
      const rate = len > 0 ? ((d.speed ?? PROPS.moverSpeed) / len) * COOP_DT : 1;
      m.p = approach(m.p, on ? 1 : 0, rate);
    }
    this.placeKinematic(host.levelTick);
  }

  /** Put every kinematic collider where its state says, recording the move in dx/dy. */
  private placeKinematic(levelTick: number): void {
    const time = levelTick * COOP_DT;
    const put = (c: BoxCollider, x: number, y: number) => {
      c.dx = x - c.x;
      c.dy = y - c.y;
      c.x = x;
      c.y = y;
    };
    for (const s of this.seesaws) {
      put(s.left, s.left.x, s.restTop + s.travel * s.t);
      put(s.right, s.right.x, s.restTop - s.travel * s.t);
      s.cap.dx = 0;
      s.cap.dy = 0;
    }
    for (const b of this.balances) {
      put(b.left.collider, b.left.collider.x, b.left.thing.y + b.offset);
      put(b.right.collider, b.right.collider.x, b.right.thing.y - b.offset);
    }
    for (const m of this.movers) {
      const d = m.def;
      const t = m.thing;
      if (d.arc) {
        const a = d.arc;
        const rx = t.x + t.w / 2 - (a.px + 0.5);
        const ry = t.y - (a.py + 0.5);
        const r = Math.sqrt(rx * rx + ry * ry);
        const angle = a.degrees * DEG * dsin(TWO_PI * (time / a.period + (a.phase ?? 0)));
        put(m.collider, a.px + 0.5 + r * dsin(angle) - t.w / 2, a.py + 0.5 + r * dcos(angle));
      } else {
        const p = d.link === undefined && m.need === null ? (1 - dcos(TWO_PI * (time / (d.period ?? 1) + (d.phase ?? 0)))) / 2 : m.p;
        put(m.collider, t.x + (d.dx ?? 0) * p, t.y + (d.dy ?? 0) * p);
      }
    }
  }

  // --- 2. Crates --------------------------------------------------------------------------

  /**
   * One crate's step: carried by what it stands on, pushed by a row of players strong enough
   * (pushers lean against it: it is solid for them), then gravity. Never pushes anyone.
   */
  stepCrate(host: PropsHost, crate: CoopCrate, carrier: BoxCollider | null): void {
    crate.landed = false;
    crate.pushDir = 0;
    const grid = this.level.crateGrid;
    const cols = host.colliders;
    if (carrier && (carrier.dx !== 0 || carrier.dy !== 0)) {
      this.moveCrate(host, crate, carrier.dx, carrier.dy);
    }
    if (crate.support) {
      for (const dir of [1, -1] as const) {
        if (this.pushStrength(host, crate, dir) >= crate.need) {
          const moved = sweepX(grid, cols, crate.collider.id, crate.x, crate.y, crate.w, crate.h, dir * PROPS.pushSpeed * COOP_DT, -1);
          if (moved !== 0) {
            crate.x += moved;
            crate.pushDir = dir;
            crate.sync();
          }
          break;
        }
      }
    }
    // Gravity (a crate always falls with the fall gravity of the players).
    const wasSupported = crate.support !== null;
    crate.vy = Math.min(crate.vy + FALL_GRAVITY * COOP_DT, COOP_MOVEMENT.maxFallSpeed);
    const want = crate.vy * COOP_DT;
    const got = this.crateSweepY(host, crate, want);
    crate.y += got;
    if (want > 0 && got < want - EPS) {
      if (!wasSupported) crate.impactVy = crate.vy;
      crate.vy = 0;
    } else if (want < 0 && got > want + EPS) {
      crate.vy = 0;
    }
    crate.sync();
    crate.support = crate.vy >= 0 ? this.crateSupport(grid, cols, crate) : null;
    if (crate.support) {
      if (!wasSupported) crate.landed = true;
      crate.vy = 0;
    }
    // Out of the level or into a deadly pit: back home.
    if (crate.y > this.level.killY || this.touchesVoid(crate.x, crate.y, crate.w, crate.h)) crate.home();
  }

  /**
   * Move a crate by (dx, dy) through collisions (carried by its support, or by the rope through a
   * body). Whatever stands on it is carried by the world afterwards (moveStack, or the crate's
   * collider dx/dy for the riders that step after it).
   */
  moveCrate(host: PropsHost, crate: CoopCrate, dx: number, dy: number): void {
    const grid = this.level.crateGrid;
    const cols = host.colliders;
    if (dy < 0) {
      crate.y += this.crateSweepY(host, crate, dy);
      crate.x += sweepX(grid, cols, crate.collider.id, crate.x, crate.y, crate.w, crate.h, dx, -1);
    } else {
      crate.x += sweepX(grid, cols, crate.collider.id, crate.x, crate.y, crate.w, crate.h, dx, -1);
      crate.y += this.crateSweepY(host, crate, dy);
    }
    crate.sync();
  }

  /**
   * How far a crate can move along y: going up it never bumps into what stands on it, and rises
   * only as far as that pile can follow (a ceiling above it), like a body (CoopController.moveY).
   */
  private crateSweepY(host: PropsHost, crate: CoopCrate, dy: number): number {
    const got = sweepY(this.level.crateGrid, host.colliders, crate.collider.id, crate.x, crate.y, crate.w, crate.h, dy, crate.node, host);
    if (got >= 0) return got;
    const room = host.riderRoom(crate.node, -got);
    return room < -got ? -room : got;
  }

  /** What a crate rests on, or null. */
  crateSupport(grid: Level, cols: readonly BoxCollider[], crate: CoopCrate): Support | null {
    const feet = crate.y + crate.h;
    let best: BoxCollider | null = null;
    for (const c of cols) {
      if (c.off || c.id === crate.collider.id) continue;
      if (!spansOverlap(crate.x, crate.w, c.x, c.w)) continue;
      const gap = c.y - feet;
      if (gap < -EPS || gap > CONTACT_PROBE) continue;
      if (!best || c.id < best.id) best = c;
    }
    if (best) return { kind: "collider", id: best.id, body: best.body };
    const row = Math.floor(feet + EPS);
    if (Math.abs(feet - row) <= CONTACT_PROBE) {
      const [x0, x1] = cellSpan(crate.x, crate.w);
      for (let x = x0; x <= x1; x++) if (isSolidCell(grid, x, row)) return TERRAIN_SUPPORT;
    }
    return null;
  }

  /**
   * Total strength of the row of players pushing `crate` towards `dir`: grounded, pressing `dir`,
   * each touching the crate or the pusher in front. A friend pushes 1, Ruben 2.
   */
  pushStrength(host: PropsHost, crate: CoopCrate, dir: 1 | -1): number {
    const n = host.bodies.length;
    const used = new Array<boolean>(n).fill(false);
    let strength = 0;
    // The front: bodies touching the crate's side.
    let front: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!this.canPush(host, i, dir)) continue;
      const b = host.bodies[i]!;
      if (!spansOverlap(b.y, b.height, crate.y, crate.h)) continue;
      const gap = dir > 0 ? crate.x - (b.x + b.width) : b.x - (crate.x + crate.w);
      if (gap < -0.2 || gap > PROPS.pushTouch) continue;
      front.push(i);
    }
    while (front.length > 0) {
      const next: number[] = [];
      for (const i of front) {
        if (used[i]) continue;
        used[i] = true;
        const b = host.bodies[i]!;
        strength += b.isRuben ? COOP.rubenMass : 1;
        for (let j = 0; j < n; j++) {
          if (used[j] || !this.canPush(host, j, dir)) continue;
          const o = host.bodies[j]!;
          if (!spansOverlap(o.y, o.height, b.y, b.height)) continue;
          const gap = dir > 0 ? b.x - (o.x + o.width) : o.x - (b.x + b.width);
          if (gap < -0.2 || gap > PROPS.pushTouch) continue;
          next.push(j);
        }
      }
      front = next;
    }
    return strength;
  }

  private canPush(host: PropsHost, i: number, dir: number): boolean {
    return !host.isInside(i) && host.isGrounded(i) && host.inputDir(i) === dir;
  }

  // --- 3. Reactions ---------------------------------------------------------------------------

  /** After everyone moved: weights, plates, gates, shelves, floors, key, door, terminals. */
  interact(host: PropsHost): void {
    const tick = host.levelTick;
    // Plates.
    for (const p of this.plates) {
      p.load = p.standing ? host.standingLoadOn(p.collider.id) : host.loadOn(p.collider.id);
      const on = host.standersOn(p.collider.id).filter((node) => node < this.bodyCount);
      // Someone stepped off: remembered for the blame if the link goes off.
      for (const b of p.on) if (!on.includes(b)) this.releasedBy.set(p.link, b);
      const newcomer = on.find((b) => !p.on.includes(b)) ?? on[0] ?? -1;
      p.on = on;
      const pressed = p.exact ? p.load === p.need : p.load >= p.need;
      const was = p.active;
      if (pressed) p.hold = PROPS.plateHold;
      else p.hold = Math.max(0, p.hold - COOP_DT);
      p.active = pressed || p.hold > 0;
      // This plate turns its link on: whoever just stepped on is remembered for the blame.
      if (!was && p.active && this.signals.get(p.link) !== true) this.pressedBy.set(p.link, newcomer);
      if (was !== p.active) host.emit({ kind: "plate", thing: p.thing.index, active: p.active, body: p.active ? (on[0] ?? -1) : (this.releasedBy.get(p.link) ?? -1) });
    }
    for (const s of this.seesaws) {
      s.loadL = host.loadOn(s.left.id);
      s.loadR = host.loadOn(s.right.id);
    }
    for (const b of this.balances) {
      b.loadL = host.loadOn(b.left.collider.id);
      b.loadR = host.loadOn(b.right.collider.id);
    }
    for (const m of this.movers) m.load = host.loadOn(m.collider.id);

    // Terminals (↓ in front of one), the key (↓ next to its carrier) and the door (↓ in it).
    this.useDoorAndTerminals(host, tick);
    this.computeSignals();

    // Gates: open with their link; close only once nobody is in the way.
    for (const g of this.gates) {
      const want = this.wantsOpen(g);
      if (want) {
        g.open = true;
        g.blocked = false;
      } else if (g.open) {
        g.blocked = this.boxOccupied(host, g.collider.x, g.collider.y, g.collider.w, g.collider.h);
        if (!g.blocked) g.open = false;
      }
      g.collider.off = g.open;
      g.anim = approach(g.anim, g.open ? 1 : 0, PROPS.gateAnim * COOP_DT);
    }

    // Switch blocks: a head hit swaps the shelves.
    this.switchCooldown = Math.max(0, this.switchCooldown - COOP_DT);
    if (this.switchCooldown === 0) {
      for (let i = 0; i < host.bodies.length; i++) {
        // A body inside the door hits nothing (its last head contact is stale).
        if (host.isInside(i)) continue;
        const hit = host.bodies[i]!.headCollider;
        if (hit < 0 || !this.switches.some((s) => s.collider.id === hit)) continue;
        this.active = this.active === "A" ? "B" : "A";
        this.switchCooldown = PROPS.switchCooldown;
        host.emit({ kind: "switch", body: i, active: this.active });
        for (const s of this.shelves) if (s.group !== this.active) s.solid = false;
        break;
      }
    }
    for (const s of this.shelves) {
      if (s.group === this.active && !s.solid) {
        const c = s.collider;
        s.solid = !this.boxOccupied(host, c.x, c.y, c.w, c.h);
      }
      s.collider.off = !s.solid;
    }

    // Fragile floors.
    for (const f of this.fragiles) {
      if (f.broken) continue;
      f.load = host.loadOn(f.collider.id);
      if (f.load >= PROPS.fragileWeight) {
        f.broken = true;
        f.collider.off = true;
        host.emit({ kind: "crack", thing: f.thing.index });
      }
    }

    // The key: picked up on contact.
    const key = this.level.key;
    if (key && this.keyCarrier === -1) {
      for (let i = 0; i < host.bodies.length; i++) {
        if (host.isInside(i)) continue;
        const b = host.bodies[i]!;
        if (boxesTouch(b.x, b.y, b.width, b.height, key.x + 0.15, key.y + 0.25, 0.7, 0.5)) {
          this.keyCarrier = i;
          host.emit({ kind: "key", body: i, from: -1 });
          break;
        }
      }
    }
    // The carrier opens the door by touching it.
    const door = this.level.door;
    if (door && !this.doorOpen && this.keyCarrier >= 0) {
      const b = host.bodies[this.keyCarrier]!;
      if (boxesTouch(b.x, b.y, b.width, b.height, door.x, door.y, door.w, door.h)) {
        this.doorOpen = true;
        this.doorOpener = this.keyCarrier;
        host.emit({ kind: "doorOpen", body: this.keyCarrier });
        this.keyCarrier = -2;
      }
    }
  }

  /** ↓ presses, in priority: the door (enter / leave), a terminal, taking the key from its carrier. */
  private useDoorAndTerminals(host: PropsHost, tick: number): void {
    const door = this.level.door;
    for (let i = 0; i < host.bodies.length; i++) {
      if (!host.downPressed(i)) continue;
      const b = host.bodies[i]!;
      if (host.isInside(i)) continue; // the world handles leaving the door
      if (door && this.doorOpen && boxesTouch(b.x, b.y, b.width, b.height, door.x, door.y, door.w, door.h)) {
        host.emit({ kind: "enter", body: i });
        continue;
      }
      const term = this.terminals.find((t) => boxesTouch(b.x, b.y, b.width, b.height, t.thing.x, t.thing.y, t.thing.w, t.thing.h));
      if (term) {
        this.useTerminal(host, term, i, tick);
        continue;
      }
      const c = this.keyCarrier;
      if (c >= 0 && c !== i) {
        const o = host.bodies[c]!;
        const dx = o.cx - b.cx;
        const dy = o.cy - b.cy;
        if (dx * dx + dy * dy <= PROPS.keyReach * PROPS.keyReach) {
          this.keyCarrier = i;
          host.emit({ kind: "key", body: i, from: c });
        }
      }
    }
  }

  private useTerminal(host: PropsHost, term: TerminalState, body: number, tick: number): void {
    const inverted = host.bodies[body]!.isRuben;
    term.usedAt = tick;
    term.usedBy = body;
    const group = term.def.together;
    if (group === undefined) {
      this.applyTerminal(term, inverted, body);
      host.emit({ kind: "terminal", thing: term.thing.index, body, inverted, waiting: false });
      return;
    }
    const window = Math.round(PROPS.togetherWindow / COOP_DT);
    const all = this.terminals.filter((t) => t.def.together === group);
    const ready = all.every((t) => t.usedAt >= 0 && tick - t.usedAt <= window);
    if (ready) {
      for (const t of all) {
        this.applyTerminal(t, host.bodies[t.usedBy]!.isRuben, t.usedBy);
        t.usedAt = -1;
      }
    }
    host.emit({ kind: "terminal", thing: term.thing.index, body, inverted, waiting: !ready });
  }

  private applyTerminal(term: TerminalState, inverted: boolean, body: number): void {
    const k = this.latchLinks.indexOf(term.def.link);
    const on = inverted ? term.def.set !== "on" : term.def.set === "on";
    // Who switched the latch, for the blame of a gate it opens.
    if (on !== this.latches[k]) (on ? this.pressedBy : this.releasedBy).set(term.def.link, body);
    this.latches[k] = on;
  }

  /** Links on: any active plate, or a terminal that set it. */
  computeSignals(): void {
    this.signals.clear();
    for (const p of this.plates) if (p.active) this.signals.set(p.link, true);
    this.latchLinks.forEach((l, k) => {
      if (this.latches[k]) this.signals.set(l, true);
    });
  }

  private wantsOpen(g: GateState): boolean {
    return (this.signals.get(g.link) === true) !== g.inverted;
  }

  /** Whether a body (not inside the door) or a crate overlaps the box. */
  private boxOccupied(host: PropsHost, x: number, y: number, w: number, h: number): boolean {
    for (let i = 0; i < host.bodies.length; i++) {
      if (host.isInside(i)) continue;
      const b = host.bodies[i]!;
      if (spansOverlap(b.x, b.width, x, w) && spansOverlap(b.y, b.height, y, h)) return true;
    }
    for (const c of this.crates) if (spansOverlap(c.x, c.w, x, w) && spansOverlap(c.y, c.h, y, h)) return true;
    return false;
  }

  /**
   * After the move: a node that landed hard on the raised side of a seesaw fires the catapult.
   * `landings` lists nodes that landed this step, with their downward speed.
   */
  catapults(host: PropsHost, landings: ReadonlyArray<{ node: number; vy: number; support: number }>): void {
    const vMin = Math.sqrt(2 * FALL_GRAVITY * PROPS.catapultFall);
    for (const s of this.seesaws) {
      for (const l of landings) {
        let side = 0;
        if (l.support === s.left.id && s.t <= 0) side = 1;
        else if (l.support === s.right.id && s.t >= 0) side = -1;
        if (side === 0 || l.vy < vMin) continue;
        const fall = (l.vy * l.vy) / (2 * FALL_GRAVITY);
        const other = side === 1 ? s.right.id : s.left.id;
        const launched = host.standersOn(other);
        const wFall = host.weightOf(l.node);
        let wUp = 0;
        for (const n of launched) wUp += host.weightOf(n);
        s.snap = side;
        if (launched.length === 0) continue;
        const height = Math.min(PROPS.catapultMax, (PROPS.catapultGain * fall * wFall) / Math.max(1, wUp));
        for (const n of launched) host.launchNode(n, height, l.node);
        host.emit({ kind: "catapult", thing: s.thing.index, by: l.node, height });
        break;
      }
    }
  }

  // --- Hazards -------------------------------------------------------------------------------

  /** Whether a (hazard-inset) body box touches spikes, a deadly pit or the deadline. */
  killsBox(x: number, y: number, w: number, h: number, levelTick: number): "hazard" | "deadline" | null {
    if (this.touchesVoid(x, y, w, h)) return "hazard";
    const d = PROPS.spikeDepth;
    for (const s of this.spikes) {
      const t = s.thing;
      let r: [number, number, number, number];
      if (s.dir === "up") r = [t.x, t.y + t.h - d, t.w, d];
      else if (s.dir === "down") r = [t.x, t.y, t.w, d];
      else if (s.dir === "left") r = [t.x + t.w - d, t.y, d, t.h];
      else r = [t.x, t.y, d, t.h];
      if (x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]) return "hazard";
    }
    const dl = this.deadlineX(levelTick);
    if (dl !== null && x < dl) return "deadline";
    return null;
  }

  /** Front of the deadline wall, cells, or null without one. */
  deadlineX(levelTick: number): number | null {
    const d = this.level.deadline;
    if (!d) return null;
    return d.x0 + Math.max(0, levelTick * COOP_DT - d.delay) * d.speed;
  }

  private touchesVoid(x: number, y: number, w: number, h: number): boolean {
    if (this.level.voids.size === 0) return false;
    const [x0, x1] = cellSpan(x, w);
    const [y0, y1] = cellSpan(y, h);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (this.level.voids.has(cy * this.level.width + cx)) return true;
    return false;
  }

  // --- Snapshots -------------------------------------------------------------------------------

  /** The whole state as numbers, in a fixed order (snapshots, prediction, hashes). */
  save(): number[] {
    const out: number[] = [];
    for (const c of this.crates) {
      const s = c.support;
      out.push(c.x, c.y, c.vy, s === null ? -2 : s.kind === "terrain" ? -1 : s.id, c.impactVy, c.pushDir);
    }
    for (const p of this.plates) out.push(p.hold, p.active ? 1 : 0, p.load);
    for (const g of this.gates) out.push(g.open ? 1 : 0, g.blocked ? 1 : 0, g.anim);
    for (const s of this.seesaws) out.push(s.t, s.snap, s.loadL, s.loadR);
    for (const b of this.balances) out.push(b.offset, b.loadL, b.loadR);
    for (const m of this.movers) out.push(m.p, m.load);
    for (const s of this.shelves) out.push(s.solid ? 1 : 0);
    for (const t of this.terminals) out.push(t.usedAt, t.usedBy);
    for (const f of this.fragiles) out.push(f.broken ? 1 : 0, f.load);
    for (const l of this.latches) out.push(l ? 1 : 0);
    out.push(this.active === "A" ? 0 : 1, this.switchCooldown, this.keyCarrier, this.doorOpen ? 1 : 0, this.doorOpener);
    return out;
  }

  load(v: readonly number[], levelTick: number): void {
    let o = 0;
    const next = () => v[o++] ?? 0;
    for (const c of this.crates) {
      c.x = next();
      c.y = next();
      c.vy = next();
      const s = next();
      c.support = s === -2 ? null : s === -1 ? TERRAIN_SUPPORT : { kind: "collider", id: s, body: s < OBJECT_COLLIDER_BASE ? s : NO_BODY };
      c.impactVy = next();
      c.pushDir = next();
      c.landed = false;
      c.sync();
    }
    for (const p of this.plates) {
      p.hold = next();
      p.active = next() === 1;
      p.load = next();
    }
    for (const g of this.gates) {
      g.open = next() === 1;
      g.blocked = next() === 1;
      g.anim = next();
      g.collider.off = g.open;
    }
    for (const s of this.seesaws) {
      s.t = next();
      s.snap = next();
      s.loadL = next();
      s.loadR = next();
    }
    for (const b of this.balances) {
      b.offset = next();
      b.loadL = next();
      b.loadR = next();
    }
    for (const m of this.movers) {
      m.p = next();
      m.load = next();
    }
    for (const s of this.shelves) {
      s.solid = next() === 1;
      s.collider.off = !s.solid;
    }
    for (const t of this.terminals) {
      t.usedAt = next();
      t.usedBy = next();
    }
    for (const f of this.fragiles) {
      f.broken = next() === 1;
      f.load = next();
      f.collider.off = f.broken;
    }
    this.latches = this.latches.map(() => next() === 1);
    this.active = next() === 0 ? "A" : "B";
    this.switchCooldown = next();
    this.keyCarrier = next();
    this.doorOpen = next() === 1;
    this.doorOpener = next();
    this.computeSignals();
    this.placeKinematic(levelTick);
  }
}

// --- Box sweeps (crates) ---------------------------------------------------------------------

/**
 * How far a box can move along x (|dx| < 1) through the grid and the solid colliders that are not
 * `self`. Colliders it already overlaps are ignored (they separate).
 */
export function sweepX(grid: Level, cols: readonly BoxCollider[], self: number, x: number, y: number, w: number, h: number, dx: number, _node: number): number {
  if (dx === 0) return 0;
  let limit = dx;
  const [r0, r1] = cellSpan(y, h);
  if (dx > 0) {
    const edge = x + w;
    for (let c = Math.floor(edge + EPS); c <= Math.floor(edge + dx - EPS); c++) {
      let hit = false;
      for (let r = r0; r <= r1 && !hit; r++) hit = isSolidCell(grid, c, r);
      if (hit) {
        limit = Math.max(0, Math.min(limit, c - edge));
        break;
      }
    }
  } else {
    for (let c = Math.ceil(x - EPS) - 1; c >= Math.ceil(x + dx + EPS) - 1; c--) {
      let hit = false;
      for (let r = r0; r <= r1 && !hit; r++) hit = isSolidCell(grid, c, r);
      if (hit) {
        limit = Math.min(0, Math.max(limit, c + 1 - x));
        break;
      }
    }
  }
  for (const c of cols) {
    if (c.off || c.id === self || c.mode !== "solid") continue;
    if (!spansOverlap(y, h, c.y, c.h)) continue;
    if (boxesOverlap(x, y, w, h, c)) continue;
    if (dx > 0) {
      const gap = c.x - (x + w);
      if (gap >= -EPS && gap < limit) limit = Math.max(0, gap);
    } else {
      const gap = c.x + c.w - x;
      if (gap <= EPS && gap > limit) limit = Math.min(0, gap);
    }
  }
  return limit;
}

/**
 * How far a box can move along y (|dy| < 1): down it lands on the grid, on solid colliders and on
 * one-way tops; up it bumps into the grid and solid colliders. `node` is the box's own node: given
 * `space`, it never bumps into what stands on it, directly or not (the world carries that along).
 */
export function sweepY(
  grid: Level,
  cols: readonly BoxCollider[],
  self: number,
  x: number,
  y: number,
  w: number,
  h: number,
  dy: number,
  node: number,
  space: { ridesOn(rider: number, base: number): boolean } | null = null,
): number {
  if (dy === 0) return 0;
  let limit = dy;
  const [c0, c1] = cellSpan(x, w);
  if (dy > 0) {
    const edge = y + h;
    for (let r = Math.floor(edge + EPS); r <= Math.floor(edge + dy - EPS); r++) {
      let hit = false;
      for (let c = c0; c <= c1 && !hit; c++) hit = isSolidCell(grid, c, r);
      if (hit) {
        limit = Math.max(0, Math.min(limit, r - edge));
        break;
      }
    }
  } else {
    for (let r = Math.ceil(y - EPS) - 1; r >= Math.ceil(y + dy + EPS) - 1; r--) {
      let hit = false;
      for (let c = c0; c <= c1 && !hit; c++) hit = isSolidCell(grid, c, r);
      if (hit) {
        limit = Math.min(0, Math.max(limit, r + 1 - y));
        break;
      }
    }
  }
  for (const c of cols) {
    if (c.off || c.id === self) continue;
    if (!spansOverlap(x, w, c.x, c.w)) continue;
    if (boxesOverlap(x, y, w, h, c)) continue;
    if (dy > 0) {
      const gap = c.y - (y + h);
      if (gap >= -EPS && gap < limit) limit = Math.max(0, gap);
    } else {
      if (c.mode !== "solid") continue;
      if (space && node >= 0 && c.node >= 0 && space.ridesOn(c.node, node)) continue;
      const gap = c.y + c.h - y;
      if (gap <= EPS && gap > limit) limit = Math.min(0, gap);
    }
  }
  return limit;
}

/** Boxes overlap or touch (within a hair). */
export function boxesTouch(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): boolean {
  const m = 0.02;
  return ax < bx + bw + m && bx < ax + aw + m && ay < by + bh + m && by < ay + ah + m;
}

function approach(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
