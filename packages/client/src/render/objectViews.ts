/**
 * Drawing of placed objects in the sketchbook style, following the colour rule: red kills,
 * orange helps, black and white is neutral. Felt-pen outlines and solid offset shadows.
 * Animation is driven by the round clock only, like the object logic, except purely local
 * feedback (a spring squashing under this player).
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
  vineRopeLength,
  type PlacedObject,
} from "@game/shared";
import { CELL_PX } from "../config";
import { INK, ORANGE, OUTLINE, RED, SHADOW_X, SHADOW_Y, WHITE } from "./levelView";

const SAW_TEETH = 9;
/** Shadows sit under every object body, above the terrain and the stains. */
const SHADOW_DEPTH = 1.5;
const BODY_DEPTH = 2;
const PENDING_ALPHA = 0.6;

export interface ObjectFrame {
  /** Centre (cells) of the body holding each vine that is held. */
  holders?: ReadonlyMap<number, { x: number; y: number }>;
  /** Show cannons' lines of fire (placement). */
  showLines?: boolean;
}

interface View {
  obj: PlacedObject;
  /** Every Graphics of this object, for alpha and destroy. */
  parts: Phaser.GameObjects.Graphics[];
  /** Parts that spin with the saw. */
  spin: Phaser.GameObjects.Graphics[];
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
        for (const p of v.parts) p.destroy();
        this.views.delete(id);
      }
    }
    for (const obj of objects) {
      let v = this.views.get(obj.id);
      if (!v) {
        v = this.create(obj);
        this.views.set(obj.id, v);
      }
      // Pending objects are see-through and cast no shadow: not stuck to the paper yet.
      const pending = dimmed.has(obj.id);
      v.parts.forEach((p, i) => p.setAlpha(pending ? (i === 0 ? 0 : PENDING_ALPHA) : 1));
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
        case "saw": {
          const a = sawAngle(roundTime);
          for (const g of v.spin) g.setRotation(a);
          break;
        }
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
    const shadow = this.scene.add.graphics().setDepth(SHADOW_DEPTH);
    const g = this.scene.add.graphics().setDepth(BODY_DEPTH);
    // parts[0] is always the shadow (hidden while pending).
    const view: View = { obj, parts: [shadow, g], spin: [], live: null, bouncedAt: -Infinity };
    const addLive = () => {
      view.live = this.scene.add.graphics().setDepth(BODY_DEPTH);
      view.parts.push(view.live);
    };
    const px = obj.x * CELL_PX;
    const py = obj.y * CELL_PX;
    switch (obj.kind) {
      case "saw": {
        // Drawn around (0, 0) so both the disc and its shadow spin around their centres.
        const cx = px + CELL_PX / 2;
        const cy = py + CELL_PX / 2;
        g.setPosition(cx, cy);
        shadow.setPosition(cx + SHADOW_X, cy + SHADOW_Y);
        const r = SAW_RADIUS * CELL_PX;
        const teeth = sawPoints(r, r * 0.7);
        shadow.fillStyle(INK, 1);
        shadow.fillPoints(teeth, true);
        g.fillStyle(RED, 1);
        g.fillPoints(teeth, true);
        g.lineStyle(OUTLINE, INK, 1);
        g.strokePoints(teeth, true, true);
        // Hub with a bolt, and two slots so the spin is visible.
        g.lineStyle(2, INK, 1);
        g.beginPath();
        g.arc(0, 0, r * 0.52, -0.5, 0.5);
        g.strokePath();
        g.beginPath();
        g.arc(0, 0, r * 0.52, Math.PI - 0.5, Math.PI + 0.5);
        g.strokePath();
        g.fillStyle(WHITE, 1);
        g.fillCircle(0, 0, r * 0.3);
        g.lineStyle(OUTLINE, INK, 1);
        g.strokeCircle(0, 0, r * 0.3);
        g.fillStyle(INK, 1);
        g.fillCircle(0, 0, 2.5);
        view.spin.push(g, shadow);
        break;
      }
      case "spikes": {
        const h = SPIKES_HEIGHT * CELL_PX;
        const n = 3;
        const bottom = py + CELL_PX;
        const w = (CELL_PX - 4) / n;
        const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(px + 2, bottom)];
        for (let i = 0; i < n; i++) {
          pts.push(new Phaser.Math.Vector2(px + 2 + (i + 0.5) * w, bottom - h));
          pts.push(new Phaser.Math.Vector2(px + 2 + (i + 1) * w, bottom - (i < n - 1 ? 3 : 0)));
        }
        shadow.fillStyle(INK, 1);
        shadow.fillPoints(pts.map((p) => new Phaser.Math.Vector2(p.x + SHADOW_X, p.y)), true);
        g.fillStyle(RED, 1);
        g.fillPoints(pts, true);
        g.lineStyle(OUTLINE, INK, 1);
        g.strokePoints(pts, true, true);
        g.lineStyle(OUTLINE + 0.5, INK, 1);
        g.lineBetween(px + 1, bottom - 1, px + CELL_PX - 1, bottom - 1);
        break;
      }
      case "platform": {
        // A placed block: a white tile with four rivets, so it never passes for terrain.
        shadow.fillStyle(INK, 1);
        shadow.fillRoundedRect(px + 1 + SHADOW_X, py + 1 + SHADOW_Y, CELL_PX - 2, CELL_PX - 2, 6);
        g.fillStyle(WHITE, 1);
        g.fillRoundedRect(px + 1, py + 1, CELL_PX - 2, CELL_PX - 2, 6);
        g.lineStyle(OUTLINE, INK, 1);
        g.strokeRoundedRect(px + 1.5, py + 1.5, CELL_PX - 3, CELL_PX - 3, 6);
        g.lineStyle(1.5, INK, 1);
        g.strokeRoundedRect(px + 7, py + 7, CELL_PX - 14, CELL_PX - 14, 3);
        g.fillStyle(INK, 1);
        for (const [rx, ry] of [
          [7, 7],
          [CELL_PX - 7, 7],
          [7, CELL_PX - 7],
          [CELL_PX - 7, CELL_PX - 7],
        ] as const) {
          g.fillCircle(px + rx, py + ry, 2.6);
        }
        break;
      }
      case "cannon": {
        shadow.fillStyle(INK, 1);
        shadow.fillRoundedRect(px + 2 + SHADOW_X, py + 2 + SHADOW_Y, CELL_PX - 4, CELL_PX - 4, 7);
        g.fillStyle(RED, 1);
        g.fillRoundedRect(px + 2, py + 2, CELL_PX - 4, CELL_PX - 4, 7);
        g.lineStyle(OUTLINE, INK, 1);
        g.strokeRoundedRect(px + 2, py + 2, CELL_PX - 4, CELL_PX - 4, 7);
        // Two bolts on the side away from the barrel.
        const { dx, dy } = DIR_VECTORS[dirOf(obj)];
        const cx = px + CELL_PX / 2;
        const cy = py + CELL_PX / 2;
        g.fillStyle(INK, 1);
        g.fillCircle(cx - dx * 12 - dy * 9, cy - dy * 12 - dx * 9, 2.2);
        g.fillCircle(cx - dx * 12 + dy * 9, cy - dy * 12 + dx * 9, 2.2);
        addLive();
        break;
      }
      case "spring": {
        shadow.fillStyle(INK, 1);
        shadow.fillRoundedRect(px + 4 + SHADOW_X, py + CELL_PX - 10 + SHADOW_Y, CELL_PX - 8, 9, 3);
        g.fillStyle(WHITE, 1);
        g.fillRoundedRect(px + 4, py + CELL_PX - 10, CELL_PX - 8, 9, 3);
        g.lineStyle(OUTLINE, INK, 1);
        g.strokeRoundedRect(px + 4, py + CELL_PX - 10, CELL_PX - 8, 9, 3);
        addLive();
        break;
      }
      case "vine": {
        // White anchor block with a ring underneath and two sprouting leaves.
        shadow.fillStyle(INK, 1);
        shadow.fillRoundedRect(px + 1 + SHADOW_X, py + 1 + SHADOW_Y, CELL_PX - 2, CELL_PX - 2, 6);
        g.fillStyle(WHITE, 1);
        g.fillRoundedRect(px + 1, py + 1, CELL_PX - 2, CELL_PX - 2, 6);
        g.lineStyle(OUTLINE, INK, 1);
        g.strokeRoundedRect(px + 1.5, py + 1.5, CELL_PX - 3, CELL_PX - 3, 6);
        // Ring the rope hangs from, with two leaves sprouting beside it.
        leaf(g, px + CELL_PX / 2 - 3, py + CELL_PX - 10, Math.PI + 0.5, 13, 5);
        leaf(g, px + CELL_PX / 2 + 3, py + CELL_PX - 10, -0.5, 13, 5);
        g.fillStyle(WHITE, 1);
        g.fillCircle(px + CELL_PX / 2, py + CELL_PX - 9, 5);
        g.lineStyle(OUTLINE, INK, 1);
        g.strokeCircle(px + CELL_PX / 2, py + CELL_PX - 9, 5);
        addLive();
        break;
      }
    }
    return view;
  }

  private drawCannonLive(v: View, t: number, showLine: boolean): void {
    const g = v.live!;
    g.clear();
    const obj = v.obj;
    const { dx, dy } = DIR_VECTORS[dirOf(obj)];
    const cx = (obj.x + 0.5) * CELL_PX;
    const cy = (obj.y + 0.5) * CELL_PX;
    if (showLine && obj.range) {
      g.lineStyle(3, RED, 0.7);
      const sx = cx + dx * CELL_PX * 0.5;
      const sy = cy + dy * CELL_PX * 0.5;
      const len = obj.range * CELL_PX;
      for (let d = 4; d < len; d += 14) {
        const e = Math.min(d + 7, len);
        g.lineBetween(sx + dx * d, sy + dy * d, sx + dx * e, sy + dy * e);
      }
    }
    const since = cannonSinceShot(obj, t);
    // The barrel kicks back right after a shot.
    const recoil = since >= 0 && since < 0.18 ? 6 * (1 - since / 0.18) : 0;
    const along = (s: number, side: number) => new Phaser.Math.Vector2(cx + dx * s - dy * side, cy + dy * s + dx * side);
    const quad = (s0: number, s1: number, half: number) => [along(s0, -half), along(s1, -half), along(s1, half), along(s0, half)];
    const barrel = quad(-2 - recoil, 21 - recoil, 7);
    const muzzle = quad(17 - recoil, 24 - recoil, 9.5);
    g.fillStyle(INK, 1);
    g.fillCircle(cx - dx * recoil * 0.3, cy - dy * recoil * 0.3, 11);
    g.fillPoints(barrel, true);
    g.fillPoints(muzzle, true);
    // Highlight along the barrel.
    g.lineStyle(2, WHITE, 1);
    const h0 = along(1 - recoil, -3.5);
    const h1 = along(14 - recoil, -3.5);
    g.lineBetween(h0.x, h0.y, h1.x, h1.y);

    // Smoke puff right after a shot.
    if (since >= 0 && since < 0.14) {
      const k = since / 0.14;
      const fx = cx + dx * (CELL_PX * 0.75 + k * 8);
      const fy = cy + dy * (CELL_PX * 0.75 + k * 8);
      const r = 8 * (1 - k * 0.5);
      g.fillStyle(WHITE, 1);
      g.fillCircle(fx, fy, r);
      g.lineStyle(2, INK, 1);
      g.strokeCircle(fx, fy, r);
      for (const side of [-1, 1]) {
        g.lineBetween(fx - dy * side * (r + 3), fy + dx * side * (r + 3), fx - dy * side * (r + 8), fy + dx * side * (r + 8));
      }
    }
    const br = CANNON_BALL_RADIUS * CELL_PX;
    for (const b of cannonBalls(obj, t)) {
      const bx = b.x * CELL_PX;
      const by = b.y * CELL_PX;
      // Speed lines behind the ball.
      g.lineStyle(2, INK, 1);
      for (const side of [-0.5, 0.5]) {
        const ox = -dy * side * br;
        const oy = dx * side * br;
        g.lineBetween(bx - dx * (br + 4) + ox, by - dy * (br + 4) + oy, bx - dx * (br + 13) + ox, by - dy * (br + 13) + oy);
      }
      g.fillStyle(INK, 1);
      g.fillCircle(bx + SHADOW_X * 0.7, by + SHADOW_Y * 0.7, br);
      g.fillStyle(RED, 1);
      g.fillCircle(bx, by, br);
      g.lineStyle(OUTLINE, INK, 1);
      g.strokeCircle(bx, by, br);
      g.fillStyle(WHITE, 1);
      g.fillCircle(bx - br * 0.35, by - br * 0.35, 2);
    }
  }

  private drawSpringLive(v: View, t: number): void {
    const g = v.live!;
    g.clear();
    const px = v.obj.x * CELL_PX;
    const py = v.obj.y * CELL_PX;
    const since = t - v.bouncedAt;
    const squash = since >= 0 && since < 0.2 ? 1 - since / 0.2 : 0;
    const top = py + 2 + squash * 14;
    const bottom = py + CELL_PX - 10;
    // Coil.
    g.lineStyle(3, INK, 1);
    const coils = 3;
    const y0 = top + 9;
    const step = (bottom - y0) / coils;
    let prevX = px + CELL_PX / 2;
    let prevY = y0;
    for (let i = 0; i < coils; i++) {
      const ya = y0 + step * i;
      const pts = [
        [px + 10, ya + step * 0.25],
        [px + CELL_PX - 10, ya + step * 0.75],
        [px + CELL_PX / 2, ya + step],
      ] as const;
      for (const [x, y] of pts) {
        g.lineBetween(prevX, prevY, x, y);
        prevX = x;
        prevY = y;
      }
    }
    // Orange pad on top, with its shadow.
    g.fillStyle(INK, 1);
    g.fillRoundedRect(px + 2 + SHADOW_X, top + SHADOW_Y - 2, CELL_PX - 4, 9, 4);
    g.fillStyle(ORANGE, 1);
    g.fillRoundedRect(px + 2, top, CELL_PX - 4, 9, 4);
    g.lineStyle(OUTLINE, INK, 1);
    g.strokeRoundedRect(px + 2, top, CELL_PX - 4, 9, 4);
  }

  private drawVineLive(v: View, holder: { x: number; y: number } | null, t: number): void {
    const g = v.live!;
    g.clear();
    // Same rope length as the one players hang from (none when it would be too short).
    const rope = vineRopeLength(v.obj.range ?? 0);
    if (rope < 0.8) return;
    const ax = (v.obj.x + 0.5) * CELL_PX;
    const ay = (v.obj.y + 1) * CELL_PX - 4;
    // Hanging straight with a slight sway, or stretched to whoever holds it.
    const sway = Math.sin(t * 1.3 + v.obj.id) * 3;
    const ex = holder ? holder.x * CELL_PX : ax + sway;
    const ey = holder ? holder.y * CELL_PX : (v.obj.y + 1 + rope) * CELL_PX;
    // Outlined rope: a wide ink line under a narrower orange one.
    g.lineStyle(7, INK, 1);
    g.lineBetween(ax, ay, ex, ey);
    g.fillStyle(INK, 1);
    g.fillCircle(ex, ey, 3.5);
    g.lineStyle(3.5, ORANGE, 1);
    g.lineBetween(ax, ay, ex, ey);
    const len = Math.hypot(ex - ax, ey - ay);
    if (len < 1) return;
    const angle = Math.atan2(ey - ay, ex - ax);
    const leaves = Math.max(2, Math.round(len / 26));
    for (let i = 1; i <= leaves; i++) {
      const k = (i - 0.4) / leaves;
      const side = i % 2 ? 1 : -1;
      const flutter = Math.sin(t * 2.1 + i + v.obj.id) * 0.15;
      leaf(g, ax + (ex - ax) * k, ay + (ey - ay) * k, angle + side * (1.0 + flutter), 12, 4.5);
    }
    // Knot at the end.
    g.fillStyle(ORANGE, 1);
    g.fillCircle(ex, ey, 5);
    g.lineStyle(2, INK, 1);
    g.strokeCircle(ex, ey, 5);
  }

  destroy(): void {
    for (const v of this.views.values()) for (const p of v.parts) p.destroy();
    this.views.clear();
  }
}

