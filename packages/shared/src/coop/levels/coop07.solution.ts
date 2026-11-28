/**
 * Bot solution of "La BU" (coop07.ts), and the ways round the puzzle that must fail.
 *
 * Roles: R is Ruben, F0..F3 the friends in seat order (the chain is F0-F1-...-R). F0, the free end
 * of the chain, climbs the staircase; Ruben hits the alcove's switch on the signal. At 2 players
 * Ruben stands alone in the alcove; from 3 the others wait in it with him, F1 at its front (F0's
 * rope reaches him there, not further in), Ruben at its back under his switch. At the top F0 hits
 * the reading room's switch, and the alcove comes out one by one onto shelf L2 and is hauled up,
 * Ruben last. Map, beats and numbers: docs/coop-levels/coop07.md.
 */
import { BIT_DOWN, BIT_DOWN_PRESS, BIT_JUMP, BIT_JUMP_PRESS, BIT_LEFT, BIT_RIGHT } from "../inputBits";
import { cond, enter, friends, jumpTo, mount, roleIndex, seq, wait, walk, when, type CoopSolution, type Goal, type Phase, type Role } from "../bots";
import type { CoopWorld } from "../world";

// --- Helpers ---------------------------------------------------------------------------------

const body = (w: CoopWorld, r: Role) => w.bodies[roleIndex(r, w.bodies.length)]!;
const feetOf = (w: CoopWorld, r: Role) => body(w, r).y + body(w, r).height;
/** The role is in the air with its feet above y (higher on screen). */
const airAbove = (r: Role, y: number) => (w: CoopWorld) => !body(w, r).grounded && feetOf(w, r) < y;
const active = (g: "A" | "B") => (w: CoopWorld) => w.props.active === g;
const never = { jump: "never" as const };

/** Jump straight up now (a full jump, no steering); done once landed again. Hits a switch block overhead. */
export function hop(holdSteps = 50): Goal {
  let air = 0;
  return {
    label: "hop",
    step(c) {
      if (!c.w.bodies[c.i]!.grounded) air++;
      if (c.t === 0) return BIT_JUMP | BIT_JUMP_PRESS;
      return c.t < holdSteps ? BIT_JUMP : 0;
    },
    done: (c) => air > 2 && c.w.bodies[c.i]!.grounded,
  };
}

/**
 * Run towards x and jump once the centre passes xJump (out from under a low ceiling: the reading
 * alcove is 2 high, so a standing jump inside it bonks), steering to x; done once landed again.
 */
