/**
 * Bot solution of "Le Labo Réseau" (coop02.ts), at 2 to 5 players, and the shortcuts it closes.
 *
 * Beat 1 (shaft A, left): F0 goes to the edge, its neighbour in the chain (Ruben with 2 players,
 * F1 with more) stops about 3 cells back, F0 steps off and the rope swings him under the lip onto
 * the slot's floor. Then the others step off one by one, in chain order, and whoever is already
 * in the server room walks on, hauling them in (Ruben last).
 * Beat 2 (shaft B, right): with 2 players Ruben stops about 2 cells from the edge and F0 steps
 * off: he hangs against the wall at the key, between the stripped cables. With 3 or more, F1
 * lowers F0 first, then steps off too while the third body of the chain holds them both; F0
 * hangs deeper, swings a little towards the key, and the anchor hauls the pair back up.
 * Then F0, who carries the key, opens the door and everyone goes in.
 *
 * The lowering and swinging goals are below (on the exported bot API), so other levels can copy them.
 */
import {
  cond,
  enter,
  friends,
  hold,
  idle,
  roleIndex,
  seq,
  walk,
  when,
  type CoopSolution,
  type Goal,
  type Phase,
  type Role,
} from "../bots";
import { BIT_LEFT, BIT_RIGHT } from "../inputBits";
import type { CoopWorld } from "../world";

// --- The level's numbers (cells) -----------------------------------------------------------

/** Feet of a body standing on the raised floor (top row of the lab). */
const PLATEAU = 6;
/** Feet of a body standing in the server room. */
const ROOM = 10;
/** Shaft A: the lip of the raised floor (its left edge); the slot's floor starts at x = 6. */
const EDGE_A = 5;
const SLOT_FLOOR_X = 6;
/** Shaft B: its near rim (the server room's floor ends at x = 26). */
const EDGE_B = 26;
/** Where beat 1's anchor stops: about 3 cells back from the lip (the slot takes him between 7.7 and 8.7). */
const ANCHOR_A = 8.1;
/** Beat 2, 2 players: F0's feet against the wall at the key (touch from 13.23, cables from 14.1). */
const KEY_FEET_2 = 13.7;
/** Where that anchor starts (feet 13.74 when F0 hangs from it). */
const ANCHOR_B2 = 23.9;
/** Beat 2, 3+ players: F0's feet one rope below F1 (the key one cell out from the wall: touch from 16.23 to 17.67; cables from 18.1). */
const KEY_FEET_3 = 17.15;
const ANCHOR_B3 = 22.75;
/** F0 swings right until he touches the key (one cell out from the wall), never past this x (far cables at 28.25). */
const SWING_MAX_X = 27.2;

// --- Helpers on the world --------------------------------------------------------------------

function body(w: CoopWorld, role: Role) {
  return w.bodies[roleIndex(role, w.bodies.length)]!;
}

function feetOf(w: CoopWorld, i: number): number {
  const b = w.bodies[i]!;
  return b.y + b.height;
}

/** Body i stands in the server room (between the slot and shaft B). */
function inRoom(w: CoopWorld, i: number): boolean {
  const b = w.bodies[i]!;
  return !w.inside[i] && b.grounded && Math.abs(feetOf(w, i) - ROOM) < 0.05 && b.cx > SLOT_FLOOR_X && b.cx < EDGE_B;
}

/** Body i is in the server room, standing or lifted a little by the rope (a friend at the edge above). */
function nearRoom(w: CoopWorld, i: number): boolean {
  const b = w.bodies[i]!;
  return !w.inside[i] && Math.abs(feetOf(w, i) - ROOM) < 0.35 && b.cx > SLOT_FLOOR_X && b.cx < EDGE_B;
}

/** Body i stands on the raised floor (beat 1's plateau). */
function onPlateau(w: CoopWorld, i: number): boolean {
  return w.bodies[i]!.grounded && Math.abs(feetOf(w, i) - PLATEAU) < 0.05;
}

/** Body i hangs on the rope (in the air, below where it stood). */
function hangs(w: CoopWorld, i: number, below: number): boolean {
  return !w.bodies[i]!.grounded && feetOf(w, i) > below + 0.5;
}

