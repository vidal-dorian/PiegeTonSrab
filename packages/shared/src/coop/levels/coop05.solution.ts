/**
 * Bot solution of "La Salle" (coop05.ts), and the ways round the puzzle that must fail.
 *
 * Roles: R is Ruben, F0..F3 the friends in seat order (the chain is F0-F1-...-R). F0, the free end
 * of the chain, crosses the pulley first, flies off the seesaw onto the mezzanine and stands on
 * the plate that holds the step for the others. His only neighbour (Ruben at 2 players, F1 from
 * 3) anchors him from the tunnel mouth and hits the switch. Map, beats and numbers:
 * docs/coop-levels/coop05.md.
 */
import { BIT_DOWN, BIT_DOWN_PRESS, BIT_JUMP, BIT_JUMP_PRESS, BIT_LEFT, BIT_RIGHT } from "../inputBits";
import { cond, enter, friends, hold, jumpTo, mount, roleIndex, seq, walk, when, type CoopSolution, type Goal, type Phase, type Role } from "../bots";
import type { CoopWorld } from "../world";

// --- Helpers (goals and conditions the toolbox does not have) --------------------------------

const body = (w: CoopWorld, r: Role) => w.bodies[roleIndex(r, w.bodies.length)]!;
/** The role's feet are at or below y (down in a shaft). */
const feetBelow = (r: Role, y: number) => (w: CoopWorld) => body(w, r).y + body(w, r).height >= y - 1e-3;
/** The role stands with its feet at or above y and its centre right of x. */
const upAndPast = (r: Role, y: number, x: number) => (w: CoopWorld) => cond.standsAbove(r, y)(w) && body(w, r).cx > x;
const not = (f: (w: CoopWorld) => boolean) => (w: CoopWorld) => !f(w);
const pastX = (r: Role, x: number) => (w: CoopWorld) => body(w, r).cx > x;
const allNear = (spots: Array<[Role, number]>, tol = 0.35) => cond.all(...spots.map(([r, x]) => cond.near(r, x, tol)));
/** The seesaw leans towards its right pad (A, the flyer's pad). */
const padADown = (w: CoopWorld) => w.props.seesaws[0]!.t === -1;

/** The key is carried by one of these roles. */
const carriedBy = (roles: Role[]) => (w: CoopWorld) => roles.some((r) => w.props.keyCarrier === roleIndex(r, w.bodies.length));

/** Take the key from \`from\` (↓ next to its carrier) whenever \`from\` carries it. */
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

/** In the air (thrown by the seesaw), steer towards x; done once landed again. */
function fly(x: number): Goal {
  let air = 0;
  return {
    label: `fly to ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      if (b.grounded) return 0;
      air++;
      const dx = x - b.cx;
      return Math.abs(dx) > 0.1 ? (dx > 0 ? BIT_RIGHT : BIT_LEFT) : 0;
    },
    done: (c) => air > 10 && c.w.bodies[c.i]!.grounded,
  };
}

/** Walk off a ledge towards x and jump as soon as the feet leave it (coyote time), steering to x; done once landed. */
function coyote(x: number): Goal {
  let air = 0;
  return {
    label: `coyote jump to ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      const dx = x - b.cx;
      const dir = Math.abs(dx) > 0.1 ? (dx > 0 ? BIT_RIGHT : BIT_LEFT) : 0;
      if (b.grounded && air === 0) return dir;
      air++;
      if (air === 1) return dir | BIT_JUMP | BIT_JUMP_PRESS;
      return dir | (air < 50 ? BIT_JUMP : 0);
    },
    done: (c) => air > 10 && c.w.bodies[c.i]!.grounded,
  };
}

const never = { jump: "never" as const };

// --- Places (x of body centres, in cells) --------------------------------------------------

