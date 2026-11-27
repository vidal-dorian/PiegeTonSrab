/**
 * Bot solution of "Le Labo Réseau" (coop02.ts), at 2 to 5 players, and the shortcuts it closes.
 *
 * The team goes down in the order it stands: Ruben (who spawns on the right, nearest shaft A)
 * first, F0 last. Both beats put Ruben on the rope at every team size.
 *
 * Beat 1 (shaft A, right): Ruben goes to the lip, his neighbour in the chain stops about 3 cells
 * back, Ruben steps off and the rope swings him under the lip onto the slot's floor. Then the
 * others step off one by one, each lowered by the one behind it and caught by the one already in
 * the server room, who walks on to haul him in; F0, last, is caught from the mouth of the slot.
 * Beat 2 (shaft B, left): Ruben entered first, so he is nearest shaft B. With 2 players F0 stops
 * about 3 cells from the edge and Ruben steps off: he hangs against the wall at the key, one row
 * above the stripped cables. With 3 or more, Ruben's neighbour lowers him first, then steps off
 * too while the next one holds them both; Ruben hangs a rope deeper, swings a little towards the
 * key, and the anchor hauls the pair back up. Ruben, who carries his key, opens the door.
 *
 * The lowering and swinging goals are below (on the exported bot API), so other levels can copy them.
 */
import { cond, enter, friends, hold, idle, roleIndex, seq, walk, when, type CoopSolution, type Goal, type Phase, type Role } from "../bots";
import { BIT_LEFT, BIT_RIGHT } from "../inputBits";
import type { CoopWorld } from "../world";

// --- The level's numbers (cells) -----------------------------------------------------------

/** Feet of a body standing on the raised floor (top row of the lab). */
const PLATEAU = 6;
/** Feet of a body standing in the server room. */
const ROOM = 10;
/** Shaft A: the lip of the raised floor (its right edge); the slot's floor ends at x = 24. */
const EDGE_A = 25;
const SLOT_FLOOR_X = 24;
/** Shaft B: its near rim (the server room's floor starts at x = 4). */
const EDGE_B = 4;
/** Where beat 1's anchor stops: about 3.5 cells back from the lip (the slot takes Ruben from 21.0 to 21.8). */
const ANCHOR_A = 21.3;
/** Beat 2, 2 players: Ruben's feet against the wall at the key (touch from 12.23, cables from 13.1). */
const KEY_FEET_2 = 12.65;
/** Where that anchor stands (held still, the key is touched for 6.7-7.5; closer, the drop dips onto the cables). */
const ANCHOR_B2 = 7.2;
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

