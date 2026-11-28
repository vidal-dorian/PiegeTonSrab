/**
 * Bot solution of "L'Amphi" (coop03.ts), and the ways round the puzzle that must fail.
 *
 * Roles: R is Ruben, F0..F3 the friends in seat order; the last friend is Ruben's neighbour in the
 * chain, F0 the free end of the chain. Map, beats and numbers: docs/coop-levels/coop03.md.
 */
import { BIT_DOWN, BIT_DOWN_PRESS, BIT_JUMP, BIT_JUMP_PRESS, BIT_LEFT, BIT_RIGHT } from "../inputBits";
import { COOP_DT } from "../coopTuning";
import { cond, enter, friends, jumpTo, mount, roleIndex, seq, walk, type CoopSolution, type Goal, type Phase, type Role } from "../bots";
import type { CoopWorld } from "../world";

// --- Helpers (goals and conditions the toolbox does not have) --------------------------------

/** The role's feet are at or below y (it fell into the cellar, say). */
const feetBelow = (role: Role, y: number) => (w: CoopWorld) => {
  const b = w.bodies[roleIndex(role, w.bodies.length)]!;
  return b.y + b.height >= y - 1e-3;
};
/** The role's centre is right of x. */
const pastX = (role: Role, x: number) => (w: CoopWorld) => w.bodies[roleIndex(role, w.bodies.length)]!.cx > x;
const not = (c: (w: CoopWorld) => boolean) => (w: CoopWorld) => !c(w);
/** The trapdoor w (a platform that slides under the bench) is open: slid away, at least partly. */
const trapdoorOpen = (w: CoopWorld) => w.props.movers.some((m) => m.thing.char === "w" && m.p > 0);
/** Every listed role stands near its x. */
const allNear = (spots: Array<[Role, number]>, tol = 0.35) => cond.all(...spots.map(([r, x]) => cond.near(r, x, tol)));
/** Goals walking each role to its spot. */
const goTo = (spots: Array<[Role, number]>, o: Parameters<typeof walk>[1] = never): Phase["do"] => Object.fromEntries(spots.map(([r, x]) => [r, walk(x, o)]));

