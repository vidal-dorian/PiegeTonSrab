/**
 * La BU (coop07): the timed hits forgive a hitter who presses a little early or reacts to the jump,
 * and the mistakes of the climb and of the role swap neither kill nor drag the room's hitter out.
 *
 * - The climb's next shelf never appears on a head (`spareHeads`): a hit up to the coyote time
 *   (0.1 s) before the climber's jump still lands him on it, and so does a hit up to about 0.4 s
 *   after it (the sign: « 3, 2, 1, saute ! » puis frappe). Much earlier or much later fails: the
 *   hit stays timed.
 * - The reading room's switch h hangs at x 24: whoever hits it stands clear of the mouth m (x 26),
 *   so m always shuts behind the hit, and a climber who then walks off the alcove's floor hangs
 *   there while the idle hitter stays in the room. A body in the mouth cannot reach h.
 * - The reading room is 4 cells deep (the turnstile o) until the whole team stood on its mat: too
 *   short to haul a climber from L2 up to the mouth. Without the turnstile the haul (then a hit at
 *   leisure) gets the climber in at 4-5 players: the turnstile is what closes it.
 * - The stack stands over a dip one under the rim, not a pit: Ruben walking off the rim's end, or
 *   F0 dropped by a hit too early, stands in it, idle, with nobody dying.
 */
import { describe, expect, it } from "vitest";
import { COOP_LEVELS } from "@game/shared/coop";
import { roleIndex, runSolution, walk, type Goal, type Phase, type Role } from "@game/shared/coop/bots";
import { BIT_JUMP, BIT_JUMP_PRESS } from "@game/shared/coop";
import { hop, shortcuts, solution } from "../../../shared/src/coop/levels/coop07.solution";
import type { CoopWorld } from "@game/shared/coop";

const coop07 = COOP_LEVELS.find((l) => l.id === "coop07")!;
const STEP = 1 / 120;

/** The solution's phases before the `occurrence`-th one whose name contains `name`. */
function upTo(n: number, name: string, occurrence = 1): Phase[] {
  const ps = solution(n);
  let seen = 0;
  for (let i = 0; i < ps.length; i++) if (ps[i]!.name.includes(name) && ++seen === occurrence) return ps.slice(0, i);
  throw new Error(`no phase "${name}"`);
}

function timer(s: number): (w: CoopWorld) => boolean {
  let t0 = -1;
  return (w) => {
    if (t0 < 0) t0 = w.tick;
    return w.tick - t0 >= Math.round(s / STEP);
  };
}

const idle = (s: number): Phase => ({ name: `idle ${s} s`, do: {}, until: timer(s), timeout: s + 1 });
const end: Phase = { name: "end", do: {}, until: () => true, timeout: 1 };
const reachedEnd = (failure: string | undefined) => failure === undefined || failure.startsWith("every phase ended");
const feet = (w: CoopWorld, r: Role) => {
  const b = w.bodies[roleIndex(r, w.bodies.length)]!;
  return b.y + b.height;
};

/** Press jump on step k of the phase (and hold it for `hold` steps). */
function pressAt(k: number, hold: number): Goal {
  return { label: `press at ${k}`, step: (c) => (c.t === k ? BIT_JUMP | BIT_JUMP_PRESS : c.t > k && c.t < k + hold ? BIT_JUMP : 0) };
}

const HITS: Array<{ label: string; phase: string; occurrence: number; climber: (n: number) => Role; hitter: (n: number) => Role; top: number }> = [
  { label: "L1 -> L2", phase: "« 3, 2, 1, saute ! »: F0 jumps", occurrence: 1, climber: () => "F0", hitter: () => "R", top: 7 },
  { label: "L2 -> L3", phase: "« saute ! »: F0 jumps", occurrence: 1, climber: () => "F0", hitter: () => "R", top: 5 },
  { label: "the swap's first round", phase: "« 3, 2, 1, saute ! »", occurrence: 2, climber: (n) => (n === 2 ? "R" : "F1"), hitter: () => "F0", top: 5 },
];

/** The climb with the hitter pressing `d` steps after the climber (before him if negative): does the climber land on the next shelf? */
function lands(n: number, hit: (typeof HITS)[number], d: number): boolean {
  const climber = hit.climber(n);
  const i = roleIndex(climber, n);
  const r = runSolution(coop07, n, () => [
    ...upTo(n, hit.phase, hit.occurrence),
    {
      name: "timed",
      do: { [climber]: pressAt(Math.max(0, -d), 50), [hit.hitter(n)]: pressAt(Math.max(0, d), 3) },
      until: (w) => w.tick > 0 && w.bodies[i]!.grounded && Math.abs(feet(w, climber) - hit.top) < 1e-3,
      timeout: 3,
    },
    end,
  ]);
  return reachedEnd(r.failure);
}

describe("coop07 La BU: the timed hits", () => {
  for (const hit of HITS) {
    it(`${hit.label}: lands from 0.1 s early to 0.375 s late at 2-5 players, not at 0.2 s early nor 0.67 s late`, () => {
      for (const n of [2, 3, 4, 5]) {
        for (const d of [-12, -6, 0, 12, 24, 36, 45]) expect(lands(n, hit, d), `${n} players, hitter ${(d * STEP).toFixed(3)} s after`).toBe(true);
        for (const d of [-24, 80]) expect(lands(n, hit, d), `${n} players, hitter ${(d * STEP).toFixed(3)} s after`).toBe(false);
      }
    }, 60_000);
  }
});

