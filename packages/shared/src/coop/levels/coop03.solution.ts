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

/** The role's feet are at or below y (it fell into the basement, say). */
const feetBelow = (role: Role, y: number) => (w: CoopWorld) => {
  const b = w.bodies[roleIndex(role, w.bodies.length)]!;
  return b.y + b.height >= y - 1e-3;
};
/** The role's centre is right of x. */
const pastX = (role: Role, x: number) => (w: CoopWorld) => w.bodies[roleIndex(role, w.bodies.length)]!.cx > x;
const not = (c: (w: CoopWorld) => boolean) => (w: CoopWorld) => !c(w);
/** The key is carried by one of these roles. */
const carriedBy = (roles: Role[]) => (w: CoopWorld) => roles.some((r) => w.props.keyCarrier === roleIndex(r, w.bodies.length));
/** Every listed role stands near its x. */
const allNear = (spots: Array<[Role, number]>, tol = 0.35) => cond.all(...spots.map(([r, x]) => cond.near(r, x, tol)));
/** Goals walking each role to its spot. */
const goTo = (spots: Array<[Role, number]>, o: Parameters<typeof walk>[1] = never): Phase["do"] => Object.fromEntries(spots.map(([r, x]) => [r, walk(x, o)]));

/** Take the key from `from` (↓ next to its carrier) whenever `from` carries it. */
function takeKey(from: Role): Goal {
  let pressedAt = -100;
  return {
    label: `take the key from ${from}`,
    step(c) {
      const j = roleIndex(from, c.w.bodies.length);
      if (c.w.props.keyCarrier !== j) return 0;
      const a = c.w.bodies[c.i]!;
      const b = c.w.bodies[j]!;
      if (Math.hypot(a.cx - b.cx, a.cy - b.cy) <= 1.35 && c.t - pressedAt > 8) {
        pressedAt = c.t;
        return BIT_DOWN | BIT_DOWN_PRESS;
      }
      return 0;
    },
    done: (c) => c.w.props.keyCarrier === c.i,
  };
}

/** Hop on the spot again and again around x (a body trying to hang from the rope). */
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

/** Walk to the spot of my rank (by x, left to right) among `group`: a line that keeps its order whatever it is. */
function walkByRank(group: Role[], xs: number[]): Goal {
  const goals = xs.map((x) => walk(x, never));
  return {
    label: `walk to my place among ${group.join(",")}`,
    step(c) {
      const n = c.w.bodies.length;
      const mine = c.w.bodies[c.i]!.cx;
      const rank = group.filter((r) => c.w.bodies[roleIndex(r, n)]!.cx < mine).length;
      return goals[rank]!.step(c);
    },
  };
}

const never = { jump: "never" as const };

// --- Places (x of body centres, in cells) --------------------------------------------------

/** Beat 1: plate a at 9-10, gate g at 14, plate b at 15-17. Ruben waits against the gate. */
const G1_FRONT = 13.5;
/** Beat 2: the step k at 24, the seat (pocket, plate c) at 25 under the block 25-26, gate h at 27, plate d at 28-30. */
const SEAT_STAND = 23.3;
const SEAT = 25.6;
const STEP = 24.4;
const BLOCK_LEFT = 25.4;
const BLOCK_RIGHT = 26.45;
/** Beat 3: key 33 behind gate n 34, trapdoor w 35-36, gap 37-38, bench p 39-43, plate f 45 (basement), gate x 46, trapdoor e 49 (landing), plate r 53-55. */
const ON_TRAPDOOR = 36.4;
const KEY = 33.5;
const PF = 45.5;
const UNDER_E = 49.5;
const OUT_OF_E = 48.0;
/** Beat 4: the door at 81 on the stage. */
const DOOR_FRONT = 80.4;

/** Ruben's neighbour (goes first in beat 2) and, from 3 players, the friend who waits on the block. */
function seatRoles(n: number): { nb: Role; second: Role | null; rest: Role[] } {
  const fs = friends(n);
  const k = fs.length;
  return { nb: fs[k - 1]!, second: k >= 2 ? fs[k - 2]! : null, rest: fs.slice(0, Math.max(0, k - 2)) };
}

/**
 * The line, front to back, after beat 2: Ruben's neighbour (who held d), Ruben (who hopped over the
 * friend waiting on the block), that friend, then the others who crossed the block after him.
 */