// --- Goals: lowering and swinging ------------------------------------------------------------

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
      if (err > tol && room > 0.9) return toward;
      if (err < -tol) return away;
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

// --- The solution ----------------------------------------------------------------------------

/** Chain order: F0, F1, ..., Ruben. */
function chain(n: number): Role[] {
  return [...friends(n), "R"];
}

/**
 * Where a body in the server room waits while the next one is lowered: as far in as the rope lets
 * the next one still reach the lip (4 cells higher), then it walks on as soon as he steps off.
 * The last one is caught from the mouth of the slot.
 */
const MAKE_ROOM = 6.9;
const AT_THE_MOUTH = 6.5;

/**
 * Beat 1, the train into the server room, the same move again for each body k of the chain
 * (F0 is already in): the next body on the raised floor stops at the anchor's place, body k steps
 * off, and the rope swings it into the slot; the body before it in the room keeps out of its way.
 * The last one (Ruben) has nobody behind him: he steps off and the body before him, waiting at the
 * mouth of the slot, catches him and walks on to haul him in.
 */
function trainIn(k: number, n: number): Goal {
  const off = stepOff(EDGE_A, -1);
  const toEdge = walk(EDGE_A + 0.5, { jump: "never", tol: 0.1 });
  const toAnchor = walk(ANCHOR_A, { jump: "never", tol: 0.1 });
  const toMouth = walk(AT_THE_MOUTH, { jump: "never", tol: 0.15 });
  const makeRoom = walk(MAKE_ROOM, { jump: "never", tol: 0.2 });
  return {
    label: `train in (${k})`,
    step(c) {
      const w = c.w;
      const i = c.i;
      const last = i === n - 1;
      if (nearRoom(w, i)) {
        // Someone behind hangs below the slot: walk on (the one right before him hauls him in,
        // the ones ahead make way).
        for (let j = i + 1; j < n; j++) if (!nearRoom(w, j) && !onPlateau(w, j)) return BIT_RIGHT;
        const next = i + 1;
        if (next < n && onPlateau(w, next)) return next === n - 1 ? toMouth.step(c) : makeRoom.step(c);
        return 0;
      }
      if (onPlateau(w, i)) {
        const prev = i - 1;
        if (prev >= 0 && nearRoom(w, prev)) {
          // My turn: step off once the one behind me stands at the anchor's place (or, last, once
          // the one before me waits at the mouth).
          const ready = last
            ? w.bodies[prev]!.cx < AT_THE_MOUTH + 0.4
            : Math.abs(w.bodies[i + 1]!.cx - ANCHOR_A) < 0.3 && w.bodies[prev]!.cx > MAKE_ROOM - 0.5;
          return ready ? off.step(c) : toEdge.step(c);
        }
        // The one before me is next: I am his anchor.
        if (prev >= 0 && onPlateau(w, prev) && (prev === 0 || nearRoom(w, prev - 1))) return toAnchor.step(c);
        return 0;
      }
      // In the air or hanging: lean towards the slot (under the lip).
      return BIT_RIGHT;
    },
    done: (c) => inRoom(c.w, c.i),
  };
}

