/**
 * Bot solution of "L'Amphi" (coop03.ts), and the ways round the puzzle that must fail.
 *
 * Roles: R is Ruben, F0..F3 the friends in seat order. F0, the free end of the chain, is the one
 * left free by plate p (W-1) who fetches the key; the last friend in seat order is Ruben's
 * neighbour in the chain. Map, beats and numbers: docs/coop-levels/coop03.md.
 */
import { BIT_DOWN, BIT_DOWN_PRESS } from "../inputBits";
import { cond, enter, friends, hold, jumpTo, mount, roleIndex, seq, walk, type CoopSolution, type Goal, type Phase, type Role } from "../bots";
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

const never = { jump: "never" as const };

// --- Places (x of body centres, in cells) --------------------------------------------------

/** Beat 1: plate a at 9-10, gate g at 14, plate b at 15-17. Ruben waits against the gate. */
const G1_FRONT = 13.5;
/** Beat 2: the seat (plate c) at 24-25 on row 7, an open column at 26, gate h at 27, plate d at 28-30. */
const SHELF2_STAND = 23.2;
const SHELF2 = 25.5;
const SHELF2_DROP = 26.4;
/** Beat 3: trapdoor w at 35-36, plate p (W-1) at 37-41 with the key under it (40, gate n at 38), the "= 1" shelf (plate f) at 45, gate x at 46, plate r at 47-49. */
const TRAPDOOR = 35.5;
const KEY = 40.5;
const UNDER_TRAPDOOR = 36.4;
const OUT_OF_TRAPDOOR = 37.6;
const PF = 45.5;
const PF_DROP = 44.3;
/** Beat 4: the door at 78 on the stage. */
const DOOR_FRONT = 77.4;

/** Friends who go first through beat 2 (all but F0 from 3 players; F0 alone at 2). */
function frontFriends(n: number): Role[] {
  const fs = friends(n);
  return n === 2 ? fs : fs.slice(1);
}

/** The queue, front to back, from beat 3 on: the front friends (last seat first), Ruben, F0 at the back. */
function queue(n: number): Role[] {
  return n === 2 ? ["R", "F0"] : [...[...frontFriends(n)].reverse(), "R", "F0"];
}

/** Plate p: Ruben at its left end, the friends but F0 after him. */
function benchOf(n: number): Array<[Role, number]> {
  return [["R", 37.6], ...friends(n).slice(1).map((f, i) => [f, 38.45 + 0.8 * i] as [Role, number])];
}

// --- Phases ------------------------------------------------------------------------------

/** Beat 1, "Relais": Ruben (in front) waits at gate g, the friend behind him stands on plate a, Ruben goes through to plate b, everyone follows. */
function relais(n: number): Phase[] {
  const fs = friends(n);
  const k = fs.length;
  const lineUp: Phase["do"] = { R: walk(G1_FRONT) };
  fs.forEach((f, i) => (lineUp[f] = walk(10.5 - (k - 1 - i) * 0.85, never)));
  const throughSpots = fs.map((f, i) => [f, 16.5 - (k - 1 - i) * 0.8] as [Role, number]);
  const through: Phase["do"] = { R: walk(17.4, never) };
  for (const [f, x] of throughSpots) through[f] = walk(x, never);
  const onSpots: Array<[Role, number]> = [["R", SHELF2_STAND], ...fs.map((f, i) => [f, SHELF2_STAND - 0.85 - (k - 1 - i) * 0.85] as [Role, number])];
  const onwards: Phase["do"] = {};
  for (const [r, x] of onSpots) onwards[r] = walk(x, never);
  return [
    { name: "1. relais: Ruben at gate g, the friend behind him on plate a", do: lineUp, until: cond.all(cond.near("R", G1_FRONT, 0.3), cond.plateActive("a"), cond.gateOpen("g")) },
    { name: "1. relais: Ruben goes through to plate b", do: { R: walk(17.4, never) }, until: cond.all(cond.near("R", 17.4, 0.3), cond.plateActive("b")) },
    { name: "1. relais: Ruben holds b, the friends come through", do: through, until: allNear(throughSpots) },
    { name: "walk to the reserved seat", do: onwards, until: allNear(onSpots, 0.3) },
  ];
}

