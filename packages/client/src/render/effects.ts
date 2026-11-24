/**
 * Short visual effects: the "POF" of a stomp, the puff of a bump. Purely local, never
 * part of the game state.
 */
import Phaser from "phaser";
import { CELL_PX } from "../config";

export class Effects {
  constructor(private scene: Phaser.Scene) {}

  /** A stomp at (x, y), cells: a burst and a word. */
  pof(x: number, y: number, word = "POF !"): void {
    const px = x * CELL_PX;
    const py = y * CELL_PX;
    const ring = this.scene.add.graphics().setDepth(6);
    ring.lineStyle(3, 0x161616, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ring.lineBetween(Math.cos(a) * 10, Math.sin(a) * 10, Math.cos(a) * 20, Math.sin(a) * 20);
    }
    ring.setPosition(px, py);
    this.scene.tweens.add({ targets: ring, scale: 1.8, alpha: 0, duration: 320, onComplete: () => ring.destroy() });
    const text = this.scene.add
      .text(px, py - 18, word, { fontFamily: "sans-serif", fontSize: "20px", fontStyle: "bold", color: "#161616" })
      .setOrigin(0.5, 1)
      .setDepth(6);
    this.scene.tweens.add({ targets: text, y: py - 44, alpha: 0, duration: 650, onComplete: () => text.destroy() });
  }

  /** A sideways bump at (x, y), cells. */
  puff(x: number, y: number): void {
    const g = this.scene.add.graphics().setDepth(6).setPosition(x * CELL_PX, y * CELL_PX);
    g.fillStyle(0xdcd8cc, 1);
    g.fillCircle(-6, 0, 6);
    g.fillCircle(6, -3, 5);
    g.fillCircle(0, 5, 4);
    this.scene.tweens.add({ targets: g, scale: 1.6, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }
}
