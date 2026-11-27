/**
 * Bot solution of "Le Labo Réseau" (coop02.ts), at 2 to 5 players, and the shortcuts it closes.
 *
 * The team goes down in the order it stands: Ruben (who spawns on the right, nearest shaft A)
 * first, F0 last. Both beats put Ruben on the rope at every team size.
 *
 * Beat 1 (shaft A, right): the rope runs over the lip's corner, so the one who steps off hangs as
 * deep as the rope is long past that corner. Ruben steps off; his neighbour stops about 2.3 cells
 * back, so that Ruben hangs in the slot's mouth under the lip; Ruben leans in (the rope now also
 * wraps the lip's lower corner) until he is over the slot's floor; then his neighbour walks
 * towards the edge and sets him down. Each next one does the same, lowered by the one behind him;
 * the one before him waits at the floor's end and makes way. F0, last, has nobody behind him: he
 * falls against the side of the slot's floor and the one before him hauls him up over its end.
 * Beat 2 (shaft B, left): Ruben entered first, so he is nearest shaft B. With 2 players F0 stops
 * about 3 cells from the edge and Ruben steps off: he hangs against the wall at the key, one row
 * above the stripped cables. With 3 or more, Ruben's neighbour lowers him first, then steps off
 * too while the next one holds them both; Ruben hangs a rope deeper, swings a little towards the
 * key, and the anchor hauls the pair back up. Ruben, who carries his key, opens the door.
 *
 * The lowering, leaning and swinging goals are below (on the exported bot API), so other levels
 * can copy them.
 */
import { cond, enter, friends, idle, roleIndex, seq, walk, when, type CoopSolution, type Goal, type Phase, type Role } from "../bots";
import { BIT_JUMP, BIT_JUMP_PRESS, BIT_LEFT, BIT_RIGHT } from "../inputBits";
import type { CoopWorld } from "../world";

// --- The level's numbers (cells) -----------------------------------------------------------

/** Feet of a body standing in the server room (and on the slot's floor). */
const ROOM = 10;
/** Shaft A: the lip of the raised floor (its right edge, the corner the rope runs over: (25, 6)). */
const EDGE_A = 25;
/** The slot's floor ends at x = 24, one cell short of the lip (the recess under it). */
const SLOT_FLOOR_X = 24;
/** Shaft B: its near rim (the server room's floor starts at x = 4). */
const EDGE_B = 4;
/**
 * Where beat 1's anchor stands while the one he lowers leans in: about 2.3 cells back from the lip
 * (held still from 22.8 to 23.8 the one below hovers in the mouth over the slot's floor, feet
 * 9.1-9.8; closer to the edge he drops below the floor's top against its side).
 */
const ANCHOR_A = 22.7;
/** Beat 2, 2 players: Ruben's feet against the wall at the key (touch from 12.23, cables from 13.1). */
const KEY_FEET_2 = 12.65;
/** Where that anchor stands (held still, the key is touched for 6.6-7.25; from 6.55 closer, the drop dips onto the cables). */
const ANCHOR_B2 = 6.9;
/**
 * Beat 2, 3+ players: Ruben's feet one rope below his neighbour (the key one cell out from the
 * wall: touch from 16.23 to 17.67; cables from 18.1).
 */
const KEY_FEET_3 = 17.15;
/**
 * Where that anchor waits: far enough back that the pair's drop off the rim (the rope gives about a
 * cell under it) stays above the cables; he lowers them once they have settled.
 */
const ANCHOR_B3 = 8.0;
/** Ruben swings left until he touches the key (one cell out from the wall), never past this x (far cables at 1.75). */
const SWING_MAX_X = 2.8;

// --- Helpers on the world --------------------------------------------------------------------

function feetOf(w: CoopWorld, i: number): number {
  const b = w.bodies[i]!;
  return b.y + b.height;
}

/** Body i stands in the server room (between shaft B and the slot). */
function inRoom(w: CoopWorld, i: number): boolean {
  const b = w.bodies[i]!;
  return !w.inside[i] && b.grounded && Math.abs(feetOf(w, i) - ROOM) < 0.05 && b.cx > EDGE_B && b.cx < SLOT_FLOOR_X;
}

