/**
 * Ruben's look: the sports sweatband he always wears (he lives at the gym). Shared by the intro and
 * by the game, so the player who plays Ruben looks the same in the story and in the levels.
 *
 * Contract: drawRubenBand(g, pose) draws the band for a blob drawn with drawBlob(g2, pose), with the
 * same pose, into `g` WITHOUT clearing it (draw it after the body, on a graphics object at the same
 * depth or above). It follows the pose's squash, lean, facing and tilt through blobFrame.
 * Players are never orange or red (art direction), so the band is white with ink stripes.
 *
 * This first version is a placeholder; the intro's author may redraw it, keeping the signature.
 */
import type Phaser from "phaser";
import { INK, OUTLINE, WHITE } from "../../render/levelView";
import { blobFrame, type BlobPose } from "../../render/playerView";

export function drawRubenBand(g: Phaser.GameObjects.Graphics, pose: BlobPose): void {
  const { w, h, tx } = blobFrame(pose);
  // A band around the forehead, above the eyes: a slightly curved strip across the body.
  const top = -h * 0.86;
  const bottom = -h * 0.74;
  const left = -w * 0.47;
  const right = w * 0.5;
  const pts: Phaser.Math.Vector2[] = [];
  const steps = 8;
  const toVec = ([x, y]: [number, number]) => ({ x, y }) as Phaser.Math.Vector2;
  for (let i = 0; i <= steps; i++) {
    const lx = left + ((right - left) * i) / steps;
    const bulge = Math.sin((i / steps) * Math.PI) * h * 0.03;
    pts.push(toVec(tx(lx, top - bulge)));
  }
  for (let i = steps; i >= 0; i--) {
    const lx = left + ((right - left) * i) / steps;
    const bulge = Math.sin((i / steps) * Math.PI) * h * 0.03;
    pts.push(toVec(tx(lx, bottom - bulge)));
  }
  g.fillStyle(WHITE, 1);
  g.fillPoints(pts, true);
  g.lineStyle(OUTLINE * 0.8, INK, 1);
  g.strokePoints(pts, true, true);
  // Two ink stripes.
  g.lineStyle(1.5, INK, 1);
  for (const k of [0.38, 0.62]) {
    const [x0, y0] = tx(left + (right - left) * k, top - h * 0.02);
    const [x1, y1] = tx(left + (right - left) * k, bottom - h * 0.02);
    g.lineBetween(x0, y0, x1, y1);
  }
  // The knot at the back of the head, with its two loose ends.
  const [kx, ky] = tx(left - w * 0.02, (top + bottom) / 2);
  g.fillStyle(WHITE, 1);
  g.fillCircle(kx, ky, w * 0.06);
  g.lineStyle(1.5, INK, 1);
  g.strokeCircle(kx, ky, w * 0.06);
  const [e1x, e1y] = tx(left - w * 0.2, bottom + h * 0.02);
  const [e2x, e2y] = tx(left - w * 0.16, bottom + h * 0.12);
  g.lineStyle(3, INK, 1);
  g.lineBetween(kx, ky, e1x, e1y);
  g.lineBetween(kx, ky, e2x, e2y);
  g.lineStyle(1.6, WHITE, 1);
  g.lineBetween(kx, ky, e1x, e1y);
  g.lineBetween(kx, ky, e2x, e2y);
}