/** Beat 1: the pulley pans l (x 8, Ruben's, one cell above the floor at rest) and r (x 9, rises to the tunnel floor). */
const PAN_L = 8.5;
const L_DOWN = 15.9;
const PAN_R = 9.5;
const EDGE = 7.4;
/** First tunnel spot (x 10-11), clear of pan r. */
const TUNNEL = 10.6;
/** Beat 2: the tunnel mouth under the switch (x 24), the seesaw's far pad A (x 27). */
const MOUTH = 24.5;
const PAD_A = 27.5;
const CAP = 26.5;
/** The mezzanine: floor top 9, x 12-24, the door at 14; the flyer lands at its lip. */
const LANDING = 24.45;
/** The plate on the mezzanine (x 23) and the step it holds (x 26, top 11). */
const PLATE = 23.4;
const STEP_G = 26.5;
/** Where a climber waits on the mezzanine for the next one (left of the plate holder, within rope reach of the tunnel mouth). */
const WAITING = 22.6;
/** In front of the door (x 14) on the mezzanine. */
const DOOR_FRONT = 14.6;
const KEY = 24.3;

/** The chain from F0 to Ruben. */
function chain(n: number): Role[] {
  return [...friends(n), "R"];
}

// --- Phases ------------------------------------------------------------------------------

/**
 * Beat 1, "La poulie": Ruben jumps onto pan l, which sinks 4 while pan r rises flush with the
 * tunnel; the friends hop over l onto r one by one, F0 first, and walk into the tunnel; the last
 * one, Ruben's neighbour, hauls Ruben out. Ruben's neighbour waits one cell from the pit (further
 * away, his rope over the pit's corner would lift Ruben off his pan); the others jump over him.
 */
function poulie(n: number): Phase[] {
  const fs = friends(n);
  const k = fs.length;
  const nb = fs[k - 1]!;
  const WAIT_NB = EDGE - 0.85;
  const phases: Phase[] = [];
  /** F_j to the edge (jumping over whoever is in the way), then the next one behind Ruben's neighbour. */
  const queue = (j: number): Phase[] => {
    const out: Phase[] = [{ name: `1. ${fs[j]} comes to the edge`, do: { [fs[j]!]: walk(EDGE, { tol: 0.25 }) }, until: cond.near(fs[j]!, EDGE, 0.3), timeout: 10 }];
    if (j + 1 < k - 1) out.push({ name: `1. ${fs[j + 1]} waits behind ${nb}`, do: { [fs[j + 1]!]: walk(WAIT_NB - 0.9, { tol: 0.25 }) }, until: cond.near(fs[j + 1]!, WAIT_NB - 0.9, 0.35), timeout: 10 });
    return out;
  };
  phases.push({
    name: "1. Ruben jumps onto pan l (it sinks), his neighbour waits near the pit",
    do: { R: walk(PAN_L), [nb]: walk(k > 1 ? WAIT_NB : EDGE, { tol: 0.25 }) },
    until: cond.all(feetBelow("R", L_DOWN), cond.near(nb, k > 1 ? WAIT_NB : EDGE, 0.3)),
    timeout: 15,
  });
  if (k > 1) phases.push(...queue(0));
  for (let j = 0; j < k; j++) {
    const f = fs[j]!;
    phases.push({
      name: `1. ${f} hops over pan l onto pan r (raised by Ruben)`,
      do: { [f]: jumpTo(PAN_R, { holdFor: 0.06 }) },
      until: cond.all(cond.standsAbove(f, 13), cond.near(f, PAN_R, 0.45)),
      timeout: 4,
    });
    if (j < k - 1) {
      phases.push(...queue(j + 1));
      const train: Phase["do"] = {};
      for (let i = 0; i <= j; i++) train[fs[i]!] = walk(TUNNEL + 0.85 * (j - i), never);
      phases.push({
        name: `1. into the tunnel (${fs.slice(0, j + 1).join(", ")})`,
        do: train,
        until: allNear(fs.slice(0, j + 1).map((r, i) => [r, TUNNEL + 0.85 * (j - i)] as [Role, number]), 0.3),
        timeout: 8,
      });
    }
  }
  const haul: Phase["do"] = { R: hold(1) };
  fs.forEach((f, i) => (haul[f] = walk(MOUTH - 0.85 * i, never)));
  phases.push({ name: "1. Ruben's neighbour hauls him into the tunnel", do: haul, until: upAndPast("R", 13, 10.2), timeout: 20 });
  return phases;
}