/** Body i stands on the slot's floor (maybe on its very end, held there by the rope). */
function onSlotFloor(w: CoopWorld, i: number): boolean {
  const b = w.bodies[i]!;
  return b.grounded && Math.abs(feetOf(w, i) - ROOM) < 0.05 && b.x < SLOT_FLOOR_X && b.cx > EDGE_B;
}

/** Body i hangs under the lip of shaft A, over the slot's floor (its left side past the floor's end). */
function overSlot(i: number): (w: CoopWorld) => boolean {
  return (w) => {
    const b = w.bodies[i]!;
    return !b.grounded && b.x < SLOT_FLOOR_X - 0.08 && feetOf(w, i) < ROOM;
  };
}

/** Body i hangs on the rope (in the air, below where it stood). */
function hangs(w: CoopWorld, i: number, below: number): boolean {
  return !w.bodies[i]!.grounded && feetOf(w, i) > below + 0.5;
}

// --- Goals: lowering, leaning and swinging -----------------------------------------------------

/**
 * Anchor goal: walk to `at` (cells), then keep the friend `who` hanging below at feet `feet`
 * (cells, the y of his feet): walk towards the edge (`edgeDir`) when he is too high, away when he
 * is too deep (that also holds against the anchor's slide), stand still within `tol`. Never walks
 * closer than 0.9 to the edge `edgeX`.
 */
export function lowerTo(who: Role, feet: number, o: { at: number; edgeX: number; edgeDir: -1 | 1; tol?: number }): Goal {
  const tol = o.tol ?? 0.12;
  const start = walk(o.at, { tol: 0.15, jump: "never" });
  let placed = false;
  return {
    label: `lower ${who} to feet ${feet}`,
    step(c) {
      const w = c.w;
      const h = w.bodies[roleIndex(who, w.bodies.length)]!;
      const me = w.bodies[c.i]!;
      // Act only once the rope holds him (a falling friend is not lowered yet), and holds him from
      // me: everyone between us in the chain hangs too.
      const j = roleIndex(who, w.bodies.length);
      let fromMe = true;
      for (let k = Math.min(j, c.i) + 1; k < Math.max(j, c.i); k++) if (w.bodies[k]!.grounded) fromMe = false;
      const hanging = fromMe && !h.grounded && h.hanging && h.y + h.height > me.y + me.height + 0.5;
      if (!placed && !hanging) {
        if (start.done?.(c)) placed = true;
        return start.step(c);
      }
      placed = true;
      if (!hanging) return 0;
      const err = feet - (h.y + h.height);
      const toward = o.edgeDir > 0 ? BIT_RIGHT : BIT_LEFT;
      const away = o.edgeDir > 0 ? BIT_LEFT : BIT_RIGHT;
      const room = (o.edgeX - me.cx) * o.edgeDir;
      // Lower him only once he has settled: the rope gives a little when someone drops onto it,
      // and walking on while he still bounces down takes him deeper than asked.
      if (err > tol && room > 0.9 && Math.abs(h.vy) < 0.5) return toward;
      if (err < -tol) return away;
      return 0;
    },
  };
}

/**
 * Anchor goal for a slot under a lip. The rope runs over the lip's corner, so the friend `who`
 * hangs as deep as the rope is long past that corner: walking towards the edge lowers him,
 * walking back raises him. Walk to `at` and stand there; once he hangs over the slot's floor
 * (`over`: he leaned in under the lip) and has settled, walk slowly towards the edge (`edgeDir`,
 * at most `speed` cells/s, never past `maxX`) until he stands; while he hangs deeper than the
 * floor's top (`floor`, a y) without being over it, walk back (not past `at`) to raise him.
 */
