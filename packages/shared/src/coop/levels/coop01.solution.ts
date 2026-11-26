/**
 * Bot solution of coop01 "La Rentrée" (docs/coop-levels/coop01.md), and the shortcuts it closes.
 *
 * Chain: F0 .. F(n-2), then Ruben. At the muret the climber is Ruben's neighbour F(n-2): Ruben is
 * the base (nobody can carry him), the climber jumps from his head, walks on and hauls Ruben and
 * then the rest of the chain, each body hauled by a neighbour already on top who keeps walking.
 *
 * After a haul the team stands on top in the order it came up, so the later towers (the trench
 * rim, the pillar) pick their base and climber by position when the phase starts, like players
 * would: "toi devant, tu fais la base ; toi derrière, tu montes".
 */
import {
  cond,
  enter,
  seq,
  friends,
  idle,
  jumpTo,
  mount,
  roleOf,
  walk,
  when,
  type CoopSolution,
  type Goal,
  type Phase,
  type Role,
} from "../bots";
import { BIT_JUMP, BIT_JUMP_PRESS, BIT_LEFT, BIT_RIGHT } from "../inputBits";
import { COOP_DT } from "../coopTuning";
import type { CoopWorld } from "../world";

/** Muret: its face (the window) at x 26, top 10. Ruben lines up against it. */
const MURET_FOOT = 25.45;
const MURET_TOP = 10;
/** Middle floor x 26-36 (top 10); its rim (the trench's edge) at x 37. */
const MIDDLE_END = 35.6;
const RIM = 36.45;
/** Top floor x 39-50 (top 7), then the stairs down. */
const WALL_TOP = 7;
const TOP_LAND = 39.7;
const TOP_END = 49.6;
/** Stairs down (three slabs, x 51-59), then the B12 (floor top 19): the pillar at x 31 (top 16), the door at x 42. */
const STAIRS_FOOT = 61;
const B12_FEET = 18;
const PILLAR = 31.5;
const PILLAR_SIDE = 32.45;
const DOOR = 42.5;

/** Ruben's neighbour in the chain: the climber of the muret. */
function climberOf(n: number): Role {
  return friends(n)[n - 2]!;
}

/** Who builds the B12 tower (body indices), chosen by position when the phase starts. */
interface Tower {
  base: number;
  climber: number;
}

/** Holds once `seconds` have passed since it was first asked (a phase's settle time). */
function after(seconds: number, c: (w: CoopWorld) => boolean): (w: CoopWorld) => boolean {
  let since = -1;
  return (w) => {
    if (!c(w)) {
      since = -1;
      return false;
    }
    if (since < 0) since = w.tick;
    return (w.tick - since) * COOP_DT >= seconds;
  };
}

/** Bodies (not inside the door) sorted by x, front first in the given direction. */
function byX(w: CoopWorld, dir: 1 | -1): number[] {
  return w.bodies.map((_, i) => i).sort((a, b) => dir * (w.bodies[b]!.cx - w.bodies[a]!.cx) || a - b);
}

/** A goal decided on its first step from the world (all bots of a phase see the same world then). */
function decide(make: (w: CoopWorld, i: number) => Goal): Goal {
  let g: Goal | null = null;
  return {
    label: "decide",
    step(c) {
      g ??= make(c.w, c.i);
      return g.step(c);
    },
    done(c) {
      return g?.done?.(c) ?? false;
    },
  };
}

/** Walk right off the top floor and down the stairs into the B12, then back left to x. */
function dropTo(x: number): Goal {
  const down = walk(STAIRS_FOOT, { drop: true, jump: "never", tol: 0.4 });
  const there = walk(x, { jump: "never", tol: 0.25 });
  return {
    label: `drop into the B12, then walk ${x}`,
    step(c) {
      const b = c.w.bodies[c.i]!;
      return b.y + b.height > B12_FEET ? there.step(c) : down.step(c);
    },
    done(c) {
      const b = c.w.bodies[c.i]!;
      return b.y + b.height > B12_FEET && there.done!(c);
    },
  };
}