export const solution: CoopSolution = (n) => {
  const roles = chain(n);
  const anchorA: Role = roles[1]!; // F0's neighbour: Ruben with 2 players, F1 with more
  const phases: Phase[] = [
    {
      // F0 walks off the lip; his neighbour stops about 3 cells back: the rope swings F0 under the
      // lip onto the slot's floor.
      name: "beat 1: lower F0 into the slot",
      do: {
        F0: stepOff(EDGE_A, -1),
        [anchorA]: walk(ANCHOR_A, { jump: "never", tol: 0.1 }),
        "*": idle(),
      },
      until: (w) => inRoom(w, 0),
      timeout: 15,
    },
    {
      name: "beat 1: the others step off one by one and are hauled in",
      do: Object.fromEntries(roles.map((r, k) => [r, trainIn(k, n)])),
      until: (w) => w.bodies.every((_, i) => inRoom(w, i)),
      timeout: 20 + 6 * n,
    },
  ];

  if (n === 2) {
    phases.push(
      {
        name: "beat 2: F0 goes to the edge, Ruben stops 2 cells back",
        do: { F0: walk(EDGE_B - 0.6, { jump: "never", tol: 0.15 }), R: walk(ANCHOR_B2, { jump: "never", tol: 0.12 }) },
        until: cond.all(cond.near("F0", EDGE_B - 0.6, 0.2), cond.near("R", ANCHOR_B2, 0.15)),
        timeout: 15,
      },
      {
        // Ruben stops about 2 cells from the edge and F0 steps off: he hangs at the key, between the cables.
        name: "beat 2: Ruben lowers F0 to the key",
        do: {
          F0: stepOff(EDGE_B, 1),
          R: lowerTo("F0", KEY_FEET_2, { at: ANCHOR_B2, edgeX: EDGE_B, edgeDir: 1 }),
        },
        until: (w) => w.props.keyCarrier === 0,
        timeout: 15,
      },
      {
        name: "beat 2: Ruben hauls F0 back up",
        do: { R: walk(15, { jump: "never" }), F0: idle() },
        until: (w) => inRoom(w, 0),
        timeout: 15,
      },
    );
  } else {
    const anchorB: Role = roles[2]!; // Ruben with 3 players, F2 with more
    const behind = roles.slice(3);
    phases.push(
      {
        name: "beat 2: line up at shaft B",
        do: {
          F0: walk(EDGE_B - 0.5, { jump: "never", tol: 0.15 }),
          F1: walk(EDGE_B - 1.4, { jump: "never", tol: 0.15 }),
          [anchorB]: walk(ANCHOR_B3, { jump: "never", tol: 0.12 }),
          ...Object.fromEntries(behind.map((r, k) => [r, walk(ANCHOR_B3 - 1.1 * (k + 1), { jump: "never", tol: 0.3 })])),
        },
        until: cond.all(cond.near("F0", EDGE_B - 0.5, 0.2), cond.near("F1", EDGE_B - 1.4, 0.2), cond.near(anchorB, ANCHOR_B3, 0.15)),
        timeout: 15,
      },
      {
        // F1 near the edge lowers F0 a first rope length; the anchor waits behind.
        name: "beat 2: F1 lowers F0",
        do: {
          F0: stepOff(EDGE_B, 1),
          F1: walk(EDGE_B - 1.4, { jump: "never", tol: 0.15 }),
          [anchorB]: walk(ANCHOR_B3, { jump: "never", tol: 0.15 }),
          ...Object.fromEntries(behind.map((r, k) => [r, walk(ANCHOR_B3 - 1.1 * (k + 1), { jump: "never", tol: 0.3 })])),
        },
        until: (w) => hangs(w, 0, ROOM) && cond.near(anchorB, ANCHOR_B3, 0.25)(w),
        timeout: 15,
      },
      {
        // F1 steps off too: the anchor holds them both, F0 a rope below F1, at the key's depth; F0
        // swings gently right until he touches it.
        name: "beat 2: F1 steps off, F0 swings to the key",
        do: {
          F1: stepOff(EDGE_B, 1),
          [anchorB]: lowerTo("F0", KEY_FEET_3, { at: ANCHOR_B3, edgeX: EDGE_B, edgeDir: 1 }),
          F0: when(
            (w) => !body(w, "F1").grounded && Math.abs(feetOf(w, 0) - KEY_FEET_3) < 0.35,
            swingTo(28, { until: (w) => w.props.keyCarrier === 0, max: SWING_MAX_X }),
          ),
        },
        until: (w) => w.props.keyCarrier === 0,
        timeout: 20,
      },
      {
        name: "beat 2: the anchor hauls F1 and F0 back up",
        do: {
          [anchorB]: walk(13, { jump: "never" }),
          ...Object.fromEntries(behind.map((r, k) => [r, walk(12 - 1.1 * k, { jump: "never" })])),
          F1: idle(),
          F0: idle(),
        },
        until: (w) => inRoom(w, 0) && inRoom(w, 1),
        timeout: 25,
      },
    );
  }

  phases.push({ name: "F0 opens the door, everyone goes in", do: { "*": () => enter() }, until: cond.won, timeout: 30 });
  return phases;
};

// --- Shortcuts that must fail ----------------------------------------------------------------
//
// Each one tries the forbidden move in its phase named "ATTEMPT"; if that phase ever succeeded,
// the rest of the intended solution would follow and finish the level.