/** Hop on the spot again and again around x (a body trying to hang from the rope); x NaN: no direction at all. */
function hopAt(x: number, period: number): Goal {
  const every = Math.round(period / COOP_DT);
  return {
    label: `hop at ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      const k = c.t % every;
      let bits = k === 0 ? BIT_JUMP | BIT_JUMP_PRESS : k < 40 ? BIT_JUMP : 0;
      const dx = x - b.cx;
      if (Math.abs(dx) > 0.15) bits |= dx > 0 ? BIT_RIGHT : BIT_LEFT;
      return bits;
    },
  };
}

/** One hop of a sweep: jump held `jump` steps, right held from step `from` for `hold` steps (or to the landing). */
interface HopPattern {
  jump: number;
  from: number;
  hold: number;
}

/**
 * A body trying to hang from the rope on its way to a hole, every way in turn: for each start x and
 * each pattern, it walks to the start and stands still, then hops once, holding right as the
 * pattern says while its centre is left of `stopAt`, and lands. Whenever `ready` does not hold
 * (the others out of place: a hop from far out drags them) it first waits at `home` until it does
 * (2 s at most). Once every start and pattern is done it stands where it is.
 */
function hopSweep(starts: number[], patterns: HopPattern[], o: { stopAt: number; home: number; ready: (w: CoopWorld) => boolean }): Goal {
  let k = 0;
  let state: "home" | "walk" | "settle" | "hop" = "home";
  let g: Goal | null = null;
  let t0 = 0;
  let still = 0;
  const total = starts.length * patterns.length;
  return {
    get label() {
      return `hop sweep ${Math.min(k, total)}/${total}`;
    },
    step(c) {
      if (k >= total) return 0;
      const b = c.w.bodies[c.i]!;
      const x0 = starts[Math.floor(k / patterns.length)]!;
      const p = patterns[k % patterns.length]!;
      if (state === "home") {
        // Straight on if the others are in place; otherwise back home until they are (2 s at most).
        g ??= o.ready(c.w) ? null : walk(o.home, { ...never, tol: 0.1 });
        if (g && !(g.done!(c) && o.ready(c.w)) && c.t - t0 < Math.round(2 / COOP_DT)) return g.step(c);
        state = "walk";
        g = walk(x0, { ...never, tol: 0.05 });
        t0 = c.t;
      }
      if (state === "walk") {
        if (!g!.done!(c) && c.t - t0 < Math.round(3 / COOP_DT)) return g!.step(c);
        state = "settle";
        still = 0;
      }
      if (state === "settle") {
        still = b.grounded && Math.abs(b.vx) < 0.05 ? still + 1 : 0;
        if (still < 3) return 0;
        state = "hop";
        t0 = c.t;
      }
      const t = c.t - t0;
      if (t > 4 && b.grounded) {
        // Landed: on to the next pattern (or start).
        k++;
        state = "home";
        g = null;
        t0 = c.t;
        return 0;
      }
      let bits = t === 0 ? BIT_JUMP | BIT_JUMP_PRESS : t < p.jump ? BIT_JUMP : 0;
      if (t >= p.from && t < p.from + p.hold && b.cx < o.stopAt) bits |= BIT_RIGHT;
      return bits;
    },
  };
}

const never = { jump: "never" as const };

/**
 * Walk the roles to the spots, right to left in the order they stand now (the rightmost one to the
 * first spot): a line that reorders itself on a drop keeps its spots apart.
 */
function inLine(roles: Role[], spots: number[], o: Parameters<typeof walk>[1]): Phase["do"] {
  const goals: Phase["do"] = {};
  for (const r of roles) {
    let x = Number.NaN;
    let g: Goal | null = null;
    goals[r] = {
      label: `in line (${r})`,
      step(c) {
        const me = c.w.bodies[c.i]!.cx;
        const rank = roles.filter((o2) => o2 !== r && c.w.bodies[roleIndex(o2, c.w.bodies.length)]!.cx > me).length;
        if (spots[rank] !== x || !g) {
          x = spots[rank]!;
          g = walk(x, o);
        }
        return g.step(c);
      },
    };
  }
  return goals;
}

// --- Places (x of body centres, in cells) --------------------------------------------------

/** Beat 1: plate a at 9-10, gate g at 14, plate b at 15-17. Ruben waits against the gate. */
const G1_FRONT = 13.5;
/** Beat 2: gate h at 22 over the tunnel's mouth, plate d at 23-25 (the upper floor, top 10) over the tunnel, the step k at 24, the seat (plate c) at 25. */
const BELOW_H = 21.4;
const TUNNEL_OUT = 22.4;
const SEAT = 25.5;
/** Where the one holding d stands (its right end), and the two places left of him on d. */
const ON_D = 25.15;
const D_B = 23.95;
const D_A = 23.0;
/**
 * Beat 3: key 28 behind gate n 31 (under the aisle), trapdoor w 32-33, the bench's end m 33 over
 * it (shut at the bench's height while w is open, a pit otherwise), bench p 34-36 (x stands on 36:
 * two seats), plate f 35 (cellar floor), door e 37 onto tier 1 (38-43, plate r 39-41).
 */
const ON_W = 32.45;
const AISLE_W = 31.4;
/** The bench's two seats, right then left. */
const BENCH = [35.45, 34.45];
/** In the pit of the bench's end m (open while the bench is short), between the trapdoor and the bench. */
const PIT = 33.5;
const KEY = 28.9;
const PF = 35.5;
const ON_R = 39.4;
const OUT_E = 38.4;
const TIER1 = [43.5, 42.65, 41.8];
/** Beat 4: the door at 66 on the stage. */
const DOOR_FRONT = 65.4;

/** Ruben's neighbour, who holds d in beat 2 (at 2 players, F0). */
const nb = (n: number): Role => friends(n)[n - 2]!;
/** The friends between F1 and Ruben's neighbour (from 5 players: F2), nearest to the neighbour first. */
const middle = (n: number): Role[] => friends(n).slice(2, n - 2).reverse();

/**
 * The line after beat 2, left to right: F0, F1 (who came up last and stand left of the one who held
 * d), Ruben's neighbour, the middle friends, Ruben.
 */
function lineAfterSeat(n: number): Role[] {
  if (n === 2) return ["F0", "R"];
  if (n === 3) return ["F0", "F1", "R"];
  return ["F0", "F1", nb(n), ...[...middle(n)].reverse(), "R"];
}

/**
 * How everybody but F0 sits on the bench, in order: Ruben on the right seat, the next one on the
 * left seat; from 4 players the others ride on heads (at 5 players the middle friend on Ruben's,
 * before the left seat is taken; F1 last, on the left seat's head, next to m).
 */
function benchPlan(n: number): Array<{ role: Role; seat: number } | { role: Role; on: Role }> {
  const team = lineAfterSeat(n).slice(1).reverse(); // right to left: Ruben first
  if (n <= 3) return team.map((role, i) => ({ role, seat: BENCH[i]! }));
  if (n === 4) return [{ role: "R", seat: BENCH[0]! }, { role: team[1]!, seat: BENCH[1]! }, { role: team[2]!, on: team[1]! }];
  return [{ role: "R", seat: BENCH[0]! }, { role: team[1]!, on: "R" }, { role: team[2]!, seat: BENCH[1]! }, { role: team[3]!, on: team[2]! }];
}

/** F0's neighbour in the chain: the one who gives him rope over w. */
const f0Nb = (n: number): Role => (n === 2 ? "R" : "F1");

/** Up onto the bench at x from the aisle or the pit, and settle there. */
const onto = (x: number): Goal => seq(jumpTo(x, { rise: 0.1 }), walk(x, { tol: 0.12 }));

// --- Phases ------------------------------------------------------------------------------

/** Beat 1, "Relais": Ruben (in front) waits at gate g, the friend behind him stands on plate a, Ruben goes through to plate b, everyone follows. */
function relais(n: number): Phase[] {
  const fs = friends(n);
  const k = fs.length;
  const lineUp: Phase["do"] = { R: walk(G1_FRONT) };
  fs.forEach((f, i) => (lineUp[f] = walk(10.5 - (k - 1 - i) * 0.85, never)));
  const throughSpots = fs.map((f, i) => [f, 16.5 - (k - 1 - i) * 0.8] as [Role, number]);
  const through: Phase["do"] = { R: walk(17.4, never), ...goTo(throughSpots) };
  const onSpots: Array<[Role, number]> = [["R", BELOW_H], ...fs.map((f, i) => [f, BELOW_H - 0.85 - (k - 1 - i) * 0.85] as [Role, number])];
  return [
    { name: "1. relais: Ruben at gate g, the friend behind him on plate a", do: lineUp, until: cond.all(cond.near("R", G1_FRONT, 0.3), cond.plateActive("a"), cond.gateOpen("g")) },
    { name: "1. relais: Ruben goes through to plate b", do: { R: walk(17.4, never) }, until: cond.all(cond.near("R", 17.4, 0.3), cond.plateActive("b")) },
    { name: "1. relais: Ruben holds b, the friends come through", do: through, until: allNear(throughSpots) },
    { name: "walk to the reserved seat", do: goTo(onSpots), until: allNear(onSpots, 0.3) },
  ];
}

/** A friend below goes up through the open gate h onto plate d, landing at x. */
function upTo(f: Role, x: number): Phase {
  return {
    name: `2. ${f} goes up through h onto d (${x})`,
    do: { [f]: seq(walk(BELOW_H, never), jumpTo(x, { rise: 0.15 })) },
    until: cond.all(cond.standsAbove(f, 10), cond.near(f, x, 0.3)),
    timeout: 8,
  };
}

/** Someone on d hops over the one holding it, onto the aisle at x. */
function hopOver(r: Role, x: number): Phase {
  return { name: `2. ${r} hops over the one on d to the aisle (${x})`, do: { [r]: jumpTo(x, { rise: 0.1 }) }, until: cond.all(cond.standsAbove(r, 10), cond.near(r, x, 0.35)), timeout: 6 };
}

/**
 * Beat 2, "La place de Ruben": Ruben walks down the tunnel into his seat (plate c: 2/2, gate h
 * opens), his neighbour goes up through h and holds d (right over the seat); Ruben comes out, goes
 * up and hops over him onto the aisle; the others go up one by one, the last two (F1, F0) staying
 * left of the one on d, the middle ones hopping over him once their other neighbour is up.
 */
function place(n: number): Phase[] {
  const N = nb(n);
  const fs = friends(n);
  const below = fs.slice(0, n - 2).reverse(); // the friends behind him, nearest to h first
  const waiting = below.map((f, j) => [f, BELOW_H - 0.85 * (j + 1)] as [Role, number]);
  const phases: Phase[] = [
    { name: "2. Ruben walks down the tunnel into his seat (plate c: 2/2)", do: { R: walk(SEAT, never), [N]: walk(BELOW_H, never) }, until: cond.all(cond.near("R", SEAT, 0.2), cond.plateActive("c"), cond.gateOpen("h")), timeout: 8 },
    { name: "2. Ruben's neighbour goes up through h and holds d", do: { [N]: seq(walk(BELOW_H, never), jumpTo(ON_D, { rise: 0.15 })), ...goTo(waiting) }, until: cond.all(cond.near(N, ON_D, 0.25), cond.standsAbove(N, 10), cond.plateActive("d")), timeout: 8 },
    { name: "2. Ruben comes out of his seat (d holds h)", do: { R: walk(TUNNEL_OUT, never) }, until: cond.near("R", TUNNEL_OUT, 0.25), timeout: 6 },
    { name: "2. Ruben goes up through h", do: { R: jumpTo(23.6, { rise: 0.15 }) }, until: cond.all(cond.standsAbove("R", 10), cond.near("R", 23.6, 0.35)), timeout: 5 },
    hopOver("R", 28.6),
  ];
  // The friends below go up, nearest first.
  const mids = middle(n);
  mids.forEach((m, j) => {
    phases.push(upTo(m, D_B));
    // The next one (nearer F0) lands left of him; then he hops over the one on d.
    const next = below[j + 1]!;
    phases.push(upTo(next, D_A));
    phases.push(hopOver(m, 27.75 - 0.85 * j));
    phases.push({ name: `2. ${next} moves right on d`, do: { [next]: walk(D_B, { tol: 0.15 }) }, until: cond.near(next, D_B, 0.2), timeout: 4 });
  });
  if (n >= 4 && mids.length === 0) phases.push(upTo("F1", D_B));
  if (n >= 3) phases.push(upTo("F0", n === 3 ? D_B : D_A));
  // Everybody on to the aisle, in line, before the bench.
  const line = lineAfterSeat(n);
  const spots = line.map((r, j) => [r, 31.0 - 0.85 * (line.length - 1 - j)] as [Role, number]);
  phases.push({ name: "2. everybody on, before the bench", do: goTo(spots), until: allNear(spots, 0.3), timeout: 10 });
  return phases;
}

/**
 * Beat 3 up to the key: everybody but F0 sits on the bench p (W-1) and the trapdoor w opens under
 * F0; F0's neighbour comes off the bench onto w (shut again), so that the rope round the aisle's
 * edge reaches the key; F0 takes the key.
 */
function controle(n: number): Phase[] {
  const phases: Phase[] = [];
  const sit: Phase["do"] = {};
  const plan = benchPlan(n);
  // The ones still to sit queue up behind, from the trapdoor back along the aisle (the rope stays short).
  const queue = (j: number): Phase["do"] => goTo([...plan.slice(j + 1).map((s) => s.role), "F0" as Role].map((r, i) => [r, ON_W - 0.85 * i] as [Role, number]));
  // Up onto the bench from the queue: a hop over the pit (a mount starts from the bench, next to its friend's left).
  plan.forEach((s, j) => {
    // The last one sits together with F0 walking onto the trapdoor (below).
    if (j === plan.length - 1 && "seat" in s) return;
    if ("seat" in s) {
      sit[s.role] = s.role === "R" ? walk(s.seat, {}) : onto(s.seat);
      phases.push({ name: `3. contrôle surprise: ${s.role} sits on the bench (${s.seat})`, do: { ...queue(j), ...sit }, until: cond.all(cond.near(s.role, s.seat, 0.3), cond.standsAbove(s.role, 9)), timeout: 12 });
    } else {
      // Onto Ruben's head (on the right seat) from the left seat; onto the left seat's head from the pit.
      sit[s.role] = s.on === "R" ? seq(onto(BENCH[1]!), mount(s.on)) : mount(s.on);
      if (j < plan.length - 1) phases.push({ name: `3. ${s.role} sits on ${s.on}'s head`, do: { ...queue(j), ...sit }, until: cond.on(s.role, s.on), timeout: 8 });
    }
  });
  const last = plan[plan.length - 1]!;
  if ("seat" in last) sit[last.role] = last.role === "R" ? walk(last.seat, {}) : onto(last.seat);
  phases.push({
    name: "3. contrôle surprise: everybody but F0 sits (W-1), the trapdoor opens under F0",
    do: { ...sit, F0: walk(ON_W, never) },
    until: cond.all(cond.plateActive("p"), feetBelow("F0", 11.95)),
    timeout: 15,
  });
  const g = f0Nb(n);
  phases.push(
    { name: `3. ${g} comes off the bench (the trapdoor shuts)`, do: { [g]: jumpTo(AISLE_W, { rise: 0.1 }) }, until: cond.all(cond.near(g, AISLE_W, 0.35), cond.standsAbove(g, 10), not(trapdoorOpen)), timeout: 6 },
    { name: `3. ${g} stands on the trapdoor`, do: { [g]: walk(ON_W, { ...never, tol: 0.12 }) }, until: cond.all(cond.near(g, ON_W, 0.15), cond.standsAbove(g, 10)), timeout: 5 },
    { name: "3. F0 takes the key under the aisle", do: { F0: walk(KEY, never) }, until: cond.keyTaken, timeout: 8 },
  );
  return phases;
}