function lineAfterSeat(n: number): Role[] {
  const { nb, second, rest } = seatRoles(n);
  return n === 2 ? [nb, "R"] : [nb, "R", second!, ...[...rest].reverse()];
}

/** The line at gate x and outside, front to back, without F0 (the one in the basement). */
function teamAtX(n: number): Role[] {
  return n === 2 ? ["R"] : lineAfterSeat(n).filter((r) => r !== "F0");
}

// --- Phases ------------------------------------------------------------------------------

/** Beat 1, "Relais": Ruben (in front) waits at gate g, the friend behind him stands on plate a, Ruben goes through to plate b, everyone follows. */
function relais(n: number): Phase[] {
  const fs = friends(n);
  const k = fs.length;
  const lineUp: Phase["do"] = { R: walk(G1_FRONT) };
  fs.forEach((f, i) => (lineUp[f] = walk(10.5 - (k - 1 - i) * 0.85, never)));
  const throughSpots = fs.map((f, i) => [f, 16.5 - (k - 1 - i) * 0.8] as [Role, number]);
  const through: Phase["do"] = { R: walk(17.4, never), ...goTo(throughSpots) };
  const onSpots: Array<[Role, number]> = [["R", SEAT_STAND], ...fs.map((f, i) => [f, SEAT_STAND - 0.85 - (k - 1 - i) * 0.85] as [Role, number])];
  return [
    { name: "1. relais: Ruben at gate g, the friend behind him on plate a", do: lineUp, until: cond.all(cond.near("R", G1_FRONT, 0.3), cond.plateActive("a"), cond.gateOpen("g")) },
    { name: "1. relais: Ruben goes through to plate b", do: { R: walk(17.4, never) }, until: cond.all(cond.near("R", 17.4, 0.3), cond.plateActive("b")) },
    { name: "1. relais: Ruben holds b, the friends come through", do: through, until: allNear(throughSpots) },
    { name: "walk to the reserved seat", do: goTo(onSpots), until: allNear(onSpots, 0.3) },
  ];
}

/**
 * Beat 2, "La place de Ruben": Ruben walks into the seat (plate c: 2/2, gate h opens), his neighbour
 * jumps over the block and holds d, the next friend waits on the block; Ruben comes out, jumps onto
 * the block and hops over that friend into h; the others cross the block one after the other, the
 * one on the block always waiting for the next one before he drops (the rope would drag the next one
 * into the seat).
 */
