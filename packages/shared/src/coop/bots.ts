/**
 * Test bots for co-op levels: goal-driven players that solve a level on the real physics, so
 * every level is checked at 2, 3, 4 and 5 players (coopLevels.test.ts, check-coop-level.ts).
 *
 * A solution is a list of phases; in each phase every bot has a goal: walk somewhere, climb on a
 * friend, jump towards a ledge, hold a direction, press ↓... A phase ends when its `until`
 * condition holds (or, without one, when every goal is done) and fails after its timeout. Goals
 * read the world each step and answer with input bits, like a player would, so a solution
 * survives small tuning changes better than recorded key presses.
 *
 * Roles: "R" is Ruben (always the last body of the chain), "F0".."F3" the friends in seat order,
 * "*" every bot without a goal of its own. Solutions are functions of the team size.
 */
import { isSolidCell } from "../level";
import { BIT_DOWN, BIT_DOWN_PRESS, BIT_JUMP, BIT_JUMP_PRESS, BIT_LEFT, BIT_RIGHT } from "./inputBits";
import { COOP_DT, COOP_MOVEMENT } from "./coopTuning";
import { parseCoopLevel, type CoopLevelDef } from "./levelFormat";
import { CoopWorld, type CoopEvent } from "./world";

export type Role = "R" | "F0" | "F1" | "F2" | "F3";

export interface BotCtx {
  readonly w: CoopWorld;
  /** The bot's body index. */
  readonly i: number;
  /** Steps since the goal started. */
  t: number;
}

export interface Goal {
  label: string;
  /** Input bits for this step. */
  step(c: BotCtx): number;
  /** Whether the goal is reached (checked after each step). A goal without it never ends by itself. */
  done?(c: BotCtx): boolean;
}

/** A goal, or a function making one for a body (for "*", which applies to several bots). */
export type GoalSpec = Goal | ((i: number) => Goal);

export interface Phase {
  /** What happens, in English (logs). */
  name: string;
  /** Goals by role. A bot with no goal (and no "*") stands still. */
  do: Partial<Record<Role | "*", GoalSpec>>;
  /** The phase ends when this holds. Default: when every goal that can end is done. */
  until?: (w: CoopWorld) => boolean;
  /** Seconds before the phase fails. Default 20. */
  timeout?: number;
}

export type CoopSolution = (players: number) => Phase[];

/** Body index of a role in a team of n (Ruben last). */
export function roleIndex(role: Role, n: number): number {
  if (role === "R") return n - 1;
  const k = Number(role.slice(1));
  if (k >= n - 1) throw new Error(`no ${role} in a team of ${n}`);
  return k;
}

/** Role of body i in a team of n. */
export function roleOf(i: number, n: number): Role {
  return i === n - 1 ? "R" : (`F${i}` as Role);
}

/** The friends' roles in a team of n, in seat order. */
export function friends(n: number): Role[] {
  return Array.from({ length: n - 1 }, (_, k) => `F${k}` as Role);
}

const DECEL = COOP_MOVEMENT.groundDecel;
/** Hold jump this many steps after pressing (a full jump rises for about 0.39 s). */
const JUMP_HOLD = Math.round(0.42 / COOP_DT);

function dirBits(dir: number): number {
  return dir > 0 ? BIT_RIGHT : dir < 0 ? BIT_LEFT : 0;
}

/** Whether there is ground (terrain, or a collider top) under (x, feet) within `depth` cells. */
function groundAt(w: CoopWorld, self: number, x: number, feet: number, depth: number): boolean {
  const grid = w.level.collision;
  for (let y = Math.floor(feet + 0.01); y <= Math.floor(feet + depth); y++) if (isSolidCell(grid, Math.floor(x), y)) return true;
  for (const c of w.colliders) {
    if (c.off || c.body === self) continue;
    if (x < c.x || x > c.x + c.w) continue;
    if (c.y >= feet - 0.05 && c.y <= feet + depth) return true;
  }
  return false;
}

/** Whether body i stands on body j (directly). */
export function standsOn(w: CoopWorld, i: number, j: number): boolean {
  const s = w.bodies[i]!.support;
  return !!s && s.kind === "collider" && s.body === j && !w.inside[i];
}