/** Beat 3, the way out: F0 stands on f (= 1), gate x opens; the team goes out onto tier 1, F0's neighbour last, onto r; F0 walks out through e. */
function sortie(n: number): Phase[] {
  const g = f0Nb(n);
  const team = lineAfterSeat(n).slice(1).reverse().filter((r) => r !== g); // right to left, without F0's neighbour
  const out: Array<[Role, number]> = [...team.map((r, j) => [r, TIER1[j]!] as [Role, number]), [g, ON_R]];
  return [
    { name: "3. F0 onto plate f (= 1): gate x opens, the key's gate n shuts", do: { F0: walk(PF, never) }, until: cond.all(cond.plateActive("f"), cond.gateOpen("x"), not(cond.gateOpen("n"))), timeout: 10 },
    // Those on the bench walk out in line (no hopping over each other); F0's neighbour climbs up from the trapdoor.
    {
      name: "3. the team goes out through x onto the first tier",
      do: { ...inLine(team, TIER1.slice(0, team.length), { drop: true, jump: "never" }), ...goTo([[g, ON_R]], { drop: true, jump: "auto" }) },
      until: cond.all(cond.near(g, ON_R, 0.3), (w) => team.every((r) => TIER1.some((x) => cond.near(r, x, 0.3)(w)))),
      timeout: 15,
    },
    { name: "3. F0 walks out through e (r is held)", do: { F0: walk(OUT_E, never) }, until: cond.all(cond.near("F0", OUT_E, 0.3), cond.standsAbove("F0", 12)), timeout: 6 },
  ];
}

/** The one standing right in front of the key's carrier (the next one towards the door) takes the key from him. */
function keyForward(): Goal {
  let pressedAt = -100;
  return {
    label: "take the key from the one behind",
    step(c) {
      const j = c.w.props.keyCarrier;
      if (j < 0) return 0;
      const bs = c.w.bodies;
      const front = bs.reduce((k, b, i) => (b.cx > bs[j]!.cx && (k < 0 || b.cx < bs[k]!.cx) ? i : k), -1);
      if (front !== c.i) return 0;
      const dx = bs[c.i]!.cx - bs[j]!.cx;
      const dy = bs[c.i]!.cy - bs[j]!.cy;
      if (Math.sqrt(dx * dx + dy * dy) <= 1.35 && c.t - pressedAt > 8) {
        pressedAt = c.t;
        return BIT_DOWN | BIT_DOWN_PRESS;
      }
      return 0;
    },
  };
}

/** The key's carrier is the one nearest the door. */
const keyInFront = (w: CoopWorld) => w.props.keyCarrier >= 0 && w.bodies.every((b) => b.cx <= w.bodies[w.props.keyCarrier]!.cx);

