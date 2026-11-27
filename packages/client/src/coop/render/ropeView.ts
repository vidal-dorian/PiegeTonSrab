/**
 * The rope between the players, drawn in felt pen through the terrain corners it wraps: it sags
 * when slack and goes straight when taut. Near its rest length it turns orange (and a little
 * thicker), so players learn how far they can go before they feel the pull; stretched past it, it
 * thins like a rubber band and turns red, all red once it reaches its hard stop.
 * The geometry and the cue are in ropeLayout.ts.
 */
import Phaser from "phaser";
import { CELL_PX } from "../../config";
import { INK, ORANGE } from "../../render/levelView";
import { ropeLook, ropeShape, type RopeSegment } from "./ropeLayout";

export type { RopeSegment } from "./ropeLayout";

const DEPTH = 2.8;
/** A stretched rope's red (brighter than the level's brick RED, which reads as dark on a thin line). */
const STRETCH_RED = 0xe0281a;

/** Orange blended towards red by `t` (0 to 1). */
function tensionColor(t: number): number {
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = mix((ORANGE >> 16) & 0xff, (STRETCH_RED >> 16) & 0xff);
  const g = mix((ORANGE >> 8) & 0xff, (STRETCH_RED >> 8) & 0xff);
  const b = mix(ORANGE & 0xff, STRETCH_RED & 0xff);
  return (r << 16) | (g << 8) | b;
}

export class RopeView {
  private g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    /** Rest length and hard stop of a link, cells. */
    private rest: number,
    private max: number,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH);
  }

  draw(segments: readonly RopeSegment[]): void {
    const g = this.g;
    g.clear();
    for (const s of segments) {
      const shape = ropeShape(s, this.rest, this.max);
      const look = ropeLook(shape);
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i + 1 < shape.line.length; i += 2) pts.push(new Phaser.Math.Vector2(shape.line[i]! * CELL_PX, shape.line[i + 1]! * CELL_PX));
      // An open path: closing it would draw a chord back from the last point to the first.
      g.lineStyle(look.inkWidth, INK, 1);
      g.strokePoints(pts, false, false);
      if (look.overlayAlpha > 0) {
        g.lineStyle(look.overlayWidth, tensionColor(look.redness), look.overlayAlpha);
        g.strokePoints(pts, false, false);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