export function lowerOnto(
  who: Role,
  o: { at: number; edgeDir: -1 | 1; over: (w: CoopWorld) => boolean; floor: number; maxX: number; speed?: number },
): Goal {
  const speed = o.speed ?? 1.5;
  const place = walk(o.at, { tol: 0.1, jump: "never" });
  let started = false;
  return {
    label: `lower ${who} onto the slot's floor`,
    step(c) {
      const w = c.w;
      const me = w.bodies[c.i]!;
      const h = w.bodies[roleIndex(who, w.bodies.length)]!;
      const toward = o.edgeDir > 0 ? BIT_RIGHT : BIT_LEFT;
      const away = o.edgeDir > 0 ? BIT_LEFT : BIT_RIGHT;
      if (!h.grounded && h.hanging) started = true;
      if (!started) return place.step(c);
      if (h.grounded) return 0;
      if (h.y + h.height > o.floor + 0.02 && !o.over(w)) {
        // Too deep, against the side of the slot's floor: « Recule ! »
        if ((me.cx - o.at) * o.edgeDir <= 0) return 0;
        return -me.vx * o.edgeDir < speed ? away : 0;
      }
      if (o.over(w) && Math.abs(h.vy) < 1) {
        // Over the floor: « Avance doucement… »
        if ((o.maxX - me.cx) * o.edgeDir <= 0) return 0;
        return me.vx * o.edgeDir < speed ? toward : 0;
      }
      return 0;
    },
  };
}

/**
 * Hanging goal: push towards `x` in short pulses (a gentle swing, never a full pump) until
 * `until` holds, never letting the body's centre go past `max` (beyond it, push back).
 */
export function swingTo(x: number, o: { until: (w: CoopWorld) => boolean; max: number; maxSpeed?: number }): Goal {
  const maxSpeed = o.maxSpeed ?? 1.2;
  let done = false;
  return {
    label: `swing to ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      if (done || o.until(c.w)) {
        done = true;
        // Damp the swing: push against the motion.
        return b.vx > 0.3 ? BIT_LEFT : b.vx < -0.3 ? BIT_RIGHT : 0;
      }
      if (b.grounded) return 0;
      const dir = Math.sign(x - b.cx);
      if ((b.cx - o.max) * dir > 0) return dir > 0 ? BIT_LEFT : BIT_RIGHT;
      if (b.vx * dir > maxSpeed) return 0;
      return dir > 0 ? BIT_RIGHT : BIT_LEFT;
    },
    done: () => done,
  };
}

/**
 * Walk off the edge at `edgeX` going `dir`: a step, not a jump, and slowly over the last cell
 * (at most `speed` cells/s), so the rope catches the body against the wall instead of swinging it
 * out across the shaft.
 */
export function stepOff(edgeX: number, dir: -1 | 1, speed = 1.5): Goal {
  return {
    label: `step off at ${edgeX}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      if (!b.grounded) return 0;
      const bits = dir > 0 ? BIT_RIGHT : BIT_LEFT;
      const left = (edgeX - b.cx) * dir;
      if (left > 1.4) return bits;
      return b.vx * dir < speed ? bits : 0;
    },
  };
}

/**
 * Walk off the edge at `edgeX` going `dir` (as stepOff), then, once in the air, lean back the other
 * way, under the lip one stepped off (the rope, wrapped round the lip's corners, holds the body
 * there); once it stands again, walk to `inX` (into the slot) and stay there.
 */
export function stepOffAndLean(edgeX: number, dir: -1 | 1, inX: number, speed = 1.5): Goal {
  const off = stepOff(edgeX, dir, speed);
  const settle = walk(inX, { tol: 0.15, jump: "never" });
  let flew = false;
  return {
    label: `step off at ${edgeX} and lean back`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      if (!b.grounded) flew = true;
      if (!flew) return off.step(c);
      if (b.grounded) return settle.step(c);
      return dir > 0 ? BIT_LEFT : BIT_RIGHT;
    },
    done: (c) => flew && settle.done!(c),
  };
}

// --- The solution ----------------------------------------------------------------------------

/** The order the team goes down in: as it stands, Ruben (nearest shaft A) first, F0 last. */
function order(n: number): Role[] {
  return ["R", ...friends(n).reverse()];
}

/**
 * Where the last one into the slot waits while the next one steps off: at the slot floor's end, so
 * that the rope between them (round the lip's two corners) stays slack; then he makes way.
 */
const CATCH_X = 23.75;
/** Where the one who has just come in waits while the next one is set down (out of his way). */
const MAKE_ROOM = 22.4;

/**
 * Beat 1, the train into the server room: the body at place k of the order (Ruben, place 0, is
 * already in) steps off the lip while the one behind him on the raised floor holds him at the
 * slot's height, leans in under the lip and is set down on the slot's floor, as Ruben was. The one
 * before him waits at the floor's end and makes way once he is in the air; the ones further in
 * close up. The last one (F0) has nobody behind him: he falls against the side of the slot's floor
 * and the one before him hauls him up over its end, the ones further in walking on with him.
 */
