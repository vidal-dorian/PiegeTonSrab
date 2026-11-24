/**
 * Ink stains left where players died, in their colour, with a thin felt-pen edge so a white
 * stain still shows on the paper. They stay for the rest of the game.
 */
import Phaser from "phaser";
import { CELL_PX } from "../config";
import { INK } from "./levelView";

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
    // Deterministic pseudo-random numbers, so stains don't all look identical.
    let seed = (this.count * 9301 + Math.floor(x * 7 + y * 13)) % 233280;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const g = this.g;
    const r = CELL_PX * 0.42;
    // Main splat: a wobbly disc with a few bumps.
    const n = 22;
    const bumps = 3 + Math.floor(rand() * 3);
    const phase = rand() * Math.PI * 2;
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (0.82 + 0.22 * Math.sin(a * bumps + phase) + 0.12 * rand());
      pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9));
    }
    g.fillStyle(color, 0.9);
    g.fillPoints(pts, true);
    g.lineStyle(1.5, INK, 0.7);
    g.strokePoints(pts, true, true);
    // Droplets flung around it.
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2;
      const d = r * (1.15 + rand() * 0.7);
      const dr = CELL_PX * (0.05 + rand() * 0.06);
      const dx = x + Math.cos(a) * d;
      const dy = y + Math.sin(a) * d;
      g.fillStyle(color, 0.9);
      g.fillCircle(dx, dy, dr);
      g.lineStyle(1.2, INK, 0.7);
      g.strokeCircle(dx, dy, dr);
    }
    // One drip running down.
    const dripX = x + (rand() - 0.5) * r;
    const dripLen = r * (0.5 + rand() * 0.6);
    g.fillStyle(color, 0.9);
    g.fillRoundedRect(dripX - 2.5, y, 5, r * 0.6 + dripLen, 2.5);
    g.fillCircle(dripX, y + r * 0.6 + dripLen, 3.6);
  }
}
