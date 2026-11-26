/**
 * Sprites of the co-op things, drawn once with the Canvas 2D API (dashes, text, curves) and packed
 * into a few canvas textures. Phaser Graphics replay every shape each frame; an Image of a packed
 * frame costs one quad, so a level full of shelves, crates and wires stays cheap at 5 players.
 *
 * Each sprite is drawn in its own pixel coordinates; its box (x0, y0, w, h) may stick out of its
 * origin (shadows, outlines). An image of it is placed so that the sprite's (0, 0) lands at the
 * image's position. Static sprites are simply drawn in world pixels and placed at (0, 0).
 */
import Phaser from "phaser";

const PAGE = 2048;
const PAD = 2;

type Draw = (ctx: CanvasRenderingContext2D) => void;

interface Sprite {
  name: string;
  x0: number;
  y0: number;
  w: number;
  h: number;
  draw: Draw;
}

interface Placed {
  key: string;
  x0: number;
  y0: number;
}

let atlasCounter = 0;

export class Atlas {
  private pending: Sprite[] = [];
  private placed = new Map<string, Placed>();
  private keys: string[] = [];
  private readonly prefix = `coop-atlas-${++atlasCounter}`;

  constructor(private scene: Phaser.Scene) {}

  has(name: string): boolean {
    return this.placed.has(name) || this.pending.some((s) => s.name === name);
  }

  /** A sprite covering (x0, y0, w, h) in its own pixels. Names are unique; a second add is ignored. */
  add(name: string, x0: number, y0: number, w: number, h: number, draw: Draw): void {
    if (this.has(name)) return;
    const fx = Math.floor(x0);
    const fy = Math.floor(y0);
    this.pending.push({ name, x0: fx, y0: fy, w: Math.max(1, Math.ceil(x0 + w) - fx), h: Math.max(1, Math.ceil(y0 + h) - fy), draw });
  }

  /** Draw every pending sprite into canvas pages (shelf packing, tallest first) and make the textures. */
  build(): void {
    const items = this.pending.splice(0).sort((a, b) => b.h - a.h || b.w - a.w);
    type Page = { items: Array<{ s: Sprite; x: number; y: number }>; w: number; h: number };
    const pages: Page[] = [];
    let page: Page | null = null;
    let x = 0;
    let y = 0;
    let rowH = 0;
    for (const s of items) {
      const iw = s.w + 2 * PAD;
      const ih = s.h + 2 * PAD;
      if (iw > PAGE || ih > PAGE) {
        // Too big for a page (a very long wire): a page of its own.
        pages.push({ items: [{ s, x: 0, y: 0 }], w: iw, h: ih });
        continue;
      }
      if (!page || x + iw > PAGE) {
        y += rowH;
        x = 0;
        rowH = 0;
      }
      if (!page || y + ih > PAGE) {
        page = { items: [], w: 0, h: 0 };
        pages.push(page);
        x = 0;
        y = 0;
        rowH = 0;
      }
      page.items.push({ s, x, y });
      x += iw;
      rowH = Math.max(rowH, ih);
      page.w = Math.max(page.w, x);
      page.h = Math.max(page.h, y + rowH);
    }
    for (const p of pages) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, p.w);
      canvas.height = Math.max(1, p.h);
      const ctx = canvas.getContext("2d");
      const key = `${this.prefix}-${this.keys.length}`;
      if (ctx) {
        for (const { s, x: px, y: py } of p.items) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(px + PAD, py + PAD, s.w, s.h);
          ctx.clip();
          ctx.translate(px + PAD - s.x0, py + PAD - s.y0);
          ctx.lineJoin = "round";
          ctx.lineCap = "round";
          s.draw(ctx);
          ctx.restore();
        }
      }
      const tex = this.scene.textures.addCanvas(key, canvas);
      this.keys.push(key);
      for (const { s, x: px, y: py } of p.items) {
        tex?.add(s.name, 0, px + PAD, py + PAD, s.w, s.h);
        this.placed.set(s.name, { key, x0: s.x0, y0: s.y0 });
      }
    }
  }

  /** An image of a built sprite with its (0, 0) at (x, y), pixels. */
  image(name: string, x = 0, y = 0, depth = 0): Phaser.GameObjects.Image {
    const p = this.placed.get(name);
    const img = p ? this.scene.add.image(x, y, p.key, name) : this.scene.add.image(x, y, "__MISSING");
    if (p) img.setDisplayOrigin(-p.x0, -p.y0);
    return img.setDepth(depth);
  }

  /** Show another sprite on an image (same anchor rule). */
  set(img: Phaser.GameObjects.Image, name: string): void {
    const p = this.placed.get(name);
    if (!p || (img.texture.key === p.key && img.frame.name === name)) return;
    img.setTexture(p.key, name);
    img.setDisplayOrigin(-p.x0, -p.y0);
  }

  destroy(): void {
    for (const key of this.keys) if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
    this.keys = [];
    this.placed.clear();
  }
}