/** Jump again and again (a lone player trying a wall or the key), steering towards dir. */
function hopTowards(dir: 1 | -1): Goal {
  const period = Math.round(0.9 / COOP_DT);
  return {
    label: `hop ${dir > 0 ? "right" : "left"}`,
    step(c) {
      const k = c.t % period;
      return (k === 0 ? BIT_JUMP | BIT_JUMP_PRESS : k < 50 ? BIT_JUMP : 0) | (dir > 0 ? BIT_RIGHT : BIT_LEFT);
    },
  };
}

// --- The solution, beat by beat --------------------------------------------------------------

/** Beat 1, le couloir: walk to the muret, Ruben in front against the window. */
function corridor(n: number): Phase {
  const climber = climberOf(n);
  return {
    name: "le couloir: line up against the muret (the window)",
    do: { R: walk(MURET_FOOT), "*": (i) => walk(MURET_FOOT - (n - 1 - i) * 1.0, { jump: "never" }) },
    until: cond.all(cond.near("R", MURET_FOOT, 0.25), cond.near(climber, MURET_FOOT - 1, 0.3)),
  };
}

/** Everyone walks on towards x (bunching up), hauling whoever is still below; ends once all are up and still. */
function haul(name: string, top: number, x: number): Phase {
  return {
    name,
    do: { "*": () => walk(x, { jump: "never", tol: 0.3 }) },
    until: after(0.4, cond.allAbove(top)),
    timeout: 40,
  };
}

/** Beat 2, le muret de 3: the climber jumps from Ruben's head and hauls everyone up. */
function muret(n: number): Phase[] {
  const climber = climberOf(n);
  return [
    { name: "muret: the climber gets on Ruben", do: { [climber]: mount("R") }, until: cond.on(climber, "R") },
    { name: "muret: the climber jumps on top", do: { [climber]: jumpTo(28, { rise: 0.15 }) }, until: cond.standsAbove(climber, MURET_TOP) },
    haul("muret: « Tire ! » haul everyone up", MURET_TOP, MIDDLE_END),
  ];
}

/**
 * Beat 3, la tranchée. The tower stands on the rim with Ruben at its base, and the jumper's rope
 * must reach across: its neighbours in the chain have to be in the tower or huddled right behind
 * it (1.2 cells at most), or it is the end of the rope. The bots take the robust way: after the
 * muret the friends who came up first stand in front of Ruben: the one right
 * in front of him climbs on his head from the front, the next one on that friend's head, and Ruben
 * carries the pile to the rim (a rider moves with its base). At 2 players the pile is Ruben and
 * his friend; at 3 or more it is a 3-tower: Ruben, the jumper's other neighbour, the jumper. The top
 * jumps across onto the wall, everyone else falls into the trench and is hauled up its 6-high face.
 */