export function runJump(xJump: number, x: number): Goal {
  let air = 0;
  let pressed = -1;
  return {
    label: `run and jump at ${xJump} to ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      if (pressed >= 0 && !b.grounded) air++;
      const dir = Math.abs(x - b.cx) > 0.1 ? (x > b.cx ? BIT_RIGHT : BIT_LEFT) : 0;
      if (pressed < 0 && (x > b.cx ? b.cx >= xJump : b.cx <= xJump)) {
        pressed = c.t;
        return dir | BIT_JUMP | BIT_JUMP_PRESS;
      }
      return dir | (pressed >= 0 && c.t - pressed < 40 ? BIT_JUMP : 0);
    },
    done: (c) => air > 3 && c.w.bodies[c.i]!.grounded,
  };
}

// --- Places (x of body centres, cells; feet heights are floor tops, y down) -------------------

/** Beat 1, le sas: the switch s at x 10, the B wall at x 7, the A wall at x 14. */
const SAS_FRONT = 13.3;
/** Beat 2: the rim's end (x 27, top 11), L1 (x 29-30, top 9), L2 (x 28-29, top 7), L3 + trapdoor (x 27-28, top 5). */
const RIM_END = 27.4;
const L1_X = 29.4;
const L2_X = 28.4;
/** The alcove (x 23-26, floor top 8): its front, and Ruben's spot under his switch (x 25 at 2 players, x 23 from 3). */
const ALCOVE_FRONT = 26.3;
const hitSpot = (n: number) => (n === 2 ? 25.4 : 23.4);
/** The reading room (floor top 5, x 14-26): under its switch h (x 26), and its left end by the key's shelf. */
const UNDER_H = 25.8;
/** Beat 4: under the switch r (x 15); the key's shelf q (x 11-13, top 4); the door (x 2). */
const UNDER_R = 15.4;
const Q_X = 12.4;
const ROOM_END = 14.35;

function chain(n: number): Role[] {
  return [...friends(n), "R"];
}

// --- Phases ----------------------------------------------------------------------------------

/** Beat 1: everyone into the airlock, the one under the switch hits it; the A wall opens, the B wall shuts behind. */
function sas(n: number): Phase[] {
  const c = chain(n);
  // Front to back: Ruben by the A wall, then the friends from the last one to F0.
  const spots: Array<[Role, number]> = [...c].reverse().map((r, i) => [r, SAS_FRONT - 0.9 * i]);
  if (n === 2) spots[1] = ["F0", 10.5];
  const hitter = spots.reduce((best, s) => (Math.abs(s[1] - 10.5) < Math.abs(best[1] - 10.5) ? s : best))[0];
  const go: Phase["do"] = {};
  for (const [r, x] of spots) go[r] = walk(x, never);
  return [
    { name: "1. everyone into the airlock", do: go, until: cond.all(...spots.map(([r, x]) => cond.near(r, x, 0.3))), timeout: 12 },
    { name: `1. ${hitter} hits the switch: the A wall opens, the B wall shuts behind`, do: { [hitter]: hop() }, until: cond.all(active("B"), (w) => !w.props.shelves.some((s) => s.thing.char === "a" && s.solid)), timeout: 3 },
  ];
}

/** Beat 2, first part: the alcove fills (Ruben at the back, F1 at the front; Ruben alone at 2 players). */
function fillAlcove(n: number): Phase[] {
  const c = chain(n);
  const phases: Phase[] = [];
  // Into the alcove, Ruben first (deepest), then the friends from the last one to F1. The alcove
  // fills from its front and moves back as each one comes in: while someone is on his way in
  // (rim's end, L1, the jump), the one already in that he is tied to waits at x 25.4 (further in,
  // the rope round the alcove's floor is too short), the earlier ones behind him.
  const inAlcove = [...c].reverse().slice(0, n - 1); // R, F(k-1), ..., F1
  const finalSpot = (m: number) => (m === 0 ? hitSpot(n) : ALCOVE_FRONT - 0.95 * (inAlcove.length - 1 - m));
  const waitSpot = (m: number, j: number) => 25.4 - 0.95 * (j - 1 - m);
  for (let j = 0; j < inAlcove.length; j++) {
    const r = inAlcove[j]!;
    const inside: Phase["do"] = {};
    for (let m = 0; m < j; m++) inside[inAlcove[m]!] = walk(waitSpot(m, j), { ...never, tol: 0.15 });
    // Everyone not yet in follows towards the rim's end, in chain order (F0 last in the corridor).
    const waiting = c.filter((q) => !inAlcove.slice(0, j + 1).includes(q));
    const behind: Phase["do"] = {};
    waiting.forEach((q, k) => (behind[q] = walk(RIM_END - 1 - 0.9 * (waiting.length - 1 - k), never)));
    const settled = cond.all(...[...Array(j).keys()].map((m) => cond.near(inAlcove[m]!, waitSpot(m, j), 0.25)));
    phases.push(
      { name: `2. ${r} to the rim's end`, do: { ...behind, ...inside, [r]: walk(RIM_END, never) }, until: cond.all(cond.near(r, RIM_END, 0.3), settled), timeout: 15 },
      { name: `2. ${r} jumps onto L1`, do: { [r]: jumpTo(L1_X) }, until: cond.all(cond.standsAbove(r, 9), cond.near(r, L1_X, 0.6)), timeout: 4 },
      { name: `2. ${r} jumps into the alcove`, do: { [r]: seq(jumpTo(26.2), walk(j === inAlcove.length - 1 ? finalSpot(j) : 26.2, never)) }, until: cond.all(cond.standsAbove(r, 8), (w) => body(w, r).cx < 26.7), timeout: 6 },
    );
  }
  {
    const take: Phase["do"] = {};
    inAlcove.forEach((r, m) => (take[r] = walk(finalSpot(m), { ...never, tol: 0.12 })));
    phases.push({ name: "2. the alcove takes its places: Ruben at the back under his switch, F1 at the front", do: take, until: cond.all(...inAlcove.map((r, m) => cond.near(r, finalSpot(m), 0.2))), timeout: 8 });
  }
  return phases;
}

