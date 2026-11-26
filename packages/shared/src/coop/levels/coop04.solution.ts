/**
 * Bot solution of "La Salle de TP" (coop04.ts), and the ways round the puzzle that must fail.
 *
 * Roles: R is Ruben, F0..F3 the friends in seat order (the spawn order, left to right, Ruben on
 * the right). The chain is F0 - F1 - ... - the last friend - R. Map, beats and numbers:
 * docs/coop-levels/coop04.md.
 */
import { cond, enter, friends, hold, idle, jumpTo, roleIndex, seq, wait, walk, type CoopSolution, type Goal, type Phase, type Role } from "../bots";
import { BIT_DOWN, BIT_DOWN_PRESS, BIT_LEFT, BIT_RIGHT } from "../inputBits";
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
/** The role's centre is at or right of x. */
const cxAtLeast = (role: Role, x: number) => (w: CoopWorld) => w.bodies[roleIndex(role, w.bodies.length)]!.cx >= x;
/** Every listed role stands near its x. */
const allNear = (spots: Array<[Role, number]>, tol = 0.35) => cond.all(...spots.map(([r, x]) => cond.near(r, x, tol)));
/** The key is carried by one of these roles. */
const carriedBy = (roles: Role[]) => (w: CoopWorld) => roles.some((r) => w.props.keyCarrier === roleIndex(r, w.bodies.length));

const never = { jump: "never" as const };

/** Walk to each spot (no jumping). */
function walkTo(spots: Array<[Role, number]>): Phase["do"] {
  const d: Phase["do"] = {};
  for (const [r, x] of spots) d[r] = walk(x, never);
  return d;
}

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

/** Come up to crate `char` from the left without pushing it, then jump over it and land at dx right of it. */
function hopOver(char: string, dx: number): Goal {
  let jump: Goal | null = null;
  let t0 = 0;
  return {
    label: `hop over ${char}`,
    step(c) {
      const crate = c.w.crates.find((k) => k.thing.char === char)!;
      const b = c.w.bodies[c.i]!;
      if (!jump) {
        const gap = crate.x - (b.x + b.width);
        if (gap > 0.25) return BIT_RIGHT;
        if (Math.abs(b.vx) > 0.5 || !b.grounded) return 0;
        jump = jumpTo(crate.x + crate.w + dx, { rise: 0.12 });
        t0 = c.t;
      }
      return jump.step({ w: c.w, i: c.i, t: c.t - t0 });
    },
    done: (c) => jump?.done?.({ w: c.w, i: c.i, t: c.t - t0 }) === true,
  };
}

