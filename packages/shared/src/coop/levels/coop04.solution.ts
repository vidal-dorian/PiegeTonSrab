/**
 * Bot solution of "La Salle de TP" (coop04.ts), and the ways round the puzzle that must fail.
 *
 * Roles: R is Ruben, F0..F3 the friends in seat order (the spawn order, left to right, Ruben on
 * the right). The chain is F0 - F1 - ... - the last friend - R. Map, beats and numbers:
 * docs/coop-levels/coop04.md.
 */
import { cond, enter, friends, hold, jumpTo, mount, roleIndex, seq, wait, walk, type CoopSolution, type Goal, type Phase, type Role } from "../bots";
import { BIT_LEFT, BIT_RIGHT } from "../inputBits";
import type { CoopWorld } from "../world";

// --- Helpers (goals and conditions the toolbox does not have) --------------------------------

/** The role's feet are at or below y. */
const feetBelow = (role: Role, y: number) => (w: CoopWorld) => {
  const b = w.bodies[roleIndex(role, w.bodies.length)]!;
  return b.y + b.height >= y - 1e-3;
};
/** Crate `char` has its left side at or right of x. */
const crateAt = (char: string, x: number) => (w: CoopWorld) => w.crates.some((c) => c.thing.char === char && c.x >= x - 1e-3);
/** Crate `char` has fallen with its top to y or below. */
const crateDown = (char: string, y: number) => (w: CoopWorld) => w.crates.some((c) => c.thing.char === char && c.y >= y - 1e-3);
/** Every listed role stands near its x. */
const allNear = (spots: Array<[Role, number]>, tol = 0.35) => cond.all(...spots.map(([r, x]) => cond.near(r, x, tol)));

const never = { jump: "never" as const };

/** Walk to each spot (no jumping). */
function walkTo(spots: Array<[Role, number]>): Phase["do"] {
  const d: Phase["do"] = {};
  for (const [r, x] of spots) d[r] = walk(x, never);
  return d;
}

/**
 * Keep about dx right of another role's centre (at most maxX), without jumping; while the
 * target is past `hopFrom` and the body is still left of it, walk (and hop the gap) to `hopTo`.
 */
