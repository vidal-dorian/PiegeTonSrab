/**
 * Drawing of a character: a plain rectangle until the art direction (build step 5).
 * Turns lighter while wall sliding, which helps when tuning.
 */
import Phaser from "phaser";
import type { CharacterController } from "@game/shared";
import { CELL_PX } from "../config";
import { tuning } from "../tuningStore";

/** Player colours from the art direction: black, white, blue, green. Never orange or red. */
export const PLAYER_COLORS = [0x161616, 0xffffff, 0x2b59c3, 0x3fa35c] as const;

export class PlayerView {
  private rect: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    readonly color: number,
  ) {
    const m = tuning.movement;
    this.rect = scene.add
      .rectangle(0, 0, m.bodyWidth * CELL_PX, m.bodyHeight * CELL_PX, color)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x161616)
      .setDepth(4);
  }

  applyTuning(): void {
    const m = tuning.movement;
    this.rect.setSize(m.bodyWidth * CELL_PX, m.bodyHeight * CELL_PX);
  }

  /** Position in cells (top-left of the body). */
  update(x: number, y: number, c: CharacterController, visible: boolean): void {
    this.rect.setVisible(visible);
    this.rect.setPosition(x * CELL_PX, y * CELL_PX);
    this.rect.setAlpha(c.wallSliding ? 0.65 : 1);
  }
}