function trench(n: number): Phase[] {
  const R = n - 1;
  /** The tower, base first: Ruben, then the friends in front of him, nearest first. */
  const pile: number[] = [];
  const pick = (w: CoopWorld) => {
    if (pile.length > 0) return;
    const ord = byX(w, 1);
    const k = ord.indexOf(R);
    pile.push(R, ...ord.slice(0, k).reverse().slice(0, 2));
  };
  const standsOnBody = (w: CoopWorld, i: number, j: number) => {
    const s = w.bodies[i]!.support;
    return !!s && s.kind === "collider" && (s as { body?: number }).body === j;
  };
  const piled = (w: CoopWorld) => pile.length > 1 && pile.every((j, k) => k === 0 || standsOnBody(w, j, pile[k - 1]!));
  const top = () => pile[pile.length - 1]!;
  return [
    {
      name: "tranchée: the pile goes up on Ruben",
      do: {
        "*": () =>
          decide((w, i) => {
            pick(w);
            const k = pile.indexOf(i);
            if (k > 0) {
              // Step forward first so that the friend below has room to climb, then climb.
              const below = roleOf(pile[k - 1]!, n);
              const ready = k === 1 ? () => true : cond.on(below, roleOf(pile[k - 2]!, n));
              const room = walk(Math.min(w.bodies[R]!.cx + 1.05 * k, RIM + 0.1), { jump: "never", tol: 0.15 });
              return seq(room, when(ready, mount(below, { side: 1 })));
            }
            return idle();
          }),
      },
      until: after(0.3, piled),
    },
    {
      name: "tranchée: Ruben carries the pile to the rim",
      do: { "*": (i) => (pile.indexOf(i) > 0 ? idle() : walk(RIM, { jump: "never", tol: 0.25 })) },
      until: after(0.3, (w) => piled(w) && cond.near("R", RIM, 0.25)(w)),
    },
    {
      name: "tranchée: the top jumps across",
      do: { "*": (i) => (i === top() ? jumpTo(TOP_LAND, { rise: 0.1 }) : idle()) },
      until: (w) => {
        const b = w.bodies[top()]!;
        return b.grounded && b.y + b.height <= WALL_TOP + 1e-3;
      },
    },
    haul("tranchée: « Saute, je te remonte ! » haul everyone up", WALL_TOP, TOP_END),
  ];
}

/**
 * Beat 4, the B12. Everyone drops in and walks to the pillar; the tower stands right of it: the
 * friend nearest the pillar climbs on the body behind it, or, if Ruben is nearest, the next friend
 * climbs on Ruben. The climber jumps onto the pillar (the key), the others make way past the door,
 * the key opens it, everyone goes in.
 */
function b12(n: number, o: { lone?: boolean } = {}): Phase[] {
  const t: Tower = { base: -1, climber: -1 };
  const R = n - 1;
  const pick = (w: CoopWorld) => {
    if (t.base >= 0) return;
    const [first, second] = byX(w, -1) as [number, number];
    if (first === R) Object.assign(t, { base: R, climber: second });
    else Object.assign(t, { base: second, climber: first });
  };
  const phases: Phase[] = [
    {
      name: "B12: everyone drops in and walks to the pillar",
      do: { "*": () => dropTo(PILLAR_SIDE) },
      until: after(0.5, (w) => w.bodies.every((b) => b.y + b.height > B12_FEET && b.grounded && Math.abs(b.vx) < 0.3)),
      timeout: 25,
    },
  ];
  if (o.lone) {
    phases.push({
      name: "ATTEMPT: the friend nearest the pillar jumps at the key alone",
      do: { "*": () => decide((w, i) => (i === byX(w, -1).find((j) => j !== R) ? hopTowards(-1) : idle())) },
      until: cond.keyTaken,
      timeout: 12,
    });
    phases.push({ name: "everyone tries the door", do: { "*": () => enter() }, until: cond.won, timeout: 15 });
    return phases;
  }
  phases.push(
    {
      name: "B12: « Courte échelle ! » the climber gets on the base",
      do: {
        "*": () =>
          decide((w, i) => {
            pick(w);
            const baseRole = roleOf(t.base, n);
            const baseFirst = byX(w, -1)[0] === t.base;
            if (i === t.base) return walk(baseFirst ? PILLAR_SIDE : PILLAR_SIDE + 1, { jump: "never" });
            if (i === t.climber) return mount(baseRole, { side: baseFirst ? 1 : -1 });
            // The others step back to leave the climber room.
            const rest = byX(w, -1).filter((j) => j !== t.base && j !== t.climber);
            return walk(PILLAR_SIDE + 2.4 + 1.0 * rest.indexOf(i), { jump: "never" });
          }),
      },
      until: (w) => t.base >= 0 && cond.on(roleOf(t.climber, n), roleOf(t.base, n))(w),
    },
    {
      name: "B12: the climber jumps onto the pillar (the key)",
      do: { "*": (i) => (i === t.climber ? jumpTo(PILLAR, { rise: 0.12 }) : idle()) },
      until: cond.keyTaken,
    },
    {
      name: "B12: the others make way past the door",
      do: {
        "*": () =>
          decide((w, i) => {
            if (i === t.climber) return idle();
            const order = byX(w, -1).filter((j) => j !== t.climber);
            return walk(DOOR + 2.5 + 1.05 * order.indexOf(i), { jump: "never" });
          }),
      },
      until: (w) => w.bodies.every((b, i) => i === t.climber || b.cx > DOOR + 1.6),
    },
    { name: "B12: the key opens the door", do: { "*": (i) => (i === t.climber ? walk(DOOR, { tol: 0.4 }) : idle()) }, until: cond.doorOpen },
    { name: "everyone into the B12", do: { "*": () => enter() }, until: cond.won },
  );
  return phases;
}