/** Outline of a saw disc around (0, 0): slanted teeth between radius `r` and `inner`. */
function sawPoints(r: number, inner: number): Phaser.Math.Vector2[] {
  const pts: Phaser.Math.Vector2[] = [];
  const step = (Math.PI * 2) / SAW_TEETH;
  for (let i = 0; i < SAW_TEETH; i++) {
    const a = i * step;
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * inner, Math.sin(a) * inner));
    const b = a + step * 0.7;
    pts.push(new Phaser.Math.Vector2(Math.cos(b) * r, Math.sin(b) * r));
  }
  return pts;
}

/** An orange leaf from (x, y) pointing at `angle`, outlined in ink. */
function leaf(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, length: number, width: number): void {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const pts: Phaser.Math.Vector2[] = [];
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const w = Math.sin(Math.PI * s) * width;
    pts.push(new Phaser.Math.Vector2(x + ux * length * s - uy * w, y + uy * length * s + ux * w));
  }
  for (let i = n - 1; i > 0; i--) {
    const s = i / n;
    const w = Math.sin(Math.PI * s) * width * 0.6;
    pts.push(new Phaser.Math.Vector2(x + ux * length * s + uy * w, y + uy * length * s - ux * w));
  }
  g.fillStyle(ORANGE, 1);
  g.fillPoints(pts, true);
  g.lineStyle(1.5, INK, 1);
  g.strokePoints(pts, true, true);
}