// --- Goals ----------------------------------------------------------------------------------

/** Stand still; done at once (the phase ends on its `until`). */
export function idle(): Goal {
  return { label: "idle", step: () => 0, done: () => true };
}

/** Stand still for a while. */
export function wait(seconds: number): Goal {
  const steps = Math.round(seconds / COOP_DT);
  return { label: `wait ${seconds}s`, step: () => 0, done: (c) => c.t >= steps };
}

export interface WalkOptions {
  /** How close to x counts as there (centre), cells. Default 0.2. */
  tol?: number;
  /** Jump when blocked by a wall or a step ("auto", the default), or never (hauling, pushing). */
  jump?: "auto" | "never";
  /** Walk off ledges instead of jumping gaps. */
  drop?: boolean;
}

/** Walk until the body's centre is at x, jumping steps and gaps on the way. */
export function walk(x: number, o: WalkOptions = {}): Goal {
  const tol = o.tol ?? 0.2;
  let hold = 0;
  let stuck = 0;
  return {
    label: `walk ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      const dx = x - b.cx;
      const dir = Math.sign(dx);
      const brake = (b.vx * b.vx) / (2 * DECEL) + 0.03;
      let bits = Math.abs(dx) > Math.max(tol * 0.5, brake) ? dirBits(dir) : 0;
      if (hold > 0) {
        hold--;
        return bits | BIT_JUMP;
      }
      if (o.jump === "never" || !b.grounded || bits === 0) {
        stuck = 0;
        return bits;
      }
      stuck = Math.abs(b.vx) < 0.5 ? stuck + 1 : 0;
      const front = dir > 0 ? b.x + b.width + 0.3 : b.x - 0.3;
      const gap = !o.drop && Math.abs(dx) > 1.2 && !groundAt(c.w, c.i, front, b.y + b.height, 0.6);
      if (stuck >= 4 || gap) {
        stuck = 0;
        hold = JUMP_HOLD;
        bits |= BIT_JUMP | BIT_JUMP_PRESS;
      }
      return bits;
    },
    done(c) {
      const b = c.w.bodies[c.i]!;
      return Math.abs(x - b.cx) <= tol && b.grounded && Math.abs(b.vx) < 1;
    },
  };
}

/** Keep pressing a direction (pushing a crate, bracing, walking away to haul). */
export function hold(dir: -1 | 1): Goal {
  return { label: `hold ${dir > 0 ? "right" : "left"}`, step: () => dirBits(dir) };
}

/** Press ↓ once (the door, a terminal, taking the key). */
export function use(): Goal {
  return {
    label: "use",
    step: (c) => (c.t === 0 ? BIT_DOWN | BIT_DOWN_PRESS : c.t < 3 ? BIT_DOWN : 0),
    done: (c) => c.t >= 4,
  };
}

export interface JumpOptions {
  /** Rise this long before steering towards x, seconds (to clear a ledge's side). Default 0. */
  rise?: number;
  /** Release jump after this long (a lower jump), seconds. Default: a full jump. */
  holdFor?: number;
}

/** Jump now (from the ground or a friend's head) and steer towards x; done once landed. */
export function jumpTo(x: number, o: JumpOptions = {}): Goal {
  const riseSteps = Math.round((o.rise ?? 0) / COOP_DT);
  const holdSteps = o.holdFor === undefined ? JUMP_HOLD : Math.round(o.holdFor / COOP_DT);
  let left = false;
  let air = 0;
  return {
    label: `jump to ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      let bits = 0;
      if (c.t === 0) bits |= BIT_JUMP | BIT_JUMP_PRESS;
      else if (c.t < holdSteps) bits |= BIT_JUMP;
      if (!b.grounded) {
        left = true;
        air++;
      }
      if (c.t >= riseSteps) {
        const dx = x - b.cx;
        const brake = (b.vx * b.vx) / (2 * COOP_MOVEMENT.airDecel) + 0.05;
        if (Math.abs(dx) > brake) bits |= dirBits(Math.sign(dx));
      }
      return bits;
    },
    done(c) {
      const b = c.w.bodies[c.i]!;
      return left && air > 3 && b.grounded;
    },
  };
}

