/**
 * Base of every shot of the intro. A shot owns one container with three layers:
 * the paper grid, a "world" seen through the shot's own camera (position and zoom, so characters
 * keep the game's proportions when the camera comes closer), and a flat "ui" layer on top for
 * things stuck to the screen (location cards, title).
 *
 * A shot is stateless: draw(u, life) paints the picture for second `u` of the shot, whatever was
 * drawn before. `life` is a free-running clock for what must never freeze (blinks, wobbles).
 */
import type Phaser from "phaser";
import { CELL_PX, VIEW_CELLS_X, VIEW_CELLS_Y } from "../../config";
import { FONT_TEXT, INK_CSS } from "../../render/levelView";
import { Actor } from "./actor";
import type { IntroCast } from "./introContract";
import { fitToWidth } from "./layout";
import { paperGrid, type G } from "./sketch";
import type { Script, ShotId, Speaker } from "./timeline";

export const SCREEN_W = VIEW_CELLS_X * CELL_PX;
export const SCREEN_H = VIEW_CELLS_Y * CELL_PX;

export interface ShotContext {
  scene: Phaser.Scene;
  cast: IntroCast;
  script: Script;
}

export interface TextStyle {
  font?: string;
  size: number;
  color?: string;
  weight?: string;
  /** Origin, 0..1 (default: centred). */
  ox?: number;
  oy?: number;
  rot?: number;
  /** Wrap width, in the text's own pixels. */
  wrap?: number;
  align?: "left" | "center" | "right";
  /** Texture resolution: raise it for text seen through a zoomed camera. */
  res?: number;
  stroke?: string;
  strokeW?: number;
  spacing?: number;
}

export interface Point {
  x: number;
  y: number;
}

export abstract class Shot {
  readonly root: Phaser.GameObjects.Container;
  protected readonly scene: Phaser.Scene;
  protected readonly cast: IntroCast;
  protected readonly script: Script;
  protected readonly world: Phaser.GameObjects.Container;
  protected readonly ui: Phaser.GameObjects.Container;
  private readonly gridG: G;
  protected camX = SCREEN_W / 2;
  protected camY = SCREEN_H / 2;
  protected zoom = 1;
  private offX = 0;
  private offY = 0;

  constructor(
    ctx: ShotContext,
    readonly id: ShotId,
  ) {
    this.scene = ctx.scene;
    this.cast = ctx.cast;
    this.script = ctx.script;
    this.root = ctx.scene.add.container(0, 0).setVisible(false);
    this.gridG = ctx.scene.add.graphics();
    this.world = ctx.scene.add.container(0, 0);
    this.ui = ctx.scene.add.container(0, 0);
    this.root.add([this.gridG, this.world, this.ui]);
  }

  /** Paints the shot at second `u` of its own clock. */
  abstract draw(u: number, life: number): void;

  /**
   * Where a speech bubble for `who` should point, in screen pixels (the top of the speaker's
   * head). Returns false when the speaker is not in this shot.
   */
  anchor(_who: Speaker, _out: Point): boolean {
    return false;
  }

  setVisible(on: boolean): void {
    this.root.setVisible(on);
  }

  /** A new Graphics object in a layer (the world by default). Layers draw in creation order. */
  protected gfx(parent: Phaser.GameObjects.Container = this.world): G {
    const g = this.scene.add.graphics();
    parent.add(g);
    return g;
  }

  protected actor(color: number, band = false, parent: Phaser.GameObjects.Container = this.world): Actor {
    return new Actor(this.scene, parent, color, band);
  }

  protected layer(parent: Phaser.GameObjects.Container = this.world): Phaser.GameObjects.Container {
    const c = this.scene.add.container(0, 0);
    parent.add(c);
    return c;
  }

  protected text(parent: Phaser.GameObjects.Container, x: number, y: number, value: string, style: TextStyle): Phaser.GameObjects.Text {
    const t = this.scene.add.text(x, y, value, {
      fontFamily: style.font ?? FONT_TEXT,
      fontSize: `${style.size}px`,
      fontStyle: style.weight ?? "",
      color: style.color ?? INK_CSS,
      align: style.align ?? "center",
      resolution: style.res ?? 1,
      padding: { x: Math.ceil(style.size * 0.25), y: Math.ceil(style.size * 0.2) },
      ...(style.wrap ? { wordWrap: { width: style.wrap, useAdvancedWrap: true } } : {}),
      ...(style.stroke ? { stroke: style.stroke, strokeThickness: style.strokeW ?? 4 } : {}),
      ...(style.spacing !== undefined ? { lineSpacing: style.spacing } : {}),
    });
    t.setOrigin(style.ox ?? 0.5, style.oy ?? 0.5);
    if (style.rot) t.setRotation(style.rot);
    // One texture per draw call. Phaser's default batch samples up to 16 textures in one shader;
    // on software WebGL (SwiftShader) that shader tears holes in rotated or scaled text quads.
    if ("renderNodes" in this.scene.sys.renderer) t.setRenderNodeRole("BatchHandler", "BatchHandlerQuadSingle");
    parent.add(t);
    return t;
  }

  /** A name label that never gets wider than `maxWidth`: longer names end with an ellipsis. */
  protected nameTag(parent: Phaser.GameObjects.Container, name: string, maxWidth: number, style: TextStyle): Phaser.GameObjects.Text {
    const t = this.text(parent, 0, 0, name, style);
    const pad = Math.ceil(style.size * 0.25) * 2;
    const fitted = fitToWidth(name, maxWidth, (s) => {
      t.setText(s);
      return t.width - pad;
    });
    t.setText(fitted);
    return t;
  }

  /** Points the shot's camera at a world point; (dx, dy) shifts the picture in screen pixels (shakes). */
  protected setCam(x: number, y: number, zoom: number, dx = 0, dy = 0): void {
    this.camX = x;
    this.camY = y;
    this.zoom = zoom;
    this.offX = dx;
    this.offY = dy;
    this.world.setScale(zoom).setPosition(SCREEN_W / 2 - x * zoom + dx, SCREEN_H / 2 - y * zoom + dy);
    this.gridG.clear();
    paperGrid(this.gridG, x - dx / zoom, y - dy / zoom, zoom, SCREEN_W, SCREEN_H, CELL_PX);
  }

  /** A world point on the screen. */
  protected toScreen(wx: number, wy: number, out: Point): Point {
    out.x = (wx - this.camX) * this.zoom + SCREEN_W / 2 + this.offX;
    out.y = (wy - this.camY) * this.zoom + SCREEN_H / 2 + this.offY;
    return out;
  }
}
