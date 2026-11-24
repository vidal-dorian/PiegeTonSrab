import { describe, expect, it } from "vitest";
import {
  boxHitsHazard,
  canPlaceAt,
  findKiller,
  hazardsOf,
  isSolidCell,
  level1,
  parseLevel,
  withSolidObjects,
  type Box,
  type PlacedObject,
} from "@game/shared";
import { CharacterController } from "./character/controller";
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

  it("platforms become solid terrain, other objects do not", () => {
    const level = parseLevel(level1);
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
    const level = parseLevel(level1);
    const objects: PlacedObject[] = [{ id: 1, kind: "saw", x: 5, y: 5 }];
    expect(canPlaceAt(level, objects, 6, 5)).toBe(true);
    expect(canPlaceAt(level, objects, 5, 5)).toBe(false);
    expect(canPlaceAt(level, objects, 3, 16)).toBe(false); // ground
    expect(canPlaceAt(level, objects, level.start.x, level.start.y)).toBe(false);
    expect(canPlaceAt(level, objects, level.finish!.x, level.finish!.y)).toBe(false);
    expect(canPlaceAt(level, objects, -1, 5)).toBe(false);
  });

  it("level 1: running under the head-height saw is safe", () => {
    const tuning = cloneTuning(DEFAULT_TUNING).movement;
    const level = parseLevel(level1);
    const collision = withSolidObjects(level, level.initialObjects);
    const c = new CharacterController(collision, tuning);
    c.x = 33;
    c.y = 16 - tuning.bodyHeight;
    for (let i = 0; i < SIM_HZ && c.x < 39; i++) {
      c.step(1 / SIM_HZ, { left: false, right: true, jumpHeld: false, jumpPressed: false });
      const box = {
        x: c.x + HAZARD_INSET,
        y: c.y + HAZARD_INSET,
        w: tuning.bodyWidth - 2 * HAZARD_INSET,
        h: tuning.bodyHeight - 2 * HAZARD_INSET,
      };
      expect(findKiller(level.initialObjects, box, c.vy, i / SIM_HZ)).toBeNull();
    }
    expect(c.x).toBeGreaterThanOrEqual(39);
  });
});
