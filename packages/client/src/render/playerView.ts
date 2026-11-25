/**
 * Drawing of the local character: a small pebble-shaped blob with two eyes, outlined in
 * felt pen with a solid offset shadow. It stretches when it jumps or falls, squashes when it
 * lands or is stomped on, leans when it runs, hugs walls while sliding, tilts on a vine and
 * looks where it is going. Crown on the score leader, stars while stunned.
 */
import Phaser from "phaser";
import type { CharacterController } from "@game/shared";
import { CELL_PX } from "../config";
import { tuning } from "../tuningStore";
import { INK, ORANGE, OUTLINE, WHITE } from "./levelView";

/** Player colours from the art direction: black, white, blue, green. Never orange or red. */
export const PLAYER_COLORS = [0x161616, 0xffffff, 0x2b59c3, 0x3fa35c] as const;

const BLOB_SHADOW_X = 3;
const BLOB_SHADOW_Y = 4;
const BLOB_POINTS = 32;
const LAND_MS = 150;
const STOMP_MS = 250;

/** Everything needed to draw one blob. Position in cells, top-left of the body. */
export interface BlobPose {
  x: number;
  y: number;
  color: number;
  facing: -1 | 1;
  /** Squash and stretch around the feet. */
  scaleX: number;
  scaleY: number;
  /** How far the top of the body leans forward, pixels (negative leans back). */
  lean: number;
  /** Tilt around the body centre, radians (hanging from a vine). */
  rotation: number;
  /** Where the eyes look, each in -1..1. */
  lookX: number;
  lookY: number;
  blink: boolean;
  dizzy: boolean;
}

/** Draw a blob into `g` (cleared first). Shared by the local player and the other players. */
export function drawBlob(g: Phaser.GameObjects.Graphics, p: BlobPose): void {
  g.clear();
  const m = tuning.movement;
  const w = m.bodyWidth * CELL_PX;
  const h = m.bodyHeight * CELL_PX;
  const footX = (p.x + m.bodyWidth / 2) * CELL_PX;
  const footY = (p.y + m.bodyHeight) * CELL_PX;
  const sx = p.scaleX;
  const sy = p.scaleY;
  const pivotY = (-h / 2) * sy;
  const cos = Math.cos(p.rotation);
  const sin = Math.sin(p.rotation);
  // Local coordinates: feet at (0, 0), facing right, y down.
  const tx = (lx: number, ly: number): [number, number] => {
    let x = lx * sx;
    const y = ly * sy;
    x += p.lean * (-y / h);
    x *= p.facing;
    const ry = y - pivotY;
    return [footX + x * cos - ry * sin, footY + pivotY + x * sin + ry * cos];
  };

  // Pebble: flatter at the bottom, a little rounder and pushed forward at the top.
  const rx = w / 2;
  const ryy = h / 2;
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < BLOB_POINTS; i++) {
    const a = (i / BLOB_POINTS) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const n = s > 0 ? 3.2 : 2.3;
    let lx = rx * Math.sign(c) * Math.abs(c) ** (2 / n);
    const ly = ryy * Math.sign(s) * Math.abs(s) ** (2 / n);
    lx *= 1 + 0.06 * (ly / ryy);
    if (ly < 0) lx += 1.6 * (-ly / ryy);
    const [x, y] = tx(lx, ly - ryy);
    pts.push(new Phaser.Math.Vector2(x, y));
  }
  g.fillStyle(INK, 1);
  g.fillPoints(
    pts.map((q) => new Phaser.Math.Vector2(q.x + BLOB_SHADOW_X, q.y + BLOB_SHADOW_Y)),
    true,
  );
  g.fillStyle(p.color, 1);
  g.fillPoints(pts, true);
  g.lineStyle(OUTLINE, INK, 1);
  g.strokePoints(pts, true, true);

  // Eyes, towards the front of the body.
  const eyeY = -h * 0.6;
  const eyeR = Math.max(3.5, w * 0.13);
  for (const ex of [-w * 0.06, w * 0.26]) {
    const [cx, cy] = tx(ex, eyeY);
    if (p.dizzy) {
      g.lineStyle(2, p.color === INK ? WHITE : INK, 1);
      const d = eyeR * 0.75;
      g.lineBetween(cx - d, cy - d, cx + d, cy + d);
      g.lineBetween(cx - d, cy + d, cx + d, cy - d);
      continue;
    }
    if (p.blink) {
      g.lineStyle(2, p.color === INK ? WHITE : INK, 1);
      g.lineBetween(cx - eyeR, cy + 1, cx + eyeR, cy + 1);
      continue;
    }
    g.fillStyle(WHITE, 1);
    g.fillEllipse(cx, cy, eyeR * 2, eyeR * 2.4);
    g.lineStyle(1.5, INK, 1);
    g.strokeEllipse(cx, cy, eyeR * 2, eyeR * 2.4);
    g.fillStyle(INK, 1);
    g.fillCircle(cx + p.lookX * p.facing * eyeR * 0.45, cy + p.lookY * eyeR * 0.55, eyeR * 0.55);
  }
}

