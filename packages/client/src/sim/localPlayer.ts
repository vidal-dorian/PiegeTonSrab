/**
 * The character simulated on this machine: fixed-step loop, interpolation for rendering,
 * and death / finish detection after every step. Used by both the solo practice scene
 * and the round scene.
 */
import {
  CharacterController,
  findKiller,
  HAZARD_INSET,
  SIM_HZ,
  type Box,
  type Level,
  type MovementTuning,
  type PlacedObject,
  type StepInput,
} from "@game/shared";

export const STEP = 1 / SIM_HZ;

export type StepOutcome =
  | { kind: "died"; killer: PlacedObject | null; fell: boolean }
  | { kind: "finished"; time: number };

export class LocalPlayer {
  readonly controller: CharacterController;
  /** Simulated seconds since the last reset. Objects use it as the round clock. */
  time = 0;
  private accumulator = 0;
  private prevX = 0;
  private prevY = 0;

  constructor(
    private level: Level,
    collision: Level,
    private tuning: MovementTuning,
  ) {
    this.controller = new CharacterController(collision, tuning);
    this.reset();
  }

  /** Back to the start, clock at zero. */
  reset(): void {
    this.controller.respawn();
    this.prevX = this.controller.x;
    this.prevY = this.controller.y;
    this.accumulator = 0;
    this.time = 0;
  }

  setCollision(collision: Level): void {
    this.controller.replaceLevel(collision);
  }

  /**
   * Run as many fixed steps as `frameDt` allows. Stops at the first death or finish and returns it.
   * `onStep` runs after every step (used for the debug trail).
   */
  advance(
    frameDt: number,
    takeInput: () => StepInput,
    objects: readonly PlacedObject[],
    onStep?: () => void,
  ): StepOutcome | null {
    this.accumulator += frameDt;
    while (this.accumulator >= STEP) {
      this.prevX = this.controller.x;
      this.prevY = this.controller.y;
      this.controller.step(STEP, takeInput());
      this.time += STEP;
      this.accumulator -= STEP;
      onStep?.();
      const outcome = this.check(objects);
      if (outcome) {
        this.accumulator = 0;
        return outcome;
      }
    }
    return null;
  }

  /** Position to draw at, interpolated between the last two steps. */
  renderPosition(): { x: number; y: number } {
    const a = this.accumulator / STEP;
    const c = this.controller;
    return { x: this.prevX + (c.x - this.prevX) * a, y: this.prevY + (c.y - this.prevY) * a };
  }

  /** Round clock including the fraction of a step not simulated yet, for smooth object animation. */
  renderTime(): number {
    return this.time + this.accumulator;
  }

  /** Centre of the body, cells. */
  centre(): { x: number; y: number } {
    const c = this.controller;
    return { x: c.x + this.tuning.bodyWidth / 2, y: c.y + this.tuning.bodyHeight / 2 };
  }

  private check(objects: readonly PlacedObject[]): StepOutcome | null {
    const c = this.controller;
    const t = this.tuning;
    if (c.fellOut) return { kind: "died", killer: null, fell: true };
    const box: Box = {
      x: c.x + HAZARD_INSET,
      y: c.y + HAZARD_INSET,
      w: t.bodyWidth - 2 * HAZARD_INSET,
      h: t.bodyHeight - 2 * HAZARD_INSET,
    };
    const killer = findKiller(objects, box, c.vy, this.time);
    if (killer) return { kind: "died", killer, fell: false };
    const f = this.level.finish;
    if (f && c.x < f.x + 1 && c.x + t.bodyWidth > f.x && c.y < f.y + 1 && c.y + t.bodyHeight > f.y) {
      return { kind: "finished", time: this.time };
    }
    return null;
  }
}
