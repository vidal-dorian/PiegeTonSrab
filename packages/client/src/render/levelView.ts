/**
 * Drawing of the level terrain: grid, solid cells, start marker, finish flag, labels.
 * Plain shapes until the art direction (build step 5).
 */
import Phaser from "phaser";
import type { Level } from "@game/shared";
import { CELL_PX } from "../config";

export const LEVEL_COLORS = {
  grid: 0xdcd8cc,
  solid: 0x161616,
  start: 0x161616,
  finish: 0xf07a2e,
  label: "#161616",
};

export interface LevelView {
  /** The grid lines, which the debug panel can hide. */
  grid: Phaser.GameObjects.Graphics;
}

export function drawLevel(scene: Phaser.Scene, level: Level): LevelView {
  const { width, height } = level;
  const C = LEVEL_COLORS;

  const grid = scene.add.graphics();
  grid.lineStyle(1, C.grid, 1);
  for (let x = 0; x <= width; x++) grid.lineBetween(x * CELL_PX, 0, x * CELL_PX, height * CELL_PX);
  for (let y = 0; y <= height; y++) grid.lineBetween(0, y * CELL_PX, width * CELL_PX, y * CELL_PX);

  const solids = scene.add.graphics();
  solids.fillStyle(C.solid, 1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (level.solid[y * width + x]) solids.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
    }
  }

  const markers = scene.add.graphics();
  const s = level.start;
  markers.lineStyle(2, C.start, 1);
  markers.strokeRect(s.x * CELL_PX + 4, s.y * CELL_PX + 4, CELL_PX - 8, CELL_PX - 8);
  const f = level.finish;
  if (f) {
    // Flag: pole and pennant.
    const px = f.x * CELL_PX;
    const py = f.y * CELL_PX;
    markers.fillStyle(C.solid, 1);
    markers.fillRect(px + 10, py - CELL_PX, 3, CELL_PX * 2);
    markers.fillStyle(C.finish, 1);
    markers.fillTriangle(px + 13, py - CELL_PX, px + 13, py - CELL_PX + 22, px + 36, py - CELL_PX + 11);
  }

  for (const l of level.labels) {
    scene.add
      .text(l.x * CELL_PX, l.y * CELL_PX, l.text, { fontFamily: "sans-serif", fontSize: "18px", color: C.label })
      .setOrigin(0.5, 0.5);
  }
  return { grid };
}
