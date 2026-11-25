/**
 * The rope between the players, drawn in felt pen: it sags when slack and goes straight when taut.
 * Near its full length it turns orange (and a little thicker), so players learn how far they can go
 * before they feel the pull.
 */
import Phaser from "phaser";
import { CELL_PX } from "../../config";
import { INK, ORANGE } from "../../render/levelView";

const DEPTH = 2.8;
const POINTS = 18;
/** Within this much of its full length the rope shows its tension, cells. */
const TENSION_ZONE = 0.35;

export interface RopeSegment {
  /** End points, cells. */
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export class RopeView {
  private g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private length: number,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH);
  }

  draw(segments: readonly RopeSegment[]): void {
    const g = this.g;
    g.clear();
    for (const s of segments) {
      const dx = s.bx - s.ax;
      const dy = s.by - s.ay;
      const d = Math.sqrt(dx * dx + dy * dy);
      const slack = Math.max(0, this.length - d);
      // A hanging rope sags roughly by half the slack it could take up (a shallow catenary).
      const sag = Math.min(2.2, 0.55 * Math.sqrt(Math.max(0, this.length * this.length - d * d)) * 0.5);
      const mx = (s.ax + s.bx) / 2;
      const my = (s.ay + s.by) / 2 + sag;
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= POINTS; i++) {
        const t = i / POINTS;
        const u = 1 - t;
        const x = u * u * s.ax + 2 * u * t * mx + t * t * s.bx;
        const y = u * u * s.ay + 2 * u * t * my + t * t * s.by;
        pts.push(new Phaser.Math.Vector2(x * CELL_PX, y * CELL_PX));
      }
      const tension = slack < TENSION_ZONE ? 1 - slack / TENSION_ZONE : 0;
      g.lineStyle(3 + tension, INK, 1);
      g.strokePoints(pts, false, true);
      if (tension > 0) {
        g.lineStyle(1.4 + tension * 0.6, ORANGE, 0.35 + 0.65 * tension);
        g.strokePoints(pts, false, true);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