function place(n: number): Phase[] {
  const { nb, second, rest } = seatRoles(n);
  const back = [...rest].reverse(); // the next to cross first
  const restSpots = back.map((f, j) => [f, 23.2 - 0.8 * j] as [Role, number]);
  const phases: Phase[] = [
    { name: "2. Ruben walks into his seat (plate c: 2/2)", do: { R: walk(SEAT, never) }, until: cond.all(cond.near("R", SEAT, 0.2), cond.plateActive("c"), cond.gateOpen("h")), timeout: 6 },
    { name: "2. Ruben's neighbour jumps over the block and holds d", do: { [nb]: walk(28.4) }, until: cond.all(cond.near(nb, 28.4, 0.3), cond.plateActive("d")), timeout: 8 },
  ];
  if (second) {
    phases.push({
      name: "2. the next friend waits on the block",
      do: { [second]: walk(BLOCK_RIGHT, { tol: 0.15 }), ...goTo(restSpots) },
      until: cond.all(cond.near(second, BLOCK_RIGHT, 0.25), cond.standsAbove(second, 7), allNear(restSpots, 0.3)),
      timeout: 8,
    });
  }
  phases.push(
    { name: "2. Ruben comes out of his seat (d holds h)", do: { R: walk(STEP, never) }, until: cond.near("R", STEP, 0.25), timeout: 5 },
    { name: "2. Ruben jumps onto the block", do: { R: jumpTo(BLOCK_LEFT, { rise: 0.15 }) }, until: cond.all(cond.standsAbove("R", 7), cond.near("R", BLOCK_LEFT, 0.35)), timeout: 5 },
    { name: "2. Ruben's neighbour makes room in front of the gate", do: { [nb]: walk(29.2, never) }, until: cond.near(nb, 29.2, 0.3), timeout: 5 },
    second
      ? { name: "2. Ruben hops over the friend on the block into gate h", do: { R: jumpTo(27.6, { rise: 0.12 }) }, until: cond.all(cond.near("R", 27.6, 0.4), cond.standsAbove("R", 9), (w) => w.bodies[roleIndex("R", w.bodies.length)]!.y + 0.9 > 8.9), timeout: 5 }
      : { name: "2. Ruben drops into gate h", do: { R: walk(27.55, { drop: true, tol: 0.25 }) }, until: cond.near("R", 27.55, 0.3), timeout: 5 },
  );
  // The line past the gate, front to back, and the one waiting on the block.
  const ahead: Role[] = [nb, "R"];
  let pivot = second;
  const shift = (): Phase => {
    const spots = ahead.map((r, j) => [r, 29.5 + 0.8 * (ahead.length - 1 - j)] as [Role, number]);
    return { name: "2. the line moves on (d stays held)", do: goTo(spots), until: allNear(spots, 0.3), timeout: 6 };
  };
  phases.push(shift());
  for (const f of back) {
    phases.push(
      { name: `2. ${f} jumps onto the block`, do: { [f]: seq(walk(23.9, never), jumpTo(BLOCK_LEFT, { rise: 0.15 })) }, until: cond.all(cond.standsAbove(f, 7), cond.near(f, BLOCK_LEFT, 0.35)), timeout: 6 },
      { name: `2. ${pivot} drops into gate h`, do: { [pivot!]: walk(28.1, { drop: true }) }, until: cond.all(cond.near(pivot!, 28.1, 0.35), feetBelow(pivot!, 8.95)), timeout: 5 },
      { name: `2. ${f} moves on along the block`, do: { [f]: walk(BLOCK_RIGHT, { tol: 0.15 }) }, until: cond.near(f, BLOCK_RIGHT, 0.25), timeout: 5 },
    );
    ahead.push(pivot!);
    pivot = f;
    phases.push(shift());
  }
  if (pivot) {
    phases.push({ name: `2. ${pivot} drops into gate h`, do: { [pivot]: walk(28.1, { drop: true }) }, until: cond.all(cond.near(pivot, 28.1, 0.35), feetBelow(pivot, 8.95)), timeout: 5 });
    ahead.push(pivot);
  }
  const lineSpots = lineAfterSeat(n).map((r, j) => [r, 33.4 - 0.8 * j] as [Role, number]);
  phases.push({ name: "2. everybody on", do: goTo(lineSpots), until: allNear(lineSpots, 0.3), timeout: 10 });
  return phases;
}

/**
 * Beat 3 up to the key: everybody but F0 sits on the bench p (W-1) and the trapdoor w opens under
 * F0 (at 2 players F0 is in front of Ruben and first hops back over him); the bench comes close to
 * the key's end; F0 takes the key.
 */
function controle(n: number): Phase[] {
  const phases: Phase[] = [];
  let left: Array<[Role, number]>;
  if (n === 2) {
    const wait: Array<[Role, number]> = [["R", 38.2], ["F0", 39.1]];
    phases.push(
      { name: "3. Ruben waits before the bench, F0 just past him", do: goTo(wait), until: allNear(wait, 0.3), timeout: 15 },
      { name: "3. F0 hops back over Ruben onto the trapdoor", do: { F0: jumpTo(ON_TRAPDOOR, { rise: 0.1 }) }, until: cond.all(cond.near("F0", ON_TRAPDOOR, 0.35), cond.standsAbove("F0", 9)), timeout: 5 },
      { name: "3. contrôle surprise: Ruben sits (W-1), the trapdoor opens under F0", do: { R: walk(39.4, never) }, until: cond.all(cond.plateActive("p"), feetBelow("F0", 10.9)), timeout: 6 },
    );
    left = [["R", 36.6]];
  } else {
    // Left to right: F0 at the back (on the trapdoor), the others in line order.
    const seated = teamAtX(n).reverse();
    const bench = seated.map((r, i) => [r, 39.4 + 0.85 * i] as [Role, number]);
    phases.push({
      name: "3. contrôle surprise: everybody but F0 sits (W-1), the trapdoor opens under F0",
      do: { ...goTo(bench), F0: walk(ON_TRAPDOOR, never) },
      until: cond.all(allNear(bench, 0.35), cond.plateActive("p"), feetBelow("F0", 10.9)),
      timeout: 25,
    });
    left = seated.map((r, i) => [r, 36.0 + 0.85 * i] as [Role, number]);
  }
  phases.push(
    { name: "3. the bench comes close to the key (the trapdoor shuts)", do: goTo(left), until: cond.all(allNear(left, 0.3), not(cond.gateOpen("w"))), timeout: 8 },
    { name: "3. F0 takes the key under the benches", do: { F0: walk(KEY, never) }, until: cond.keyTaken, timeout: 6 },
  );
  return phases;
}

