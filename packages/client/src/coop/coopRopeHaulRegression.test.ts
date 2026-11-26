/**
 * Regression tests for hauling whole chains (after coopRopeChains.test.ts):
 * - a whole team is hauled up a 6-high ledge one by one, whoever is on top helping;
 * - a friend Ruben hangs from rises no faster than Ruben (a chain rises at the pace of what it lifts);
 * - a walker carrying a friend on its head cannot outrun the rope that friend holds.
 */
import { describe, expect, it } from "vitest";
import { BIT_LEFT, BIT_RIGHT, COOP, COOP_DT, CoopWorld, parseCoopLevel, sandboxLevel, type CoopPlayer } from "@game/shared/coop";

const H = 0.9;
/** Longest a link may get (4.5 plus what one step of a fall can add before the solve). */
const MAX_LINK = 4.85;

function team(n: number, rubenAt = -1): CoopPlayer[] {
  return Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isRuben: i === rubenAt }));
}

/** A room w x h with walls, a ceiling, floor rows from floorY, S at (2, floorY - 1); `solid` adds cells, `hole` removes them. */
function room(w: number, h: number, floorY: number, solid: (x: number, y: number) => boolean = () => false, hole: (x: number, y: number) => boolean = () => false): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = "";
    for (let x = 0; x < w; x++) r += !hole(x, y) && (y === 0 || x === 0 || x === w - 1 || y >= floorY || solid(x, y)) ? "#" : ".";
    rows.push(r);
  }
  rows[floorY - 1] = rows[floorY - 1]!.slice(0, 2) + "S" + rows[floorY - 1]!.slice(3);
  return rows;
}

function world(rows: string[], n: number, rubenAt = -1): CoopWorld {
  return new CoopWorld(parseCoopLevel({ id: "t", name: "t", rows }, n), team(n, rubenAt));
}

function longestLink(w: CoopWorld): number {
  return w.rope.reduce((m, l) => Math.max(m, l.length), 0);
}

describe("co-op rope: hauling a whole team", () => {
  // A 6-high ledge: floor y = 20, ledge from x = 20 with its top at y = 14.
  const ledge = room(60, 27, 20, (x, y) => x >= 20 && y >= 14);

  for (const n of [3, 4, 5]) {
    it(`${n} players, Ruben last: P0 on top hauls everyone up one by one, whoever is up walks on`, () => {
      const w = world(ledge, n, n - 1);
      w.placeBody(0, 21.5, 14 - H);
      w.placeBody(1, 19.1, 14 + 3.4);
      for (let i = 2; i < n; i++) w.placeBody(i, 16 - (i - 2) * 3.5, 20 - H);
      for (let s = 0; s < 60; s++) w.step(new Array<number>(n).fill(0));
      const up = new Array<boolean>(n).fill(false);
      up[0] = true;
      let worst = 0;
      let steps = 0;
      for (; steps < 120 * 20 && !up.every((u) => u); steps++) {
        w.step(up.map((u, i) => (u && w.bodies[i]!.x < 50 ? BIT_RIGHT : 0)));
        worst = Math.max(worst, longestLink(w));
        w.bodies.forEach((b, i) => {
          if (b.grounded && b.y + H <= 14 + 1e-6) up[i] = true;
        });
      }
      // Measured: everyone up after 3.7 s (3 players) to 10 s (5 players, Ruben hauled at 1.2 cells/s).
      expect(up, "everyone on top within 20 s").toEqual(new Array<boolean>(n).fill(true));
      expect(worst).toBeLessThanOrEqual(MAX_LINK);
      expect(w.dying).toBe(0);
    });
  }

  it("a friend Ruben hangs from rises no faster than Ruben", () => {
    // P0 stands at the edge of a deep pit (x 30-31); P1 hangs below it, Ruben (P2) below P1. P0 walks away.
    const w = world(
      room(60, 60, 20, () => false, (x, y) => y >= 20 && x >= 30 && x <= 31),
      3,
      2,
    );
    w.placeBody(0, 28.2, 20 - H);
    w.placeBody(1, 30.05, 20 - H + 4.0);
    w.placeBody(2, 30.05, 20 - H + 8.45);
    for (let s = 0; s < 120; s++) w.step([0, 0, 0]);
    expect(w.bodies[2]!.hanging, "Ruben hangs").toBe(true);
    let fastest = 0;
    let rose = 0;
    const y0 = w.bodies[1]!.y;
    for (let s = 0; s < 240; s++) {
      const y = w.bodies[1]!.y;
      w.step([BIT_LEFT, 0, 0]);
      fastest = Math.max(fastest, (y - w.bodies[1]!.y) / COOP_DT);
      expect(longestLink(w)).toBeLessThanOrEqual(MAX_LINK);
    }
    rose = y0 - w.bodies[1]!.y;
    expect(rose, "P1 is hauled up").toBeGreaterThan(1.5);
    expect(fastest).toBeLessThanOrEqual(COOP.riseCap.ruben + 0.05);
  });
});

describe("co-op rope: a pile cannot outrun the rope", () => {
  it("a walker carrying the friend who holds the rope is held back with it", () => {
    // Sandbox 3-wall: P0 at its foot, P1 standing on P2's head on top; P2 walks away.
    const w = new CoopWorld(parseCoopLevel(sandboxLevel, 3), team(3));
    w.placeBody(0, 14.2, 18 - H);
    w.placeBody(2, 16.4, 15 - H);
    w.placeBody(1, 16.4, 15 - 2 * H);
    for (const b of w.bodies) b.refreshContacts();
    let worst = 0;
    let up = -1;
    for (let s = 0; s < 360 && up < 0; s++) {
      w.step([0, 0, BIT_RIGHT]);
      worst = Math.max(worst, longestLink(w));
      const b = w.bodies[0]!;
      if (b.grounded && b.y + H <= 15 + 1e-6) up = s;
    }
    expect(worst).toBeLessThanOrEqual(MAX_LINK);
    expect(up, "P0 hauled up within 3 s").toBeGreaterThanOrEqual(0);
    expect(w.bodies[1]!.support, "P1 still on P2's head").toMatchObject({ kind: "collider", body: 2 });
  });
});
