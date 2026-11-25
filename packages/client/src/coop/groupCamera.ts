/**
 * The co-op camera follows the whole group: it centres on the box around every player and zooms
 * out a little when they spread (never below MIN_ZOOM), staying inside the level. Pure logic in
 * cells; apply() hands the result to the Phaser camera.
 */
import type Phaser from "phaser";
import { CELL_PX, VIEW_CELLS_X, VIEW_CELLS_Y } from "../config";

const MIN_ZOOM = 0.78;
const MAX_ZOOM = 1;
/** Room kept around the group, cells (more above: players jump). */
const MARGIN_X = 4;
const MARGIN_TOP = 4;
const MARGIN_BOTTOM = 3;
/** How fast the camera catches up, 1/s. */
const FOLLOW_SPEED = 5;
const ZOOM_SPEED = 2.5;

export interface CameraBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class GroupCamera {
  /** Centre of the view, cells. */
  cx = 0;
  cy = 0;
  zoom = 1;
  private started = false;

  constructor(
    private levelW: number,
    private levelH: number,
  ) {}

  /** Where the camera wants to be for these boxes: centre and zoom, clamped to the level. */
  target(boxes: readonly CameraBox[]): { cx: number; cy: number; zoom: number } {
    if (boxes.length === 0) return { cx: this.cx, cy: this.cy, zoom: this.zoom };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const b of boxes) {
      x0 = Math.min(x0, b.x);
      y0 = Math.min(y0, b.y);
      x1 = Math.max(x1, b.x + b.w);
      y1 = Math.max(y1, b.y + b.h);
    }
    const w = x1 - x0 + 2 * MARGIN_X;
    const h = y1 - y0 + MARGIN_TOP + MARGIN_BOTTOM;
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, VIEW_CELLS_X / w, VIEW_CELLS_Y / h));
    const cx = (x0 + x1) / 2;
    const cy = (y0 - MARGIN_TOP + y1 + MARGIN_BOTTOM) / 2;
    return { ...this.clamp(cx, cy, zoom), zoom };
  }

  update(dt: number, boxes: readonly CameraBox[]): void {
    const t = this.target(boxes);
    if (!this.started) {
      this.cx = t.cx;
      this.cy = t.cy;
      this.zoom = t.zoom;
      this.started = true;
      return;
    }
    const k = 1 - Math.exp(-FOLLOW_SPEED * dt);
    const kz = 1 - Math.exp(-ZOOM_SPEED * dt);
    this.zoom += (t.zoom - this.zoom) * kz;
    const c = this.clamp(this.cx + (t.cx - this.cx) * k, this.cy + (t.cy - this.cy) * k, this.zoom);
    this.cx = c.cx;
    this.cy = c.cy;
  }

  /** Jump straight to the target (level start, restart). */
  snap(boxes: readonly CameraBox[]): void {
    this.started = false;
    this.update(0, boxes);
  }

  apply(cam: Phaser.Cameras.Scene2D.Camera): void {
    cam.setZoom(this.zoom);
    cam.centerOn(this.cx * CELL_PX, this.cy * CELL_PX);
  }

  private clamp(cx: number, cy: number, zoom: number): { cx: number; cy: number } {
    const vw = VIEW_CELLS_X / zoom;
    const vh = VIEW_CELLS_Y / zoom;
    const x = this.levelW <= vw ? this.levelW / 2 : Math.max(vw / 2, Math.min(this.levelW - vw / 2, cx));
    const y = this.levelH <= vh ? this.levelH / 2 : Math.max(vh / 2, Math.min(this.levelH - vh / 2, cy));
    return { cx: x, cy: y };
  }
}