/** Beat 2: F0 onto L1 (B), the shelf he climbs from. */
function ontoL1(): Phase[] {
  return [
    { name: "2. F0 to the rim's end", do: { F0: walk(RIM_END, never) }, until: cond.near("F0", RIM_END, 0.3), timeout: 10 },
    { name: "2. F0 jumps onto L1 (B)", do: { F0: jumpTo(L1_X) }, until: cond.all(cond.standsAbove("F0", 9), cond.near("F0", L1_X, 0.3)), timeout: 4 },
    { name: "2. F0 settles on L1", do: { F0: walk(L1_X, { ...never, tol: 0.08 }) }, until: cond.near("F0", L1_X, 0.1), timeout: 3 },
  ];
}

/** Beat 2, the first hit: F0 jumps from L1, Ruben hits, L2 (A) appears under him. */
function hit1(): Phase[] {
  return [
    {
      name: "2. « 3, 2, 1, frappe ! »: F0 jumps, Ruben hits; L1 goes, L2 (A) appears under F0",
      do: { F0: hop(), R: when(airAbove("F0", 8.6), hop(3)) },
      until: cond.all(active("A"), cond.standsAbove("F0", 7)),
      timeout: 4,
    },
  ];
}

/** Beat 2, the second hit: F0 steps left on L2 and jumps, Ruben hits, L3 (B) appears under him. */
function hit2(): Phase[] {
  return [
    { name: "2. F0 steps left on L2", do: { F0: walk(L2_X, { ...never, tol: 0.08 }) }, until: cond.near("F0", L2_X, 0.1), timeout: 3 },
    {
      name: "2. « frappe ! »: F0 jumps, Ruben hits; L3 (B) appears under F0",
      do: { F0: hop(), R: when(airAbove("F0", 6.4), hop(3)) },
      until: cond.all(active("B"), cond.standsAbove("F0", 5)),
      timeout: 4,
    },
  ];
}

/** Beat 2, l'escalier. */
function escalier(n: number): Phase[] {
  return [...fillAlcove(n), ...ontoL1(), ...hit1(), ...hit2()];
}

/** Beat 3, l'inversion: F0 hits the reading room's switch (A: the trapdoor goes, L2 comes back), the alcove steps out onto L2 one by one and is hauled up. */

/** Beat 3: F0 walks off L3 into the reading room, under its switch h. */
function intoRoom(): Phase[] {
  return [{ name: "3. F0 into the reading room, under its switch", do: { F0: walk(UNDER_H, never) }, until: cond.all(cond.near("F0", UNDER_H, 0.2), cond.standsAbove("F0", 5)), timeout: 6 }];
}

/** Where the ones already in the reading room wait while c[j] climbs (the hitter is c[j-1], under h). */
const roomSpot = (k: number, j: number) => 24.7 - 0.9 * (j - 1 - k);

/**
 * Beat 3, l'inversion: the climb again, for the alcove, front first and Ruben last, with the
 * reading room hitting h. Round j: the hitter c[j-1] (under h) hits (A: L2 is back, the room's
 * mouth shuts); c[j] runs out of the alcove onto L2; « frappe ! »: he jumps, the hitter hits (B:
 * L3 under his feet, the mouth opens); the hitter steps back and c[j] comes in under h.
 */