function follow(role: Role, dx: number, o: { maxX?: number; hopFrom?: number; hopTo?: number } = {}): Goal {
  const hop = o.hopTo === undefined ? null : walk(o.hopTo, { tol: 0.3 });
  let hopped = false;
  return {
    label: `follow ${role} ${dx >= 0 ? "+" : ""}${dx}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      const other = c.w.bodies[roleIndex(role, c.w.bodies.length)]!;
      const target = Math.min(other.cx + dx, o.maxX ?? Infinity);
      if (hop && !hopped && target > (o.hopFrom ?? 0) + 0.9) {
        if (b.cx > (o.hopFrom ?? 0) + 0.8 && b.grounded) hopped = true;
        else return hop.step(c);
      }
      const d = target - b.cx;
      return Math.abs(d) > 0.15 ? (d > 0 ? BIT_RIGHT : BIT_LEFT) : 0;
    },
  };
}

/** Walk to `d` left of where another role stands when the goal starts, hopping over whoever is in the way. */
function behind(role: Role, d: number): Goal {
  let g: Goal | null = null;
  return {
    label: `get ${d} behind ${role}`,
    step(c) {
      g ??= walk(c.w.bodies[roleIndex(role, c.w.bodies.length)]!.cx - d, { tol: 0.25 });
      return g.step(c);
    },
    done: (c) => g?.done?.(c) === true,
  };
}

/** Standing on `base`, walk along its head until the centre is at x (a leaning tower). */
function shiftOn(base: Role, x: number): Goal {
  return {
    label: `shift to ${x} on ${base}`,
    step(c) {
      const d = x - c.w.bodies[c.i]!.cx;
      return Math.abs(d) > 0.05 ? (d > 0 ? BIT_RIGHT : BIT_LEFT) : 0;
    },
    // Done once there, or after 1.5 s (something may stop it short: then it stays where it got).
    done: (c) => c.t >= 180 || (cond.on(c.w.bodies.length - 1 === c.i ? "R" : (`F${c.i}` as Role), base)(c.w) && Math.abs(x - c.w.bodies[c.i]!.cx) <= 0.08),
  };
}

// --- Places (x of body centres, in cells) --------------------------------------------------

/** Beat 1: the hole at x 7, the duct x 10-13 (floor row 11), M x 14, the shaft J x 15, the upper floor from x 16 (row 9). */
const HOLE = 7.5;
const M_SPOT = 14.6;
const ON_TOWER = 15.0;
const UNDER_SHAFT = 15.5;
const DUCT_END = 13.4;
/** Beat 2: the rack at x 27-29 in the 1-high tunnel (row 8), the ditch at 32-34, its stop at 35. */
const RACK_FRONT = 26.55;
/**
 * Beat 3: the lab x 40-47 (floor row 9, ceiling row 5: 3 high), the second tower at x 40
 * (rows 7-8), plate w at x 43-48. The exit shaft T is x 48 (its floor is w's last cell, bare
 * cables across its foot up to height 2); the landing from x 49 (floor row 5), the door at 50, the
 * cage gate at 51, the key at 52.
 */
const TOWER2_FRONT = 39.55;
/** Touching the tower once it stands in T. */
const T_FRONT = 47.55;
const ON_T = 48.5;
const LANDING = 49.45;
/** In the cage, past its gate, touching the key. */
const KEY_SPOT = 52.2;
/** Off plate w, in front of it. */
const OFF_PLATE = 42.4;

/** The team in chain order, left to right: F0 .. the last friend, Ruben on the right. */
function chainOrder(n: number): Role[] {
  return [...friends(n), "R"];
}

/** Front to back once Ruben leads the queue (beats 2 and 3): Ruben, the last friend, .., F0. */
function queue(n: number): Role[] {
  return chainOrder(n).reverse();
}

/** The friends but Ruben's neighbour, in the duct behind it (nearest first). */
function ductQueue(n: number): Role[] {
  return friends(n).slice(0, -1).reverse();
}

// --- Beat 1, "Le marchepied" -----------------------------------------------------------------

/** Ruben drops into the corridor, pushes the PC tower under the shaft and climbs on it; the friends follow in the duct. */
function marchepiedPush(n: number): Phase[] {
  const fs = friends(n);
  const waitHole: Phase["do"] = { R: walk(HOLE, { drop: true, jump: "never" }) };
  fs.forEach((f, i) => (waitHole[f] = walk(6.4 - (fs.length - 1 - i) * 0.9, never)));
  // The friends hop the hole onto the walkway (x 8-9) and keep above Ruben as he pushes.
  const along = (k: number) => follow("R", 0.9 - 0.85 * k, { maxX: DUCT_END - 0.85 * k, hopFrom: 7, hopTo: 8.6 });
  const push: Phase["do"] = { R: hold(1), [fs[fs.length - 1]!]: along(0) };
  ductQueue(n).forEach((f, k) => (push[f] = along(k + 1)));
  return [
    { name: "1. Ruben drops into the corridor behind the PC tower", do: waitHole, until: cond.all(feetBelow("R", 13.9), cond.near("R", HOLE, 0.3)), timeout: 8 },
    { name: "1. Ruben pushes the tower under the shaft, the friends follow in the duct", do: push, until: cond.all(crateAt("a", 15), cond.near("R", M_SPOT, 0.35)), timeout: 12 },
    { name: "1. Ruben jumps onto the tower", do: { R: jumpTo(ON_TOWER) }, until: cond.all(cond.standsAbove("R", 12), cond.near("R", ON_TOWER, 0.3)), timeout: 4 },
  ];
}

/** Ruben's neighbour drops from the duct onto his head, jumps onto the upper floor. */
function marchepiedClimb(n: number): Phase[] {
  const climber = friends(n)[n - 2]!;
  return [
    { name: "1. his neighbour drops from the duct onto his head", do: { [climber]: walk(ON_TOWER, { drop: true, jump: "never" }) }, until: cond.on(climber, "R"), timeout: 4 },
    { name: "1. Ruben steps under the open shaft", do: { R: walk(UNDER_SHAFT, never) }, until: cond.all(cond.near("R", UNDER_SHAFT, 0.12), cond.on(climber, "R")), timeout: 4 },
    { name: "1. the friend on top jumps onto the upper floor", do: { [climber]: jumpTo(17.2, { rise: 0.25 }) }, until: cond.standsAbove(climber, 9), timeout: 4 },
  ];
}

/** The one up walks away and hauls the others, then the queue reorders with Ruben in front. */
function haulAndLineUp(n: number, top: Role = friends(n)[n - 2]!): Phase[] {
  const rest = chainOrder(n).filter((r) => r !== top);
  const haul: Phase["do"] = { [top]: walk(25.5, never) };
  rest.reverse().forEach((r, k) => (haul[r] = walk(24.6 - 0.9 * k, never)));
  const back: Phase["do"] = { R: wait(0) };
  friends(n).forEach((f, i) => (back[f] = behind("R", 0.9 * (n - 1 - i))));
  const q = chainOrder(n);
  const spots = q.map((r, j) => [r, RACK_FRONT - 0.86 * (q.length - 1 - j)] as [Role, number]);
  return [
    { name: "1. haul everyone up", do: haul, until: cond.all(cond.allAbove(9), (w) => w.bodies.every((b) => b.cx >= 19)), timeout: 30 },
    { name: "2. the friends get behind Ruben", do: back, timeout: 12 },
    { name: "2. everyone lines up behind the server rack, Ruben in front", do: walkTo(spots), until: allNear(spots, 0.3), timeout: 12 },
  ];
}

// --- Beat 2, "Le fossé du tunnel" ------------------------------------------------------------

/** Everyone pushes the rack W into the ditch, then walks on to the second tower. */
function fosse(n: number): Phase[] {
  const q = chainOrder(n);
  const spots = q.map((r, j) => [r, TOWER2_FRONT - 0.86 * (q.length - 1 - j)] as [Role, number]);
  return [
    { name: "2. everyone pushes the rack into the ditch", do: { "*": () => hold(1) }, until: crateDown("r", 9), timeout: 10 },
    { name: "2. over the rack, through the tunnel to the second tower", do: walkTo(spots), until: allNear(spots, 0.3), timeout: 15 },
  ];
}


// --- Beat 3, "Une caisse, deux usages" -------------------------------------------------------

/** The queue pushes the PC tower along plate w until it stands in the exit shaft T (against its far wall). */
function pushIntoShaft(): Phase[] {
  return [{ name: "3. the queue pushes the PC tower along plate w into the exit shaft", do: { "*": () => hold(1) }, until: crateAt("t", 48), timeout: 10 }];
}

/** The queue from q[from] on, in front of the shaft: q[from] touching the tower. */
function atShaft(q: Role[], from: number): Array<[Role, number]> {
  return q.slice(from).map((r, j) => [r, T_FRONT - 0.86 * j] as [Role, number]);
}

const onTower = (r: Role): Phase => ({
  name: `3. ${r} jumps onto the tower`,
  do: { [r]: jumpTo(ON_T) },
  until: cond.all(cond.standsAbove(r, 7), cond.near(r, ON_T, 0.3)),
  timeout: 4,
});

const toLanding = (r: Role): Phase => ({
  name: `3. ${r} jumps up to the landing`,
  do: { [r]: jumpTo(LANDING, { rise: 0.25 }) },
  until: cond.all(cond.standsAbove(r, 5), cond.near(r, LANDING, 0.4)),
  timeout: 4,
});

/**
 * Ruben first up the tower to the landing, his neighbour onto the tower behind him (everyone but
 * Ruben is on plate w: the tower's 2 make up for his); Ruben takes the key in the cage and goes in;
 * then one at a time, each onto the tower while the one before is on the landing, up, and in.
 */
function exitUp(n: number): Phase[] {
  const q = queue(n);
  const phases: Phase[] = [
    onTower("R"),
    { name: `3. ${q[1]} steps up to the tower`, do: walkTo(atShaft(q, 1)), until: allNear(atShaft(q, 1)), timeout: 4 },
    toLanding("R"),
    onTower(q[1]!),
    { name: "3. Ruben takes the key in the open cage", do: { R: walk(KEY_SPOT, never), ...walkTo(atShaft(q, 2)) }, until: cond.keyTaken, timeout: 6 },
    { name: "3. Ruben opens the door and goes in", do: { R: enter() }, until: cond.inside("R"), timeout: 6 },
  ];
  for (let k = 1; k < n; k++) {
    // The next one stays close under him (the rope).
    const up = toLanding(q[k]!);
    phases.push({ ...up, do: { ...walkTo(atShaft(q, k + 1)), ...up.do } });
    if (q[k + 1]) phases.push(onTower(q[k + 1]!));
    phases.push({ name: `3. ${q[k]} goes in`, do: { [q[k]!]: enter(), ...walkTo(atShaft(q, k + 2)) }, until: cond.inside(q[k]!), timeout: 6 });
  }
  return phases;
}

const beats12 = (n: number): Phase[] => [...marchepiedPush(n), ...marchepiedClimb(n), ...haulAndLineUp(n), ...fosse(n)];

export const solution: CoopSolution = (n) => [...beats12(n), ...pushIntoShaft(), ...exitUp(n)];

// --- Shortcuts that must fail --------------------------------------------------------------
//
// Each one plays the solution up to the beat it tries to skip, then the attempt (the phase whose
// name starts with "ATTEMPT", which must time out or kill), then what would finish the level had
// the attempt worked: if a change to the level let the attempt through, the shortcut would win
// or fail later, and the checks would catch it.

/**
 * A human tower in the shaft J without the PC tower: everyone walks into the duct and drops into
 * the shaft one after the other, each onto the head of the one below. At 4 players the tower
 * leans out of M (its base on the floor sensor); at 5 it stands straight in J, its base in the
 * crawl under the rail (a leaning 5-tower would not fit under M's ceiling).
 */
function towerWithoutCrate(n: number): Phase[] {
  const order: Role[] = ["R", ...[...friends(n)].reverse()]; // bottom to top: Ruben first in the duct
  const top = order[order.length - 1]!;
  const xs = n === 4 ? [15.0, 15.2, 15.4, 15.5] : order.map(() => UNDER_SHAFT);
  const duct: Array<[Role, number]> = order.map((r, k) => [r, DUCT_END - 0.85 * k]);
  const intoDuct: Phase["do"] = {};
  for (const [r, x] of duct) intoDuct[r] = walk(x);
  const phases: Phase[] = [{ name: "everyone walks into the duct, Ruben in front", do: intoDuct, until: allNear(duct, 0.3), timeout: 15 }];
  order.forEach((r, k) => {
    const base = order[k - 1];
    if (!base) {
      // At 5 Ruben falls through the rail into the crawl: his neighbour comes down into M (onto
      // the floor sensor, alone: the hatch stays open) so that the rope lets him reach the floor.
      const next: Phase["do"] = n === 5 ? { [order[1]!]: walk(M_SPOT, { drop: true, jump: "never" }) } : {};
      phases.push({ name: "Ruben drops into the shaft", do: { ...next, R: walk(xs[0]!, { drop: true, jump: "never" }) }, until: cond.all(cond.near("R", xs[0]!, 0.12), feetBelow("R", 13.9)), timeout: 5 });
      return;
    }
    // The others in the duct move up behind (at 5, the next one comes down into M once it is free).
    const up = walkTo(order.slice(k + 1).map((o, j) => [o, DUCT_END - 0.85 * (j + 1)] as [Role, number]));
    if (n === 5 && k === 1) up[order[2]!] = seq(wait(0.3), walk(M_SPOT, { drop: true, jump: "never" }));
    phases.push({ name: `${r} drops onto ${base}`, do: { ...up, [r]: walk(xs[k - 1]!, { drop: true, jump: "never", tol: 0.1 }) }, until: cond.all(cond.on(r, base), cond.near(r, xs[k - 1]!, 0.15)), timeout: 5 });
    phases.push({ name: `${r} steps along ${base}'s head`, do: { [r]: shiftOn(base, xs[k]!) }, timeout: 4 });
  });
  phases.push({ name: "ATTEMPT: the top of the human tower jumps for the upper floor", do: { [top]: jumpTo(17.2, { rise: 0.25 }) }, until: cond.standsAbove(top, 9), timeout: 5 });
  return phases;
}

