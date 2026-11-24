/**
 * Ink stains left where players died. They stay for the rest of the game.
 */
import Phaser from "phaser";
import { CELL_PX } from "../config";

export class Stains {
  private g: Phaser.GameObjects.Graphics;
  private count = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(1);
  }

  /** Add a stain centred on (cx, cy), in cells. */
  add(cx: number, cy: number, color: number): void {
    const x = cx * CELL_PX;
    const y = cy * CELL_PX;
    this.count++;
    this.g.fillStyle(color, 0.55);
    this.g.fillCircle(x, y, CELL_PX * 0.45);
    // A few deterministic splashes around it, so stains don't all look identical.
    const seed = this.count * 97 + Math.floor(x + y);
    for (let i = 0; i < 5; i++) {
      const a = ((seed * (i + 3)) % 360) * (Math.PI / 180);
      const d = CELL_PX * (0.45 + ((seed * (i + 7)) % 30) / 100);
      this.g.fillCircle(x + Math.cos(a) * d, y + Math.sin(a) * d, CELL_PX * (0.08 + ((seed + i) % 5) / 50));
    }
  }
}