/** Beat 2, "La place de Ruben": Ruben on the seat (plate c, 2), the friends pass under it and hold d, Ruben drops off the seat and follows. */
function place(n: number): Phase[] {
  const front = frontFriends(n); // seat order; the last one is Ruben's neighbour and goes first
  const m = front.length;
  const passSpots = front.map((f, j) => [f, n === 2 ? 28.6 : 29.4 - 0.8 * (m - 1 - j)] as [Role, number]);
  const pass: Phase["do"] = {};
  for (const [f, x] of passSpots) pass[f] = walk(x, never);
  if (n > 2) pass.F0 = walk(24.8, never); // under the seat, behind the column Ruben drops into
  const goSpots: Array<[Role, number]> = [["R", 29.0], ...front.map((f, j) => [f, 29.8 + 0.8 * j] as [Role, number])];
  const go: Phase["do"] = {};
  for (const [r, x] of goSpots) go[r] = walk(x, never);
  return [
    { name: "2. Ruben jumps onto his seat (plate c: 2/2)", do: { R: jumpTo(SHELF2, { rise: 0.15 }) }, until: cond.all(cond.standsAbove("R", 7), cond.plateActive("c")), timeout: 6 },
    { name: "2. the friends pass under the seat, Ruben's neighbour holds d", do: pass, until: cond.all(allNear(passSpots, 0.3), cond.plateActive("d"), ...(n > 2 ? [cond.near("F0", 24.8, 0.3)] : [])) },
    { name: "2. Ruben drops off his seat", do: { R: walk(SHELF2_DROP, { drop: true, tol: 0.25 }) }, until: cond.near("R", SHELF2_DROP, 0.3), timeout: 6 },
    { name: "2. Ruben goes through gate h (d held)", do: go, until: allNear(goSpots, 0.3) },
    ...(n > 2 ? [{ name: "2. F0 follows", do: { F0: walk(28.3, never) }, until: cond.near("F0", 28.3, 0.3) } as Phase] : []),
  ];
}

/** Beat 3 up to the key: everybody but F0 on plate p (W-1); F0 drops through the trapdoor, takes the key under the benches and jumps back out. */
function controle(n: number): Phase[] {
  const bench = benchOf(n);
  const sit: Phase["do"] = {};
  for (const [r, x] of bench) sit[r] = walk(x, never);
  sit.F0 = n === 2 ? walk(38.4, never) : walk(TRAPDOOR, never); // at 3+ F0 waits on the trapdoor
  const shifted: Phase["do"] = {};
  for (const [r, x] of bench) shifted[r] = walk(x + 1, never);
  const phases: Phase[] = [
    {
      name: "3. contrôle surprise: everybody sits on plate p but F0 (W-1), the trapdoor opens",
      do: sit,
      until: cond.all(allNear(bench, 0.35), cond.plateActive("p"), cond.gateOpen("w"), n === 2 ? cond.near("F0", 38.4, 0.35) : feetBelow("F0", 10.9)),
      timeout: 25,
    },
  ];
  if (n === 2) phases.push({ name: "3. F0 hops over Ruben into the trapdoor", do: { F0: jumpTo(TRAPDOOR, { rise: 0.05 }) }, until: feetBelow("F0", 10.9), timeout: 4 });
  phases.push(
    { name: "3. F0 takes the key under the benches", do: { F0: walk(KEY, never) }, until: cond.keyTaken, timeout: 6 },
    { name: "3. F0 back under the trapdoor", do: { F0: walk(UNDER_TRAPDOOR, never) }, until: cond.near("F0", UNDER_TRAPDOOR, 0.3), timeout: 6 },
    { name: "3. the bench makes room at its left end", do: shifted, until: allNear(bench.map(([r, x]) => [r, x + 1] as [Role, number]), 0.3), timeout: 5 },
    { name: "3. F0 jumps out onto the bench", do: { F0: jumpTo(OUT_OF_TRAPDOOR, { rise: 0.25 }) }, until: cond.all(cond.standsAbove("F0", 9), cond.near("F0", OUT_OF_TRAPDOOR, 0.35)), timeout: 4 },
  );
  return phases;
}

