/**
 * Drawing of placed objects, following the colour rule: red kills, orange helps,
 * black and white is neutral. Animation is driven by the round clock only, like the
 * object logic, except purely local feedback (a spring squashing under this player).
 */
import Phaser from "phaser";
import {
  cannonBalls,
  CANNON_BALL_RADIUS,
  cannonSinceShot,
  DIR_VECTORS,
  dirOf,
  SAW_RADIUS,
  SPIKES_HEIGHT,
  sawAngle,
  type PlacedObject,
} from "@game/shared";
import { CELL_PX } from "../config";

const RED = 0xb3361a;
const ORANGE = 0xf07a2e;
const INK = 0x161616;
const WHITE = 0xffffff;
const SAW_TEETH = 10;

export interface ObjectFrame {
  /** Centre (cells) of the body holding each vine that is held. */
  holders?: ReadonlyMap<number, { x: number; y: number }>;
  /** Show cannons' lines of fire (placement). */
  showLines?: boolean;
}

interface View {
  obj: PlacedObject;
  /** Static part, drawn once. */
  body: Phaser.GameObjects.Graphics;
  /** Animated part (balls, rope, spring coil), redrawn every frame; absent for static objects. */
  live: Phaser.GameObjects.Graphics | null;
  /** Round time of the last local bounce on a spring. */
  bouncedAt: number;
}

export class ObjectViews {
  private views = new Map<number, View>();
  private now = 0;

  constructor(private scene: Phaser.Scene) {}

  /** Create, keep or destroy views so they match `objects`. Objects in `dimmed` are drawn see-through. */
  sync(objects: readonly PlacedObject[], dimmed: ReadonlySet<number> = new Set()): void {
    const alive = new Map(objects.map((o) => [o.id, o]));
    for (const [id, v] of this.views) {
      const o = alive.get(id);
      // Recreate when the object changed (a cannon turned, a line got shorter).
      if (!o || o.x !== v.obj.x || o.y !== v.obj.y || o.dir !== v.obj.dir || o.range !== v.obj.range || o.kind !== v.obj.kind) {
        v.body.destroy();
        v.live?.destroy();
        this.views.delete(id);
      }
    }
    for (const obj of objects) {
      let v = this.views.get(obj.id);
      if (!v) {
        v = this.create(obj);
        this.views.set(obj.id, v);
      }
      const alpha = dimmed.has(obj.id) ? 0.55 : 1;
      v.body.setAlpha(alpha);
      v.live?.setAlpha(alpha);
    }
  }

  /** A spring just threw this player up: squash it for a moment (local feedback only). */
  bounce(id: number): void {
    const v = this.views.get(id);
    if (v) v.bouncedAt = this.now;
  }

  /** Per-frame animation from the round clock. */
  update(objects: readonly PlacedObject[], roundTime: number, frame: ObjectFrame = {}): void {
    this.now = roundTime;
    for (const obj of objects) {
      const v = this.views.get(obj.id);
      if (!v) continue;
      switch (obj.kind) {
        case "saw":
          v.body.setRotation(sawAngle(roundTime));
          break;
        case "cannon":
          this.drawCannonLive(v, roundTime, frame.showLines === true);
          break;
        case "spring":
          this.drawSpringLive(v, roundTime);
          break;
        case "vine":
          this.drawVineLive(v, frame.holders?.get(obj.id) ?? null, roundTime);
          break;
        default:
          break;
      }
    }
  }