/** Climb onto a friend's head (a tower): walk next to them, jump, steer onto them. Retries on a miss. */
export function mount(target: Role, o: { side?: -1 | 1 } = {}): Goal {
  let state: "approach" | "air" = "approach";
  let air = 0;
  let hold = 0;
  let settle = 0;
  return {
    label: `mount ${target}`,
    step(c) {
      const w = c.w;
      const j = roleIndex(target, w.bodies.length);
      const b = w.bodies[c.i]!;
      const t = w.bodies[j]!;
      if (standsOn(w, c.i, j)) {
        state = "approach";
        // Centre on the friend's head.
        const dx = t.cx - b.cx;
        return Math.abs(dx) > 0.12 ? dirBits(Math.sign(dx)) : 0;
      }
      if (state === "approach") {
        const side = o.side ?? (b.cx <= t.cx ? -1 : 1);
        const spot = t.cx + side * 1.0;
        const dx = spot - b.cx;
        if (Math.abs(dx) > 0.2 || !b.grounded) {
          settle = 0;
          return Math.abs(dx) > 0.12 ? dirBits(Math.sign(dx)) : 0;
        }
        if (++settle < 3) return 0;
        state = "air";
        air = 0;
        hold = JUMP_HOLD;
        return BIT_JUMP | BIT_JUMP_PRESS;
      }
      // In the air: go up first, then steer onto the head once the feet are above it.
      air++;
      let bits = hold-- > 0 ? BIT_JUMP : 0;
      const feet = b.y + b.height;
      if (feet < t.y - 0.05) {
        const dx = t.cx - b.cx;
        if (Math.abs(dx) > 0.06) bits |= dirBits(Math.sign(dx));
      }
      if (b.grounded && air > 4) state = "approach";
      return bits;
    },
    done(c) {
      const j = roleIndex(target, c.w.bodies.length);
      const b = c.w.bodies[c.i]!;
      const t = c.w.bodies[j]!;
      return standsOn(c.w, c.i, j) && Math.abs(t.cx - b.cx) < 0.2;
    },
  };
}

/**
 * Go through the door: walk to it (without jumping: friends queue instead of piling up) and press
 * ↓ whenever the body touches it; done once inside.
 */
export function enter(): Goal {
  let w0: Goal | null = null;
  return {
    label: "enter the door",
    step(c) {
      if (c.w.inside[c.i]) return 0;
      const d = c.w.level.door!;
      const b = c.w.bodies[c.i]!;
      const touching = b.x < d.x + d.w + 0.02 && d.x < b.x + b.width + 0.02 && b.y < d.y + d.h && d.y < b.y + b.height;
      if (touching && b.grounded) return c.t % 6 === 0 ? BIT_DOWN | BIT_DOWN_PRESS : BIT_DOWN;
      w0 ??= walk(d.x + d.w / 2, { tol: 0.25, jump: "never" });
      return w0.step(c);
    },
    done: (c) => c.w.inside[c.i] === true,
  };
}

/** Goals one after the other. */
export function seq(...goals: Goal[]): Goal {
  let k = 0;
  let t0 = 0;
  return {
    label: goals.map((g) => g.label).join(" > "),
    step(c) {
      while (k < goals.length - 1 && goals[k]!.done?.({ w: c.w, i: c.i, t: c.t - t0 })) {
        k++;
        t0 = c.t;
      }
      return goals[k]!.step({ w: c.w, i: c.i, t: c.t - t0 });
    },
    done(c) {
      return k === goals.length - 1 && goals[k]!.done?.({ w: c.w, i: c.i, t: c.t - t0 }) === true;
    },
  };
}

/** Stand still until `cond` holds, then pursue the goal. */
export function when(cond: (w: CoopWorld) => boolean, goal: Goal): Goal {
  let t0 = -1;
  return {
    label: `when … ${goal.label}`,
    step(c) {
      if (t0 < 0 && cond(c.w)) t0 = c.t;
      return t0 < 0 ? 0 : goal.step({ w: c.w, i: c.i, t: c.t - t0 });
    },
    done: (c) => t0 >= 0 && goal.done?.({ w: c.w, i: c.i, t: c.t - t0 }) === true,
  };
}

