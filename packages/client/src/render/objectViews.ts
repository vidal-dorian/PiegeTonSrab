/**
 * Drawing of placed objects. Plain shapes for now (art direction comes in build step 5),
 * but already following the colour rule: red kills, black and white is neutral.
 * Animation is driven by the round clock only, like the object logic.
 */
import Phaser from "phaser";
import { SAW_RADIUS, SPIKES_HEIGHT, sawAngle, type PlacedObject } from "@game/shared";
import { CELL_PX } from "../config";

const RED = 0xb3361a;
const INK = 0x161616;
const WHITE = 0xffffff;
const SAW_TEETH = 10;

export class ObjectViews {
  private views = new Map<number, Phaser.GameObjects.Graphics>();

  constructor(private scene: Phaser.Scene) {}

  /** Create, keep or destroy views so they match `objects`. Objects in `dimmed` are drawn see-through. */
  sync(objects: readonly PlacedObject[], dimmed: ReadonlySet<number> = new Set()): void {
    const alive = new Set(objects.map((o) => o.id));
    for (const [id, g] of this.views) {
      if (!alive.has(id)) {
        g.destroy();
        this.views.delete(id);
      }
    }
    for (const obj of objects) {
      let g = this.views.get(obj.id);
      if (!g) {
        g = this.create(obj);
        this.views.set(obj.id, g);
      }
      g.setAlpha(dimmed.has(obj.id) ? 0.55 : 1);
    }
  }

  /** Per-frame animation from the round clock. */
  update(objects: readonly PlacedObject[], roundTime: number): void {
    for (const obj of objects) {
      const g = this.views.get(obj.id);
      if (g && obj.kind === "saw") g.setRotation(sawAngle(roundTime));
    }
  }

  private create(obj: PlacedObject): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics().setDepth(2);
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
    }
    return g;
  }

  destroy(): void {
    for (const g of this.views.values()) g.destroy();
    this.views.clear();
  }
}