/** Beat 4: down the tiers onto the stage in line (in the order they come), the key passed to the front of the line, the door. */
function estrade(n: number): Phase[] {
  const all: Role[] = [...friends(n), "R"];
  const spots = all.map((_, j) => DOOR_FRONT - 0.8 * j);
  return [
    {
      name: "4. down the tiers onto the stage",
      do: inLine(all, spots, { drop: true }),
      until: (w) => all.every((r) => spots.some((x) => cond.near(r, x, 0.3)(w))),
      timeout: 25,
    },
    { name: "4. the key passed to the front of the line", do: { "*": () => keyForward() }, until: keyInFront, timeout: 3 * n },
    { name: "4. everyone through the door", do: { "*": () => enter() }, until: cond.won, timeout: 20 },
  ];
}

export const solution: CoopSolution = (n) => [...relais(n), ...place(n), ...controle(n), ...sortie(n), ...estrade(n)];

// --- Shortcuts that must fail --------------------------------------------------------------
//
// Each one plays the solution up to the beat it tries to skip, then the attempt (the phase named
// "ATTEMPT", which must time out: the campaign test checks that the run fails there).

/** Run left out of the tunnel and jump for d the moment the head is clear of plate d (Ruben opening h and running). */
function dashUp(): Goal {
  let jumped = -1;
  return {
    label: "run out of the tunnel and jump for d",
    step(c) {
      const b = c.w.bodies[c.i]!;
      const d = c.w.props.plates.find((p) => p.thing.char === "d")!.thing;
      if (jumped < 0 && b.x + b.width <= d.x + 0.01 && b.grounded) jumped = c.t;
      if (jumped < 0) return BIT_LEFT;
      const k = c.t - jumped;
      let bits = k === 0 ? BIT_JUMP | BIT_JUMP_PRESS : k < 50 ? BIT_JUMP : 0;
      if (k > 18 && b.cx < d.x + 0.6) bits |= BIT_RIGHT;
      return bits;
    },
  };
}

/** Walk onto the middle of the plate drawn with `char` (wherever the level puts it). */
function onPlate(char: string): Goal {
  let g: Goal | null = null;
  return {
    label: `onto plate ${char}`,
    step(c) {
      if (!g) {
        const t = c.w.props.plates.find((p) => p.thing.char === char)!.thing;
        g = walk(t.x + t.w / 2, { ...never, tol: 0.15 });
      }
      return g.step(c);
    },
  };
}

/** Again and again: walk to `from` and jump for x (someone trying to get past a shut gate). */
function keepJumping(from: number, x: number): Goal {
  let g: Goal | null = null;
  let t0 = 0;
  return {
    label: `keep jumping from ${from} for ${x}`,
    step(c) {
      if (!g || g.done?.({ w: c.w, i: c.i, t: c.t - t0 })) {
        g = seq(walk(from, { ...never, tol: 0.15 }), jumpTo(x, { rise: 0.15 }));
        t0 = c.t;
      }
      return g.step({ w: c.w, i: c.i, t: c.t - t0 });
    },
  };
}

/**
 * Beat 2 set-up: Ruben (in front at the seat) hops back over his neighbour, and with `overTwo` over
 * the friend behind him too; the others step back first to make room.
 */
function rubenBehind(n: number, overTwo: boolean): Phase[] {
  const fs = friends(n);
  const second = n >= 3 ? fs[n - 3]! : null;
  const rest = fs.slice(0, Math.max(0, n - 3)).reverse();
  const phases: Phase[] = [];
  const back: Array<[Role, number]> = [];
  if (second && !overTwo) back.push([second, BELOW_H - 2.55]);
  rest.forEach((f, j) => back.push([f, BELOW_H - 3.4 - 0.85 * j]));
  if (back.length > 0) phases.push({ name: "the others step back", do: goTo(back), until: allNear(back, 0.3), timeout: 8 });
  const land = second && overTwo ? BELOW_H - 2.65 : BELOW_H - 1.7;
  phases.push({ name: "Ruben hops back over his neighbour", do: { R: jumpTo(land, { rise: 0.1 }) }, until: cond.all(cond.near("R", land, 0.35), cond.standsAbove("R", 12)), timeout: 6 });
  return phases;
}

/** The friends but Ruben's neighbour and `skip` follow up to the seat, in line behind `front`. */
function followUp(n: number, front: number, skip: Role[]): Phase["do"] {
  const fs = friends(n).filter((f) => !skip.includes(f) && f !== nb(n)).reverse();
  return goTo(fs.map((f, j) => [f, front - 0.85 * (j + 1)] as [Role, number]));
}

/**
 * Where a friend goes in a set-up: a place on the bench, onto another one's head (who sits at x) in
 * the same hop, or (`mount`) up onto a friend's head from where he waits on the bench.
 */
type Seat = number | { on: Role; x: number } | { mount: Role };

/**
 * Beat 3 set-up: Ruben stops at `rx` (the pit, or the bench's left seat); then the friends of
 * `who`, front of the line first, walk to `launch` and hop over him onto their seats, the line
 * behind closing up each time; F0 (if he does not sit) then waits at `f0` on the aisle. The later
 * ones go onto the heads of those already seated, from close by (the bench's ceiling is one body
 * over a seated head): onto the left seat's head from the pit, or from Ruben's head when he stands
 * in it; onto the right seat's head from the left seat, or across from the left seat's head.
 * `keep`: goals the others keep meanwhile.
 */
function friendsOverRuben(rx: number, launch: number, who: Array<[Role, Seat]>, f0: number | null, keep: Phase["do"] = {}): Phase[] {
  const stay = walk(rx, { tol: 0.12 });
  const phases: Phase[] = [{ name: `Ruben stops at ${rx}`, do: { ...keep, R: stay }, until: cond.all(cond.near("R", rx, 0.15), cond.standsAbove("R", 10)), timeout: 8 }];
  const queue: Role[] = [...who.filter(([, seat]) => !(typeof seat === "object" && "mount" in seat)).map(([r]) => r), ...(f0 !== null ? ["F0" as Role] : [])];
  const placed: Phase["do"] = {};
  // Who sits on the left seat itself so far (Ruben, when he stops there).
  let leftSitter: Role | null = rx === BENCH[1] ? "R" : null;
  who.forEach(([f, seat]) => {
    const behind = queue.slice(queue.indexOf(f) + 1).map((r, i) => [r, launch - 0.85 * (i + 1)] as [Role, number]);
    if (typeof seat === "object" && "mount" in seat) {
      phases.push({ name: `${f} climbs onto ${seat.mount}'s head`, do: { ...keep, ...placed, [f]: mount(seat.mount), R: stay }, until: cond.on(f, seat.mount), timeout: 8 });
      placed[f] = mount(seat.mount);
      if (leftSitter === f) leftSitter = null;
      return;
    }
    const start = walk(launch, { ...never, tol: 0.15 });
    if (typeof seat === "number") {
      if (seat === BENCH[1]) leftSitter = f;
      phases.push({
        name: `${f} hops over Ruben onto the bench (${seat})`,
        do: { ...keep, [f]: seq(start, jumpTo(seat, { rise: 0.12 }), walk(seat, { tol: 0.12 })), R: stay, ...goTo(behind) },
        until: cond.all(cond.standsAbove(f, 9), cond.near(f, seat, 0.15)),
        timeout: 8,
      });
      return;
    }
    // From next to the left seat: Ruben's head in the pit, or the pit itself.
    const steps: Goal[] = [start];
    if (rx === PIT) steps.push(jumpTo(PIT, { rise: 0.1 }));
    if (seat.x === BENCH[1]) steps.push(mount(seat.on));
    else if (leftSitter) steps.push(mount(leftSitter), walk(seat.x, never));
    else steps.push(jumpTo(BENCH[1]!, { rise: 0.12 }), mount(seat.on));
    phases.push({ name: `${f} climbs onto ${seat.on}'s head`, do: { ...keep, [f]: seq(...steps), R: stay, ...goTo(behind) }, until: cond.on(f, seat.on), timeout: 10 });
  });
  if (f0 !== null) phases.push({ name: `F0 waits at ${f0}`, do: { F0: walk(f0, never) }, until: cond.near("F0", f0, 0.3), timeout: 6 });
  return phases;
}