// --- Conditions -----------------------------------------------------------------------------

export const cond = {
  /** The role's centre is within tol of x and it stands. */
  near:
    (role: Role, x: number, tol = 0.4) =>
    (w: CoopWorld) => {
      const b = w.bodies[roleIndex(role, w.bodies.length)]!;
      return Math.abs(b.cx - x) <= tol && b.grounded;
    },
  /** The role stands on another role's head. */
  on: (role: Role, base: Role) => (w: CoopWorld) => standsOn(w, roleIndex(role, w.bodies.length), roleIndex(base, w.bodies.length)),
  /** The role's feet are at or above y and it stands on something. */
  standsAbove:
    (role: Role, y: number) =>
    (w: CoopWorld) => {
      const b = w.bodies[roleIndex(role, w.bodies.length)]!;
      return b.grounded && b.y + b.height <= y + 1e-3;
    },
  /** Every body's centre is within [x0, x1] and stands. */
  allBetween: (x0: number, x1: number) => (w: CoopWorld) => w.bodies.every((b, i) => w.inside[i] || (b.grounded && b.cx >= x0 && b.cx <= x1)),
  /** Every body stands with its feet at or above y. */
  allAbove: (y: number) => (w: CoopWorld) => w.bodies.every((b, i) => w.inside[i] || (b.grounded && b.y + b.height <= y + 1e-3)),
  inside: (role: Role) => (w: CoopWorld) => w.inside[roleIndex(role, w.bodies.length)] === true,
  won: (w: CoopWorld) => w.won,
  keyTaken: (w: CoopWorld) => w.props.keyCarrier >= 0 || w.props.keyCarrier === -2,
  doorOpen: (w: CoopWorld) => w.props.doorOpen,
  gateOpen: (char: string) => (w: CoopWorld) => w.props.gates.some((g) => g.thing.char === char && g.open),
  plateActive: (char: string) => (w: CoopWorld) => w.props.plates.some((p) => p.thing.char === char && p.active),
  all:
    (...cs: Array<(w: CoopWorld) => boolean>) =>
    (w: CoopWorld) =>
      cs.every((f) => f(w)),
  any:
    (...cs: Array<(w: CoopWorld) => boolean>) =>
    (w: CoopWorld) =>
      cs.some((f) => f(w)),
};

// --- Runner ---------------------------------------------------------------------------------

export interface SolutionResult {
  ok: boolean;
  players: number;
  /** World seconds until everyone was inside, or until the failure. */
  seconds: number;
  deaths: number;
  /** Why it failed (the phase and what went wrong). */
  failure?: string;
  /** One line per phase: its name and how long it took. */
  log: string[];
  world: CoopWorld;
}

export interface RunOptions {
  /** Called every `every` steps (default 120: once a second) with the world and the phase's name. */
  trace?: (w: CoopWorld, phase: string) => void;
  every?: number;
}