/** Beat 3, the way out: F0 stands on f (= 1) in the basement, the team goes out through x, F0 goes under e, someone steps on r, F0 jumps out. */
function sortie(n: number): Phase[] {
  const team = teamAtX(n);
  const atX = team.map((r, j) => [r, PF - 0.8 * j] as [Role, number]);
  const out = team.map((r, j) => [r, 49.4 + 0.8 * (team.length - 1 - j)] as [Role, number]);
  // Outside, the back of the line stays off e; the front one ends on r.
  const room = team.map((r, j) => [r, 52.85 - 0.8 * j] as [Role, number]);
  const front = team[0]!;
  // F0 comes out on the side of his chain neighbour: left of e at 5 players, right of it otherwise.
  const out0 = n >= 5 ? OUT_OF_E : 50.3;
  return [
    { name: "3. F0 onto plate f (= 1): gate x opens, the key's gate n shuts", do: { F0: walk(PF, never), ...goTo(atX) }, until: cond.all(allNear(atX), cond.plateActive("f"), cond.gateOpen("x")), timeout: 15 },
    { name: "3. the team goes out through x", do: goTo(out), until: allNear(out), timeout: 10 },
    { name: "3. F0 goes under the landing's trapdoor e", do: { F0: walk(UNDER_E, never), ...goTo(room) }, until: cond.all(cond.near("F0", UNDER_E, 0.3), allNear(room)), timeout: 8 },
    { name: "3. the front one on r: e opens", do: { [front]: walk(53.2, never) }, until: cond.all(cond.plateActive("r"), cond.gateOpen("e")), timeout: 5 },
    { name: "3. F0 jumps out of the basement", do: { F0: jumpTo(out0, { rise: 0.32 }), [front]: walk(53.2, never) }, until: cond.all(cond.standsAbove("F0", 9), cond.near("F0", out0, 0.4)), timeout: 4 },
  ];
}

/** Beat 4: down the tiers onto the stage, the key passed to the front of the line, the door. */
function estrade(q: Role[]): Phase[] {
  const spots = q.map((r, j) => [r, DOOR_FRONT - 0.8 * j] as [Role, number]);
  const phases: Phase[] = [{ name: "4. down the tiers onto the stage", do: goTo(spots, { drop: true }), until: allNear(spots, 0.3), timeout: 25 }];
  for (let j = q.length - 2; j >= 0; j--) {
    phases.push({ name: `4. ${q[j]} takes the key from ${q[j + 1]}`, do: { [q[j]!]: takeKey(q[j + 1]!) }, until: carriedBy(q.slice(0, j + 1)), timeout: 3 });
  }
  phases.push({ name: "4. everyone through the door", do: { "*": () => enter() }, until: cond.won, timeout: 20 });
  return phases;
}

export const solution: CoopSolution = (n) => [...relais(n), ...place(n), ...controle(n), ...sortie(n), ...estrade([...teamAtX(n), "F0"])];

// --- Shortcuts that must fail --------------------------------------------------------------
//
// Each one plays the solution up to the beat it tries to skip, then the attempt (the phase named
// "ATTEMPT", which must time out: the campaign test checks that the run fails there), then, where
// it makes sense, what would finish the level had the attempt worked.

/** Beat 2 set-up for the seat shortcuts: Ruben jumps onto the block from the step and waits on it, against gate h. */
function rubenOnTheBlock(): Phase[] {
  return [{ name: "Ruben jumps onto the block (out of the way)", do: { R: seq(walk(23.9, never), jumpTo(BLOCK_RIGHT, { rise: 0.15 })) }, until: cond.all(cond.standsAbove("R", 7), cond.near("R", BLOCK_RIGHT, 0.35)), timeout: 8 }];
}