  private create(obj: PlacedObject): View {
    const g = this.scene.add.graphics().setDepth(2);
    let live: Phaser.GameObjects.Graphics | null = null;
    const px = obj.x * CELL_PX;
    const py = obj.y * CELL_PX;
    switch (obj.kind) {
      case "saw": {
        // Drawn around (0, 0) so it can spin around its centre.
        g.setPosition(px + CELL_PX / 2, py + CELL_PX / 2);
        const r = SAW_RADIUS * CELL_PX;
        const inner = r * 0.78;
        const points: Phaser.Math.Vector2[] = [];
        for (let i = 0; i < SAW_TEETH * 2; i++) {
          const a = (i / (SAW_TEETH * 2)) * Math.PI * 2;
          const rr = i % 2 === 0 ? r : inner;
          points.push(new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
        }
        g.fillStyle(RED, 1);
        g.fillPoints(points, true);
        g.fillStyle(INK, 1);
        g.fillCircle(0, 0, r * 0.18);
        break;
      }
      case "spikes": {
        const h = SPIKES_HEIGHT * CELL_PX;
        const n = 3;
        const w = CELL_PX / n;
        g.fillStyle(RED, 1);
        for (let i = 0; i < n; i++) {
          g.fillTriangle(px + i * w, py + CELL_PX, px + (i + 1) * w, py + CELL_PX, px + (i + 0.5) * w, py + CELL_PX - h);
        }
        break;
      }
      case "platform": {
        g.fillStyle(WHITE, 1);
        g.fillRect(px, py, CELL_PX, CELL_PX);
        g.lineStyle(2, INK, 1);
        g.strokeRect(px + 1, py + 1, CELL_PX - 2, CELL_PX - 2);
        break;
      }
      case "cannon": {
        g.fillStyle(RED, 1);
        g.fillRect(px + 4, py + 4, CELL_PX - 8, CELL_PX - 8);
        g.lineStyle(2, INK, 1);
        g.strokeRect(px + 4, py + 4, CELL_PX - 8, CELL_PX - 8);
        // Barrel towards the direction of fire.
        const { dx, dy } = DIR_VECTORS[dirOf(obj)];
        const cx = px + CELL_PX / 2;
        const cy = py + CELL_PX / 2;
        g.fillStyle(INK, 1);
        g.fillRect(cx + dx * 10 - 6 + (dx === 0 ? 0 : dx * 4), cy + dy * 10 - 6 + (dy === 0 ? 0 : dy * 4), 12, 12);
        live = this.scene.add.graphics().setDepth(2);
        break;
      }
      case "spring": {
        g.fillStyle(INK, 1);
        g.fillRect(px + 4, py + CELL_PX - 8, CELL_PX - 8, 8);
        live = this.scene.add.graphics().setDepth(2);
        break;
      }
      case "vine": {
        g.fillStyle(WHITE, 1);
        g.fillRect(px, py, CELL_PX, CELL_PX);
        g.lineStyle(2, INK, 1);
        g.strokeRect(px + 1, py + 1, CELL_PX - 2, CELL_PX - 2);
        g.fillStyle(ORANGE, 1);
        g.fillCircle(px + CELL_PX / 2, py + CELL_PX - 6, 5);
        live = this.scene.add.graphics().setDepth(2);
        break;
      }
    }
    return { obj, body: g, live, bouncedAt: -Infinity };
  }

  private drawCannonLive(v: View, t: number, showLine: boolean): void {
    const g = v.live!;
    g.clear();
    const obj = v.obj;
    const { dx, dy } = DIR_VECTORS[dirOf(obj)];
    if (showLine && obj.range) {
      g.lineStyle(2, RED, 0.45);
      const sx = (obj.x + 0.5 + dx * 0.5) * CELL_PX;
      const sy = (obj.y + 0.5 + dy * 0.5) * CELL_PX;
      const len = obj.range * CELL_PX;
      for (let d = 0; d < len; d += 12) {
        const e = Math.min(d + 6, len);
        g.lineBetween(sx + dx * d, sy + dy * d, sx + dx * e, sy + dy * e);
      }
    }
    // Muzzle flash right after a shot.
    if (cannonSinceShot(obj, t) < 0.12) {
      g.fillStyle(ORANGE, 0.9);
      g.fillCircle((obj.x + 0.5 + dx * 0.6) * CELL_PX, (obj.y + 0.5 + dy * 0.6) * CELL_PX, 9);
    }
    for (const b of cannonBalls(obj, t)) {
      g.fillStyle(RED, 1);
      g.fillCircle(b.x * CELL_PX, b.y * CELL_PX, CANNON_BALL_RADIUS * CELL_PX);
      g.lineStyle(2, INK, 1);
      g.strokeCircle(b.x * CELL_PX, b.y * CELL_PX, CANNON_BALL_RADIUS * CELL_PX);
    }
  }

  private drawSpringLive(v: View, t: number): void {
    const g = v.live!;
    g.clear();
    const px = v.obj.x * CELL_PX;
    const py = v.obj.y * CELL_PX;
    const since = t - v.bouncedAt;
    const squash = since >= 0 && since < 0.2 ? 1 - since / 0.2 : 0;
    const top = py + 6 + squash * 14;
    g.lineStyle(3, INK, 1);
    const coils = 3;
    const bottom = py + CELL_PX - 8;
    for (let i = 0; i < coils; i++) {
      const y0 = top + 6 + ((bottom - top - 6) * i) / coils;
      const y1 = top + 6 + ((bottom - top - 6) * (i + 1)) / coils;
      g.lineBetween(px + 10, y0, px + CELL_PX - 10, (y0 + y1) / 2);
      g.lineBetween(px + CELL_PX - 10, (y0 + y1) / 2, px + 10, y1);
    }
    g.fillStyle(ORANGE, 1);
    g.fillRect(px + 2, top, CELL_PX - 4, 7);
    g.lineStyle(2, INK, 1);
    g.strokeRect(px + 2, top, CELL_PX - 4, 7);
  }

  private drawVineLive(v: View, holder: { x: number; y: number } | null, t: number): void {
    const g = v.live!;
    g.clear();
    const range = v.obj.range ?? 0;
    if (range <= 0) return;
    const ax = (v.obj.x + 0.5) * CELL_PX;
    const ay = (v.obj.y + 1) * CELL_PX;
    // Hanging straight with a slight sway, or stretched to whoever holds it.
    const sway = Math.sin(t * 1.3 + v.obj.id) * 3;
    const ex = holder ? holder.x * CELL_PX : ax + sway;
    const ey = holder ? holder.y * CELL_PX : ay + (range - 0.15) * CELL_PX;
    g.lineStyle(4, ORANGE, 1);
    g.lineBetween(ax, ay, ex, ey);
    g.fillStyle(ORANGE, 1);
    for (let i = 1; i <= 3; i++) {
      const k = i / 4;
      g.fillEllipse(ax + (ex - ax) * k + (i % 2 ? 5 : -5), ay + (ey - ay) * k, 9, 5);
    }
  }

  destroy(): void {
    for (const v of this.views.values()) {
      v.body.destroy();
      v.live?.destroy();
    }
    this.views.clear();
  }
}