/** Beat 3, the way out: the team queues at gate x, F0 holds the "= 1" shelf (plate f), the team goes out onto plate r (2), F0 follows. */
function sortie(n: number): Phase[] {
  const q = queue(n).filter((r) => r !== "F0");
  const waitSpots = q.map((r, j) => [r, PF - 0.8 * j] as [Role, number]);
  const behind = PF - 0.8 * q.length - 0.1;
  const wait: Phase["do"] = { F0: walk(behind, never) };
  for (const [r, x] of waitSpots) wait[r] = walk(x, never);
  const outSpots = q.map((r, j) => [r, 47.4 + 0.8 * (q.length - 1 - j)] as [Role, number]);
  const out: Phase["do"] = {};
  for (const [r, x] of outSpots) out[r] = walk(x, never);
  return [
    { name: "3. the team leaves plate p (the trapdoor shuts) and queues at gate x", do: wait, until: cond.all(allNear(waitSpots), cond.near("F0", behind, 0.35), not(cond.gateOpen("w"))) },
    { name: "3. F0 jumps onto the shelf plate f (= 1): gate x opens, gate n shuts", do: { F0: jumpTo(PF, { rise: 0.18 }) }, until: cond.all(cond.plateActive("f"), cond.gateOpen("x")), timeout: 5 },
    { name: "3. the team goes out onto plate r", do: out, until: cond.all(allNear(outSpots), cond.plateActive("r")) },
    { name: "3. F0 drops off the shelf", do: { F0: walk(PF_DROP, { drop: true, tol: 0.25 }) }, until: cond.near("F0", PF_DROP, 0.3), timeout: 5 },
    { name: "3. F0 goes into gate x (r held)", do: { F0: walk(46.0, never) }, until: cond.near("F0", 46.0, 0.25), timeout: 5 },
  ];
}

/** Beat 4: down the tiers onto the stage, the key passed to the front of the queue, the door. */
function estrade(n: number, q: Role[] = queue(n)): Phase[] {
  const spots = q.map((r, j) => [r, DOOR_FRONT - 0.8 * j] as [Role, number]);
  const go: Phase["do"] = {};
  for (const [r, x] of spots) go[r] = walk(x, { drop: true });
  const phases: Phase[] = [{ name: "4. down the tiers onto the stage", do: go, until: allNear(spots, 0.3), timeout: 25 }];
  for (let j = q.length - 2; j >= 0; j--) {
    phases.push({ name: `4. ${q[j]} takes the key from ${q[j + 1]}`, do: { [q[j]!]: takeKey(q[j + 1]!) }, until: carriedBy(q.slice(0, j + 1)), timeout: 3 });
  }
  phases.push({ name: "4. everyone through the door", do: { "*": () => enter() }, until: cond.won, timeout: 20 });
  return phases;
}

export const solution: CoopSolution = (n) => [...relais(n), ...place(n), ...controle(n), ...sortie(n), ...estrade(n)];

// --- Shortcuts that must fail --------------------------------------------------------------
//
// Each one plays the solution up to the beat it tries to skip, then the attempt (the phase
// named "ATTEMPT", which must time out), then what would finish the level had the attempt
// worked: if a change to the level let the attempt through, the shortcut would win and the
// checks would catch it.