/**
 * The friends who sit with Ruben on the bench's left seat (everybody but F0, front of the line
 * first): the right seat, then that one's head, then (5 players) Ruben's own head.
 */
function besideRuben(n: number): Array<[Role, Seat]> {
  const s = lineAfterSeat(n).slice(1, -1).reverse();
  const spots: Seat[] = [BENCH[0]!, { on: s[0]!, x: BENCH[0]! }, { on: "R", x: BENCH[1]! }];
  return s.map((r, j) => [r, spots[j]!] as [Role, Seat]);
}

/** The far end of the right seat, against gate x. */
const FAR = 35.55;

/** All the friends on the bench, front of the line first, with Ruben on the trapdoor: both seats, then their heads. */
function allFriendsSeated(n: number): Array<[Role, Seat]> {
  const s = lineAfterSeat(n).slice(0, -1).reverse();
  const spots: Seat[] = [BENCH[0]!, BENCH[1]!, { on: s[0]!, x: BENCH[0]! }, { on: s[1]!, x: BENCH[1]! }];
  return s.map((r, j) => [r, spots[j]!] as [Role, Seat]);
}

/**
 * All the friends on the bench with Ruben's neighbour as high and as far from the trapdoor as he
 * can be: `under` of the others (one at most under the bench's low ceiling) make a tower on the
 * right seat and he climbs on top from the left seat (`who`). Then the tower moves right against
 * gate x, and the rest sit on the left seat (`rest`; at 5 players one on the other's head).
 */
function nbOnTower(n: number, under = 1): { who: Array<[Role, Seat]>; rest: Array<[Role, Seat]>; tower: Role[] } {
  const N = nb(n);
  if (n === 2) return { who: [[N, BENCH[0]!]], rest: [], tower: [N] };
  const s = lineAfterSeat(n).slice(0, -1).reverse();
  const others = s.filter((r) => r !== N);
  const tower = others.slice(0, Math.min(under, others.length));
  const later = others.slice(tower.length);
  const who: Array<[Role, Seat]> = [];
  for (const r of s) {
    if (r === N) who.push([r, BENCH[1]!]);
    else if (r === tower[0]) who.push([r, BENCH[0]!]);
    else if (tower.indexOf(r) > 0) who.push([r, { on: tower[tower.indexOf(r) - 1]!, x: BENCH[0]! }]);
  }
  who.push([N, { mount: tower[tower.length - 1]! }]);
  const rest = later.map((r, j): [Role, Seat] => [r, j === 0 ? BENCH[1]! : { on: later[j - 1]!, x: BENCH[1]! }]);
  return { who, rest, tower: [...tower, N] };
}

/**
 * Where Ruben starts his hops in "Ruben hanging", right to left: from the trapdoor's edge to as far
 * left on the aisle as the stretched rope lets him stand (the link taut: he hangs from the tower).
 */
const HANG_STARTS = Array.from({ length: 9 }, (_, i) => 32.4 - 0.4 * i);
/** How he hops: a full jump, holding right from the start or from the apex to the landing, or for 0.1 s late on the way down. */
const HANG_HOPS: HopPattern[] = [
  { jump: 50, from: 0, hold: 999 },
  { jump: 50, from: 25, hold: 999 },
  { jump: 50, from: 30, hold: 12 },
];

/** Back to where the role sits in the solution's bench plan (a seat, or a head), from the trapdoor or the pit (a hop from the trapdoor, as in the solution). */
function seatAgain(n: number, role: Role): Goal {
  const s = benchPlan(n).find((p) => p.role === role)!;
  if ("seat" in s) return role === "R" ? walk(s.seat, {}) : seq(walk(ON_W, { ...never, tol: 0.15 }), onto(s.seat));
  return s.on === "R" ? seq(onto(BENCH[1]!), mount(s.on)) : mount(s.on);
}

/** Under the trapdoor, in the cellar, where the free friend waits to hop. */
const UNDER_W = 32.5;

/**
 * One try of "the free friend holds the trapdoor open from below": F0's hop (steps after the leaver
 * sets off, jump held, 1 to hold right), and the leaver's jump (-1 none, else steps after he sets off).
 */
interface HoldTry {
  hop: number;
  jump: number;
  dir: number;
  leap: number;
}
const HOLD_TRIES: HoldTry[] = [];
for (const leap of [-1, 8]) {
  for (let hop = 12; hop <= 28; hop += 2) HOLD_TRIES.push({ hop, jump: 10, dir: 1, leap });
  for (const hop of [16, 20, 24]) HOLD_TRIES.push({ hop, jump: 20, dir: 1, leap });
  for (const hop of [20, 24, 28]) HOLD_TRIES.push({ hop, jump: 10, dir: 0, leap });
}

/**
 * The free friend in the cellar hops under the trapdoor while `leaver` leaves the bench towards it
 * (left, jumping as the try says), every try in turn; after each try the leaver climbs back to his
 * place on the bench (W-1 again: the trapdoor slides open again) and F0 walks back under it.
 */