/** Beat 2, "Le développé-catapulte": F0 goes down onto pad A, his neighbour anchors at the mouth and jumps into the switch; the barbell falls, F0 flies onto the mezzanine. */
function catapulte(n: number): Phase[] {
  const c = chain(n);
  const anchor = c[1]!;
  const behind = c.slice(2);
  const go: Phase["do"] = { F0: walk(PAD_A, { drop: true, jump: "never" }), [anchor]: when(pastX("F0", 25.2), walk(MOUTH, never)) };
  behind.forEach((r, i) => (go[r] = when(pastX("F0", 25.2), walk(MOUTH - 0.85 * (i + 1), never))));
  return [
    {
      name: "2. F0 drops onto the seesaw and stands on pad A; the anchor takes the mouth",
      do: go,
      until: cond.all(cond.near("F0", PAD_A, 0.3), padADown, cond.near(anchor, MOUTH, 0.3), ...behind.map((r, i) => cond.near(r, MOUTH - 0.85 * (i + 1), 0.35))),
      timeout: 15,
    },
    {
      name: "2. « 3, 2, 1, saute ! »: the anchor jumps into the switch, the barbell falls, F0 flies onto the mezzanine",
      do: { [anchor]: jumpTo(MOUTH), F0: fly(LANDING) },
      until: cond.all(cond.standsAbove("F0", 9), (w) => body(w, "F0").cx < 24.9),
      timeout: 5,
    },
    { name: "2. F0 picks up the key", do: { F0: walk(KEY, never) }, until: cond.keyTaken, timeout: 5 },
  ];
}

/** Beat 3, "Le pote qui vole fait monter Ruben": the flyer stands on plate p, the step g appears in the barbell's column; the others climb tunnel, step, mezzanine, Ruben last; everyone through the door. */
function monte(n: number): Phase[] {
  const c = chain(n);
  const phases: Phase[] = [
    { name: "3. F0 stands on plate p: the step appears", do: { F0: walk(PLATE, never) }, until: cond.all(cond.near("F0", PLATE, 0.3), not(cond.gateOpen("g"))), timeout: 6 },
  ];
  // The next one in the chain follows to the mouth as soon as it is free (his rope holds the climber back otherwise).
  const follow = (j: number): Phase["do"] => (j + 1 < c.length ? { [c[j + 1]!]: when(pastX(c[j]!, 25.25), walk(MOUTH, never)) } : {});
  for (let j = 1; j < c.length; j++) {
    const r = c[j]!;
    phases.push(
      { name: `3. ${r} to the tunnel mouth`, do: { [r]: walk(MOUTH, never) }, until: cond.near(r, MOUTH, 0.3), timeout: 8 },
      { name: `3. ${r} walks out of the mouth and jumps onto the step g`, do: { [r]: coyote(STEP_G), ...follow(j) }, until: cond.all(cond.standsAbove(r, 11), cond.near(r, STEP_G, 0.45)), timeout: 4 },
    );
    if (j > 1) {
      // With r on the step, the previous climber can jump over the plate holder (his rope reaches r there, not the tunnel).
      const prev = c[j - 1]!;
      const shift: Phase["do"] = { [prev]: walk(WAITING) };
      for (let i = 1; i < j - 1; i++) shift[c[i]!] = walk(WAITING - 0.85 * (j - 1 - i));
      phases.push({
        name: `3. ${prev} jumps over F0 off the landing`,
        do: { ...shift, ...follow(j) },
        until: cond.all(...[...Array(j - 1).keys()].map((q) => cond.near(c[q + 1]!, WAITING - 0.85 * (j - 2 - q), 0.3))),
        timeout: 8,
      });
    }
    phases.push({ name: `3. ${r} jumps onto the mezzanine`, do: { [r]: jumpTo(LANDING), ...follow(j) }, until: cond.standsAbove(r, 9), timeout: 4 });
  }
  // The queue to the door, front first: the climbers (F1 first), then F0 with the key, then Ruben. The key goes forward.
  const q: Role[] = [...c.slice(1, -1), "F0", "R"];
  const spots = q.map((r, i) => [r, DOOR_FRONT + 0.85 * i] as [Role, number]);
  const go: Phase["do"] = {};
  for (const [r, x] of spots) go[r] = walk(x);
  phases.push({ name: "3. the queue to the door", do: go, until: allNear(spots, 0.3), timeout: 15 });
  for (let j = q.length - 3; j >= 0; j--) {
    phases.push({ name: `3. ${q[j]} takes the key from ${q[j + 1]}`, do: { [q[j]!]: takeKey(q[j + 1]!) }, until: cond.any(carriedBy([q[j]!]), cond.doorOpen), timeout: 3 });
  }
  phases.push({ name: "3. everyone through the door", do: { "*": () => enter() }, until: cond.won, timeout: 25 });
  return phases;
}