/** The door phase, alone. */
function throughTheDoor(): Phase {
  return { name: "F0 opens the door, everyone goes in", do: { "*": () => enter() }, until: cond.won, timeout: 30 };
}

/**
 * Beat 1 with nobody holding: the whole team walks off the lip of shaft A together, leaning
 * towards the slot, hoping to land in it on the way down. Nobody can drift a cell sideways
 * while falling past it: everyone falls to the bottom of the shaft.
 */
const allDropIntoShaftA: CoopSolution = (n) => [
  {
    name: "ATTEMPT: everyone drops into shaft A at once, leaning into the slot",
    do: { "*": () => seq(walk(3, { jump: "never", drop: true }), hold(1)) },
    until: (w) => w.bodies.every((_, i) => inRoom(w, i)),
    timeout: 12,
  },
  ...solution(n).slice(2),
];

/**
 * Beat 1 without stopping at the right depth: F0 steps off shaft A with his neighbour standing
 * right behind him at the lip, and leans into the slot. The rope catches him half a cell below
 * the slot's floor, against its wall: he never gets in.
 */
const dropIntoTheSlot: CoopSolution = (n) => [
  {
    name: "F0 at the lip, his neighbour right behind him",
    do: {
      F0: walk(EDGE_A + 0.4, { jump: "never", tol: 0.1 }),
      [chain(n)[1]!]: walk(EDGE_A + 1.3, { jump: "never", tol: 0.1 }),
    },
    timeout: 8,
  },
  {
    name: "ATTEMPT: F0 steps off and leans into the slot",
    do: { F0: seq(stepOff(EDGE_A, -1), hold(1)), [chain(n)[1]!]: walk(EDGE_A + 1.3, { jump: "never", tol: 0.1 }) },
    until: (w) => inRoom(w, 0),
    timeout: 10,
  },
  ...solution(n).slice(1),
];

/**
 * Beat 2 without stopping at the right depth: the team gets into the server room the intended
 * way, then F0 steps off shaft B with his neighbour standing right behind him at the edge. With 2
 * players he hangs on the stripped cables under the key; with 3 or more one rope does not reach
 * the deeper key.
 */
const dropAtTheKey: CoopSolution = (n) => {
  const neighbour = chain(n)[1]!;
  return [
    ...solution(n).slice(0, 2),
    {
      name: "F0 at the edge of shaft B, his neighbour right behind him",
      do: { F0: walk(EDGE_B - 0.25, { jump: "never", tol: 0.1 }), [neighbour]: walk(EDGE_B - 1.1, { jump: "never", tol: 0.12 }) },
      until: cond.all(cond.near("F0", EDGE_B - 0.25, 0.15), cond.near(neighbour, EDGE_B - 1.1, 0.15)),
      timeout: 15,
    },
    {
      // His neighbour holds still until F0 has the key, then walks away to haul him back up.
      name: "ATTEMPT: F0 steps off at the key and is hauled back up",
      do: {
        F0: stepOff(EDGE_B, 1),
        [neighbour]: seq(
          when(cond.keyTaken, idle()),
          walk(14, { jump: "never" }),
        ),
        "*": (i) => when(cond.keyTaken, walk(13 - i * 1.1, { jump: "never" })),
      },
      until: (w) => w.props.keyCarrier >= 0 && inRoom(w, 0),
      timeout: 15,
    },
    throughTheDoor(),
  ];
};

/** The key from below: the team gets into the server room, then everyone drops into shaft B. */
const allDropIntoShaftB: CoopSolution = (n) => [
  ...solution(n).slice(0, 2),
  {
    name: "ATTEMPT: everyone drops into shaft B to grab the key",
    do: { "*": () => walk(28.5, { jump: "never", drop: true }) },
    until: (w) => w.props.keyCarrier >= 0 && w.bodies.every((_, i) => inRoom(w, i)),
    timeout: 12,
  },
  throughTheDoor(),
];

export const shortcuts: Record<string, CoopSolution> = {
  "everyone drops into shaft A at once (nobody holds)": allDropIntoShaftA,
  "drop into the slot without stopping at the right depth": dropIntoTheSlot,
  "drop at the key without stopping at the right depth": dropAtTheKey,
  "everyone drops into shaft B (the key from below)": allDropIntoShaftB,
};