export const shortcuts: Record<string, CoopSolution> = {
  /** Beat 2 without Ruben: Ruben's neighbour alone on the reserved seat (1/2), Ruben and the others try gate h. */
  "a friend alone on Ruben's seat": (n) => {
    const fs = friends(n);
    const sitter = fs[fs.length - 1]!;
    const rest = (["R", ...fs.slice(0, -1).reverse()] as Role[]); // front to back once Ruben leads
    const aheadSpots = rest.map((r, j) => [r, SHELF2_DROP - 0.8 * j - (j > 0 ? 1.0 : 0)] as [Role, number]);
    const ahead: Phase["do"] = { [sitter]: walk(SHELF2_STAND - 0.4, never) };
    for (const [r, x] of aheadSpots) ahead[r] = walk(x, never);
    const passSpots = rest.map((r, j) => [r, 30.2 - 0.8 * j] as [Role, number]);
    const pass: Phase["do"] = {};
    for (const [r, x] of passSpots) pass[r] = walk(x, never);
    return [
      ...relais(n),
      { name: "Ruben walks under the seat, his neighbour stays before it", do: ahead, until: cond.near("R", SHELF2_DROP, 0.3), timeout: 8 },
      { name: "Ruben's neighbour jumps onto the seat (1/2)", do: { [sitter]: jumpTo(SHELF2, { rise: 0.15 }) }, until: cond.all(cond.standsAbove(sitter, 7), cond.near(sitter, SHELF2, 0.6)), timeout: 6 },
      { name: "ATTEMPT: the others go through gate h", do: pass, until: allNear(passSpots), timeout: 10 },
      { name: "the sitter follows", do: { [sitter]: seq(walk(SHELF2_DROP, { drop: true }), walk(28.6, never)) }, until: cond.near(sitter, 28.6, 0.3) },
      ...controle(n),
      ...sortie(n),
      ...estrade(n),
    ];
  },

  /** Beat 3 with Ruben as the free one: all the friends sit on plate p, Ruben waits on the trapdoor. */
  "Ruben as the free one": (n) => {
    const fs = friends(n);
    // Ruben on the trapdoor; the friends on p (at 3+ F0, behind Ruben, hops over him onto p's left end).
    const spots: Array<[Role, number]> = [["R", TRAPDOOR], ...fs.map((f, i) => [f, n === 2 ? 38.4 : i === 0 ? 34.3 : 38.65 + 0.8 * (i - 1)] as [Role, number])];
    const sit: Phase["do"] = {};
    for (const [r, x] of spots) sit[r] = walk(x, never);
    const hop: Phase["do"] = { ...sit, F0: jumpTo(37.75, { rise: 0.1 }) };
    return [
      ...relais(n),
      ...place(n),
      { name: "Ruben on the trapdoor, the friends on p", do: sit, until: allNear(spots, 0.3), timeout: 12 },
      ...(n > 2 ? [{ name: "F0 hops over Ruben onto p", do: hop, until: cond.all(cond.standsAbove("F0", 9), cond.near("F0", 37.75, 0.3)), timeout: 5 } as Phase] : []),
      { name: "ATTEMPT: the trapdoor opens under Ruben (all the friends on p)", do: {}, until: feetBelow("R", 10.9), timeout: 8 },
      { name: "Ruben takes the key", do: { R: walk(KEY, never) }, until: cond.keyTaken, timeout: 6 },
      { name: "Ruben back under the trapdoor", do: { R: walk(UNDER_TRAPDOOR, never) }, until: cond.near("R", UNDER_TRAPDOOR, 0.3), timeout: 6 },
      { name: "Ruben jumps out", do: { R: jumpTo(34.3, { rise: 0.25 }) }, until: cond.standsAbove("R", 9), timeout: 4 },
      { name: "F0 takes the key from Ruben", do: { F0: seq(walk(35.2, never), takeKey("R")) }, until: carriedBy(["F0"]), timeout: 6 },
      ...sortie(n),
      ...estrade(n),
    ];
  },

  /** Beat 3 in the wrong order: F0 frees the others (plate f) before taking the key; then they come back for it, Ruben holding gate x open from plate r. */
  "freeing the others before taking the key": (n) => {
    const fs = friends(n);
    const bench = benchOf(n);
    const sit: Phase["do"] = { F0: n === 2 ? walk(38.4, never) : walk(34.3, never) };
    for (const [r, x] of bench) sit[r] = walk(x, never);
    const shifted: Phase["do"] = {};
    for (const [r, x] of bench) shifted[r] = walk(x + 1, never);
    // At 2 players F0 has not hopped over Ruben: F0 is in front of him and jumps onto the shelf from there.
    const q = n === 2 ? (["F0", "R"] as Role[]) : queue(n);
    const shelfer: Role = "F0";
    const others = q.filter((r) => r !== shelfer);
    const shelfFrom = n === 2 ? PF - 1.1 : PF - 0.8 * others.length - 0.1;
    const waitSpots = others.map((r, j) => [r, n === 2 ? PF - 1.9 - 0.8 * j : PF - 0.8 * j] as [Role, number]);
    const wait: Phase["do"] = { [shelfer]: walk(shelfFrom, never) };
    for (const [r, x] of waitSpots) wait[r] = walk(x, never);
    const out: Phase["do"] = {};
    others.forEach((r, j) => (out[r] = walk(47.4 + 0.8 * (others.length - 1 - j), never)));
    // Once the others have left p the trapdoor stays shut: F0, alone, goes back for the key.
    const back: Phase["do"] = { F0: walk(TRAPDOOR, never), "*": () => hold(1) };
    const allOut: Phase["do"] = { R: walk(48.4, never) };
    fs.forEach((f, i) => (allOut[f] = walk(49.2 + 0.8 * (fs.length - 1 - i), never)));
    return [
      ...relais(n),
      ...place(n),
      { name: "everybody but F0 sits on p (W-1); F0 stays out of the open trapdoor", do: sit, until: cond.all(allNear(bench, 0.35), cond.plateActive("p"), cond.gateOpen("w")), timeout: 25 },
      ...(n > 2
        ? [
            { name: "the bench makes room", do: shifted, until: allNear(bench.map(([r, x]) => [r, x + 1] as [Role, number]), 0.3), timeout: 5 } as Phase,
            { name: "F0 jumps over the open trapdoor onto the bench", do: { F0: jumpTo(OUT_OF_TRAPDOOR, { rise: 0.1 }) }, until: cond.all(cond.standsAbove("F0", 9), cond.near("F0", OUT_OF_TRAPDOOR, 0.4)), timeout: 4 } as Phase,
          ]
        : []),
      { name: "the team leaves p and queues at gate x", do: wait, until: cond.all(not(cond.gateOpen("w")), cond.near(shelfer, shelfFrom, 0.35), allNear(waitSpots)), timeout: 15 },
      { name: "F0 jumps onto plate f first: the key's gate n shuts", do: { F0: jumpTo(PF, { rise: 0.18 }) }, until: cond.all(cond.plateActive("f"), not(cond.gateOpen("n"))), timeout: 5 },
      { name: "the team goes out onto r", do: out, until: cond.all(cond.plateActive("r"), ...others.map((r) => pastX(r, 47))), timeout: 10 },
      { name: "F0 drops and goes out", do: { F0: seq(walk(PF_DROP, { drop: true, tol: 0.25 }), walk(46.6, never)) }, until: pastX("F0", 46.3), timeout: 8 },
      { name: "ATTEMPT: F0 goes back for the key (the others are out, the trapdoor is shut)", do: back, until: cond.keyTaken, timeout: 25 },
      { name: "F0 back under the trapdoor", do: { F0: walk(UNDER_TRAPDOOR, never) }, until: cond.near("F0", UNDER_TRAPDOOR, 0.3), timeout: 6 },
      { name: "F0 jumps out", do: { F0: jumpTo(34.3, { rise: 0.25 }) }, until: cond.standsAbove("F0", 9), timeout: 4 },
      { name: "everybody out again (Ruben holds r)", do: allOut, until: (w) => w.bodies.every((b) => b.cx > 46.8), timeout: 15 },
      ...estrade(n, [...fs, "R"] as Role[]),
    ];
  },

  /** Beat 3: Ruben jumps onto the "= 1" shelf himself while the friends try to go out. */
  "Ruben on the = 1 plate": (n) => {
    const fs = friends(n);
    const q = queue(n).filter((r) => r !== "F0" && r !== "R"); // the friends in front of Ruben
    const rubenFrom = n === 2 ? 44.4 : PF - 0.8 * q.length;
    const wait: Phase["do"] = { R: walk(rubenFrom, never), F0: walk(n === 2 ? 43.6 : rubenFrom - 0.9, never) };
    q.forEach((r, j) => (wait[r] = walk(PF - 0.8 * j, never)));
    const outOrder = [...q, "F0"] as Role[];
    const tryOut: Phase["do"] = {};
    outOrder.forEach((r, j) => (tryOut[r] = walk(47.4 + 0.8 * (outOrder.length - 1 - j), never)));
    return [
      ...relais(n),
      ...place(n),
      ...controle(n),
      { name: "the team queues at gate x, Ruben behind the friends", do: wait, until: cond.all(not(cond.gateOpen("w")), cond.near("R", rubenFrom, 0.35)), timeout: 15 },
      { name: "Ruben jumps onto plate f (2 is not = 1)", do: { R: jumpTo(PF, { rise: 0.18 }) }, until: cond.all(cond.standsAbove("R", 7), cond.near("R", PF, 0.6)), timeout: 6 },
      { name: "ATTEMPT: the friends go out through gate x", do: tryOut, until: (w) => fs.every((f) => pastX(f, 47)(w)), timeout: 10 },
      { name: "Ruben drops and follows", do: { R: seq(walk(PF_DROP, { drop: true, tol: 0.25 }), walk(46.6, never)) }, until: pastX("R", 46.3), timeout: 8 },
      ...estrade(n, [...q, "F0", "R"] as Role[]),
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
      // Had it worked: the climber holds b and the rest of the solution follows.
      { name: "the climber holds b, the others come through", do: { [climber]: walk(17.4, never), R: walk(16.4, never), "*": (i) => walk(15.6 - 0.8 * (fs.length - 2 - i), never) }, until: cond.near("R", 16.4, 0.3), timeout: 10 },
      ...relais(n).slice(3),
      ...place(n),
      ...controle(n),
      ...sortie(n),
      ...estrade(n),
    ];
  },
};
