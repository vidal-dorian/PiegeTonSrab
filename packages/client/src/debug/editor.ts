/**
 * Debug editor for build step 2: place and remove objects with the mouse to try them out.
 * This is not the placement phase of the game (that comes with build step 3); it has no
 * draw, no timer and only the basic placement rule.
 *
 * E toggles the editor; 1 to 6 pick an object; R (or T) turns the rotatable ones (cannon,
 * spikes, spring) as in the game; click places on an empty cell or removes the object under
 * the cursor.
 */
import Phaser from "phaser";
import { defaultDir, DIR_VECTORS, OBJECT_DEFS, OBJECT_KINDS, type Dir, type ObjectKind } from "@game/shared";
import { CELL_PX } from "../config";

export interface EditorHost {
  /** Called on click with the cell under the cursor, the selected kind and its direction (rotatable kinds). */
  onCellClicked(x: number, y: number, kind: ObjectKind, dir: Dir | undefined): void;
  /** Why this object can't go in this cell (French, for the status line), or null if it can. */
  whyNot(x: number, y: number, kind: ObjectKind, dir: Dir | undefined): string | null;
  hasObjectAt(x: number, y: number): boolean;
}

export class DebugEditor {
  enabled = false;
  kind: ObjectKind = "saw";
  /** Direction of each rotatable kind, turned with R; each starts at its default (defaultDir). */
  private dirs = new Map<ObjectKind, Dir>();
  /** Why the hovered cell refuses the selected object, for the status line. */
  private refusal: string | null = null;
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
      if (cell) this.host.onCellClicked(cell.x, cell.y, this.kind, this.dir);
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
    if (code === "KeyR" || code === "KeyT") {
      const d = this.dir;
      if (d !== undefined) this.dirs.set(this.kind, ((d + 1) % 4) as Dir);
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

  /** Direction the selected kind is placed with, or undefined if it does not turn. */
  get dir(): Dir | undefined {
    return OBJECT_DEFS[this.kind].rotatable ? (this.dirs.get(this.kind) ?? defaultDir(this.kind)) : undefined;
  }

  /** Short status line for the HUD. */
  status(): string {
    if (!this.enabled) return "E : mode édition";
    const choices = OBJECT_KINDS.map((k, i) => {
      const name = `${i + 1} ${OBJECT_DEFS[k].name}`;
      return k === this.kind ? `[${name}]` : name;
    }).join("  ");
    const d = this.dir;
    const turn = d !== undefined ? ` · R tourner ${["→", "↓", "←", "↑"][d]}` : "";
    const why = this.refusal ? ` · ${this.refusal}` : "";
    return `ÉDITION (E pour quitter) · ${choices}${turn} · clic : poser / retirer${why}`;
  }

  /** Redraw the preview cell. */
  update(): void {
    this.preview.clear();
    this.refusal = null;
    if (!this.enabled || !this.hover) return;
    const { x, y } = this.hover;
    const removing = this.host.hasObjectAt(x, y);
    const dir = this.dir;
    this.refusal = removing ? null : this.host.whyNot(x, y, this.kind, dir);
    const ok = removing || this.refusal === null;
    const color = removing ? 0x161616 : ok ? 0xf07a2e : 0xb3361a;
    this.preview.lineStyle(2, color, 1);
    drawDashedRect(this.preview, x * CELL_PX + 2, y * CELL_PX + 2, CELL_PX - 4, CELL_PX - 4);
    if (removing || dir === undefined) return;
    // Which way the next object points (or fires, or throws).
    const { dx, dy } = DIR_VECTORS[dir];
    const cx = (x + 0.5) * CELL_PX;
    const cy = (y + 0.5) * CELL_PX;
    const tip = CELL_PX * 0.36;
    const back = CELL_PX * 0.12;
    const half = CELL_PX * 0.18;
    this.preview.fillStyle(color, 0.85);
    this.preview.fillTriangle(
      cx + dx * tip,
      cy + dy * tip,
      cx + dx * back - dy * half,
      cy + dy * back + dx * half,
      cx + dx * back + dy * half,
      cy + dy * back - dx * half,
    );
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