/** Up to the rack, with one player standing back. */
function rackShortOne(n: number): Phase[] {
  const q = chainOrder(n);
  const pushers = q.slice(1);
  return [
    { name: "F0 stands back from the queue", do: { F0: walk(RACK_FRONT - 0.86 * (q.length - 1) - 1.5, never) }, until: cond.near("F0", RACK_FRONT - 0.86 * (q.length - 1) - 1.5, 0.3), timeout: 6 },
    { name: "ATTEMPT: everyone but F0 pushes the rack", do: Object.fromEntries(pushers.map((r) => [r, hold(1)])), until: crateDown("r", 9), timeout: 8 },
  ];
}

/**
 * Beat 3 without the step: the PC tower is left on plate w short of the shaft (its weight still
 * counts); the front of the queue climbs over it and builds a human tower in column 47, next to
 * the shaft (Ruben at the base; 3 bodies at most fit under the lab's ceiling), and its top jumps
 * for the landing over the bare cables. This is what the old level's 4-5 player leaning wedge
 * became: the cage is only reachable from the landing now.
 */
function towerBesideShaft(n: number): Phase[] {
  const q = queue(n);
  const order = q.slice(0, Math.min(n, 3)); // bottom to top: Ruben, his neighbour, the next one
  const top = order[order.length - 1]!;
  const phases: Phase[] = [
    { name: "the queue pushes the tower onto plate w, short of the shaft", do: { "*": () => hold(1) }, until: crateAt("t", 44), timeout: 8 },
    { name: "the queue steps back from the tower", do: walkTo(q.map((r, j) => [r, 43.3 - 0.86 * j] as [Role, number])), timeout: 1 },
  ];
  order.forEach((r, k) => {
    // From the foot of the tower: the one at the back of the queue may have been dragged by the
    // rope (it gives up to 5.4 now) when the one before him climbed.
    phases.push({ name: `${r} climbs onto the parked tower`, do: { [r]: seq(walk(43.3, { jump: "never", tol: 0.1 }), wait(0.1), jumpTo(44.5)) }, until: cond.all(cond.standsAbove(r, 7), cond.near(r, 44.5, 0.3)), timeout: 4 });
    // Off its far side: Ruben into column 47; the others down next to it, then onto the one there.
    if (k === 0) {
      phases.push({ name: `${r} walks off it into column 47`, do: { [r]: walk(47.45, { drop: true, jump: "never", tol: 0.1 }) }, until: cond.all(cond.near(r, 47.45, 0.12), feetBelow(r, 8.95)), timeout: 4 });
      return;
    }
    // Ruben's neighbour drops next to him and climbs onto his head, leaning back towards the
    // parked tower; the next one walks off the tower's top onto the neighbour's head.
    const base = order[k - 1]!;
    if (k === 1) {
      phases.push({ name: `${r} walks off it next to column 47`, do: { [r]: walk(46.3, { drop: true, jump: "never", tol: 0.15 }) }, until: cond.all(cond.near(r, 46.3, 0.2), feetBelow(r, 8.95)), timeout: 4 });
      phases.push({ name: `${r} climbs onto ${base}`, do: { [r]: mount(base) }, until: cond.on(r, base), timeout: 5 });
      phases.push({ name: `${r} leans back on ${base}'s head`, do: { [r]: shiftOn(base, 46.7) }, timeout: 2 });
    } else {
      // The ones left on the floor come up to the parked tower first, so the rope (which gives a
      // little now) does not pull the one walking off short of the head below.
      const rest = Object.fromEntries(q.slice(order.length).map((x, j) => [x, walk(43.3 - 0.86 * j, { jump: "never", tol: 0.15 })]));
      phases.push({ name: `${r} walks off it onto ${base}`, do: { [r]: walk(46.6, { drop: true, jump: "never", tol: 0.1 }), ...rest }, until: cond.on(r, base), timeout: 4 });
    }
  });
  // Then the tower straightens up over column 47, bottom up.
  order.slice(1).forEach((r, k) => phases.push({ name: `${r} steps along ${order[k]}'s head over column 47`, do: { [r]: shiftOn(order[k]!, 47.45) }, timeout: 2 }));
  phases.push({ name: "ATTEMPT: the top of the human tower jumps for the landing", do: { [top]: jumpTo(LANDING, { rise: 0.05 }) }, until: cond.standsAbove(top, 5), timeout: 4 });
  // Had it worked: the key (plate w carries the parked tower and everyone else), the door.
  phases.push({ name: "the top takes the key", do: { [top]: walk(KEY_SPOT, never) }, until: cond.keyTaken, timeout: 6 });
  phases.push({ name: "the top goes in", do: { [top]: enter() }, until: cond.inside(top), timeout: 6 });
  return phases;
}

