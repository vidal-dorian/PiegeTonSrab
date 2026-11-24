/**
 * Drawing of the local character. Plain shapes; turns lighter while wall sliding,
 * squashes when stomped, shows a crown on the score leader and stars while stunned.
 */
import Phaser from "phaser";
import type { CharacterController } from "@game/shared";
import { CELL_PX } from "../config";
import { tuning } from "../tuningStore";

/** Player colours from the art direction: black, white, blue, green. Never orange or red. */
export const PLAYER_COLORS = [0x161616, 0xffffff, 0x2b59c3, 0x3fa35c] as const;

export class PlayerView {
  private rect: Phaser.GameObjects.Rectangle;
  private extras: Phaser.GameObjects.Graphics;
  private crown = false;
  private squashUntil = 0;

  constructor(
    private scene: Phaser.Scene,
    readonly color: number,
  ) {
    const m = tuning.movement;
    this.rect = scene.add
      .rectangle(0, 0, m.bodyWidth * CELL_PX, m.bodyHeight * CELL_PX, color)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x161616)
      .setDepth(4);
    this.extras = scene.add.graphics().setDepth(4);
  }

  applyTuning(): void {
    const m = tuning.movement;
    this.rect.setSize(m.bodyWidth * CELL_PX, m.bodyHeight * CELL_PX);
  }

  /** Wear the crown (leader of the game). */
  setCrown(on: boolean): void {
    this.crown = on;
  }

  /** Flattened for a moment (stomped on). */
  squash(): void {
    this.squashUntil = this.scene.time.now + 250;
  }

  /** Position in cells (top-left of the body). */
  update(x: number, y: number, c: CharacterController, visible: boolean): void {
    const m = tuning.movement;
    const squashed = this.scene.time.now < this.squashUntil;
    const h = m.bodyHeight * CELL_PX * (squashed ? 0.55 : 1);
    this.rect.setVisible(visible);
    this.rect.setSize(m.bodyWidth * CELL_PX, h);
    this.rect.setPosition(x * CELL_PX, (y + m.bodyHeight) * CELL_PX - h);
    this.rect.setAlpha(c.wallSliding ? 0.65 : 1);
    drawExtras(this.extras, visible, x, y, this.crown, c.stunTimer > 0, this.scene.time.now);
  }
}

/** Crown above the head and stars around it when stunned; shared with other players' views. */
export function drawExtras(
  g: Phaser.GameObjects.Graphics,
  visible: boolean,
  x: number,
  y: number,
  crown: boolean,
  stunned: boolean,
  nowMs: number,
): void {
  g.clear();
  if (!visible) return;
  const m = tuning.movement;
  const cx = (x + m.bodyWidth / 2) * CELL_PX;
  const top = y * CELL_PX;
  if (crown) {
    g.fillStyle(0xf07a2e, 1);
    g.lineStyle(2, 0x161616, 1);
    const pts = [
      [-10, -4],
      [-10, -16],
      [-5, -9],
      [0, -18],
      [5, -9],
      [10, -16],
      [10, -4],
    ].map(([dx, dy]) => new Phaser.Math.Vector2(cx + dx!, top + dy!));
    g.fillPoints(pts, true);
    g.strokePoints(pts, true);
  }
  if (stunned) {
    const a = nowMs / 180;
    g.fillStyle(0x161616, 1);
    for (let i = 0; i < 3; i++) {
      const k = a + (i * Math.PI * 2) / 3;
      g.fillCircle(cx + Math.cos(k) * 14, top - 6 + Math.sin(k) * 4, 3);
    }
  }
}