/**
 * Beat 3 set-up with Ruben at the left of the whole team: the friends who are behind him after beat
 * 2 hop over him and his neighbour, then everybody walks on, Ruben last. Ruben ends at `rx`, his
 * neighbour on the bench just right of him, the others after.
 */
function rubenLeftOfEveryone(n: number, rx: number, sitAt = rx): Phase[] {
  const line = lineAfterSeat(n);
  const at = line.indexOf("R");
  const nb = line[0]!;
  const behind = line.slice(at + 1); // closest to Ruben first
  const nbX = Math.max(sitAt + 0.85, 39.4);
  const phases: Phase[] = [];
  if (behind.length > 0) {
    const start: Array<[Role, number]> = [[nb, 33.4], ["R", 32.6], ...behind.map((f, i) => [f, 31.75 - 0.85 * i] as [Role, number])];
    phases.push({ name: "line up before the bench", do: goTo(start), until: allNear(start, 0.3), timeout: 10 });
    behind.forEach((f, i) => {
      if (i > 0) phases.push({ name: `${f} steps up behind Ruben`, do: { [f]: walk(31.75, never) }, until: cond.near(f, 31.75, 0.3), timeout: 6 });
      const land = 35.0 + 0.85 * i; // each one lands past the ones already over
      phases.push({ name: `${f} hops over Ruben and his neighbour`, do: { [f]: jumpTo(land, { rise: 0.1 }) }, until: cond.all(cond.near(f, land, 0.4), cond.standsAbove(f, 9)), timeout: 5 });
    });
  }
  const end: Array<[Role, number]> = [[nb, nbX], ["R", rx]];
  const xs = behind.map((_, i) => nbX + 0.85 * (i + 1));
  const inPlace = (w: CoopWorld) => {
    const got = behind.map((r) => w.bodies[roleIndex(r, w.bodies.length)]!).map((b) => b.cx).sort((a, b) => a - b);
    return got.every((x, i) => Math.abs(x - xs[i]!) < 0.3) && behind.every((r) => w.bodies[roleIndex(r, w.bodies.length)]!.grounded);
  };
  phases.push({ name: "everybody walks on, Ruben last", do: { ...goTo(end), ...Object.fromEntries(behind.map((f) => [f, walkByRank(behind, xs)])) }, until: cond.all(allNear(end, 0.3), inPlace), timeout: 12 });
  return phases;
}