/** Body i is in the server room, standing or lifted a little by the rope (a friend at the edge above). */
function nearRoom(w: CoopWorld, i: number): boolean {
  const b = w.bodies[i]!;
  return !w.inside[i] && Math.abs(feetOf(w, i) - ROOM) < 0.35 && b.cx > EDGE_B && b.cx < SLOT_FLOOR_X;
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
      // Lower him only once he has settled: the rope gives a little when someone drops onto it,
      // and walking on while he still bounces down takes him deeper than asked.
      if (err > tol && room > 0.9 && Math.abs(h.vy) < 0.5) return toward;
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

/** The order the team goes down in: as it stands, Ruben (nearest shaft A) first, F0 last. */
function order(n: number): Role[] {
  return ["R", ...friends(n).reverse()];
}

/**
 * Where a body in the server room waits while the next one is lowered: as far in as the rope lets
 * the next one still reach the lip (4 cells higher), then it walks on as soon as he steps off.
 * The last one is caught from the mouth of the slot.
 */
const MAKE_ROOM = 23.1;
const AT_THE_MOUTH = 23.5;

/**
 * Beat 1, the train into the server room, the same move again for the body at place k of the
 * order (Ruben is already in): the next body on the raised floor stops at the anchor's place,
 * body k steps off, and the rope swings it into the slot; the body before it in the room keeps out
 * of its way. The last one (F0) has nobody behind him: he steps off and the body before him,
 * waiting at the mouth of the slot, catches him and walks on to haul him in.
 */
function trainIn(k: number, n: number): Goal {
  const idx = order(n).map((r) => roleIndex(r, n));
  const off = stepOff(EDGE_A, 1);
  const toEdge = walk(EDGE_A - 0.5, { jump: "never", tol: 0.1 });
  const toAnchor = walk(ANCHOR_A, { jump: "never", tol: 0.1 });
  const toMouth = walk(AT_THE_MOUTH, { jump: "never", tol: 0.15 });
  const makeRoom = walk(MAKE_ROOM, { jump: "never", tol: 0.2 });
  return {
    label: `train in (${k})`,
    step(c) {
      const w = c.w;
      const i = c.i;
      const last = k === n - 1;
      const at = (p: number) => idx[p]!;
      if (nearRoom(w, i)) {
        // Someone behind hangs below the slot: walk on (the one right before him hauls him in,
        // the ones ahead make way).
        for (let p = k + 1; p < n; p++) if (!nearRoom(w, at(p)) && !onPlateau(w, at(p))) return BIT_LEFT;
        if (k + 1 < n && onPlateau(w, at(k + 1))) return k + 1 === n - 1 ? toMouth.step(c) : makeRoom.step(c);
        return 0;
      }
      if (onPlateau(w, i)) {
        if (k > 0 && nearRoom(w, at(k - 1))) {
          // My turn: step off once the one behind me stands at the anchor's place (or, last, once
          // the one before me waits at the mouth).
          const prev = w.bodies[at(k - 1)]!;
          const ready = last ? prev.cx > AT_THE_MOUTH - 0.4 : Math.abs(w.bodies[at(k + 1)]!.cx - ANCHOR_A) < 0.3 && prev.cx < MAKE_ROOM + 0.5;
          return ready ? off.step(c) : toEdge.step(c);
        }
        // The one before me is next: I am his anchor.
        if (k > 0 && onPlateau(w, at(k - 1)) && (k === 1 || nearRoom(w, at(k - 2)))) return toAnchor.step(c);
        return 0;
      }
      // In the air or hanging: lean towards the slot (under the lip).
      return BIT_LEFT;
    },
    done: (c) => inRoom(c.w, c.i),
  };
}

/** Beat 1: Ruben lowered into the slot, then the train. */
function beat1(n: number): Phase[] {
  const o = order(n);
  return [
    {
      // Ruben walks off the lip; his neighbour stops about 3 cells back (and slides fast: Ruben
      // weighs two): the rope swings Ruben under the lip onto the slot's floor.
      name: "beat 1: lower Ruben into the slot",
      do: { R: stepOff(EDGE_A, 1), [o[1]!]: walk(ANCHOR_A, { jump: "never", tol: 0.1 }), "*": idle() },
      until: (w) => inRoom(w, n - 1),
      timeout: 15,
    },
    {
      name: "beat 1: the others step off one by one and are hauled in",
      do: Object.fromEntries(o.map((r, k) => [r, trainIn(k, n)])),
      until: (w) => w.bodies.every((_, i) => inRoom(w, i)),
      timeout: 20 + 6 * n,
    },
  ];
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
 * Beat 1 with nobody holding: the whole team walks off the lip of shaft A together, leaning
 * towards the slot, hoping to land in it on the way down. Nobody can drift a cell sideways
 * while falling past it: everyone falls to the bottom of the shaft.
 */
const allDropIntoShaftA: CoopSolution = (n) => [
  {
    name: "ATTEMPT: everyone drops into shaft A at once, leaning into the slot",
    do: { "*": () => seq(walk(27, { jump: "never", drop: true }), hold(-1)) },
    until: (w) => w.bodies.every((_, i) => inRoom(w, i)),
    timeout: 12,
  },
  ...solution(n).slice(2),
];

/**
 * Beat 1 without stopping at the right depth: Ruben steps off shaft A with his neighbour
 * standing right behind him at the lip, and leans into the slot. The rope catches him half a
 * cell below the slot's floor, against its wall: he never gets in.
 */
const dropIntoTheSlot: CoopSolution = (n) => {
  const neighbour = order(n)[1]!;
  return [
    {
      name: "Ruben at the lip, his neighbour right behind him",
      do: { R: walk(EDGE_A - 0.4, { jump: "never", tol: 0.1 }), [neighbour]: walk(EDGE_A - 1.3, { jump: "never", tol: 0.1 }) },
      timeout: 8,
    },
    {
      name: "ATTEMPT: Ruben steps off and leans into the slot",
      do: { R: seq(stepOff(EDGE_A, 1), hold(-1)), [neighbour]: walk(EDGE_A - 1.3, { jump: "never", tol: 0.1 }) },
      until: (w) => inRoom(w, n - 1),
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
  "everyone drops into shaft A at once (nobody holds)": allDropIntoShaftA,
  "drop into the slot without stopping at the right depth": dropIntoTheSlot,
  "drop at the key without stopping at the right depth": dropAtTheKey,
  "everyone drops into shaft B (the key from below)": allDropIntoShaftB,
};