function swap(n: number, from = 1): Phase[] {
  const c = chain(n);
  const phases: Phase[] = [];
  for (let j = from; j < c.length; j++) {
    const r = c[j]!;
    const hitter = c[j - 1]!;
    // The next one in the alcove (tied to r) takes its front as soon as r is out: further in, his rope would hold r back.
    const nextUp = c[j + 1];
    const next: Phase["do"] = nextUp ? { [nextUp]: when((w) => body(w, r).cx > 27.1, walk(ALCOVE_FRONT, never)) } : {};
    const stay: Phase["do"] = {};
    for (let k = 0; k < j - 1; k++) stay[c[k]!] = walk(roomSpot(k, j - 1), never);
    phases.push(
      { name: `3. ${hitter} hits h: L2 (A) comes back, the room's mouth shuts`, do: { ...stay, [hitter]: hop() }, until: active("A"), timeout: 3 },
      { name: `3. ${r} runs out of the alcove and jumps onto L2`, do: { [r]: runJump(26.9, L2_X), ...next }, until: cond.all(cond.standsAbove(r, 7), cond.near(r, L2_X, 0.6)), timeout: 4 },
      { name: `3. ${r} steps to L2's left end`, do: { [r]: walk(L2_X, { ...never, tol: 0.08 }), ...next }, until: cond.all(cond.near(r, L2_X, 0.1), ...(nextUp ? [cond.near(nextUp, ALCOVE_FRONT, 0.3)] : [])), timeout: 4 },
      {
        name: `3. « 3, 2, 1, frappe ! »: ${r} jumps, ${hitter} hits h; L3 (B) appears under ${r}`,
        do: { [r]: hop(), [hitter]: when(airAbove(r, 6.4), hop(3)) },
        until: cond.all(active("B"), cond.standsAbove(r, 5)),
        timeout: 4,
      },
    );
    // The hitter and the ones before him step back; the newcomer walks in under h.
    const back: Phase["do"] = {};
    for (let k = 0; k < j; k++) back[c[k]!] = walk(roomSpot(k, j), { ...never, tol: 0.15 });
    phases.push(
      { name: `3. ${hitter} steps back`, do: back, until: cond.all(...[...Array(j).keys()].map((k) => cond.near(c[k]!, roomSpot(k, j), 0.25))), timeout: 6 },
      { name: `3. ${r} into the reading room, under h`, do: { [r]: walk(UNDER_H, never) }, until: cond.all(cond.near(r, UNDER_H, 0.2), cond.standsAbove(r, 5)), timeout: 6 },
    );
  }
  return phases;
}

/** Beat 3. */
function inversion(n: number): Phase[] {
  return [...intoRoom(), ...swap(n)];
}

/**
 * Beat 4, la réserve: the room arrives in B: the footbridge e is gone, the key's shelf q is there
 * and its cage open. F0 takes the key on q; the hitter hits r (A): q goes and F0 drops onto e, the
 * footbridge to the door; everyone through the door.
 */