/** Walk up to `base` from the left until blocked (by it, or by what it stands on), then jump onto its head. */
function climbOnto(base: Role): Goal {
  let jump: Goal | null = null;
  let t0 = 0;
  let still = 0;
  return {
    label: `climb onto ${base}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      const o = c.w.bodies[roleIndex(base, c.w.bodies.length)]!;
      if (!jump) {
        still = b.grounded && Math.abs(b.vx) < 0.3 ? still + 1 : 0;
        if (o.cx - b.cx > 1.0 && still < 6) return BIT_RIGHT;
        jump = jumpTo(o.cx, { rise: 0.15 });
        t0 = c.t;
      }
      return jump.step({ w: c.w, i: c.i, t: c.t - t0 });
    },
    done: (c) => jump?.done?.({ w: c.w, i: c.i, t: c.t - t0 }) === true,
  };
}

/** Pursue `goal` if this body is the highest of `roles` when the goal starts (its feet highest), else stand still. */
function whenHighest(roles: Role[], goal: Goal): Goal {
  let mine: boolean | null = null;
  return {
    label: `if highest: ${goal.label}`,
    step(c) {
      if (mine === null) {
        const feet = (r: Role) => {
          const b = c.w.bodies[roleIndex(r, c.w.bodies.length)]!;
          return b.y + b.height;
        };
        const best = roles.reduce((a, r) => (feet(r) < feet(a) ? r : a));
        mine = roleIndex(best, c.w.bodies.length) === c.i;
      }
      return mine ? goal.step(c) : 0;
    },
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
 * Beat 3: the second tower at x 40 (rows 7-8), plate w at 41-45, the duct's roof (row 7) up to
 * x 39 with the cage gate at 38 and the key at 37; the floor sensor at 49-51, M3 at 51, the exit
 * shaft J3 at 52, the landing from 53 (row 5), the door at 60.
 */
const TOWER2_FRONT = 39.55;
const KEY_SPOT = 38.15;
const OFF_SENSOR = 48.4;
const NEXT_SPOT = 50.5;
const M3_SPOT = 51.5;
const ON_TOWER2 = 52.5;
const LIP_SPOT = 53.5;
const DOOR = 60.5;

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

/** The queue pushes the tower onto plate w; F0, at the back, takes the key and comes back down. */
function plateAndKey(n: number): Phase[] {
  const b1 = chainOrder(n)[1]!; // right in front of F0: stays on plate w
  return [
    {
      name: "3. the queue pushes the tower onto plate w (its weight frees one player); F0 stays behind, off it",
      do: { "*": () => hold(1) },
      until: cond.all(cond.gateOpen("c"), cxAtLeast(b1, 41.3)),
      timeout: 10,
    },
    ...fetchKey(),
  ];
}

/** F0 jumps onto the duct's roof, takes the key through the cage gate and comes back down behind the queue. */
function fetchKey(): Phase[] {
  return [
    { name: "3. F0 jumps onto the duct's roof", do: { F0: jumpTo(39.5, { rise: 0.15 }) }, until: cond.all(cond.standsAbove("F0", 7), (w) => w.bodies[0]!.cx < 40), timeout: 4 },
    { name: "3. F0 takes the key through the open cage gate", do: { F0: walk(KEY_SPOT, never) }, until: cond.keyTaken, timeout: 6 },
    { name: "3. F0 comes back down behind the queue", do: { F0: seq(walk(39.6, never), walk(40.45, { drop: true, jump: "never" })) }, until: cond.all(cond.near("F0", 40.45, 0.3), feetBelow("F0", 8.9)), timeout: 6 },
  ];
}

/** The queue pushes the tower onto its rail under the exit shaft J3. */
function pushToExit(): Phase[] {
  return [{ name: "3. the queue pushes the tower under the exit", do: { "*": () => hold(1) }, until: crateAt("t", 52), timeout: 12 }];
}

/** One at a time from M3: onto the tower, up through the hatch onto the landing; then the key forward to Ruben, the door. */
function exitHops(n: number): Phase[] {
  const q = queue(n); // front to back: Ruben in M3 first
  // Waiting for the hops: Ruben in M3, his neighbour next to him on the sensor, the others off it.
  const waitSpot = (k: number) => (k === 1 ? NEXT_SPOT : OFF_SENSOR - 0.9 * (k - 2));
  const back: Array<[Role, number]> = q.slice(1).map((r, k) => [r, waitSpot(k + 1)]);
  const phases: Phase[] = [
    { name: "3. everyone but Ruben steps back: one friend next to him, the others off the floor sensor", do: { R: idle(), ...walkTo(back) }, until: cond.all(cond.near("R", M3_SPOT, 0.35), allNear(back)), timeout: 8 },
  ];
  // The hopper jumps onto the tower, the next one comes into M3 (and the one after next to it),
  // the hopper jumps up and waits by the lip, the ones already up move on.
  q.forEach((r, k) => {
    const up: Phase["do"] = { [r]: jumpTo(LIP_SPOT, { rise: 0.25 }) };
    for (let j = 0; j < k; j++) up[q[j]!] = walk(LIP_SPOT + 0.9 * (k - j), never);
    const move: Array<[Role, number]> = [];
    if (q[k + 1]) move.push([q[k + 1]!, M3_SPOT]);
    if (q[k + 2]) move.push([q[k + 2]!, NEXT_SPOT]);
    q.slice(k + 3).forEach((o, j) => move.push([o, OFF_SENSOR - 0.9 * j]));
    phases.push({ name: `3. ${r} hops onto the tower`, do: { [r]: jumpTo(ON_TOWER2) }, until: cond.all(cond.standsAbove(r, 7), cond.near(r, ON_TOWER2, 0.35)), timeout: 4 });
    if (move.length > 0) phases.push({ name: `3. ${q[k + 1]} comes into M3`, do: walkTo(move), until: allNear(move), timeout: 6 });
    phases.push({ name: `3. ${r} jumps up to the exit landing`, do: up, until: cond.all(cond.standsAbove(r, 5), cond.near(r, LIP_SPOT, 0.4)), timeout: 4 });
  });
  // On the landing, left to right: F0 (with the key) .. Ruben. The key goes forward to Ruben, who opens the door.
  const spots = q.map((r, k) => [r, DOOR - 0.3 - 0.9 * k] as [Role, number]);
  phases.push({ name: "3. everyone walks to the door", do: walkTo(spots), until: allNear(spots), timeout: 10 });
  for (let k = q.length - 2; k >= 0; k--) {
    phases.push({ name: `3. ${q[k]} takes the key from ${q[k + 1]}`, do: { [q[k]!]: takeKey(q[k + 1]!) }, until: cond.any(carriedBy(q.slice(0, k + 1)), cond.doorOpen), timeout: 3 });
  }
  phases.push({ name: "3. Ruben opens the door", do: { R: walk(DOOR, never) }, until: cond.doorOpen, timeout: 4 });
  phases.push({ name: "3. everyone through the door", do: { "*": () => enter() }, until: cond.won, timeout: 20 });
  return phases;
}

const beats12 = (n: number): Phase[] => [...marchepiedPush(n), ...marchepiedClimb(n), ...haulAndLineUp(n), ...fosse(n)];

export const solution: CoopSolution = (n) => [...beats12(n), ...plateAndKey(n), ...pushToExit(), ...exitHops(n)];

// --- Shortcuts that must fail --------------------------------------------------------------
//
// Each one plays the solution up to the beat it tries to skip, then the attempt (the phase whose
// name starts with "ATTEMPT", which must time out), then what would finish the level had the
// attempt worked: if a change to the level let the attempt through, the shortcut would win and
// the checks would catch it.

/**
 * A human tower in the shaft J without the PC tower: everyone walks into the duct and drops into
 * the shaft one after the other, each onto the head of the one below. From 4 players the tower
 * leans out of M (its base on the floor sensor) or stands in the pit under the rail.
 */
function towerWithoutCrate(n: number): Phase[] {
  const order: Role[] = ["R", ...[...friends(n)].reverse()]; // bottom to top: Ruben first in the duct
  const top = order[order.length - 1]!;
  // Where each one stands in the shaft (centres): leaning from M at 4 players, straight above
  // the pit at 5 (a leaning 5-tower would not fit under M's ceiling), straight in J below that.
  const xs = n === 4 ? [15.0, 15.2, 15.4, 15.5] : order.map(() => UNDER_SHAFT);
  const duct: Array<[Role, number]> = order.map((r, k) => [r, DUCT_END - 0.85 * k]);
  const intoDuct: Phase["do"] = {};
  for (const [r, x] of duct) intoDuct[r] = walk(x);
  const phases: Phase[] = [{ name: "everyone walks into the duct, Ruben in front", do: intoDuct, until: allNear(duct, 0.3), timeout: 15 }];
  order.forEach((r, k) => {
    const base = order[k - 1];
    if (!base) {
      phases.push({ name: "Ruben drops into the shaft", do: { R: walk(xs[0]!, { drop: true, jump: "never" }) }, until: cond.all(cond.near("R", xs[0]!, 0.12), feetBelow("R", 13.9)), timeout: 5 });
      return;
    }
    // The others in the duct move up behind.
    const up = walkTo(order.slice(k + 1).map((o, j) => [o, DUCT_END - 0.85 * (j + 1)] as [Role, number]));
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

/** Beat 3 with everyone (F0 included) on plate w and the tower pushed off it: F0 races for the key. */
function keyWithoutCrate(n: number): Phase[] {
  const q = chainOrder(n);
  const spots = q.map((r, j) => [r, 41.45 + 0.86 * j] as [Role, number]);
  return [
    { name: "the queue pushes the tower past plate w", do: { "*": () => hold(1) }, until: crateAt("t", 46.3), timeout: 10 },
    { name: "everyone stands on plate w, F0 at its left end", do: walkTo(spots), until: allNear(spots, 0.2), timeout: 10 },
    { name: "ATTEMPT: F0 leaves the plate and races for the key", do: { F0: seq(jumpTo(39.5, { rise: 0.15 }), walk(KEY_SPOT, never)) }, until: cond.keyTaken, timeout: 6 },
    { name: "F0 comes back down", do: { F0: seq(walk(39.6, never), walk(40.45, { drop: true, jump: "never" })) }, until: cond.near("F0", 40.45, 0.3), timeout: 6 },
    { name: "the queue walks back behind the tower", do: walkTo(q.map((r, j) => [r, 45.4 - 0.86 * (q.length - 1 - j)] as [Role, number])), timeout: 8 },
  ];
}

/** After the key, a human tower leaning from M3 (its base on the floor sensor) into the exit shaft. */
function exitTowerWithoutCrate(n: number): Phase[] {
  // Everyone, Ruben at the bottom, the friends on him in chain order, F0 (the free end of the
  // chain) last, so nobody left on the floor holds the top back with the rope. Each climber has
  // one try: with the hatch shut, the 4th finds no room in the shaft (and nobody can climb onto
  // a head 3.6 high).
  const order: Role[] = ["R", ...[...friends(n)].reverse()];
  const xs = n === 2 ? [52.5, 52.5] : order.map((_, k) => Math.min(52.5, 51.9 + 0.25 * k));
  // First everyone hops over the PC tower (left on plate w), front first.
  const phases: Phase[] = queue(n).map((r, k) => ({ name: `${r} hops over the tower`, do: { [r]: hopOver("t", 0.6 + 0.9 * (n - 1 - k)) }, timeout: 5 }) as Phase);
  const lineUp = (from: number) => walkTo(order.slice(from).map((r, j) => [r, 51.06 - 0.86 * j] as [Role, number]));
  phases.push({ name: "Ruben stands at the edge of the exit shaft", do: { ...lineUp(1), R: walk(xs[0]!, { drop: true, jump: "never" }) }, until: cond.near("R", xs[0]!, 0.1), timeout: 10 });
  order.slice(1).forEach((r, k) => {
    const base = order[k]!;
    phases.push({ name: `${r} tries to climb onto ${base}`, do: { ...lineUp(k + 2), [r]: climbOnto(base) }, timeout: 6 });
    phases.push({ name: `${r} steps along ${base}'s head`, do: { [r]: shiftOn(base, xs[k + 1]!) }, timeout: 4 });
  });
  phases.push({
    name: "ATTEMPT: the highest of the human tower jumps for the exit landing",
    do: Object.fromEntries(order.map((r) => [r, whenHighest(order, jumpTo(LIP_SPOT, { rise: 0.25 }))])),
    until: (w) => order.some((r) => cond.standsAbove(r, 5)(w)),
    timeout: 5,
  });
  // Had it worked: the top hauls the others onto the landing.
  const landing = queue(n).map((r, k) => [r, DOOR - 0.3 - 0.9 * k] as [Role, number]);
  phases.push({ name: "the top hauls the others onto the landing", do: walkTo(landing), until: allNear(landing), timeout: 30 });
  return phases;
}