export const solution: CoopSolution = (n) => [corridor(n), ...muret(n), ...trench(n), ...b12(n)];

// --- Shortcuts: attempts that must fail at every team size ------------------------------------

export const shortcuts: Record<string, CoopSolution> = {
  /**
   * Nobody hauls: the climber gets on top of the muret as intended, then stands still while
   * Ruben and the others keep jumping at the 3-high wall. Ruben can only be hauled.
   */
  "Ruben climbs the muret on his own": (n) => [
    corridor(n),
    ...muret(n).slice(0, 2),
    {
      name: "ATTEMPT: Ruben and the others jump at the muret, the climber waits on top",
      do: { [climberOf(n)]: idle(), "*": () => hopTowards(1) },
      until: cond.allAbove(MURET_TOP),
      timeout: 15,
    },
  ],
  /**
   * Ruben on top instead of at the base: at the muret, Ruben's neighbour stands against the wall
   * and Ruben tries to climb on its head and jump from there. Nobody can carry Ruben: he slides
   * off (squashing his friend) and the muret stays out of reach.
   */
  "Ruben on a friend's head": (n) => {
    const base = climberOf(n);
    return [
      corridor(n),
      {
        name: "ATTEMPT: Ruben climbs on his friend's head",
        do: { R: mount(base, { side: 1 }) },
        until: cond.on("R", base),
        timeout: 8,
      },
      { name: "ATTEMPT: Ruben jumps from his friend's head onto the muret", do: { R: jumpTo(28, { rise: 0.15 }) }, until: cond.standsAbove("R", MURET_TOP), timeout: 5 },
    ];
  },
  /**
   * No tower at the trench: the friend in front on the middle floor jumps at the far wall alone
   * (a jump from the rim, then hops against the face from inside the trench) while the others wait.
   * The wall top is exactly a lone jump's apex.
   */
  "jump the trench alone": (n) => [
    corridor(n),
    ...muret(n),
    {
      name: "everyone gathers close behind the rim (slack rope for the jumper)",
      do: { "*": () => walk(RIM, { jump: "never", tol: 0.3 }) },
      until: after(1.0, () => true),
      timeout: 5,
    },
    {
      name: "ATTEMPT: the friend in front jumps across the trench alone",
      do: { "*": () => decide((w, i) => (i === byX(w, 1).find((j) => j !== n - 1) ? walk(44) : idle())) },
      until: (w) => w.bodies.some((b) => b.grounded && b.y + b.height <= WALL_TOP + 1e-3),
      timeout: 15,
    },
  ],
  /**
   * The key without the 2-tower: in the B12, the friend nearest the pillar hops at the key alone
   * for 12 s, then everyone tries the door (closed without the key).
   */
  "grab the key alone": (n) => [corridor(n), ...muret(n), ...trench(n), ...b12(n, { lone: true })],
};