/**
 * Beat 3 without the step, in the shaft itself: the PC tower is parked on plate w next to the
 * shaft (x 46); Ruben climbs onto it and walks off into T to be the base of a human tower there
 * (the friends would follow from the parked tower's top, onto the head below).
 */
function towerInShaft(n: number): Phase[] {
  const q = queue(n);
  const order = q.slice(0, Math.min(n, 3)); // bottom to top
  const top = order[order.length - 1]!;
  const onParked = (r: Role): Phase => ({ name: `${r} climbs onto the parked tower`, do: { [r]: seq(walk(45.55, never), wait(0.1), jumpTo(46.5)) }, until: cond.all(cond.standsAbove(r, 7), cond.near(r, 46.5, 0.3)), timeout: 4 });
  const phases: Phase[] = [
    { name: "the queue pushes the tower onto plate w, next to the shaft", do: { "*": () => hold(1) }, until: crateAt("t", 46), timeout: 8 },
    { name: "the queue steps back from the tower", do: walkTo(q.map((r, j) => [r, 45.4 - 0.86 * j] as [Role, number])), timeout: 1 },
    onParked("R"),
    { name: "ATTEMPT: Ruben walks off it into the exit shaft, the base of a human tower", do: { R: walk(ON_T, { drop: true, jump: "never", tol: 0.1 }) }, until: cond.all(cond.near("R", ON_T, 0.15), feetBelow("R", 8.95)), timeout: 4 },
  ];
  order.slice(1).forEach((r, k) => {
    phases.push(onParked(r));
    phases.push({ name: `${r} walks off it onto ${order[k]}`, do: { [r]: walk(ON_T, { drop: true, jump: "never", tol: 0.1 }) }, until: cond.on(r, order[k]!), timeout: 4 });
  });
  // The top's rope neighbour on the floor (from 4 players) gets onto the parked tower, close enough.
  const next = q[order.length];
  if (next) phases.push(onParked(next));
  phases.push({ name: "the top steps right into the shaft (clear of the lab's ceiling)", do: { [top]: shiftOn(order[order.length - 2]!, ON_T) }, timeout: 2 });
  phases.push({ name: "the top jumps for the landing", do: { [top]: seq(wait(0.2), jumpTo(LANDING, { rise: 0.25 })) }, until: cond.standsAbove(top, 5), timeout: 4 });
  phases.push({ name: "the top takes the key", do: { [top]: walk(KEY_SPOT, never) }, until: cond.keyTaken, timeout: 6 });
  phases.push({ name: "the top goes in", do: { [top]: enter() }, until: cond.inside(top), timeout: 6 });
  return phases;
}