export const shortcuts: Record<string, CoopSolution> = {
  /** Beat 1 without the PC tower: a human tower in the shaft. */
  "a human tower under the upper floor": (n) => [
    ...towerWithoutCrate(n),
    // Had it worked: the top hauls the others, and the level goes on.
    ...haulAndLineUp(n, friends(n)[0]!),
    ...fosse(n),
    ...plateAndKey(n),
    ...pushToExit(),
    ...exitHops(n),
  ],

  /** Beat 2 with one pusher short of W. */
  "pushing the rack with one player short": (n) => [
    ...marchepiedPush(n),
    ...marchepiedClimb(n),
    ...haulAndLineUp(n),
    ...rackShortOne(n),
    ...fosse(n).slice(1),
    ...plateAndKey(n),
    ...pushToExit(),
    ...exitHops(n),
  ],

  /** Beat 3 in the wrong order: the tower goes straight under the exit, then F0 goes for the key with the others on plate w. */
  "the tower under the exit first": (n) => {
    const q = chainOrder(n);
    const onPlate = q.slice(1).map((r, j) => [r, 41.45 + 0.86 * j] as [Role, number]);
    return [
      ...beats12(n),
      ...pushToExit(),
      { name: "everyone walks back onto plate w but F0", do: { F0: walk(40.45, never), ...walkTo(onPlate) }, until: cond.all(cond.near("F0", 40.45, 0.3), allNear(onPlate, 0.3)), timeout: 12 },
      { ...fetchKey()[0]!, timeout: 4 },
      { ...fetchKey()[1]!, name: "ATTEMPT: F0 goes for the key (the tower is not on plate w)" },
      fetchKey()[2]!,
      { name: "the queue walks back to the exit", do: walkTo(q.map((r, j) => [r, M3_SPOT - 0.86 * (q.length - 1 - j)] as [Role, number])), timeout: 10 },
      ...exitHops(n),
    ];
  },

  /** Beat 3 without the tower's weight: everyone on plate w, F0 leaves it and races for the key before the cage shuts. */
  "the key without the tower": (n) => [...beats12(n), ...keyWithoutCrate(n), ...pushToExit(), ...exitHops(n)],

  /** Beat 3's exit without the tower under it: a human tower on the floor sensor. */
  "a human tower to the exit": (n) => [...beats12(n), ...plateAndKey(n), ...exitTowerWithoutCrate(n), ...exitHops(n).slice(-n - 2)],
};