function trainStage(k: number, n: number): Phase {
  const o = order(n);
  const mover = o[k]!;
  const catcher = o[k - 1]!;
  const anchor = o[k + 1];
  const mi = roleIndex(mover, n);
  const ci = roleIndex(catcher, n);
  const last = anchor === undefined;
  const ahead = o.slice(0, k - 1);
  const catcherAtEnd = (w: CoopWorld) => {
    const b = w.bodies[ci]!;
    return b.grounded && b.cx > CATCH_X - 0.2;
  };
  const moverLeft = (w: CoopWorld) => !w.bodies[mi]!.grounded;
  const moverHangs = (w: CoopWorld) => !w.bodies[mi]!.grounded && w.bodies[mi]!.hanging;
  const toEnd = walk(CATCH_X, { tol: 0.15, jump: "never" });
  return {
    name: last ? `beat 1: the last one (${mover}) steps off and is hauled in` : `beat 1: ${anchor} lowers ${mover} into the slot`,
    do: {
      // Hold him, then haul him up the side of the slot's floor (last), or make way (the others).
      [catcher]: last ? seq(toEnd, when(moverHangs, walk(18, { jump: "never" }))) : seq(toEnd, when(moverLeft, walk(MAKE_ROOM, { tol: 0.15, jump: "never" }))),
      [mover]: when(catcherAtEnd, stepOffAndLean(EDGE_A, 1, SLOT_FLOOR_X - 0.6)),
      ...(anchor ? { [anchor]: lowerOnto(mover, { at: ANCHOR_A, edgeDir: 1, over: overSlot(mi), floor: ROOM, maxX: EDGE_A - 0.6 }) } : {}),
      ...Object.fromEntries(
        ahead.map((r, j) => [
          r,
          last
            ? when(moverLeft, walk(18 - 1.1 * (k - 1 - j), { tol: 0.3, jump: "never" }))
            : walk(MAKE_ROOM - 1.1 * (k - 1 - j), { tol: 0.2, jump: "never" }),
        ]),
      ),
      "*": idle(),
    },
    until: (w) => (last ? inRoom(w, mi) : onSlotFloor(w, mi)),
    timeout: 20,
  };
}

/** Beat 1: Ruben lowered into the slot, then the train. */
function beat1(n: number): Phase[] {
  const o = order(n);
  const phases: Phase[] = [
    {
      // Ruben walks off the lip; his neighbour holds him in the slot's mouth (the rope over the
      // lip's corner), Ruben leans in over the slot's floor, and his neighbour walks towards the
      // edge to set him down.
      name: "beat 1: lower Ruben into the slot",
      do: {
        R: stepOffAndLean(EDGE_A, 1, SLOT_FLOOR_X - 0.6),
        [o[1]!]: lowerOnto("R", { at: ANCHOR_A, edgeDir: 1, over: overSlot(n - 1), floor: ROOM, maxX: EDGE_A - 0.6 }),
        "*": idle(),
      },
      until: (w) => onSlotFloor(w, n - 1),
      timeout: 15,
    },
  ];
  for (let k = 1; k < n; k++) phases.push(trainStage(k, n));
  phases.push({
    name: "beat 1: everyone walks into the server room",
    do: Object.fromEntries(o.map((r, k) => [r, walk(20 - 1.1 * (n - 1 - k), { tol: 0.25, jump: "never" })])),
    until: (w) => w.bodies.every((_, i) => inRoom(w, i)),
    timeout: 10,
  });
  return phases;
}

/** The door phase: Ruben, who carries the key, opens it. */
function throughTheDoor(): Phase {
  return { name: "Ruben opens the door, everyone goes in", do: { "*": () => enter() }, until: cond.won, timeout: 30 };
}

