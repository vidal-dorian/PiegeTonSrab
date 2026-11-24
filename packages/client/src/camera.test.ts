import { describe, expect, it } from "vitest";
import { parseLevel, testLevel } from "@game/shared";
import { CharacterController } from "@game/shared";
import { FollowCamera } from "./camera";
import { cloneTuning, DEFAULT_TUNING, SIM_HZ, VIEW_CELLS_X, VIEW_CELLS_Y } from "./config";

const DT = 1 / SIM_HZ;

describe("FollowCamera", () => {
  it("stays horizontally still while wall-jumping up the shaft", () => {
    const tuning = cloneTuning(DEFAULT_TUNING);
    const level = parseLevel(testLevel);
    const c = new CharacterController(level, tuning.movement);
    const cam = new FollowCamera(tuning.camera, VIEW_CELLS_X, VIEW_CELLS_Y, level.width, level.height);
    const target = () => ({
      cx: c.x + tuning.movement.bodyWidth / 2,
      cy: c.y + tuning.movement.bodyHeight / 2,
      vx: c.vx,
      grounded: c.grounded,
      facing: c.facing,
    });

    // Start inside the shaft and let the camera settle.
    c.x = 44;
    c.y = 16 - tuning.movement.bodyHeight;
    cam.snapTo(target());
    for (let i = 0; i < SIM_HZ; i++) cam.update(DT, target());

    let dir: -1 | 1 = 1;
    let minCamX = Infinity;
    let maxCamX = -Infinity;
    let wallJumps = 0;
    c.step(DT, { left: false, right: true, jumpHeld: true, jumpPressed: true });
    for (let i = 0; i < SIM_HZ * 8 && c.y > 4; i++) {
      const press = !c.grounded && c.wallSide !== 0;
      if (press) {
        dir = c.wallSide === 1 ? -1 : 1;
        wallJumps++;
      }
      c.step(DT, { left: dir === -1, right: dir === 1, jumpHeld: true, jumpPressed: press });
      cam.update(DT, target());
      minCamX = Math.min(minCamX, cam.x);
      maxCamX = Math.max(maxCamX, cam.x);
    }

    expect(wallJumps).toBeGreaterThanOrEqual(3);
    expect(maxCamX - minCamX).toBeLessThan(0.05);
  });
});