function reserve(n: number): Phase[] {
  const c = chain(n);
  const hitter: Role = n === 2 ? "R" : "F1";
  const line: Phase["do"] = { F0: walk(ROOM_END, never), [hitter]: walk(UNDER_R, never) };
  const others = c.filter((r) => r !== "F0" && r !== hitter);
  others.forEach((r, k) => (line[r] = walk(UNDER_R + 0.9 * (k + 1), never)));
  return [
    {
      name: "4. everyone along the reading room: F0 by the key's shelf, the hitter under r",
      do: line,
      until: cond.all(cond.near("F0", ROOM_END, 0.15), cond.near(hitter, UNDER_R, 0.2), ...others.map((r, k) => cond.near(r, UNDER_R + 0.9 * (k + 1), 0.3))),
      timeout: 15,
    },
    { name: "4. F0 hops onto the key's shelf", do: { F0: seq(jumpTo(Q_X), walk(Q_X, { ...never, tol: 0.1 })) }, until: cond.all(cond.standsAbove("F0", 4), cond.near("F0", Q_X, 0.15)), timeout: 4 },
    { name: "4. F0 jumps for the key", do: { F0: hop() }, until: cond.keyTaken, timeout: 3 },
    { name: "4. F0 lands back on the key's shelf", do: {}, until: cond.standsAbove("F0", 4), timeout: 3 },
    {
      name: `4. ${hitter} hits r (A): the key's shelf goes, F0 drops onto the footbridge`,
      do: { [hitter]: hop() },
      until: cond.all(active("A"), cond.standsAbove("F0", 5), (w) => feetOf(w, "F0") > 4.5),
      timeout: 4,
    },
    { name: "4. everyone through the door", do: { "*": () => enter() }, until: cond.won, timeout: 30 },
  ];
}

export const solution: CoopSolution = (n) => [...sas(n), ...escalier(n), ...inversion(n), ...reserve(n)];


// --- Shortcuts that must fail --------------------------------------------------------------

// Each one plays the solution up to the beat it tries to skip, then the attempt (the phase named
// "ATTEMPT", which must fail), then what would finish the level had the attempt worked.

/**
 * The tallest tower the team can build at the front of the corridor, bottom up: Ruben (the first
 * to arrive, and nobody can stand on him... he can carry) as the base, then the friends from the
 * last one; three high at most (a 3-tower is the highest that can still jump).
 */
function towerOf(n: number): Role[] {
  return [...chain(n)].reverse().slice(0, Math.min(3, n));
}

/** The others of the team (all but `busy`) close up behind, at the rim (their ropes would hold the tower back). */
function closeUp(n: number, busy: Role[], gap = 1.1): Phase["do"] {
  const d: Phase["do"] = {};
  const rest = chain(n).filter((r) => !busy.includes(r));
  rest.forEach((r, k) => (d[r] = walk(RIM_END - gap - 0.9 * (rest.length - 1 - k), never)));
  return d;
}

/** A tower on L1 (B): the base jumps onto L1 from the rim's end, each next one jumps onto L1 beside it and climbs on. */
function towerOnL1(n: number): Phase[] {
  const tower = towerOf(n);
  const base = tower[0]!;
  const behind = closeUp(n, [base]);
  const phases: Phase[] = [
    { name: `${base} to the rim's end`, do: { ...behind, [base]: walk(RIM_END, never) }, until: cond.near(base, RIM_END, 0.3), timeout: 15 },
    { name: `${base} jumps onto L1`, do: { ...behind, [base]: jumpTo(L1_X) }, until: cond.all(cond.standsAbove(base, 9), cond.near(base, L1_X, 0.4)), timeout: 4 },
    { name: `${base} to L1's right end`, do: { ...behind, [base]: walk(30.4, { ...never, tol: 0.1 }) }, until: cond.near(base, 30.4, 0.15), timeout: 3 },
  ];
  for (let i = 1; i < tower.length; i++) {
    const r = tower[i]!;
    const behind = closeUp(n, tower.slice(0, i + 1));
    phases.push(
      { name: `${r} to the rim's end`, do: { ...behind, [r]: walk(RIM_END, never) }, until: cond.near(r, RIM_END, 0.3), timeout: 15 },
      { name: `${r} jumps onto L1`, do: { ...behind, [r]: jumpTo(L1_X) }, until: cond.all(cond.standsAbove(r, 9.95), (w) => body(w, r).cx > 29), timeout: 4 },
      { name: `${r} climbs onto ${tower[i - 1]}`, do: { ...closeUp(n, tower.slice(0, i + 1), 0), [r]: mount(tower[i - 1]!) }, until: cond.on(r, tower[i - 1]!), timeout: 10 },
    );
  }
  return phases;
}