export const solution: CoopSolution = (n) => {
  const o = order(n);
  const ruben = n - 1;
  const phases: Phase[] = beat1(n);
  if (n === 2) {
    phases.push(
      {
        name: "beat 2: Ruben goes to the edge, F0 stops 3 cells back",
        do: { R: walk(EDGE_B + 0.6, { jump: "never", tol: 0.15 }), F0: walk(ANCHOR_B2, { jump: "never", tol: 0.12 }) },
        until: cond.all(cond.near("R", EDGE_B + 0.6, 0.2), cond.near("F0", ANCHOR_B2, 0.15)),
        timeout: 15,
      },
      {
        // F0 holds the depth (« Stop ! Remonte un peu ! »): Ruben hangs at the key, just above the cables.
        name: "beat 2: F0 lowers Ruben to the key",
        do: { R: stepOff(EDGE_B, -1), F0: lowerTo("R", KEY_FEET_2, { at: ANCHOR_B2, edgeX: EDGE_B, edgeDir: -1 }) },
        until: (w) => w.props.keyCarrier === ruben,
        timeout: 15,
      },
      {
        name: "beat 2: F0 hauls Ruben back up",
        do: { F0: walk(16, { jump: "never" }), R: idle() },
        until: (w) => inRoom(w, ruben),
        timeout: 15,
      },
    );
  } else {
    const middle = o[1]!; // Ruben's neighbour
    const anchor = o[2]!;
    const behind = o.slice(3);
    const lineUp = {
      R: walk(EDGE_B + 0.5, { jump: "never", tol: 0.15 }),
      [middle]: walk(EDGE_B + 1.4, { jump: "never", tol: 0.15 }),
      [anchor]: walk(ANCHOR_B3, { jump: "never", tol: 0.12 }),
      ...Object.fromEntries(behind.map((r, k) => [r, walk(ANCHOR_B3 + 1.1 * (k + 1), { jump: "never", tol: 0.3 })])),
    };
    phases.push(
      {
        name: "beat 2: line up at shaft B",
        do: lineUp,
        until: cond.all(cond.near("R", EDGE_B + 0.5, 0.2), cond.near(middle, EDGE_B + 1.4, 0.2), cond.near(anchor, ANCHOR_B3, 0.15)),
        timeout: 15,
      },
      {
        // Ruben's neighbour, near the edge, lowers him a first rope length; the anchor waits behind.
        name: "beat 2: Ruben's neighbour lowers him",
        do: { ...lineUp, R: stepOff(EDGE_B, -1) },
        until: (w) => hangs(w, ruben, ROOM) && cond.near(anchor, ANCHOR_B3, 0.25)(w),
        timeout: 15,
      },
      {
        // The neighbour steps off too: the anchor holds them both (three units: he slides fast),
        // Ruben a rope below, at the key's depth; Ruben swings gently left until he touches it.
        name: "beat 2: the neighbour steps off, Ruben swings to the key",
        do: {
          [middle]: stepOff(EDGE_B, -1),
          [anchor]: lowerTo("R", KEY_FEET_3, { at: ANCHOR_B3, edgeX: EDGE_B, edgeDir: -1 }),
          R: when(
            (w) => !w.bodies[roleIndex(middle, n)]!.grounded && Math.abs(feetOf(w, ruben) - KEY_FEET_3) < 0.35,
            swingTo(2, { until: (w) => w.props.keyCarrier === ruben, max: SWING_MAX_X }),
          ),
        },
        until: (w) => w.props.keyCarrier === ruben,
        timeout: 20,
      },
      {
        name: "beat 2: the anchor hauls them back up",
        do: {
          [anchor]: walk(17, { jump: "never" }),
          ...Object.fromEntries(behind.map((r, k) => [r, walk(18 + 1.1 * k, { jump: "never" })])),
          [middle]: idle(),
          R: idle(),
        },
        until: (w) => inRoom(w, ruben) && inRoom(w, roleIndex(middle, n)),
        timeout: 25,
      },
    );
  }
  phases.push(throughTheDoor());
  return phases;
};

// --- Shortcuts that must fail ----------------------------------------------------------------
//
// Each one tries the forbidden move in its phase named "ATTEMPT"; if that phase ever succeeded,
// the rest of the intended solution would follow and finish the level.

/**
 * Leave the lip of shaft A going right, nobody holding: run off it (or, with `jumpAt`, jump when
 * that close to the edge, holding jump `hold` seconds), then lean into the slot (left) once `lean`
 * seconds in the air.
 */
