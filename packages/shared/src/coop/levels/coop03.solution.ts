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
  const onto = (x: number): Goal => seq(jumpTo(x, { rise: 0.1 }), walk(x, { tol: 0.12 }));
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
    { name: `3. ${g} comes off the bench (the trapdoor shuts)`, do: { [g]: jumpTo(AISLE_W, { rise: 0.1 }) }, until: cond.all(cond.near(g, AISLE_W, 0.35), cond.standsAbove(g, 10), not(cond.gateOpen("w"))), timeout: 6 },
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
 * Beat 3 set-up: Ruben stops at `rx` (the trapdoor, or the bench's left seat); then the friends of
 * `who`, front of the line first, walk to `launch` and hop over him onto their seats (the later
 * ones onto the heads of those already seated), the line behind closing up each time; F0 (if he
 * does not sit) then waits at `f0` on the aisle.
 */
function friendsOverRuben(rx: number, launch: number, who: Array<[Role, Seat]>, f0: number | null): Phase[] {
  const stay = walk(rx, { tol: 0.12 });
  const phases: Phase[] = [{ name: `Ruben stops at ${rx}`, do: { R: stay }, until: cond.all(cond.near("R", rx, 0.15), cond.standsAbove("R", 10)), timeout: 8 }];
  const queue: Role[] = [...who.filter(([, seat]) => !(typeof seat === "object" && "mount" in seat)).map(([r]) => r), ...(f0 !== null ? ["F0" as Role] : [])];
  const placed: Phase["do"] = {};
  who.forEach(([f, seat]) => {
    const behind = queue.slice(queue.indexOf(f) + 1).map((r, i) => [r, launch - 0.85 * (i + 1)] as [Role, number]);
    if (typeof seat === "object" && "mount" in seat) {
      phases.push({ name: `${f} climbs onto ${seat.mount}'s head`, do: { ...placed, [f]: mount(seat.mount), R: stay }, until: cond.on(f, seat.mount), timeout: 8 });
      placed[f] = mount(seat.mount);
      return;
    }
    const x = typeof seat === "number" ? seat : seat.x;
    const hop = seq(walk(launch, { ...never, tol: 0.15 }), jumpTo(x, { rise: 0.12 }));
    phases.push({
      name: typeof seat === "number" ? `${f} hops over Ruben onto the bench (${x})` : `${f} hops over Ruben onto ${seat.on}'s head`,
      do: { [f]: typeof seat === "number" ? seq(hop, walk(x, { tol: 0.12 })) : hop, R: stay, ...goTo(behind) },
      until: typeof seat === "number" ? cond.all(cond.standsAbove(f, 9), cond.near(f, x, 0.15)) : cond.on(f, seat.on),
      timeout: 8,
    });
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
 * can be: the others make a tower on the right seat (two at most, under the bench's ceiling), he
 * waits on the left seat and climbs on top; a fourth friend then takes the left seat. Then the
 * tower moves right against gate x.
 */
function nbOnTower(n: number): { who: Array<[Role, Seat]>; tower: Role[] } {
  const N = nb(n);
  if (n === 2) return { who: [[N, BENCH[0]!]], tower: [N] };
  const s = lineAfterSeat(n).slice(0, -1).reverse();
  const others = s.filter((r) => r !== N);
  const tower = others.slice(0, 2);
  const who: Array<[Role, Seat]> = [];
  for (const r of s) {
    if (r === N) who.push([r, BENCH[1]!]);
    else if (r === tower[0]) who.push([r, BENCH[0]!]);
    else if (r === tower[1]) who.push([r, { on: tower[0]!, x: BENCH[0]! }]);
  }
  who.push([N, { mount: tower[tower.length - 1]! }]);
  if (others[2]) who.push([others[2], BENCH[1]!]);
  return { who, tower: [...tower, N] };
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
    { name: "the bench has W-1: the trapdoor is open, the bench's end shut", do: {}, until: cond.all(cond.plateActive("p"), cond.gateOpen("w"), not(cond.gateOpen("m"))), timeout: 4 },
    { name: "ATTEMPT: Ruben walks off the bench into the trapdoor", do: { R: walk(ON_W, never) }, until: feetBelow("R", 11.95), timeout: 5 },
  ],

  /** Beat 3: the same, Ruben jumping from the bench towards the open trapdoor. */
  "Ruben jumps off the bench into the trapdoor": (n) => [
    ...relais(n),
    ...place(n),
    ...friendsOverRuben(BENCH[1]!, ON_W, besideRuben(n), AISLE_W),
    { name: "the bench has W-1: the trapdoor is open, the bench's end shut", do: {}, until: cond.all(cond.plateActive("p"), cond.gateOpen("w"), not(cond.gateOpen("m"))), timeout: 4 },
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

  /** Beat 3 with Ruben as the free one: all the friends on the bench, Ruben on the trapdoor. */
  "Ruben as the free one": (n) => [
    ...relais(n),
    ...place(n),
    ...friendsOverRuben(PIT, ON_W, allFriendsSeated(n), null),
    { name: "ATTEMPT: the trapdoor opens under Ruben (all the friends on the bench)", do: { R: walk(ON_W, { ...never, tol: 0.1 }) }, until: feetBelow("R", 11.95), timeout: 6 },
  ],

  /**
   * Beat 3, Ruben hanging: all the friends on the bench, his neighbour as high and as far from the
   * trapdoor as he can be (on top of a tower against gate x, under the bench's low ceiling), Ruben
   * hops on the trapdoor. A body in the air under a taut rope weighs on what its holder stands on:
   * his 2 would make W-1. The link stays slack (3.3 / 3.6 / 4.1 with 0 / 1 / 2 under the holder).
   */
  "Ruben hanging from his neighbour on the bench": (n) => {
    const { who, tower } = nbOnTower(n);
    const up: Phase["do"] = { [tower[0]!]: walk(FAR, { ...never, tol: 0.06 }) };
    tower.slice(1).forEach((r, j) => (up[r] = mount(tower[j]!)));
    return [
      ...relais(n),
      ...place(n),
      ...friendsOverRuben(PIT, ON_W, who, null),
      { name: "the tower moves right against gate x", do: up, until: cond.all(...tower.map((r) => cond.near(r, FAR, 0.1))), timeout: 6 },
      // Ruben hops on the trapdoor's far side from the tower.
      { name: "ATTEMPT: Ruben hops on the trapdoor", do: { ...up, R: hopAt(32.4, 0.6) }, until: cond.any(feetBelow("R", 11.95), cond.gateOpen("w")), timeout: 8 },
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