function holdSweep(n: number, leaver: Role): Phase["do"] {
  let k = 0;
  let state: "ready" | "go" | "back" = "ready";
  let start = 0;
  let back: Goal | null = null;
  let still = 0;
  const under = walk(UNDER_W, { ...never, tol: 0.08 });
  const aside = walk(AISLE_W - 1, { tol: 0.2 });
  const fi = roleIndex("F0", n);
  const leave: Goal = {
    get label() {
      return `leaves the bench, try ${Math.min(k + 1, HOLD_TRIES.length)}/${HOLD_TRIES.length} (${state})`;
    },
    step(c) {
      if (k >= HOLD_TRIES.length) return 0;
      const b = c.w.bodies[c.i]!;
      const f = c.w.bodies[fi]!;
      const t = c.w.tick - start;
      // On the bench (a seat or a head) and the bench at W-1 again.
      const seated = trapdoorOpen(c.w) && b.grounded && b.y + b.height <= 9.05;
      if (state === "ready" && !seated) {
        state = "back";
        start = c.w.tick;
      }
      if (state === "back") {
        if (seated) {
          state = "ready";
          still = 0;
          return 0;
        }
        // A fresh climb every 1.5 s (a climb that went wrong starts again).
        if (!back || t % Math.round(1.5 / COOP_DT) === 0) back = seatAgain(n, leaver);
        return back.step(c);
      }
      if (state === "ready") {
        // Both still for 0.25 s (the rope settled), F0 under the trapdoor.
        still = Math.abs(b.vx) < 0.05 && f.grounded && Math.abs(f.vx) < 0.05 && f.y + f.height > 11.9 && Math.abs(f.cx - UNDER_W) < 0.15 ? still + 1 : 0;
        if (still < 30) return 0;
        state = "go";
        start = c.w.tick;
      }
      const tg = c.w.tick - start;
      // Landed below the bench (on the trapdoor, or in the cellar), or 2 s on: the next try.
      if ((tg > 12 && b.grounded && b.y + b.height > 9.5) || tg > Math.round(2 / COOP_DT)) {
        k++;
        state = "back";
        back = null;
        start = c.w.tick;
        return 0;
      }
      const tr = HOLD_TRIES[k]!;
      let bits = b.cx > 32.5 ? BIT_LEFT : 0;
      if (tr.leap >= 0 && tg === tr.leap) bits |= BIT_JUMP | BIT_JUMP_PRESS;
      else if (tr.leap >= 0 && tg > tr.leap && tg < tr.leap + 20) bits |= BIT_JUMP;
      return bits;
    },
  };
  const hop: Goal = {
    label: "hops under the trapdoor",
    step(c) {
      if (state !== "go" || k >= HOLD_TRIES.length) {
        // Hopped out through the open trapdoor: over the leaver onto the aisle, out of his way, until it opens again.
        const f = c.w.bodies[c.i]!;
        if (f.y + f.height < 11 && !trapdoorOpen(c.w)) return aside.step(c);
        return under.step(c);
      }
      const tr = HOLD_TRIES[k]!;
      const t = c.w.tick - start;
      let bits = t === tr.hop ? BIT_JUMP | BIT_JUMP_PRESS : t > tr.hop && t < tr.hop + tr.jump ? BIT_JUMP : 0;
      if (t >= tr.hop && tr.dir > 0) bits |= BIT_RIGHT;
      return bits;
    },
  };
  return { [leaver]: leave, F0: hop };
}

/** Where F1 starts his hops in "two friends into the cellar", right to left (F0 stands on the trapdoor, right of him). */
const TWO_STARTS = [31.4, 31.0, 30.6, 30.2];

/** "Ruben hanging from his neighbour on the bench", with `under` friends under the neighbour (1: all the bench's ceiling takes; probes pass more on a higher one). */
export function rubenHanging(n: number, under = 1): Phase[] {
  const { who, rest, tower } = nbOnTower(n, under);
  const up: Phase["do"] = { [tower[0]!]: walk(FAR, { ...never, tol: 0.06 }) };
  tower.slice(1).forEach((r, j) => (up[r] = mount(tower[j]!)));
  const towerUp = cond.all(cond.near(tower[0]!, FAR, 0.3), ...tower.slice(1).map((r, j) => cond.on(r, tower[j]!)));
  return [
    ...relais(n),
    ...place(n),
    ...friendsOverRuben(PIT, ON_W, who, null),
    { name: "the tower moves right against gate x", do: up, until: cond.all(...tower.map((r) => cond.near(r, FAR, 0.1))), timeout: 6 },
    ...(rest.length > 0 ? friendsOverRuben(PIT, ON_W, rest, null, up) : []),
    // Ruben hops from every start on the aisle, every way; the attempt gets through if his feet get below the aisle's top (into w).
    { name: "ATTEMPT: Ruben hops for the trapdoor, hanging from the tower", do: { ...up, R: hopSweep(HANG_STARTS, HANG_HOPS, { stopAt: 32.6, home: ON_W, ready: towerUp }) }, until: feetBelow("R", 10.5), timeout: 95 },
  ];
}