function leaveAndLean(o: { jumpAt?: number; hold?: number; lean?: number } = {}): Goal {
  let air = -1;
  return {
    label: o.jumpAt === undefined ? "run off the lip and lean in" : "jump off the lip and lean in",
    step(c) {
      const b = c.w.bodies[c.i]!;
      if (!b.grounded && air < 0) air = c.t;
      if (air < 0) {
        if (o.jumpAt !== undefined && EDGE_A - b.x < o.jumpAt + 0.05) return BIT_RIGHT | BIT_JUMP | BIT_JUMP_PRESS;
        return BIT_RIGHT;
      }
      const since = (c.t - air) / 120;
      const jump = since < (o.hold ?? 0) ? BIT_JUMP : 0;
      return (since >= (o.lean ?? 0) ? BIT_LEFT : BIT_RIGHT) | jump;
    },
  };
}

/** Someone stands in the slot: then the train follows (if it was not Ruben, the next phases fail and show it). */
const someoneInTheSlot = (w: CoopWorld) => w.bodies.some((_, i) => onSlotFloor(w, i));

/**
 * Beat 1 with nobody holding: the whole team runs off the lip of shaft A together, leaning into
 * the slot as soon as it is in the air. Nobody can drift the cell sideways (the recess under the
 * lip) while falling past the slot's 3-row mouth: everyone falls out of the level.
 */
const allRunIntoShaftA: CoopSolution = (n) => [
  {
    name: "ATTEMPT: everyone runs off into shaft A at once, leaning into the slot",
    do: { "*": () => leaveAndLean() },
    until: someoneInTheSlot,
    timeout: 12,
  },
  ...solution(n).slice(1),
];

/**
 * The same with jumps, the way that worked before the low ceiling over the lip: Ruben jumps off the
 * edge, the friend behind him jumps right after and lands on his head, slides off it (nobody stands
 * on Ruben) with no fall speed of his own, and drifts into the slot; then he hauls Ruben in. The
 * cable duct's ceiling (one row above the raised floor over the last three cells and the shaft)
 * leaves no room for a jump there.
 */
const allJumpIntoShaftA: CoopSolution = (n) => [
  {
    name: "ATTEMPT: everyone jumps off into shaft A, lands on Ruben and slides into the slot",
    do: { "*": () => leaveAndLean({ jumpAt: 0.4, hold: 0.12, lean: 0.3 }) },
    until: someoneInTheSlot,
    timeout: 12,
  },
  ...solution(n).slice(1),
];

/**
 * Beat 1 without stopping at the right depth: Ruben steps off shaft A leaning into the slot, and
 * his neighbour, right behind him, follows him to the edge instead of holding him in the mouth.
 * Ruben drops below the slot's floor, against its side, and stays there (until someone walks back).
 */
const rushIntoTheSlot: CoopSolution = (n) => {
  const neighbour = order(n)[1]!;
  const ni = roleIndex(neighbour, n);
  return [
    {
      name: "Ruben at the lip, his neighbour right behind him",
      do: { R: walk(EDGE_A - 0.4, { jump: "never", tol: 0.1 }), [neighbour]: walk(EDGE_A - 1.25, { jump: "never", tol: 0.1 }) },
      until: cond.all(cond.near("R", EDGE_A - 0.4, 0.15), (w) => Math.abs(w.bodies[ni]!.cx - (EDGE_A - 1.25)) < 0.15),
      timeout: 8,
    },
    {
      name: "ATTEMPT: Ruben steps off leaning in, his neighbour follows him to the edge",
      do: {
        R: stepOffAndLean(EDGE_A, 1, SLOT_FLOOR_X - 0.6),
        [neighbour]: when((w) => !w.bodies[n - 1]!.grounded, walk(EDGE_A - 0.45, { jump: "never", tol: 0.1 })),
      },
      until: (w) => onSlotFloor(w, n - 1),
      timeout: 10,
    },
    ...solution(n).slice(1),
  ];
};

/**
 * Beat 2 without stopping at the right depth: the team gets into the server room the intended
 * way, then Ruben steps off shaft B with his neighbour standing right behind him at the edge.
 * With 2 players he takes the key and hangs on the stripped cables right under it; with 3 or more
 * one rope does not reach the deeper key.
 */
