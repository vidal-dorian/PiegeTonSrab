/**
 * Another player during the race: the same pebble blob as the local character, in their
 * colour, with their name above, drawn at a position interpolated between the snapshots the
 * server sends (20 per second). Its life (stretch, landing squash, gaze) is guessed from the
 * interpolated speed, since ghosts carry no controller state.
 */
import Phaser from "phaser";
import type { Ghost } from "@game/shared";
import { CELL_PX } from "../config";
import { tuning } from "../tuningStore";
import { FONT_TEXT, INK_CSS, PAPER_CSS } from "./levelView";
import { drawBlob, drawExtras } from "./playerView";

/** Draw other players this far in the past, so there are always two snapshots to blend. */
export const INTERPOLATION_DELAY_MS = 100;
const MAX_SNAPSHOTS = 30;
const LAND_MS = 150;

interface Snapshot extends Ghost {
  t: number;
}

export class GhostView {
  private body: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;
  private extras: Phaser.GameObjects.Graphics;
  private snapshots: Snapshot[] = [];
  private crown = false;
  private stunUntil = 0;
  private squashUntil = 0;
  private facing: -1 | 1 = 1;
  private lastVy = 0;
  private landedAt = -Infinity;
  private blinkSeed = Math.random() * 3000;
  /** Last interpolated state, in cells. */
  current: { x: number; y: number; vx: number; vy: number; status: Ghost["status"] } | null = null;

  constructor(
    private scene: Phaser.Scene,
    readonly id: string,
    readonly name: string,
    readonly color: number,
  ) {
    this.body = scene.add.graphics().setDepth(3).setAlpha(0.92);
    this.label = scene.add
      .text(0, 0, name, {
        fontFamily: FONT_TEXT,
        fontSize: "14px",
        fontStyle: "500",
        color: INK_CSS,
        stroke: PAPER_CSS,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(3)
      .setVisible(false);
    this.extras = scene.add.graphics().setDepth(3);
  }

  setCrown(on: boolean): void {
    this.crown = on;
  }

  /** This player was stomped on: flattened, and stars for `seconds`. */
  stomped(seconds: number): void {
    const now = this.scene.time.now;
    this.stunUntil = now + seconds * 1000;
    this.squashUntil = now + 250;
  }

  push(t: number, g: Ghost): void {
    this.snapshots.push({ ...g, t });
    if (this.snapshots.length > MAX_SNAPSHOTS) this.snapshots.shift();
  }

  clear(): void {
    this.snapshots = [];
    this.current = null;
    this.body.clear();
    this.label.setVisible(false);
    this.extras.clear();
  }

  /** Position at server time `renderT`, blended between the two surrounding snapshots. */
  update(renderT: number): void {
    const s = this.snapshots;
    if (s.length === 0) return;
    let a = s[0]!;
    let b = s[0]!;
    for (let i = s.length - 1; i >= 0; i--) {
      if (s[i]!.t <= renderT) {
        a = s[i]!;
        b = s[i + 1] ?? s[i]!;
        break;
      }
    }
    const span = b.t - a.t;
    const k = span > 0 ? Math.min(Math.max((renderT - a.t) / span, 0), 1) : 0;
    const x = a.x + (b.x - a.x) * k;
    const y = a.y + (b.y - a.y) * k;
    const vx = span > 0 ? ((b.x - a.x) / span) * 1000 : 0;
    const vy = span > 0 ? ((b.y - a.y) / span) * 1000 : 0;
    this.current = { x, y, vx, vy, status: b.status };

    const visible = b.status === "running";
    const now = this.scene.time.now;
    const m = tuning.movement;
    if (Math.abs(vx) > 0.5) this.facing = vx > 0 ? 1 : -1;
    const settled = Math.abs(vy) < 0.5;
    if (settled && this.lastVy > 4) this.landedAt = now;
    this.lastVy = vy;

    if (!visible) {
      this.body.clear();
      this.extras.clear();
      this.label.setVisible(false);
      return;
    }
    let scaleX = 1;
    let scaleY = 1;
    const run = Math.min(Math.abs(vx) / m.runSpeed, 1);
    let lean = run * 4 * Math.sign(vx) * this.facing;
    if (!settled) {
      const st = Math.min(Math.abs(vy) / 22, 0.16);
      scaleY = 1 + st;
      scaleX = 1 - st * 0.75;
      lean *= 0.5;
    } else if (run > 0.1) {
      scaleY = 1 + 0.035 * Math.sin(now / 55);
    }
    const land = 1 - (now - this.landedAt) / LAND_MS;
    if (land > 0) {
      scaleY *= 1 - 0.22 * land;
      scaleX *= 1 + 0.2 * land;
    }
    if (now < this.squashUntil) {
      scaleY = 0.55;
      scaleX = 1.3;
    }
    const stunned = now < this.stunUntil;
    drawBlob(this.body, {
      x,
      y,
      color: this.color,
      facing: this.facing,
      scaleX,
      scaleY,
      lean,
      rotation: 0,
      lookX: 0.5 + 0.5 * run,
      lookY: Math.max(-1, Math.min(1, vy / 12)),
      blink: (now + this.blinkSeed) % 3400 < 120,
      dizzy: stunned,
    });
    const topShift = (1 - scaleY) * m.bodyHeight;
    drawExtras(this.extras, visible, x, y + topShift, this.crown, stunned, now);
    this.label
      .setVisible(true)
      .setPosition((x + m.bodyWidth / 2) * CELL_PX, (y + topShift) * CELL_PX - (this.crown ? 22 : 6));
  }

  destroy(): void {
    this.body.destroy();
    this.label.destroy();
    this.extras.destroy();
  }
}