export class PlayerView {
  private g: Phaser.GameObjects.Graphics;
  private extras: Phaser.GameObjects.Graphics;
  private crown = false;
  private squashUntil = 0;
  private landedAt = -Infinity;
  private landPower = 0;
  private wasGrounded = true;
  private lastVy = 0;
  private blinkSeed = Math.random() * 3000;

  constructor(
    private scene: Phaser.Scene,
    readonly color: number,
  ) {
    this.g = scene.add.graphics().setDepth(4);
    this.extras = scene.add.graphics().setDepth(4);
  }

  /** Body size comes from the tuning; it is read every frame, nothing to rebuild. */
  applyTuning(): void {}

  /** Wear the crown (leader of the game). */
  setCrown(on: boolean): void {
    this.crown = on;
  }

  /** Flattened for a moment (stomped on). */
  squash(): void {
    this.squashUntil = this.scene.time.now + STOMP_MS;
  }

  /** Position in cells (top-left of the body). */
  update(x: number, y: number, c: CharacterController, visible: boolean): void {
    const now = this.scene.time.now;
    if (c.grounded && !this.wasGrounded && this.lastVy > 3) {
      this.landedAt = now;
      this.landPower = Math.min(1, this.lastVy / 18);
    }
    this.wasGrounded = c.grounded;
    this.lastVy = c.vy;
    if (!visible) {
      this.g.clear();
      this.extras.clear();
      return;
    }

    let scaleX = 1;
    let scaleY = 1;
    let lean = 0;
    let rotation = 0;
    const run = Math.min(Math.abs(c.vx) / tuning.movement.runSpeed, 1);
    if (c.swing) {
      rotation = -c.swing.angle;
      scaleY = 1.06;
      scaleX = 0.95;
    } else if (!c.grounded) {
      const s = Math.min(Math.abs(c.vy) / 22, 0.16);
      scaleY = 1 + s;
      scaleX = 1 - s * 0.75;
      lean = ((c.vx * c.facing) / tuning.movement.runSpeed) * 2;
      if (c.wallSliding) {
        scaleX = 0.88;
        scaleY = 1.05;
        lean = c.wallSide * c.facing * 3;
      }
    } else {
      lean = run * 4 * Math.sign(c.vx) * c.facing;
      if (run > 0.1) scaleY = 1 + 0.035 * Math.sin(now / 55);
    }
    const land = 1 - (now - this.landedAt) / LAND_MS;
    if (land > 0) {
      const k = land * (0.4 + 0.6 * this.landPower);
      scaleY *= 1 - 0.25 * k;
      scaleX *= 1 + 0.22 * k;
    }
    if (now < this.squashUntil) {
      scaleY = 0.55;
      scaleX = 1.3;
    }

    drawBlob(this.g, {
      x,
      y,
      color: this.color,
      facing: c.facing,
      scaleX,
      scaleY,
      lean,
      rotation,
      lookX: 0.5 + 0.5 * run,
      lookY: Math.max(-1, Math.min(1, c.vy / 12)),
      blink: (now + this.blinkSeed) % 3400 < 120,
      dizzy: c.stunTimer > 0,
    });
    const topShift = (1 - scaleY) * tuning.movement.bodyHeight;
    drawExtras(this.extras, visible, x, y + topShift, this.crown, c.stunTimer > 0, now);
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
    const pts = [
      [-10, -4],
      [-11, -17],
      [-5, -10],
      [0, -20],
      [5, -10],
      [11, -17],
      [10, -4],
    ].map(([dx, dy]) => new Phaser.Math.Vector2(cx + dx!, top + dy! - 2));
    g.fillStyle(INK, 1);
    g.fillPoints(
      pts.map((p) => new Phaser.Math.Vector2(p.x + 2, p.y + 3)),
      true,
    );
    g.fillStyle(ORANGE, 1);
    g.fillPoints(pts, true);
    g.lineStyle(2, INK, 1);
    g.strokePoints(pts, true, true);
  }
  if (stunned) {
    const a = nowMs / 180;
    for (let i = 0; i < 3; i++) {
      const k = a + (i * Math.PI * 2) / 3;
      const sx = cx + Math.cos(k) * 17;
      const sy = top - 8 + Math.sin(k) * 5;
      const r = 5 + Math.sin(k) * 1.2;
      const star = [0, 1, 2, 3, 4, 5, 6, 7].map((j) => {
        const rr = j % 2 === 0 ? r : r * 0.35;
        const aa = (j / 8) * Math.PI * 2 + nowMs / 400;
        return new Phaser.Math.Vector2(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
      });
      g.fillStyle(WHITE, 1);
      g.fillPoints(star, true);
      g.lineStyle(1.5, INK, 1);
      g.strokePoints(star, true, true);
    }
  }
}
