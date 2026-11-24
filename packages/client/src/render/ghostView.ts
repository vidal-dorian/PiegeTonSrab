/**
 * Another player during the race: a rectangle in their colour with their name above,
 * drawn at a position interpolated between the snapshots the server sends (20 per second).
 */
import Phaser from "phaser";
import type { Ghost } from "@game/shared";
import { CELL_PX } from "../config";
import { tuning } from "../tuningStore";
import { drawExtras } from "./playerView";

/** Draw other players this far in the past, so there are always two snapshots to blend. */
export const INTERPOLATION_DELAY_MS = 100;
const MAX_SNAPSHOTS = 30;

interface Snapshot extends Ghost {
  t: number;
}

export class GhostView {
  private rect: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private extras: Phaser.GameObjects.Graphics;
  private snapshots: Snapshot[] = [];
  private crown = false;
  private stunUntil = 0;
  private squashUntil = 0;
  /** Last interpolated state, in cells. */
  current: { x: number; y: number; vx: number; vy: number; status: Ghost["status"] } | null = null;

  constructor(
    private scene: Phaser.Scene,
    readonly id: string,
    readonly name: string,
    readonly color: number,
  ) {
    const m = tuning.movement;
    this.rect = scene.add
      .rectangle(0, 0, m.bodyWidth * CELL_PX, m.bodyHeight * CELL_PX, color)
      .setOrigin(0, 0)
      .setStrokeStyle(2, 0x161616)
      .setAlpha(0.85)
      .setDepth(3)
      .setVisible(false);
    this.label = scene.add
      .text(0, 0, name, { fontFamily: "sans-serif", fontSize: "14px", color: "#161616" })
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
    this.rect.setVisible(false);
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
    const h = m.bodyHeight * CELL_PX * (now < this.squashUntil ? 0.55 : 1);
    this.rect.setVisible(visible).setSize(m.bodyWidth * CELL_PX, h).setPosition(x * CELL_PX, (y + m.bodyHeight) * CELL_PX - h);
    drawExtras(this.extras, visible, x, y, this.crown, now < this.stunUntil, now);
    this.label
      .setVisible(visible)
      .setPosition((x + tuning.movement.bodyWidth / 2) * CELL_PX, y * CELL_PX - 4);
  }

  destroy(): void {
    this.rect.destroy();
    this.label.destroy();
    this.extras.destroy();
  }
}
