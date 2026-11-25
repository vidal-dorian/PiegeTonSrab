/**
 * Small props that appear in several shots: Ruben's protein shaker, his USB key (the thing the
 * players carry in every level), a dumbbell. Each is drawn around its own origin, then placed with
 * a position, a scale and a rotation.
 */
import { fillPoly, fillRR, INK, ORANGE, polyline, ring, strokeRR, WHITE, type G } from "./sketch";

const CUP = [-5, -8, 5, -8, 4, 10, -4, 10];

/** The shaker, standing upright on its origin's line: `level` is how full it is, 0..1. */
export function shaker(g: G, x: number, y: number, s: number, rot: number, level: number): void {
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(rot);
  g.scaleCanvas(s, s);
  fillPoly(g, CUP, WHITE);
  if (level > 0.02) {
    const top = 10 - 17 * Math.min(1, level);
    const half = 4 + ((10 - top) / 18) * 1;
    fillPoly(g, [-half, top, half, top, 4, 10, -4, 10], ORANGE);
  }
  polyline(g, CUP, 1.8, INK, true);
  g.lineStyle(1.2, INK, 1);
  g.lineBetween(-4.6, -2, -2.4, -2);
  g.lineBetween(-4.4, 3, -2.4, 3);
  fillRR(g, -6.2, -12.5, 12.4, 5, 1.6, INK);
  g.fillStyle(WHITE, 1);
  g.fillCircle(2.6, -14.2, 2.1);
  ring(g, 2.6, -14.2, 2.1, 1.4);
  g.restore();
}

/** The USB key, lying flat with its plug to the right. Orange: it is what the game is about. */
export function usbKey(g: G, x: number, y: number, s: number, rot: number, shadow = true): void {
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(rot);
  g.scaleCanvas(s, s);
  if (shadow) {
    fillRR(g, -11 + 1.6, -5.5 + 2.4, 16, 11, 2.6, INK);
    g.fillStyle(INK, 1);
    g.fillRect(4 + 1.6, -3.8 + 2.4, 8.5, 7.6);
  }
  g.fillStyle(WHITE, 1);
  g.fillRect(4, -3.8, 8.5, 7.6);
  g.lineStyle(1.6, INK, 1);
  g.beginPath();
  g.moveTo(4, -3.8);
  g.lineTo(12.5, -3.8);
  g.lineTo(12.5, 3.8);
  g.lineTo(4, 3.8);
  g.strokePath();
  g.fillStyle(INK, 1);
  g.fillRect(7.6, -2.3, 2, 1.7);
  g.fillRect(7.6, 0.6, 2, 1.7);
  fillRR(g, -11, -5.5, 16, 11, 2.6, ORANGE);
  strokeRR(g, -11, -5.5, 16, 11, 2.6, 1.8);
  g.fillStyle(WHITE, 1);
  g.fillCircle(-7.4, 0, 1.9);
  ring(g, -7.4, 0, 1.9, 1.3);
  g.restore();
}

/** A dumbbell lying along the x axis. */
export function dumbbell(g: G, x: number, y: number, s: number, rot: number): void {
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(rot);
  g.scaleCanvas(s, s);
  g.lineStyle(3, INK, 1);
  g.lineBetween(-9, 0, 9, 0);
  for (const side of [-1, 1]) {
    fillRR(g, side === 1 ? 7.5 : -12.5, -7, 5, 14, 1.6, INK);
    fillRR(g, side === 1 ? 12.5 : -15.5, -5, 3, 10, 1.2, INK);
    g.lineStyle(1, WHITE, 1);
    g.lineBetween(side * 10, -4, side * 10, 4);
  }
  g.restore();
}