export const shortcuts: Record<string, CoopSolution> = {
  /** Beat 2 without Ruben: Ruben's neighbour alone in the seat (1/2), Ruben (on the block) and the others try gate h. */
  "a friend alone on Ruben's seat": (n) => {
    const { nb } = seatRoles(n);
    return [
      ...relais(n),
      ...rubenOnTheBlock(),
      { name: "Ruben's neighbour walks into the seat (1/2)", do: { [nb]: walk(SEAT, never) }, until: cond.near(nb, SEAT, 0.2), timeout: 6 },
      { name: "ATTEMPT: Ruben goes through gate h", do: { R: walk(28.6, { drop: true }) }, until: pastX("R", 28.2), timeout: 8 },
    ];
  },

  /** Beat 2 with two friends: one in the seat, the next one leaning in from the step (k holds him, not c); Ruben tries gate h. */
  "two friends on Ruben's seat": (n) => {
    const { nb, second } = seatRoles(n);
    const phases: Phase[] = [
      ...relais(n),
      ...rubenOnTheBlock(),
      { name: "Ruben's neighbour walks into the seat", do: { [nb]: walk(SEAT, never) }, until: cond.near(nb, SEAT, 0.2), timeout: 6 },
    ];
    if (second) phases.push({ name: "the next friend leans into the seat from the step", do: { [second]: walk(25.0, never), [nb]: walk(SEAT, never) }, until: cond.near(second, 24.6, 0.3), timeout: 6 });
    phases.push({ name: "ATTEMPT: Ruben goes through gate h", do: { R: walk(28.6, { drop: true }), [nb]: walk(SEAT, never), ...(second ? { [second]: walk(25.0, never) } : {}) }, until: pastX("R", 28.2), timeout: 8 });
    return phases;
  },

  /** Beat 2: a friend in the seat, another body hops at the end of the rope (trying to hang from him and weigh on the seat); Ruben pushes into gate h. */
  "a friend hanging from the one in the seat": (n) => {
    const { nb, second } = seatRoles(n);
    const phases: Phase[] = [
      ...relais(n),
      ...rubenOnTheBlock(),
      { name: "Ruben's neighbour walks into the seat", do: { [nb]: walk(SEAT, never) }, until: cond.near(nb, SEAT, 0.2), timeout: 6 },
    ];
    if (second) {
      phases.push({ name: "ATTEMPT: the next friend hops at the end of the rope, Ruben pushes into gate h", do: { [second]: hopAt(21.1, 0.7), [nb]: walk(SEAT, never), R: walk(28.6, { drop: true }) }, until: pastX("R", 28.2), timeout: 10 });
    } else {
      // At 2 players Ruben himself is the one who hops (2 more on the seat would open h).
      phases.push({ name: "Ruben drops back before the seat", do: { R: walk(22.4, { drop: true }) }, until: cond.near("R", 22.4, 0.4), timeout: 6 });
      phases.push({ name: "ATTEMPT: Ruben hops at the end of the rope", do: { R: hopAt(21.1, 0.7), [nb]: walk(SEAT, never) }, until: cond.gateOpen("h"), timeout: 10 });
    }
    return phases;
  },

  /** Beat 3: the whole team on the bench, Ruben at its left end walks off towards the open trapdoor (he would be stuck below for good). */
  "Ruben walks off the bench into the trapdoor": (n) => [
    ...relais(n),
    ...place(n),
    ...rubenLeftOfEveryone(n, 38.2, 39.4),
    { name: "Ruben sits at the bench's left end: the trapdoor opens", do: { R: walk(39.4, never) }, until: cond.all(cond.plateActive("p"), cond.gateOpen("w")), timeout: 6 },
    { name: "ATTEMPT: Ruben walks off the bench into the trapdoor", do: { R: walk(35.6, never) }, until: feetBelow("R", 10.9), timeout: 5 },
  ],

  /** Beat 3: the same, Ruben jumping from the bench towards the open trapdoor. */
  "Ruben jumps off the bench into the trapdoor": (n) => [
    ...relais(n),
    ...place(n),
    ...rubenLeftOfEveryone(n, 38.2, 39.4),
    { name: "Ruben sits at the bench's left end: the trapdoor opens", do: { R: walk(39.4, never) }, until: cond.all(cond.plateActive("p"), cond.gateOpen("w")), timeout: 6 },
    { name: "ATTEMPT: Ruben jumps from the bench into the trapdoor", do: { R: jumpTo(35.9, { rise: 0.05 }) }, until: feetBelow("R", 10.9), timeout: 5 },
  ],

  /** Beat 3 with Ruben as the free one: all the friends sit on the bench, Ruben waits on the trapdoor. */
  "Ruben as the free one": (n) => [
    ...relais(n),
    ...place(n),
    ...rubenLeftOfEveryone(n, ON_TRAPDOOR),
    { name: "ATTEMPT: the trapdoor opens under Ruben (all the friends on the bench)", do: {}, until: feetBelow("R", 10.9), timeout: 8 },
  ],

  /** Beat 3 in the wrong order: F0 drops in and stands on f first (the team goes out), then goes back for the key. */
  "freeing the others before taking the key": (n) => {
    const team = teamAtX(n);
    const atX = team.map((r, j) => [r, PF - 0.8 * j] as [Role, number]);
    const out = team.map((r, j) => [r, 49.4 + 0.8 * (team.length - 1 - j)] as [Role, number]);
    const ctl = controle(n);
    return [
      ...relais(n),
      ...place(n),
      ...ctl.slice(0, ctl.length - 1), // everything but taking the key
      { name: "F0 onto plate f first (gate n shuts on the key)", do: { F0: walk(PF, never), ...goTo(atX) }, until: cond.all(cond.plateActive("f"), not(cond.gateOpen("n")), allNear(atX)), timeout: 15 },
      { name: "the team goes out through x", do: goTo(out), until: allNear(out), timeout: 10 },
      { name: "ATTEMPT: F0 leaves f and goes back for the key", do: { F0: walk(KEY, never) }, until: cond.keyTaken, timeout: 15 },
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