/** Play a solution with n players (Ruben last) until everyone is through the door. */
export function runSolution(def: CoopLevelDef, n: number, solution: CoopSolution, opts: RunOptions = {}): SolutionResult {
  const level = parseCoopLevel(def, n);
  const world = new CoopWorld(
    level,
    Array.from({ length: n }, (_, i) => ({ name: roleOf(i, n), isRuben: i === n - 1 })),
  );
  const log: string[] = [];
  const result = (ok: boolean, failure?: string): SolutionResult => ({
    ok,
    players: n,
    seconds: world.tick * COOP_DT,
    deaths: world.attempt - 1,
    failure,
    log,
    world,
  });
  let phases: Phase[];
  try {
    phases = solution(n);
  } catch (e) {
    return result(false, `solution(${n}) threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  for (const phase of phases) {
    const goals: Array<Goal | null> = world.bodies.map((_, i) => {
      const spec = phase.do[roleOf(i, n)] ?? phase.do["*"];
      if (!spec) return null;
      return typeof spec === "function" ? spec(i) : spec;
    });
    const ctxs: BotCtx[] = world.bodies.map((_, i) => ({ w: world, i, t: 0 }));
    const limit = Math.round((phase.timeout ?? 20) / COOP_DT);
    const start = world.tick;
    let ended = false;
    for (let s = 0; s < limit; s++) {
      const bits = goals.map((g, i) => (g ? g.step(ctxs[i]!) : 0));
      world.step(bits);
      for (const c of ctxs) c.t++;
      if (opts.trace && world.tick % (opts.every ?? 120) === 0) opts.trace(world, phase.name);
      const death = world.events.find((e): e is Extract<CoopEvent, { kind: "death" }> => e.kind === "death");
      if (death) {
        const b = world.bodies[death.victim]!;
        return result(false, `${phase.name}: ${roleOf(death.victim, n)} died (${death.cause}) at (${b.cx.toFixed(1)}, ${b.cy.toFixed(1)})`);
      }
      if (world.won) {
        log.push(`${phase.name}: ${((world.tick - start) * COOP_DT).toFixed(1)} s`);
        return result(true);
      }
      const finished = phase.until
        ? phase.until(world)
        : goals.every((g, i) => !g || !g.done || g.done(ctxs[i]!)) && goals.some((g) => g?.done);
      if (finished) {
        ended = true;
        break;
      }
    }
    if (!ended) {
      const where = world.bodies
        .map((b, i) => `${roleOf(i, n)}(${b.cx.toFixed(2)}, ${(b.y + b.height).toFixed(2)}${b.grounded ? "" : " air"}${world.inside[i] ? " in" : ""}: ${goals[i]?.label ?? "idle"})`)
        .join(" ");
      return result(false, `${phase.name}: timed out after ${phase.timeout ?? 20} s; ${where}`);
    }
    log.push(`${phase.name}: ${((world.tick - start) * COOP_DT).toFixed(1)} s`);
  }
  return result(false, "every phase ended but not everybody is through the door");
}

/** The world as text: terrain, things, and bodies (friends 0-3, Ruben R), for logs. */
export function drawWorld(w: CoopWorld): string {
  const lv = w.level;
  const rows: string[][] = [];
  for (let y = 0; y < lv.height; y++) {
    const r: string[] = [];
    for (let x = 0; x < lv.width; x++) {
      const at = y * lv.width + x;
      r.push(lv.glass.has(at) ? "%" : isSolidCell(lv.terrain, x, y) ? "#" : lv.voids.has(at) ? "~" : ".");
    }
    rows.push(r);
  }
  const put = (x: number, y: number, ch: string) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    if (cy >= 0 && cy < rows.length && cx >= 0 && cx < lv.width) rows[cy]![cx] = ch;
  };
  for (const o of lv.objects) put(o.x, o.y, o.kind === "spikes" ? "^" : o.kind === "saw" ? "*" : o.kind === "spring" ? "T" : "=");
  for (const t of lv.things) {
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) if (t.def.kind !== "crate" && t.def.kind !== "mover") put(x, y, t.char);
  }
  const p = w.props;
  for (const g of p.gates) if (g.open) for (let y = g.thing.y; y < g.thing.y + g.thing.h; y++) for (let x = g.thing.x; x < g.thing.x + g.thing.w; x++) put(x, y, ":");
  for (const m of p.movers) for (let x = 0; x < m.thing.w; x++) put(m.collider.x + x + 0.5, m.collider.y + 0.1, m.thing.char);
  for (const c of p.crates) for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) put(c.x + x + 0.5, c.y + y + 0.5, "C");
  if (lv.key && p.keyCarrier === -1) put(lv.key.x, lv.key.y, "K");
  if (lv.door) put(lv.door.x, lv.door.y, p.doorOpen ? "O" : "D");
  w.bodies.forEach((b, i) => {
    if (!w.inside[i]) put(b.cx, b.cy, i === w.bodies.length - 1 ? "R" : String(i));
  });
  return rows.map((r) => r.join("")).join("\n");
}
