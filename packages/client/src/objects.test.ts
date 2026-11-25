import { describe, expect, it } from "vitest";
import {
  boxHitsHazard,
  canPlaceAt,
  findKiller,
  hazardsOf,
  isSolidCell,
  testLevel,
  parseLevel,
  withSolidObjects,
  CharacterController,
  type Box,
  type PlacedObject,
} from "@game/shared";
import { cloneTuning, DEFAULT_TUNING, HAZARD_INSET, SIM_HZ } from "./config";

const saw: PlacedObject = { id: 1, kind: "saw", x: 5, y: 5 };
const spikes: PlacedObject = { id: 2, kind: "spikes", x: 5, y: 5 };

describe("objects", () => {
  it("saw kills on contact with its disc, not in the cell corners", () => {
    const [hz] = hazardsOf(saw, 0);
    expect(hz).toBeDefined();
    const centre: Box = { x: 5.3, y: 5.3, w: 0.4, h: 0.4 };
    const corner: Box = { x: 4.0, y: 4.0, w: 1.02, h: 1.02 }; // touches only the cell's top-left corner
    expect(boxHitsHazard(centre, hz!, 0)).toBe(true);
    expect(boxHitsHazard(corner, hz!, 0)).toBe(false);
  });

  it("spikes kill when landing or walking into them, not when jumping up through them", () => {
    const [hz] = hazardsOf(spikes, 0);
    const onSpikes: Box = { x: 5.1, y: 5.2, w: 0.8, h: 0.7 };
    expect(boxHitsHazard(onSpikes, hz!, 2)).toBe(true);
    expect(boxHitsHazard(onSpikes, hz!, 0)).toBe(true);
    expect(boxHitsHazard(onSpikes, hz!, -5)).toBe(false);
    const above: Box = { x: 5.1, y: 4.5, w: 0.8, h: 0.5 };
    expect(boxHitsHazard(above, hz!, 2)).toBe(false);
  });

  it("findKiller returns the object that killed", () => {
    const box: Box = { x: 5.3, y: 5.3, w: 0.4, h: 0.4 };
    expect(findKiller([saw], box, 0, 0)).toBe(saw);
    expect(findKiller([{ id: 3, kind: "platform", x: 5, y: 5 }], box, 0, 0)).toBeNull();
  });

  describe("findKiller when several hazards touch in the same step", () => {
    const sp = (id: number, x: number, ownerId?: string): PlacedObject => ({ id, kind: "spikes", x, y: 7, ...(ownerId ? { ownerId } : {}) });
    const body = (x: number): Box => ({ x: x + 0.1, y: 7.2, w: 0.6, h: 0.7 });
    const killer = (objs: PlacedObject[], x: number, prefs?: Parameters<typeof findKiller>[4]) =>
      findKiller(objs, body(x), 1, 0, prefs)?.id;

    it("a player's trap beats a map object, listed first or not", () => {
      expect(killer([sp(-1, 5), sp(3, 6, "A")], 5.6, { victimId: "B" })).toBe(3);
      expect(killer([sp(-1, 5), sp(3, 6, "A")], 5.6)).toBe(3);
    });

    it("another player's trap beats the victim's own", () => {
      expect(killer([sp(1, 8, "V"), sp(7, 9, "A")], 8.5, { victimId: "V" })).toBe(7);
    });

    it("between two players' traps, the one closest to the body's centre", () => {
      expect(killer([sp(2, 8, "B"), sp(7, 9, "A")], 8.75, { victimId: "X" })).toBe(7);
      expect(killer([sp(2, 8, "B"), sp(7, 9, "A")], 8.4, { victimId: "X" })).toBe(2);
      expect(killer([sp(7, 9, "A"), sp(2, 8, "B")], 8.25, { victimId: "X" })).toBe(2);
    });

    it("a trap of a recent pusher comes first", () => {
      expect(killer([sp(2, 8, "B"), sp(7, 9, "A")], 8.4, { victimId: "X", pusherIds: ["A"] })).toBe(7);
    });

    it("at the same distance, the newest object", () => {
      const a: PlacedObject = { id: 4, kind: "saw", x: 5, y: 5, ownerId: "A" };
      const b: PlacedObject = { id: 9, kind: "saw", x: 5, y: 5, ownerId: "B" };
      const box: Box = { x: 5.3, y: 5.3, w: 0.4, h: 0.4 };
      expect(findKiller([a, b], box, 0, 0)?.id).toBe(9);
      expect(findKiller([b, a], box, 0, 0)?.id).toBe(9);
    });

    it("a map hazard alone, or the victim's own trap alone, still kills", () => {
      expect(killer([sp(-1, 5)], 5.0, { victimId: "B" })).toBe(-1);
      expect(killer([sp(1, 5, "B")], 5.0, { victimId: "B" })).toBe(1);
    });
  });

  it("platforms become solid terrain, other objects do not", () => {
    const level = parseLevel(testLevel);
    const objects: PlacedObject[] = [
      { id: 1, kind: "platform", x: 5, y: 5 },
      { id: 2, kind: "saw", x: 6, y: 5 },
    ];
    const merged = withSolidObjects(level, objects);
    expect(isSolidCell(merged, 5, 5)).toBe(true);
    expect(isSolidCell(merged, 6, 5)).toBe(false);
    expect(isSolidCell(level, 5, 5)).toBe(false); // original untouched
  });

  it("placement refuses terrain, start, finish and occupied cells", () => {
    const level = parseLevel(testLevel);
    const objects: PlacedObject[] = [{ id: 1, kind: "saw", x: 5, y: 5 }];
    expect(canPlaceAt(level, objects, 6, 5)).toBe(true);
    expect(canPlaceAt(level, objects, 5, 5)).toBe(false);
    expect(canPlaceAt(level, objects, 3, 16)).toBe(false); // ground
    expect(canPlaceAt(level, objects, level.start.x, level.start.y)).toBe(false);
    expect(canPlaceAt(level, objects, level.finish!.x, level.finish!.y)).toBe(false);
    expect(canPlaceAt(level, objects, -1, 5)).toBe(false);
  });

  it("running under a saw at head height is safe", () => {
    const tuning = cloneTuning(DEFAULT_TUNING).movement;
    const def = {
      name: "saw corridor",
      rows: ["....................", "....................", "S...................", "####################"],
    };
    const level = parseLevel(def);
    // Saw in the cell just above the running character's cell.
    const objects: PlacedObject[] = [{ id: 1, kind: "saw", x: 8, y: 1 }];
    const c = new CharacterController(level, tuning);
    for (let i = 0; i < SIM_HZ * 3 && c.x < 14; i++) {
      c.step(1 / SIM_HZ, { left: false, right: true, jumpHeld: false, jumpPressed: false });
      const box = {
        x: c.x + HAZARD_INSET,
        y: c.y + HAZARD_INSET,
        w: tuning.bodyWidth - 2 * HAZARD_INSET,
        h: tuning.bodyHeight - 2 * HAZARD_INSET,
      };
      expect(findKiller(objects, box, c.vy, i / SIM_HZ)).toBeNull();
    }
    expect(c.grounded).toBe(true);
    expect(c.x).toBeGreaterThanOrEqual(14);
  });
});
