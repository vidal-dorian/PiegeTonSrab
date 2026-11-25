/**
 * Short visual effects: the "POF !" of a stomp, the puff of a bump. Comic-book bursts in
 * felt pen with a handwritten word. Purely local, never part of the game state.
 */
import Phaser from "phaser";
import { CELL_PX } from "../config";
import { FONT_MARKER, INK, INK_CSS, WHITE } from "./levelView";

export class Effects {
  constructor(private scene: Phaser.Scene) {}

  /** A stomp at (x, y), cells: a burst and a word. */
  pof(x: number, y: number, word = "POF !"): void {
    const px = x * CELL_PX;
    const py = y * CELL_PX;
    const burst = this.scene.add.graphics().setDepth(6).setPosition(px, py);
    // Jagged white star with an ink edge, and speed lines around it.
    const spikes = 9;
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2 + 0.2;
      const r = i % 2 === 0 ? 15 : 8;
      pts.push(new Phaser.Math.Vector2(Math.cos(a) * r, Math.sin(a) * r * 0.8));
    }
    burst.fillStyle(WHITE, 1);
    burst.fillPoints(pts, true);
    burst.lineStyle(2, INK, 1);
    burst.strokePoints(pts, true, true);
    burst.lineStyle(2.5, INK, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      burst.lineBetween(Math.cos(a) * 19, Math.sin(a) * 16, Math.cos(a) * 27, Math.sin(a) * 22);
    }
    burst.setScale(0.5);
    this.scene.tweens.add({ targets: burst, scale: 1.7, alpha: 0, duration: 380, ease: "Cubic.easeOut", onComplete: () => burst.destroy() });

    const text = this.scene.add
      .text(px, py - 16, word, {
        fontFamily: FONT_MARKER,
        fontSize: "24px",
        color: INK_CSS,
        stroke: "#ffffff",
        strokeThickness: 6,
      })
      .setOrigin(0.5, 1)
      .setDepth(6)
      .setRotation(-0.12)
      .setScale(0.4);
    this.scene.tweens.add({ targets: text, scale: 1, duration: 120, ease: "Back.easeOut" });
    this.scene.tweens.add({
      targets: text,
      y: py - 46,
      alpha: 0,
      delay: 250,
      duration: 500,
      ease: "Quad.easeIn",
      onComplete: () => text.destroy(),
    });
  }

  /** A sideways bump at (x, y), cells. */
  puff(x: number, y: number): void {
    const g = this.scene.add.graphics().setDepth(6).setPosition(x * CELL_PX, y * CELL_PX);
    for (const [cx, cy, r] of [
      [-7, 1, 6],
      [6, -3, 5],
      [1, 6, 4],
    ] as const) {
      g.fillStyle(WHITE, 1);
      g.fillCircle(cx, cy, r);
      g.lineStyle(2, INK, 1);
      g.strokeCircle(cx, cy, r);
    }
    this.scene.tweens.add({ targets: g, scale: 1.7, alpha: 0, duration: 280, ease: "Cubic.easeOut", onComplete: () => g.destroy() });
  }
}