export const solution: CoopSolution = (n) => [...poulie(n), ...catapulte(n), ...monte(n)];

// --- Shortcuts that must fail --------------------------------------------------------------

// Each one plays the solution up to the beat it tries to skip, then the attempt (the phase named
// "ATTEMPT", which must time out), then what would finish the level had the attempt worked.

/** Beat 2 up to the anchor at the mouth and F0 on pad A (the solution's first phase of beat 2). */
const ready = (n: number): Phase[] => catapulte(n).slice(0, 1);
/** Beat 2 after the shot: F0 picks up the key. */
const keyAfterShot = (): Phase[] => [{ name: "F0 picks up the key", do: { F0: walk(KEY, never) }, until: cond.keyTaken, timeout: 5 }];

export const shortcuts: Record<string, CoopSolution> = {
  /** Beat 1 without the counterweight: nobody on pan l, F0 hops towards pan r and the tunnel. */
  "a friend crosses the pulley alone": (n) => [
    { name: "nobody on pan l; F0 jumps over the others to the edge of the pit", do: { F0: walk(EDGE, { tol: 0.25 }) }, until: cond.near("F0", EDGE, 0.3), timeout: 12 },
    { name: "ATTEMPT: F0 hops over pan l and gets into the tunnel (pan l empty)", do: { F0: seq(jumpTo(PAN_R, { holdFor: 0.06 }), walk(TUNNEL + 1, never)) }, until: upAndPast("F0", 13, 10.2), timeout: 6 },
    ...solution(n).slice(1),
  ],

  /** Beat 2 without the catapult: F0's neighbour (Ruben at 2 players) on the seesaw's cap, F0 climbs on his head and jumps for the mezzanine. */
  "a tower from the seesaw to the mezzanine": (n) => {
    const base = chain(n)[1]!;
    return [
      ...poulie(n),
      ...ready(n),
      { name: `${base} drops onto the seesaw's cap`, do: { [base]: walk(CAP, { drop: true }), ...(n > 2 ? { [chain(n)[2]!]: when(pastX(base, 25.25), walk(MOUTH, never)) } : {}) }, until: cond.near(base, CAP, 0.3), timeout: 10 },
      { name: `F0 climbs onto ${base}`, do: { F0: mount(base) }, until: cond.on("F0", base), timeout: 10 },
      { name: `ATTEMPT: F0 jumps from ${base}'s head onto the mezzanine`, do: { F0: jumpTo(LANDING, { rise: 0.3 }) }, until: cond.standsAbove("F0", 9), timeout: 5 },
      ...keyAfterShot(),
      ...monte(n),
    ];
  },

  /** Beat 2 as first written: the anchor drops onto the raised pad himself instead of releasing the barbell; his rope holds F0 down. */
  "the anchor jumps onto the seesaw himself": (n) => {
    const anchor = chain(n)[1]!;
    return [
      ...poulie(n),
      ...ready(n),
      { name: "the anchor walks off the mouth onto the raised pad", do: { [anchor]: walk(25.5, { drop: true, jump: "never" }) }, until: feetBelow(anchor, 14.2), timeout: 5 },
      { name: "ATTEMPT: F0, thrown by the anchor's fall, steers onto the mezzanine", do: { F0: fly(LANDING) }, until: cond.standsAbove("F0", 9), timeout: 5 },
      ...keyAfterShot(),
      ...monte(n),
    ];
  },
};