/** The reading room's hitter (the last one in, under h) hits: A, L2 is back and the room's mouth shuts. */
function hitForL2(n: number): Phase {
  return { name: "F0 hits h: L2 (A) is back, the room's mouth shuts", do: { F0: hop() }, until: active("A"), timeout: 3 };
}

/** After the climb, the alcove's front one (Ruben at 2 players) runs out onto L2 (A). */
function frontOntoL2(n: number): Phase[] {
  const r = chain(n)[1]!;
  return [
    hitForL2(n),
    { name: `${r} runs out of the alcove and jumps onto L2`, do: { [r]: runJump(26.9, L2_X) }, until: cond.all(cond.standsAbove(r, 7), cond.near(r, L2_X, 0.6)), timeout: 4 },
  ];
}

export const shortcuts: Record<string, CoopSolution> = {
  /**
   * Beat 2 without the hits: a tower on L1 (B; Ruben the base, 2 high at 2 players, 3 high from 3)
   * and its top jumps for L3 (B, there too). The cap over L1 (x 29-30) and L3 itself are a ceiling
   * over the whole of L1: the top's head stops under them.
   */
  "a tower on L1 to the top shelf": (n) => {
    const tower = towerOf(n);
    const top = tower[tower.length - 1]!;
    return [
      ...sas(n),
      ...towerOnL1(n),
      {
        name: `ATTEMPT: ${top} jumps from the tower for L3 (straight, then steering left)`,
        do: { ...closeUp(n, tower, 0), [top]: seq(jumpTo(27.6, { rise: 0.25 }), wait(0.2), jumpTo(27.6)) },
        until: cond.standsAbove(top, 5),
        timeout: 5,
      },
      ...intoRoom(),
      ...swap(n),
      ...reserve(n),
    ];
  },

  /** Beat 2's second hit skipped: from L2 (A) F0 jumps up and left for the reading room: the mouth m (A) is shut while L2 is there. */
  "a jump from L2 into the reading room": (n) => [
    ...sas(n),
    ...fillAlcove(n),
    ...ontoL1(),
    ...hit1(),
    { name: "F0 steps left on L2", do: { F0: walk(L2_X, { ...never, tol: 0.08 }) }, until: cond.near("F0", L2_X, 0.1), timeout: 3 },
    {
      name: "ATTEMPT: F0 jumps for the room's mouth: short hops, full jumps, from both ends of L2",
      do: { F0: seq(jumpTo(26.2, { holdFor: 0.12 }), walk(28.4, never), jumpTo(26.2, { holdFor: 0.2 }), walk(29.3, never), jumpTo(26.2), walk(28.4, never), jumpTo(26.2, { rise: 0.3 })) },
      until: cond.all(cond.standsAbove("F0", 5), (w) => body(w, "F0").cx < 26.9),
      timeout: 8,
    },
    ...swap(n),
    ...reserve(n),
  ],

  /** The same from a friend's head: after the first hit someone runs out of the alcove onto L2 (A) as the base (Ruben at 2 players), F0 climbs on him and jumps for the mouth. */
  "a tower on L2 into the reading room": (n) => {
    const base: Role = n === 2 ? "R" : "F1";
    return [
      ...sas(n),
      ...fillAlcove(n),
      ...ontoL1(),
      ...hit1(),
      { name: "F0 steps right on L2", do: { F0: walk(29.4, { ...never, tol: 0.08 }) }, until: cond.near("F0", 29.4, 0.15), timeout: 3 },
      { name: `${base} runs out of the alcove onto L2`, do: { [base]: runJump(26.9, L2_X) }, until: cond.all(cond.standsAbove(base, 7), cond.near(base, L2_X, 0.4)), timeout: 6 },
      { name: `F0 climbs onto ${base}`, do: { F0: mount(base) }, until: cond.on("F0", base), timeout: 10 },
      { name: `ATTEMPT: F0 jumps from ${base}'s head into the reading room`, do: { F0: seq(jumpTo(26.2, { holdFor: 0.1 }), wait(0.3)) }, until: cond.all(cond.standsAbove("F0", 5), (w) => body(w, "F0").cx < 26.9), timeout: 6 },
      ...swap(n),
      ...reserve(n),
    ];
  },

  /** Beat 3 by hauling instead of climbing: the alcove's front one (Ruben at 2 players) waits on L2 (A) and F0 walks off: the room's mouth is shut (A). */
  "a haul from L2 into the reading room": (n) => {
    const r = chain(n)[1]!;
    return [
      ...sas(n),
      ...escalier(n),
      ...intoRoom(),
      ...frontOntoL2(n),
      { name: `ATTEMPT: F0 walks off with ${r} on L2`, do: { F0: walk(19, never) }, until: cond.all(cond.standsAbove(r, 5), (w) => body(w, r).cx < 26.5), timeout: 8 },
      ...swap(n, 2),
      ...reserve(n),
    ];
  },

  /** The same straight out of the alcove: F0 walks off with the alcove's front one (Ruben at 2 players) still inside; he jams under the room's floor at the mouth. */
  "a haul straight out of the alcove": (n) => {
    const r = chain(n)[1]!;
    return [
      ...sas(n),
      ...escalier(n),
      ...intoRoom(),
      hitForL2(n),
      { name: `ATTEMPT: F0 walks off with ${r} still in the alcove`, do: { F0: walk(19, never) }, until: cond.all(cond.standsAbove(r, 5), (w) => body(w, r).cx < 26.5), timeout: 8 },
      ...swap(n, 2),
      ...reserve(n),
    ];
  },

  /** Beat 4 without the cage open: in A (the footbridge there) F0 jumps for the key through its bars, under it and on both sides. */
  "the key through the bars": (n) => {
    const hitter: Role = n === 2 ? "R" : "F1";
    return [
      ...solution(n).slice(0, -5),
      { name: `${hitter} hits r (A): the footbridge is back, the cage shuts`, do: { [hitter]: hop() }, until: active("A"), timeout: 3 },
      {
        name: "ATTEMPT: F0 jumps for the key from the footbridge (A)",
        do: { F0: seq(walk(12.5, never), hop(), walk(13.5, never), jumpTo(12.6), walk(11.4, never), jumpTo(12.4), walk(12.2, never), hop()) },
        until: cond.keyTaken,
        timeout: 8,
      },
      { name: "everyone through the door", do: { "*": () => enter() }, until: cond.won, timeout: 30 },
    ];
  },

  /** Beat 4 without the last hit: F0 takes the key on its shelf (B) and leaps from there for the door, pressing ↓ in the air. The deadly pit is under him. */
  "the door from the key's shelf in one leap": (n) => [
    ...solution(n).slice(0, -2),
    { name: "ATTEMPT: F0 runs off the key's shelf and leaps for the door", do: { F0: seq(walk(13.4, never), leap(2.5)) }, until: cond.inside("F0"), timeout: 5 },
    { name: "everyone through the door", do: { "*": () => enter() }, until: cond.won, timeout: 30 },
  ],
};

/** Run towards x from where the body is and jump at once (full jump), steering to x and pressing ↓ in the air; done once landed or inside. */
function leap(x: number): Goal {
  let air = 0;
  return {
    label: `leap to ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      if (!b.grounded) air++;
      const dir = x > b.cx ? BIT_RIGHT : BIT_LEFT;
      if (c.t === 0) return dir | BIT_JUMP | BIT_JUMP_PRESS;
      return dir | (c.t < 50 ? BIT_JUMP : 0) | (air > 0 && c.t % 4 === 0 ? BIT_DOWN | BIT_DOWN_PRESS : 0);
    },
    done: (c) => c.w.inside[c.i] === true || (air > 3 && c.w.bodies[c.i]!.grounded),
  };
}