const dropAtTheKey: CoopSolution = (n) => {
  const neighbour = order(n)[1]!;
  return [
    ...beat1(n),
    {
      name: "Ruben at the edge of shaft B, his neighbour right behind him",
      do: { R: walk(EDGE_B + 0.25, { jump: "never", tol: 0.1 }), [neighbour]: walk(EDGE_B + 1.1, { jump: "never", tol: 0.12 }) },
      until: cond.all(cond.near("R", EDGE_B + 0.25, 0.15), cond.near(neighbour, EDGE_B + 1.1, 0.15)),
      timeout: 15,
    },
    {
      // His neighbour holds still until Ruben has the key, then walks away to haul him back up.
      name: "ATTEMPT: Ruben steps off at the key and is hauled back up",
      do: {
        R: stepOff(EDGE_B, -1),
        [neighbour]: seq(when(cond.keyTaken, idle()), walk(16, { jump: "never" })),
        "*": (i) => when(cond.keyTaken, walk(17 + i * 1.1, { jump: "never" })),
      },
      until: (w) => w.props.keyCarrier >= 0 && inRoom(w, n - 1),
      timeout: 15,
    },
    throughTheDoor(),
  ];
};

/**
 * The deep key (3+) on one rope: Ruben's neighbour holds at the very edge of shaft B (he walks back
 * whenever he is dragged), so Ruben hangs a single link, stretched to its stop, below the rim's
 * corner, and swings towards the key. One link reaches feet about 15.3: the key (from 16.23) stays
 * out of reach. With 2 players the same move takes Ruben onto the cables under the shallow key.
 */
const oneRopeToTheDeepKey: CoopSolution = (n) => {
  const neighbour = order(n)[1]!;
  return [
    ...beat1(n),
    {
      name: "Ruben at the edge of shaft B, his neighbour right behind him",
      do: { R: walk(EDGE_B + 0.25, { jump: "never", tol: 0.1 }), [neighbour]: walk(EDGE_B + 1.1, { jump: "never", tol: 0.12 }) },
      until: cond.all(cond.near("R", EDGE_B + 0.25, 0.15), cond.near(neighbour, EDGE_B + 1.1, 0.15)),
      timeout: 15,
    },
    {
      name: "ATTEMPT: Ruben steps off, his neighbour holds at the edge, Ruben swings to the key",
      do: {
        R: ((): Goal => {
          const off = stepOff(EDGE_B, -1);
          const swing = swingTo(2, { until: (w) => w.props.keyCarrier >= 0, max: SWING_MAX_X });
          return { label: "step off, then swing to the key", step: (c) => (c.w.bodies[c.i]!.grounded ? off.step(c) : swing.step(c)) };
        })(),
        [neighbour]: ((): Goal => {
          const atEdge = walk(EDGE_B + 1.0, { jump: "never", tol: 0.05 });
          const haul = walk(16, { jump: "never" });
          return { label: "hold at the edge, then haul", step: (c) => (cond.keyTaken(c.w) ? haul.step(c) : atEdge.step(c)) };
        })(),
        "*": (i) => when(cond.keyTaken, walk(17 + i * 1.1, { jump: "never" })),
      },
      until: (w) => w.props.keyCarrier >= 0 && inRoom(w, n - 1),
      timeout: 15,
    },
    throughTheDoor(),
  ];
};

/** The key from below: the team gets into the server room, then everyone drops into shaft B. */
const allDropIntoShaftB: CoopSolution = (n) => [
  ...beat1(n),
  {
    name: "ATTEMPT: everyone drops into shaft B to grab the key",
    do: { "*": () => walk(1.5, { jump: "never", drop: true }) },
    until: (w) => w.props.keyCarrier >= 0 && w.bodies.every((_, i) => inRoom(w, i)),
    timeout: 12,
  },
  throughTheDoor(),
];

export const shortcuts: Record<string, CoopSolution> = {
  "everyone runs off into shaft A at once (nobody holds)": allRunIntoShaftA,
  "everyone jumps off into shaft A (a friend rides Ruben's head into the slot)": allJumpIntoShaftA,
  "into the slot without stopping at the right depth": rushIntoTheSlot,
  "drop at the key without stopping at the right depth": dropAtTheKey,
  "the deep key on one rope (held at the edge, a swing)": oneRopeToTheDeepKey,
  "everyone drops into shaft B (the key from below)": allDropIntoShaftB,
};
