/**
 * Debug editor for build step 2: place and remove objects with the mouse to try them out.
 * This is not the placement phase of the game (that comes with build step 3); it has no
 * draw, no timer and only the basic placement rule.
 *
 * E toggles the editor; 1 to 6 pick an object; T turns cannons; click places on an empty
 * cell or removes the object under the cursor.
 */
import Phaser from "phaser";
import { OBJECT_DEFS, OBJECT_KINDS, type Dir, type ObjectKind } from "@game/shared";
import { CELL_PX } from "../config";

export interface EditorHost {
  /** Called on click with the cell under the cursor. */
  onCellClicked(x: number, y: number, kind: ObjectKind): void;
  /** Whether an object could go in this cell, for the preview colour. */
  canPlace(x: number, y: number): boolean;
  hasObjectAt(x: number, y: number): boolean;
}

export class DebugEditor {
  enabled = false;
  kind: ObjectKind = "saw";
  /** Direction given to rotatable objects (cannon). */
  dir: Dir = 2;
  private hover: { x: number; y: number } | null = null;
  private preview: Phaser.GameObjects.Graphics;
  private cleanup: Array<() => void> = [];

  constructor(
    private scene: Phaser.Scene,
    private host: EditorHost,
  ) {
    this.preview = scene.add.graphics().setDepth(5);
    const canvas = scene.game.canvas;

    const move = (e: PointerEvent) => {
      this.hover = this.cellAt(e.clientX, e.clientY);
    };
    const leave = () => {
      this.hover = null;
    };
    const down = (e: PointerEvent) => {
      if (!this.enabled || e.button !== 0) return;
      const cell = this.cellAt(e.clientX, e.clientY);
      if (cell) this.host.onCellClicked(cell.x, cell.y, this.kind);
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerdown", down);
    this.cleanup.push(
      () => canvas.removeEventListener("pointermove", move),
      () => canvas.removeEventListener("pointerleave", leave),
      () => canvas.removeEventListener("pointerdown", down),
    );
  }

  /** Handle a key press; returns true if the editor used it. */
  handleKey(code: string): boolean {
    if (code === "KeyE") {
      this.enabled = !this.enabled;
      return true;
    }
    if (!this.enabled) return false;
    if (code === "KeyT") {
      this.dir = ((this.dir + 1) % 4) as Dir;
      return true;
    }
    const index = /^Digit([1-9])$/.test(code) ? Number(code.slice(5)) - 1 : -1;
    const kind = OBJECT_KINDS[index];
    if (index >= 0 && kind) {
      this.kind = kind;
      return true;
    }
    return false;
  }

  /** Short status line for the HUD. */
  status(): string {
    if (!this.enabled) return "E : mode édition";
    const choices = OBJECT_KINDS.map((k, i) => {
      const name = `${i + 1} ${OBJECT_DEFS[k].name}`;
      return k === this.kind ? `[${name}]` : name;
    }).join("  ");
    const arrow = ["→", "↓", "←", "↑"][this.dir];
    return `ÉDITION (E pour quitter) · ${choices} · T canon ${arrow} · clic : poser / retirer`;
  }

  /** Redraw the preview cell. */
  update(): void {
    this.preview.clear();
    if (!this.enabled || !this.hover) return;
    const { x, y } = this.hover;
    const removing = this.host.hasObjectAt(x, y);
    const ok = removing || this.host.canPlace(x, y);
    const color = removing ? 0x161616 : ok ? 0xf07a2e : 0xb3361a;
    this.preview.lineStyle(2, color, 1);
    drawDashedRect(this.preview, x * CELL_PX + 2, y * CELL_PX + 2, CELL_PX - 4, CELL_PX - 4);
  }

  private cellAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const canvas = this.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const cam = this.scene.cameras.main;
    const gameX = ((clientX - rect.left) / rect.width) * this.scene.scale.width;
    const gameY = ((clientY - rect.top) / rect.height) * this.scene.scale.height;
    return {
      x: Math.floor((gameX + cam.scrollX) / CELL_PX),
      y: Math.floor((gameY + cam.scrollY) / CELL_PX),
    };
  }

  destroy(): void {
    for (const fn of this.cleanup) fn();
    this.preview.destroy();
  }
}

export function drawDashedRect(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  const dash = 6;
  const gap = 4;
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1);
    for (let d = 0; d < len; d += dash + gap) {
      const a = d / len;
      const b = Math.min(d + dash, len) / len;
      g.lineBetween(x1 + (x2 - x1) * a, y1 + (y2 - y1) * a, x1 + (x2 - x1) * b, y1 + (y2 - y1) * b);
    }
  };
  edge(x, y, x + w, y);
  edge(x + w, y, x + w, y + h);
  edge(x + w, y + h, x, y + h);
  edge(x, y + h, x, y);
}