export const shortcuts: Record<string, CoopSolution> = {
  /** Beat 2 without Ruben: his neighbour alone in the seat (1/2), Ruben (in the tunnel behind him) tries to go up through h. */
  "a friend alone on Ruben's seat": (n) => {
    const N = nb(n);
    return [
      ...relais(n),
      ...rubenBehind(n, false),
      { name: "Ruben's neighbour walks into the seat (1/2), Ruben into the tunnel", do: { [N]: walk(SEAT, never), R: walk(TUNNEL_OUT, never), ...followUp(n, BELOW_H + 0.85, []) }, until: cond.all(cond.near(N, SEAT, 0.2), cond.near("R", TUNNEL_OUT, 0.3)), timeout: 8 },
      { name: "ATTEMPT: Ruben goes up through h", do: { R: keepJumping(TUNNEL_OUT, 23.6) }, until: cond.all(cond.standsAbove("R", 10), pastX("R", 22.9)), timeout: 8 },
    ];
  },

  /** Beat 2 with two friends: one in the seat, the next one leaning in from the step (k holds him, not c); Ruben tries to go up through h. */
  "two friends on Ruben's seat": (n) => {
    const N = nb(n);
    const second = n >= 3 ? friends(n)[n - 3]! : null;
    const lean = second ? { [second]: walk(25.0, never) } : {};
    return [
      ...relais(n),
      ...rubenBehind(n, true),
      {
        name: "Ruben's neighbour walks into the seat, the next one leans in from the step, Ruben into the tunnel",
        do: { [N]: walk(SEAT, never), ...lean, R: walk(TUNNEL_OUT, never), ...followUp(n, BELOW_H + 0.85, second ? [second] : []) },
        until: cond.all(cond.near(N, SEAT, 0.2), cond.near("R", TUNNEL_OUT, 0.3), ...(second ? [cond.near(second, 24.3, 0.2)] : [])),
        timeout: 8,
      },
      { name: "ATTEMPT: Ruben goes up through h", do: { R: keepJumping(TUNNEL_OUT, 23.6), [N]: walk(SEAT, never), ...lean }, until: cond.all(cond.standsAbove("R", 10), pastX("R", 22.9)), timeout: 8 },
    ];
  },

  /** Beat 2: a friend in the seat, another body hops at the end of the rope (trying to hang from him and weigh on the seat). */
  "a friend hanging from the one in the seat": (n) => {
    const N = nb(n);
    const second = n >= 3 ? friends(n)[n - 3]! : null;
    const rx = second ? TUNNEL_OUT : 21.1;
    return [
      ...relais(n),
      ...rubenBehind(n, false),
      { name: "Ruben's neighbour walks into the seat", do: { [N]: walk(SEAT, never), R: walk(rx, never), ...followUp(n, BELOW_H + 0.85, []) }, until: cond.all(cond.near(N, SEAT, 0.2), cond.near("R", rx, 0.3)), timeout: 8 },
      { name: "ATTEMPT: a body hops at the end of the rope", do: { [second ?? "R"]: hopAt(21.1, 0.7), [N]: walk(SEAT, never) }, until: cond.gateOpen("h"), timeout: 10 },
    ];
  },

  /** Beat 2: Ruben opens h himself, runs out of the tunnel and jumps for d before h shuts. */
  "Ruben opens h and runs": (n) => [
    ...relais(n),
    ...place(n).slice(0, 1),
    { name: "ATTEMPT: Ruben runs out of the tunnel and jumps for d", do: { R: dashUp() }, until: cond.all(cond.standsAbove("R", 10), pastX("R", 22.9)), timeout: 6 },
  ],

  /**
   * Beat 3: everyone who sits with Ruben on the bench, Ruben on its left seat (the trapdoor open, the
   * bench's end m shut); Ruben walks off towards the trapdoor.
   */
  "Ruben walks off the bench into the trapdoor": (n) => [
    ...relais(n),
    ...place(n),
    ...friendsOverRuben(BENCH[1]!, ON_W, besideRuben(n), AISLE_W),
    { name: "the bench has W-1: the trapdoor is open, the bench's end shut", do: {}, until: cond.all(cond.plateActive("p"), trapdoorOpen, not(cond.gateOpen("m"))), timeout: 4 },
    { name: "ATTEMPT: Ruben walks off the bench into the trapdoor", do: { R: walk(ON_W, never) }, until: feetBelow("R", 11.95), timeout: 5 },
  ],

  /** Beat 3: the same, Ruben jumping from the bench towards the open trapdoor. */
  "Ruben jumps off the bench into the trapdoor": (n) => [
    ...relais(n),
    ...place(n),
    ...friendsOverRuben(BENCH[1]!, ON_W, besideRuben(n), AISLE_W),
    { name: "the bench has W-1: the trapdoor is open, the bench's end shut", do: {}, until: cond.all(cond.plateActive("p"), trapdoorOpen, not(cond.gateOpen("m"))), timeout: 4 },
    { name: "ATTEMPT: Ruben jumps from the bench into the trapdoor", do: { R: jumpTo(ON_W, { rise: 0.05 }) }, until: feetBelow("R", 11.95), timeout: 5 },
  ],

  /**
   * Beat 3 (critic, round 2): F0 has dropped in and walks for the key while his neighbour sits idle
   * on the bench; the rope, round the aisle's edge, drags the neighbour along the bench to its end.
   * There he hops (no direction: the taut rope cancels the jump and yanks him down towards the
   * trapdoor), hoping to fall in before it shuts. The bench's end m is shut while the trapdoor is
   * open: he lands on it, the bench lets go, and the trapdoor shuts long before he is over it.
   */
  "the free friend drags his neighbour off the bench into the trapdoor": (n) => {
    const ctl = controle(n);
    const g = f0Nb(n);
    let t0 = -1;
    return [
      ...relais(n),
      ...place(n),
      ...ctl.slice(0, ctl.length - 3), // up to F0 dropping into the cellar
      {
        name: `F0 walks for the key, ${g} sits idle (dragged towards the bench's end)`,
        do: { F0: walk(KEY, never) },
        until: (w) => {
          if (t0 < 0) t0 = w.tick;
          return w.tick - t0 >= Math.round(1.2 / COOP_DT);
        },
        timeout: 3,
      },
      { name: `ATTEMPT: ${g} hops again and again, F0 still walking for the key`, do: { F0: walk(KEY, never), [g]: hopAt(Number.NaN, 0.5) }, until: feetBelow(g, 11.95), timeout: 5 },
    ];
  },

  /**
   * Beat 3 (integration's skeptic, round 2): F0 has dropped in and hops up under the trapdoor (a gate
   * never shuts on a body, so a gate there stayed open while his head was in it) as his neighbour on
   * the bench (Ruben at 2 players, F1 from 3) leaves towards it, walking or jumping, 30 tries. The
   * trapdoor is a platform that slides back under the bench's end the step the bench lets go: F0 is
   * under it, not on it, so it never waits for him.
   */
  "the free friend holds the trapdoor open from below": (n) => {
    const ctl = controle(n);
    const g = f0Nb(n);
    return [
      ...relais(n),
      ...place(n),
      ...ctl.slice(0, ctl.length - 3), // up to F0 dropping into the cellar
      { name: "F0 under the trapdoor's left half", do: { F0: walk(UNDER_W, { ...never, tol: 0.08 }) }, until: cond.all(cond.near("F0", UNDER_W, 0.12), feetBelow("F0", 11.95), trapdoorOpen), timeout: 4 },
      { name: `ATTEMPT: F0 hops under the trapdoor as ${g} leaves the bench towards it`, do: holdSweep(n, g), until: feetBelow(g, 11.95), timeout: 75 },
    ];
  },

  /** Beat 3 with Ruben as the free one: all the friends on the bench, Ruben on the trapdoor. */
  "Ruben as the free one": (n) => [
    ...relais(n),
    ...place(n),
    ...friendsOverRuben(PIT, ON_W, allFriendsSeated(n), null),
    { name: "ATTEMPT: the trapdoor opens under Ruben (all the friends on the bench)", do: { R: walk(ON_W, { ...never, tol: 0.1 }) }, until: feetBelow("R", 11.95), timeout: 6 },
  ],

  /**
   * Beat 3, Ruben hanging: all the friends on the bench, his neighbour as high and as far from the
   * trapdoor as he can be (on a friend's head against gate x: the bench's ceiling takes two bodies),
   * Ruben hops for the trapdoor from all along the aisle. A body in the air under a taut rope weighs
   * on what its holder stands on: from far enough left his 2 makes W-1 and the trapdoor opens, but
   * the link goes slack too far from the trapdoor for him to be over it before it shuts.
   */
  "Ruben hanging from his neighbour on the bench": (n) => rubenHanging(n),

  /**
   * Beat 3, two friends for the cellar: Ruben on the right seat against gate x (from 4 players F2
   * on his head: the highest place F1's bench neighbour can have), the other friends on the left
   * seat, F0 on the trapdoor. The bench is one short; F1 hops from all along the aisle to hang from
   * his neighbour (F2, or Ruben at 3 players). His 1 opens the trapdoor and F0 drops in, but F1
   * never gets over it before it shuts, F0's rope through the trapdoor pulling him or not. (At 2
   * players there is no second friend.)
   */
  "two friends into the cellar, one hanging": (n) => {
    const line = lineAfterSeat(n);
    const seated = line.slice(0, -1).reverse().filter((r) => r !== "F0" && r !== "F1"); // right to left
    const queue = (rest: Role[]) => goTo(rest.map((r, i) => [r, ON_W - 0.85 * i] as [Role, number]));
    const keep: Phase["do"] = { R: walk(BENCH[0]!, { tol: 0.1 }) };
    const phases: Phase[] = [...relais(n), ...place(n)];
    phases.push({ name: "Ruben sits on the right seat", do: { ...keep, ...queue([...seated, "F1", "F0"]) }, until: cond.all(cond.near("R", BENCH[0]!, 0.2), cond.standsAbove("R", 9)), timeout: 10 });
    if (n >= 4) {
      phases.push({ name: "F2 onto Ruben's head", do: { ...keep, F2: seq(onto(BENCH[1]!), mount("R")), ...queue([...seated.slice(1), "F1", "F0"]) }, until: cond.on("F2", "R"), timeout: 10 });
      keep.F2 = mount("R");
    }
    keep.R = walk(FAR, { ...never, tol: 0.06 });
    const held = cond.all(cond.near("R", FAR, 0.1), ...(n >= 4 ? [cond.on("F2", "R")] : []));
    phases.push({ name: "Ruben moves right against gate x", do: { ...keep }, until: held, timeout: 6 });
    if (n >= 5) {
      phases.push({ name: "F3 onto the left seat", do: { ...keep, F3: onto(BENCH[1]!), ...queue(["F1", "F0"]) }, until: cond.all(cond.near("F3", BENCH[1]!, 0.2), cond.standsAbove("F3", 9)), timeout: 10 });
      keep.F3 = walk(BENCH[1]!, { tol: 0.1 });
    }
    if (n >= 3) {
      phases.push({ name: "F1 hops back over F0", do: { ...keep, F0: walk(AISLE_W + 0.2, never), F1: jumpTo(30.6, { rise: 0.1 }) }, until: cond.all(cond.near("F1", 30.6, 0.4), cond.standsAbove("F1", 10)), timeout: 6 });
    }
    keep.F0 = walk(ON_W, { ...never, tol: 0.1 });
    // At 2 players Ruben alone is W-1: F0 drops in as he gets there, alone.
    if (n >= 3) phases.push({ name: "F0 onto the trapdoor", do: { ...keep }, until: cond.all(cond.near("F0", ON_W, 0.15), cond.standsAbove("F0", 10)), timeout: 6 });
    const both = cond.all(feetBelow("F0", 11.95), n >= 3 ? feetBelow("F1", 10.5) : () => false);
    const sweep = n >= 3 ? { F1: hopSweep(TWO_STARTS, HANG_HOPS, { stopAt: 32.6, home: AISLE_W, ready: held }) } : {};
    phases.push({ name: "ATTEMPT: F1 hops to hang from his bench neighbour, F0 on the trapdoor", do: { ...keep, ...sweep }, until: both, timeout: 40 });
    return phases;
  },

  /**
   * Beat 3 (skeptic of the fix round): Ruben, on the left seat, jumps left off the bench (twice)
   * while the others walk to its far end and F0, dropped in, walks right under it: the rope goes
   * taut and Ruben hangs over the trapdoor's left half. A friend hanging from someone on the bench
   * used to weigh on it, so the bench read W-1 again, the trapdoor slid away under him and he fell
   * in (`rjump.ts 3 left`, run "f0 1 oth 1 tw 0 jh 3 ll 60 rj 1"). The bench now counts only what
   * stands on it (`standing`): it stays short and he lands on the shut trapdoor.
   */
  "Ruben hangs over the trapdoor from the bench's far end": (n) => {
    const left = shortcuts["Ruben walks off the bench into the trapdoor"]!(n).slice(0, -1);
    const leap: Goal = {
      label: "jump left off the bench, twice",
      step(c) {
        let b = c.t < 60 ? BIT_LEFT : 0;
        if (c.t === 0 || c.t === 40) b |= BIT_JUMP | BIT_JUMP_PRESS;
        else if ((c.t > 0 && c.t < 3) || (c.t > 40 && c.t < 43)) b |= BIT_JUMP;
        return b;
      },
    };
    const right: Goal = { label: "walk right", step: () => BIT_RIGHT };
    return [
      ...left,
      { name: "F0 drops onto the trapdoor and in", do: { F0: walk(ON_W, never) }, until: feetBelow("F0", 11.95), timeout: 6 },
      {
        name: "ATTEMPT: Ruben jumps left off the bench, the others walk to its far end, F0 walks right",
        do: { R: leap, F0: walk(35.5, never), "*": right },
        until: feetBelow("R", 11.95),
        timeout: 3,
      },
    ];
  },

  /** Beat 3 in the wrong order: F0 drops in and stands on f first (the team goes out), then goes back for the key. */
  "freeing the others before taking the key": (n) => {
    const ctl = controle(n);
    const out = sortie(n);
    return [
      ...relais(n),
      ...place(n),
      ...ctl.slice(0, ctl.length - 1), // everything but taking the key
      { name: "F0 onto plate f first (gate n shuts on the key)", do: { F0: walk(PF, never) }, until: cond.all(cond.plateActive("f"), not(cond.gateOpen("n")), cond.gateOpen("x")), timeout: 10 },
      out[1]!,
      // The team stays outside (each one keeps to his place, so F0 cannot drag them back in through e).
      { name: "ATTEMPT: F0 leaves f and goes back for the key", do: { ...out[1]!.do, F0: walk(KEY, never) }, until: cond.keyTaken, timeout: 15 },
    ];
  },

  /** Beat 3: the free friend, key in hand, lets himself out: he steps on the door's inside plate s and runs for e. */
  "the free friend lets himself out with s": (n) => {
    const ctl = controle(n);
    return [
      ...relais(n),
      ...place(n),
      ...ctl,
      { name: "F0 on the inside plate s (e opens)", do: { F0: onPlate("s") }, until: cond.all(cond.plateActive("s"), cond.gateOpen("e")), timeout: 6 },
      // Into the doorway is enough: e never shuts on him there.
      { name: "ATTEMPT: F0 runs out through e", do: { F0: walk(OUT_E, never) }, until: pastX("F0", 37.2), timeout: 6 },
    ];
  },

  /** Beat 1 with a tower: nobody on plate a, Ruben's neighbour climbs on Ruben at gate g and jumps for the far side. */
  "a tower over gate g": (n) => {
    const fs = friends(n);
    const climber = fs[fs.length - 1]!;
    const stay: Phase["do"] = { R: walk(G1_FRONT) };
    // Everyone off plate a (9-10): the climber and the friend behind it between a and the gate, the others behind a.
    fs.forEach((f, i) => (stay[f] = i === fs.length - 1 ? walk(12.5, never) : i === fs.length - 2 ? walk(11.5, never) : walk(8.4 - (fs.length - 3 - i) * 0.85, never)));
    return [
      { name: "line up at gate g, nobody on plate a", do: stay, until: cond.all(cond.near("R", G1_FRONT, 0.3), cond.near(climber, 12.5, 0.3), not(cond.plateActive("a"))), timeout: 10 },
      { name: "the climber gets on Ruben", do: { [climber]: mount("R") }, until: cond.on(climber, "R"), timeout: 10 },
      { name: "ATTEMPT: the climber jumps over gate g", do: { [climber]: jumpTo(16.5, { rise: 0.2 }), R: walk(G1_FRONT) }, until: pastX(climber, 15), timeout: 6 },
    ];
  },
};
