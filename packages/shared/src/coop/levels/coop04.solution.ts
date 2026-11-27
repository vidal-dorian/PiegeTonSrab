/**
 * Bot solution of "La Salle de TP" (coop04.ts), and the ways round the puzzle that must fail.
 *
 * Roles: R is Ruben, F0..F3 the friends in seat order (the spawn order, left to right, Ruben on
 * the right). The chain is F0 - F1 - ... - the last friend - R. Map, beats and numbers:
 * docs/coop-levels/coop04.md.
 */
import { cond, enter, friends, hold, jumpTo, mount, roleIndex, seq, wait, walk, type CoopSolution, type Goal, type Phase, type Role } from "../bots";
import { BIT_JUMP, BIT_JUMP_PRESS, BIT_LEFT, BIT_RIGHT } from "../inputBits";
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

/** Keep about dx right of another role's centre, without jumping (a queue walking behind a pusher). */
function follow(role: Role, dx: number): Goal {
  return {
    label: `follow ${role} ${dx >= 0 ? "+" : ""}${dx}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      const d = c.w.bodies[roleIndex(role, c.w.bodies.length)]!.cx + dx - b.cx;
      return Math.abs(d) > 0.15 ? (d > 0 ? BIT_RIGHT : BIT_LEFT) : 0;
    },
  };
}

/**
 * Jump straight up and steer towards x only once the feet are at or above y `clear` (clear of what
 * is under the ledge to reach: pressed against its side, the body slides onto it as it rises).
 */
function jumpOnto(x: number, clear: number): Goal {
  let air = 0;
  return {
    label: `jump onto the ledge at ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      if (!b.grounded) air++;
      let bits = c.t === 0 ? BIT_JUMP | BIT_JUMP_PRESS : c.t < 50 ? BIT_JUMP : 0;
      if (b.y + b.height <= clear) bits |= x < b.cx ? BIT_LEFT : BIT_RIGHT;
      return bits;
    },
    done: (c) => air > 3 && c.w.bodies[c.i]!.grounded,
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

/**
 * Beat 1: the corridor x 1-12 (floor row 14, 2 high), the duct above its end x 9-12 (floor row
 * 11, 1 high, its mouth at x 13), M x 13-14 (5 high), the shaft J x 15, the upper floor from x 16
 * (row 9). Ruben pushes the tower from M (M_SPOT); on it he stands under the shaft, clear of M
 * (ON_TOWER: a friend jumping in M under his overhang would bump into him).
 */
const M_SPOT = 14.6;
const M_FRIEND = 14.45;
const M_LEFT = 13.45;
const DUCT_MOUTH = 12.55;
const CORRIDOR_END = 11.4;
const ON_TOWER = 15.5;
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

// --- Beat 1, "Le marchepied" -----------------------------------------------------------------

/**
 * Ruben pushes the PC tower along the corridor into the shaft J (the friends come along behind)
 * and climbs on it. From 3 players the friend behind his neighbour climbs into the duct, from the
 * neighbour's head in M (the leg-up): left on the floor, its rope would hold the climber back.
 * Then the neighbour steps under the shaft, the others wait in the corridor.
 */
function marchepiedPush(n: number): Phase[] {
  const fs = [...friends(n)].reverse(); // nearest Ruben first
  const along: Phase["do"] = { R: hold(1) };
  fs.forEach((f, k) => (along[f] = follow("R", -0.9 - 0.86 * k)));
  const rest: Phase["do"] = {};
  fs.slice(2).forEach((f, k) => (rest[f] = walk(CORRIDOR_END - 0.86 * k, never)));
  const phases: Phase[] = [
    { name: "1. Ruben pushes the tower along the corridor into the shaft (he pushes like two)", do: along, until: cond.all(crateAt("a", 15), cond.near("R", M_SPOT, 0.35)), timeout: 12 },
    { name: "1. Ruben jumps onto the tower", do: { R: jumpTo(ON_TOWER) }, until: cond.all(cond.standsAbove("R", 12), cond.near("R", ON_TOWER, 0.12)), timeout: 4 },
  ];
  const [top, next] = fs;
  if (next) {
    phases.push(
      { name: `1. ${top} gives ${next} a leg up in M`, do: { ...rest, [top!]: walk(M_LEFT, never), [next]: mount(top!) }, until: cond.all(cond.on(next, top!), cond.near(top!, M_LEFT, 0.15), (w) => Math.abs(w.bodies[roleIndex(next, w.bodies.length)]!.cx - M_LEFT) < 0.15), timeout: 6 },
      { name: `1. ${next} climbs into the duct`, do: { ...rest, [next]: seq(wait(0.15), jumpOnto(DUCT_MOUTH, 12), walk(DUCT_MOUTH, never)) }, until: cond.all(cond.standsAbove(next, 11), cond.near(next, DUCT_MOUTH, 0.25)), timeout: 4 },
    );
  }
  phases.push({ name: "1. his neighbour steps under Ruben", do: { ...rest, [top!]: walk(M_FRIEND, never) }, until: cond.near(top!, M_FRIEND, 0.2), timeout: 4 });
  return phases;
}

/**
 * Ruben's neighbour jumps from M onto his head (2.9: it rises along his side and slides over at
 * its apex, 3.0), then from his head up the shaft onto the upper floor.
 */
function marchepiedClimb(n: number): Phase[] {
  const climber = friends(n)[n - 2]!;
  return [
    { name: "1. his neighbour jumps onto his head", do: { [climber]: jumpTo(ON_TOWER) }, until: cond.on(climber, "R"), timeout: 4 },
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
 * Beat 1 without the PC tower as a step: the tower is pushed into J as in the solution (it fills
 * the corridor, there is nowhere else to put it), then a human tower stands in M beside it, Ruben
 * at the base under the shaft's edge, up to 4 bodies (each one climbs from M's other cell); its
 * top leans into J and jumps for the upper floor.
 */
function towerWithoutCrate(n: number): Phase[] {
  const order = (["R", ...[...friends(n)].reverse()] as Role[]).slice(0, 4); // bottom to top
  const top = order[order.length - 1]!;
  const phases: Phase[] = [marchepiedPush(n)[0]!];
  const rest = Object.fromEntries([...friends(n)].reverse().slice(order.length - 1).map((f, k) => [f, walk(CORRIDOR_END - 0.86 * k, never)]));
  order.slice(1).forEach((r, k) => {
    const base = order[k]!;
    // A jump just high enough (a full one would carry the climber over onto the PC tower).
    phases.push({ name: `${r} climbs onto ${base}`, do: { ...rest, [r]: seq(walk(M_LEFT - 0.1, never), jumpTo(14.6, { holdFor: 0.1 + 0.08 * k, rise: 0.08 + 0.04 * k })) }, until: cond.on(r, base), timeout: 6 });
  });
  phases.push({ name: `${top} leans into the shaft`, do: { [top]: shiftOn(order[order.length - 2]!, 15.25) }, timeout: 2 });
  phases.push({ name: "ATTEMPT: the top of the human tower jumps for the upper floor", do: { [top]: jumpTo(17.2, { rise: 0.1 }) }, until: cond.standsAbove(top, 9), timeout: 5 });
  return phases;
}

/** Ruben pushes the PC tower only as far as M's right cell (x 14), the friends behind him. */
function pushOneShort(n: number): Phase {
  const along: Phase["do"] = { R: hold(1) };
  [...friends(n)].reverse().forEach((f, k) => (along[f] = follow("R", -0.9 - 0.86 * k)));
  return { name: "Ruben pushes the tower one cell short, into M's right cell", do: along, until: crateAt("a", 14), timeout: 12 };
}

/** The role stands in J (x 15) on its floor, under the shaft. */
const inJ = (role: Role) => (w: CoopWorld) => {
  const b = w.bodies[roleIndex(role, w.bodies.length)]!;
  return b.grounded && b.x >= 15 - 1e-3 && b.y + b.height > 13.9;
};

/**
 * Beat 1 with the bodies in J instead of the PC tower: it is pushed one cell short (into M's
 * right cell), and up to 4 bodies (Ruben at the base) hop over it into J, each onto the head of
 * the one below; the top jumps for the upper floor. 2-3 players: too short (top feet 1.8, apex
 * 4.8). 4-5: the 4 bodies stand on J's floor sensor (weight 4 or more) and the hatch is shut
 * (with the sensor ignored, the top gets up at 4 and 5 players).
 */
function towerInJ(n: number): Phase[] {
  const order = (["R", ...[...friends(n)].reverse()] as Role[]).slice(0, 4); // bottom to top
  const top = order[order.length - 1]!;
  const rest = Object.fromEntries([...friends(n)].reverse().slice(order.length - 1).map((f, k) => [f, walk(CORRIDOR_END - 0.86 * k, never)]));
  const phases: Phase[] = [
    pushOneShort(n),
    { name: "Ruben hops over the tower into J", do: { ...rest, R: seq(walk(M_LEFT, never), jumpTo(15.6)) }, until: inJ("R"), timeout: 5 },
  ];
  order.slice(1).forEach((r, k) => {
    const base = order[k]!;
    // Onto the PC tower from M's left cell, then off its right side onto the head below.
    phases.push({ name: `${r} onto the PC tower`, do: { ...rest, [r]: seq(walk(M_LEFT, never), jumpTo(14.5)) }, until: cond.all(cond.standsAbove(r, 12), cond.near(r, 14.5, 0.2)), timeout: 5 });
    phases.push({ name: `${r} onto ${base} in J`, do: { ...rest, [r]: k < 2 ? walk(15.6, { drop: true, jump: "never", tol: 0.1 }) : jumpTo(15.6) }, until: cond.on(r, base), timeout: 5 });
  });
  // At 5 players the top's other neighbour (F0) comes onto the PC tower, close to it.
  if (n === 5) phases.push({ name: "F0 onto the PC tower", do: { F0: seq(walk(M_LEFT, never), jumpTo(14.5)) }, until: cond.all(cond.standsAbove("F0", 12), cond.near("F0", 14.5, 0.2)), timeout: 5 });
  phases.push({ name: "ATTEMPT: the top of the human tower in J jumps for the upper floor", do: { [top]: jumpTo(17.2, { rise: 0.1 }) }, until: cond.standsAbove(top, 9), timeout: 5 });
  return phases;
}

/**
 * Beat 1 without Ruben as the base: Ruben pushes the tower into J and gets back off it; a friend
 * whose rope neighbours can both be close (F0, with F1 waiting at the duct's mouth from 3 players)
 * jumps onto the bare PC tower and, standing on it, jumps for the upper floor (3 up: apex 3.0,
 * so it never gets on). At 2 players F0's only neighbour is Ruben, back on the floor.
 */
function bareTower(n: number): Phase[] {
  const phases: Phase[] = [marchepiedPush(n)[0]!, marchepiedPush(n)[1]!];
  // Who goes into the duct (front first: each one onto the head of the one behind it in M), and
  // where it waits; at 5 players F3 (Ruben's neighbour) gives the leg-ups and then stands on
  // Ruben's head in M's right cell, out of F0's way.
  const duct: Array<[Role, Role, number]> =
    n === 3 ? [["F1", "F0", DUCT_MOUTH]] : n === 4 ? [["F2", "F1", 9.45], ["F1", "F0", DUCT_MOUTH]] : n === 5 ? [["F2", "F3", 11.7], ["F1", "F3", DUCT_MOUTH]] : [];
  const keep: Phase["do"] = {};
  for (const [c, h, spot] of duct) {
    const [cx, hx] = n === 5 ? [M_LEFT, M_FRIEND] : [M_FRIEND, M_LEFT];
    phases.push({ name: `${c} and ${h} in M`, do: { ...keep, [c]: walk(cx, never), [h]: walk(hx, never) }, until: cond.all(cond.near(c, cx, 0.45), cond.near(h, hx, 0.25)), timeout: 6 });
    phases.push({ name: `${c} mounts ${h} (leg-up)`, do: { ...keep, [c]: mount(h) }, until: cond.on(c, h), timeout: 6 });
    phases.push({ name: `${c} climbs into the duct, to x ${spot}`, do: { ...keep, [c]: seq(wait(0.15), jumpOnto(DUCT_MOUTH, 12), walk(spot, never)) }, until: cond.all(cond.standsAbove(c, 11), cond.near(c, spot, 0.25)), timeout: 5 });
    // At 5 players the ones in the duct keep their places (F3 gives both leg-ups); at 4, F2 in the
    // duct must stay free to follow Ruben's rope.
    if (n === 5) keep[c] = walk(spot, never);
  }
  const rubenDown = (w: CoopWorld) => {
    const r = w.bodies[w.bodies.length - 1]!;
    return r.grounded && r.y + r.height > 13.9;
  };
  if (n < 5) {
    phases.push({ name: "Ruben walks off the tower back into the corridor", do: { ...keep, R: walk(12.3, { jump: "never", drop: true }), F0: walk(14.3, never) }, until: cond.all(rubenDown, cond.near("R", 12.3, 0.3)), timeout: 6 });
  } else {
    phases.push({ name: "Ruben walks off the tower into M's right cell", do: { ...keep, F3: walk(13.3, never), R: walk(14.5, { jump: "never", drop: true }) }, until: cond.all(rubenDown, cond.near("R", 14.5, 0.2)), timeout: 6 });
    phases.push({ name: "F3 onto Ruben's head", do: { ...keep, F3: mount("R") }, until: cond.on("F3", "R"), timeout: 6 });
  }
  phases.push({ name: "F0 to M's left cell", do: { ...keep, F0: walk(M_LEFT, never) }, until: cond.near("F0", M_LEFT, 0.2), timeout: 4 });
  phases.push({ name: "F0 onto the bare PC tower", do: { ...keep, F0: jumpTo(ON_TOWER) }, until: cond.all(cond.standsAbove("F0", 12), cond.near("F0", ON_TOWER, 0.15)), timeout: 4 });
  phases.push({ name: "F0 stands on it", do: { ...keep, F0: wait(0.3) }, timeout: 1 });
  phases.push({ name: "ATTEMPT: F0, standing alone on the bare PC tower, jumps for the upper floor", do: { ...keep, F0: jumpTo(17.2, { rise: 0.25 }) }, until: cond.standsAbove("F0", 9), timeout: 4 });
  return phases;
}

/**
 * Beat 1 with a mistake on the way (must still finish): the PC tower is pushed one cell short,
 * Ruben hops over it into J, then gets back out (onto the tower and down into M: J's floor is M's,
 * 2 under the tower's top), pushes the tower on into J and the solution goes on.
 */
function intoJAndBack(n: number): Phase[] {
  const fs = [...friends(n)].reverse();
  const back: Phase["do"] = {};
  fs.forEach((f, k) => (back[f] = walk(CORRIDOR_END - 0.86 * k, never)));
  const along: Phase["do"] = { R: hold(1) };
  fs.forEach((f, k) => (along[f] = follow("R", -0.9 - 0.86 * k)));
  return [
    pushOneShort(n),
    { name: "Ruben hops over the tower into J", do: { R: seq(walk(M_LEFT, never), jumpTo(15.6)) }, until: inJ("R"), timeout: 5 },
    { name: "Ruben gets back out: onto the tower, down into M", do: { ...back, R: seq(jumpTo(14.5), walk(M_LEFT, { jump: "never", drop: true })) }, until: cond.all(cond.near("R", M_LEFT, 0.2), feetBelow("R", 13.95)), timeout: 6 },
    { name: "Ruben pushes the tower on into J", do: along, until: cond.all(crateAt("a", 15), cond.near("R", M_SPOT, 0.35)), timeout: 8 },
    ...marchepiedPush(n).slice(1),
  ];
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

  /** Beat 1 without the PC tower in J: it is left one cell short and a human tower stands in J. */
  "a human tower in J beside the tower left one cell short": (n) => [
    ...towerInJ(n),
    ...haulAndLineUp(n, (["R", ...[...friends(n)].reverse()] as Role[]).slice(0, 4).pop()!),
    ...fosse(n),
    ...pushIntoShaft(),
    ...exitUp(n),
  ],

  /** Beat 1 without Ruben as the base: a friend alone on the bare PC tower, a standing jump. */
  "a friend alone on the bare PC tower": (n) => [...bareTower(n), ...haulAndLineUp(n, "F0"), ...fosse(n), ...pushIntoShaft(), ...exitUp(n)],

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

// --- Recoveries that must finish ------------------------------------------------------------
//
// A mistake a team will make, then the way back: the whole level must still be solved.

export const recoveries: Record<string, CoopSolution> = {
  /** Beat 1: the tower left one cell short, Ruben hops into J, gets out, and the team goes on. */
  "into J before the tower, and back out": (n) => [...intoJAndBack(n), ...marchepiedClimb(n), ...haulAndLineUp(n), ...fosse(n), ...pushIntoShaft(), ...exitUp(n)],
};
