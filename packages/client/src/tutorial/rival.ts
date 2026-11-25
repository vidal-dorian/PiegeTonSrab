/**
 * The tutorial's scripted rival: a real CharacterController (same movement, same body, same
 * stomp and shove reactions as a player) driven by a tiny script instead of a keyboard, and
 * killed by the same hazard check as players (findKiller with HAZARD_INSET, like
 * LocalPlayer). So when it dies on the saw the player placed, it is the real rule at work,
 * not an animation: the lesson is truthful.
 */
import {
  CharacterController,
  findKiller,
  HAZARD_INSET,
  NO_INPUT,
  type Level,
  type MovementTuning,
  type PlacedObject,
  type StepInput,
} from "@game/shared";

/** idle: stands still (looking at `facing`). runLeft: runs left, never jumps. */
export type RivalMode = "idle" | "runLeft";

export interface RivalDeath {
  killer: PlacedObject | null;
  fell: boolean;
}

const RUN_LEFT: StepInput = { left: true, right: false, jumpHeld: false, jumpPressed: false };

export class ScriptedRival {
  readonly controller: CharacterController;
  mode: RivalMode = "idle";
  /** False until spawned, and after a death. Dead rivals are not simulated nor drawn. */
  alive = false;
  /** Body position one step ago, for interpolated drawing. */
  prevX = 0;
  prevY = 0;

  constructor(
    collision: Level,
    private tuning: MovementTuning,
  ) {
    this.controller = new CharacterController(collision, tuning);
  }

  setCollision(collision: Level): void {
    this.controller.replaceLevel(collision);
  }

  /** Appear standing in cell (cx, cy), still, looking towards `facing`. */
  spawn(cx: number, cy: number, facing: -1 | 1, mode: RivalMode = "idle"): void {
    const c = this.controller;
    c.standInCell(cx, cy);
    c.facing = facing;
    this.prevX = c.x;
    this.prevY = c.y;
    this.mode = mode;
    this.alive = true;
  }

  kill(): void {
    this.alive = false;
    this.mode = "idle";
  }

  /** One fixed simulation step at round time `t`. Returns the death if it died during it. */
  step(dt: number, objects: readonly PlacedObject[], t: number): RivalDeath | null {
    if (!this.alive) return null;
    const c = this.controller;
    this.prevX = c.x;
    this.prevY = c.y;
    c.step(dt, this.mode === "runLeft" ? RUN_LEFT : NO_INPUT);
    if (c.fellOut) {
      this.kill();
      return { killer: null, fell: true };
    }
    const m = this.tuning;
    const box = {
      x: c.x + HAZARD_INSET,
      y: c.y + HAZARD_INSET,
      w: m.bodyWidth - 2 * HAZARD_INSET,
      h: m.bodyHeight - 2 * HAZARD_INSET,
    };
    const killer = findKiller(objects, box, c.vy, t);
    if (killer) {
      this.kill();
      return { killer, fell: false };
    }
    return null;
  }

  /** Centre of the body, cells. */
  centre(): { x: number; y: number } {
    const c = this.controller;
    return { x: c.x + this.tuning.bodyWidth / 2, y: c.y + this.tuning.bodyHeight / 2 };
  }

  /** Position to draw at: `alpha` (0..1) of the way from the previous step to the current one. */
  renderPosition(alpha: number): { x: number; y: number } {
    const c = this.controller;
    return { x: this.prevX + (c.x - this.prevX) * alpha, y: this.prevY + (c.y - this.prevY) * alpha };
  }
}