/** Ruben is up, and F0 (the back of the queue) steps off plate w before he goes for the key. */
function keyWithOneOff(n: number): Phase[] {
  const q = queue(n);
  return [
    ...exitUp(n).slice(0, 4),
    { name: "ATTEMPT: F0 steps off plate w, then Ruben goes for the key", do: { F0: walk(OFF_PLATE, never), R: seq(wait(1.2), walk(KEY_SPOT, never)) }, until: cond.all(cond.keyTaken, (w) => w.bodies[0]!.cx <= OFF_PLATE + 0.2), timeout: 5 },
    // Back in the queue: onto the tower at 2 players (F0 is Ruben's neighbour), at the back otherwise.
    ...(n === 2
      ? [{ name: "F0 comes back", do: { F0: walk(T_FRONT, never) }, until: cond.near("F0", T_FRONT, 0.3), timeout: 4 }, onTower("F0")]
      : [{ name: "F0 comes back", do: walkTo(atShaft(q, 2)), until: allNear(atShaft(q, 2)), timeout: 4 }]),
    ...exitUp(n).slice(5),
  ];
}

export const shortcuts: Record<string, CoopSolution> = {
  /** Beat 1 without the PC tower: a human tower in the shaft. */
  "a human tower under the upper floor": (n) => [
    ...towerWithoutCrate(n),
    // Had it worked: the top hauls the others, and the level goes on.
    ...haulAndLineUp(n, friends(n)[0]!),
    ...fosse(n),
    ...pushIntoShaft(),
    ...exitUp(n),
  ],

  /** Beat 2 with one pusher short of W. */
  "pushing the rack with one player short": (n) => [
    ...marchepiedPush(n),
    ...marchepiedClimb(n),
    ...haulAndLineUp(n),
    ...rackShortOne(n),
    ...fosse(n).slice(1),
    ...pushIntoShaft(),
    ...exitUp(n),
  ],

  /** Beat 3 without the tower as a step: a human tower next to the exit shaft. */
  "a human tower beside the exit shaft": (n) => [...beats12(n), ...towerBesideShaft(n)],

  /** Beat 3 without the tower as a step: a human tower standing in the exit shaft. */
  "a human tower in the exit shaft": (n) => [...beats12(n), ...towerInShaft(n)],

  /** Beat 3 without the whole class on plate w: Ruben up, one friend off it. */
  "the key with a friend off the plate": (n) => [...beats12(n), ...pushIntoShaft(), ...keyWithOneOff(n)],
};