describe("coop07 La BU: the reading room's hitter stays in the room", () => {
  const mouthShut = (w: CoopWorld) => w.props.shelves.find((s) => s.thing.char === "m")!.solid;

  it("from anywhere under h the hit shuts the mouth; the climber walking off the alcove's floor then hangs, and the idle hitter stays in", () => {
    for (const n of [2, 3, 4, 5]) {
      const climber: Role = n === 2 ? "R" : "F1";
      for (const x of [23.65, 24.4, 25.15, 25.35]) {
        let shutAtHit = false;
        const r = runSolution(coop07, n, () => [
          ...upTo(n, "F0 hits h"),
          { name: `F0 to ${x}`, do: { F0: walk(x, { jump: "never", tol: 0.03 }) }, until: (w) => Math.abs(w.bodies[0]!.cx - x) < 0.05 && w.bodies[0]!.grounded, timeout: 4 },
          { name: "F0 hits h", do: { F0: hop() }, until: (w) => w.props.active === "A" && (shutAtHit = mouthShut(w)), timeout: 3 },
          { name: "MISTAKE: the climber walks off the alcove's floor", do: { [climber]: walk(28.4, { jump: "never" }) }, until: timer(1.5), timeout: 3 },
          idle(25),
          end,
        ]);
        const label = `${n} players, hitter at ${x}`;
        expect(reachedEnd(r.failure), `${label}: ${r.failure}`).toBe(true);
        expect(shutAtHit, label).toBe(true);
        expect(r.deaths, label).toBe(0);
        const f0 = r.world.bodies[0]!;
        expect(f0.grounded && Math.abs(f0.y + f0.height - 5) < 1e-3 && f0.cx + 0.4 <= 26 + 1e-3, `${label}: F0 at (${f0.cx.toFixed(2)}, ${(f0.y + f0.height).toFixed(2)})`).toBe(true);
        expect(mouthShut(r.world), label).toBe(true);
      }
    }
  });

  it("a body in the mouth (or with a foot in it) cannot hit h", () => {
    for (const n of [2, 5]) {
      for (const x of [25.5, 26.1]) {
        const r = runSolution(coop07, n, () => [
          ...upTo(n, "F0 hits h"),
          { name: `F0 to ${x}`, do: { F0: walk(x, { jump: "never", tol: 0.03 }) }, until: (w) => Math.abs(w.bodies[0]!.cx - x) < 0.05 && w.bodies[0]!.grounded, timeout: 4 },
          { name: "F0 jumps", do: { F0: hop() }, until: timer(1), timeout: 2 },
          end,
        ]);
        expect(reachedEnd(r.failure), `${n} players at ${x}: ${r.failure}`).toBe(true);
        expect(r.world.props.active, `${n} players at ${x}`).toBe("B");
      }
    }
  });
});

describe("coop07 La BU: the turnstile", () => {
  it("without it, the haul from L2 then a hit whenever gets the climber in at 4-5 players (with it, the shortcut fails: coopLevels.test.ts)", () => {
    const open = { ...coop07, rows: coop07.rows.map((r) => r.replace(/o/g, ".").replace(/t/g, "#")) };
    for (const n of [4, 5]) {
      let inAttempt = false;
      let past = false;
      const r = runSolution(open, n, shortcuts["a haul from L2, then a hit whenever"]!, {
        every: 1,
        trace: (_w, phase) => {
          if (phase.startsWith("ATTEMPT")) inAttempt = true;
          else if (inAttempt) past = true;
        },
      });
      expect(past, `${n} players: the climber got in (${r.failure})`).toBe(true);
      expect(r.deaths, `${n} players`).toBe(0);
    }
  });
});

describe("coop07 La BU: falls in the climb land in the dip, alive", () => {
  it("Ruben walking off the rim's end stands in the dip, and an idle team stays alive", () => {
    for (const n of [2, 3, 4, 5]) {
      const r = runSolution(coop07, n, () => [
        ...upTo(n, "2. R jumps onto L1"),
        { name: "MISTAKE: Ruben walks off the rim's end", do: { R: walk(29.4, { jump: "never" }) }, until: timer(2), timeout: 3 },
        idle(30),
        end,
      ]);
      expect(reachedEnd(r.failure), `${n} players: ${r.failure}`).toBe(true);
      expect(r.deaths, `${n} players`).toBe(0);
      expect(feet(r.world, "R"), `${n} players`).toBeCloseTo(12, 3);
    }
  });

  it("a first hit before F0 jumps drops him into the dip; an idle team stays alive", () => {
    for (const n of [2, 3, 4, 5]) {
      const r = runSolution(coop07, n, () => [
        ...upTo(n, "« 3, 2, 1, saute ! »: F0 jumps"),
        { name: "MISTAKE: Ruben hits before F0 jumps", do: { R: hop() }, until: (w) => w.props.active === "A", timeout: 3 },
        idle(30),
        end,
      ]);
      expect(reachedEnd(r.failure), `${n} players: ${r.failure}`).toBe(true);
      expect(r.deaths, `${n} players`).toBe(0);
      expect(r.world.bodies[0]!.grounded, `${n} players`).toBe(true);
      expect(feet(r.world, "F0"), `${n} players`).toBeCloseTo(12, 3);
    }
  });
});
