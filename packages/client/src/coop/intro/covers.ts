/**
 * The covers that hide a change of shot. Each is drawn over the whole screen as a function of its
 * progress p (0 → 1): it must hide everything around p = 0.5, when the picture changes underneath.
 *
 * - "page": a blank sketchbook sheet sweeps across from the right, as if the page were turned.
 * - "ink": night falls. Ink pours down from the top, then drains away.
 * - "scribble": an orange marker scribbles over the screen, then the scribble is wiped off.
 *
 * No masks: a cover is plain shapes on top, so the shots underneath stay crisp.
 */
import { clamp01, easeIn, easeOut, hash, lerp, seg, smooth } from "./anim";
import { SCREEN_H, SCREEN_W } from "./shot";
import { INK, LINE, ORANGE, OUTLINE, PAPER, WHITE, type G } from "./sketch";
import type { CoverKind } from "./timeline";

export function drawCover(g: G, kind: CoverKind, p: number): void {
  if (kind === "page") pageCover(g, p);
  else if (kind === "ink") inkCover(g, p);
  else if (kind === "scribble") scribbleCover(g, p);
}

const SHEET_W = 1760;
const SHEET_H = 1000;

function pageCover(g: G, p: number): void {
  const travel = SCREEN_W + SHEET_W + 160;
  const cx = SCREEN_W / 2 + travel / 2 - travel * smooth(clamp01(p));
  const left = -SHEET_W / 2;
  const top = -SHEET_H / 2;
  g.save();
  g.translateCanvas(cx, SCREEN_H / 2);
  g.rotateCanvas(-0.045 + 0.03 * Math.sin(p * Math.PI));
  // Solid shadow, then the sheet.
  g.fillStyle(INK, 1);
  g.fillRect(left + 10, top + 16, SHEET_W, SHEET_H);
  g.fillStyle(PAPER, 1);
  g.fillRect(left, top, SHEET_W, SHEET_H);
  g.lineStyle(1.5, LINE, 1);
  for (let x = left + 40; x < left + SHEET_W; x += 40) g.lineBetween(x, top, x, top + SHEET_H);
  for (let y = top + 20; y < top + SHEET_H; y += 40) g.lineBetween(left, y, left + SHEET_W, y);
  g.lineStyle(OUTLINE * 1.4, INK, 1);
  g.lineBetween(left, top, left, top + SHEET_H);
  g.lineBetween(left + SHEET_W, top, left + SHEET_W, top + SHEET_H);
  // The holes of the spiral binding, along the edge that leaves last.
  g.fillStyle(INK, 1);
  for (let y = top + 34; y < top + SHEET_H; y += 46) g.fillCircle(left + SHEET_W - 34, y, 8);
  g.restore();
}

const DRIPS = 26;

function inkCover(g: G, p: number): void {
  const colW = SCREEN_W / DRIPS;
  g.fillStyle(INK, 1);
  if (p < 0.5) {
    // Pouring: a flat mass coming down, with drips running ahead of it.
    const k = easeIn(seg(p, 0, 0.47));
    const base = lerp(-260, SCREEN_H + 20, k);
    if (base > 0) g.fillRect(0, 0, SCREEN_W, base + 1);
    for (let i = 0; i < DRIPS; i++) {
      const len = 40 + hash(i * 3.1) * 220;
      const w = colW * (0.62 + hash(i * 7.7) * 0.5);
      const x = i * colW + (colW - w) / 2;
      const tip = base + len * (0.4 + 0.6 * k);
      if (tip < 0) continue;
      g.fillRect(x, base - 2, w, tip - base + 2);
      g.fillCircle(x + w / 2, tip, w / 2);
    }
    return;
  }
  // Draining: the top edge goes down and leaves a few thin trails behind.
  const k = easeOut(seg(p, 0.53, 1));
  const edge = lerp(-40, SCREEN_H + 60, k);
  if (edge < SCREEN_H) g.fillRect(0, Math.max(0, edge), SCREEN_W, SCREEN_H - Math.max(0, edge) + 1);
  for (let i = 0; i < DRIPS; i++) {
    const w = colW * (0.5 + hash(i * 5.3) * 0.5);
    const x = i * colW + (colW - w) / 2;
    const lag = 30 + hash(i * 1.9) * 190 * (1 - k * 0.6);
    const topY = edge - lag;
    g.fillRect(x, topY, w, lag + 2);
    g.fillCircle(x + w / 2, topY, w / 2);
  }
}

const ZIG = 21;
const ZIG_STEP = 84;
const ZIG_WIDTH = 210;

function zigPoint(i: number, out: { x: number; y: number }): void {
  out.x = -170 + i * ZIG_STEP + (hash(i * 2.3) - 0.5) * 26;
  out.y = i % 2 === 0 ? -90 + (hash(i * 4.1) - 0.5) * 40 : SCREEN_H + 90 + (hash(i * 6.7) - 0.5) * 40;
}

const zigA = { x: 0, y: 0 };
const zigB = { x: 0, y: 0 };

function scribbleCover(g: G, p: number): void {
  // Scribbled on from the left up to p = 0.5, then wiped off from the left too.
  const from = p < 0.5 ? 0 : smooth(seg(p, 0.54, 1)) * ZIG;
  const to = p < 0.5 ? smooth(seg(p, 0, 0.46)) * ZIG : ZIG;
  if (to <= from) return;
  g.fillStyle(ORANGE, 1);
  g.lineStyle(ZIG_WIDTH, ORANGE, 1);
  for (let i = Math.floor(from); i < Math.ceil(to); i++) {
    zigPoint(i, zigA);
    zigPoint(i + 1, zigB);
    const a = clamp01(from - i);
    const b = clamp01(to - i);
    if (b <= a) continue;
    const x0 = lerp(zigA.x, zigB.x, a);
    const y0 = lerp(zigA.y, zigB.y, a);
    const x1 = lerp(zigA.x, zigB.x, b);
    const y1 = lerp(zigA.y, zigB.y, b);
    g.lineBetween(x0, y0, x1, y1);
    g.fillCircle(x0, y0, ZIG_WIDTH / 2);
    g.fillCircle(x1, y1, ZIG_WIDTH / 2);
  }
  // The felt tip leaves paler streaks along each stroke.
  for (let i = Math.floor(from); i < Math.ceil(to); i++) {
    zigPoint(i, zigA);
    zigPoint(i + 1, zigB);
    const a = clamp01(from - i);
    const b = clamp01(to - i);
    if (b <= a) continue;
    const dx = zigB.x - zigA.x;
    const dy = zigB.y - zigA.y;
    const len = Math.hypot(dx, dy) || 1;
    for (let k = 0; k < 3; k++) {
      const off = (hash(i * 3.7 + k) - 0.5) * ZIG_WIDTH * 0.7;
      const nx = (-dy / len) * off;
      const ny = (dx / len) * off;
      g.lineStyle(3 + hash(i + k * 5.1) * 5, WHITE, 0.16);
      g.lineBetween(lerp(zigA.x, zigB.x, a) + nx, lerp(zigA.y, zigB.y, a) + ny, lerp(zigA.x, zigB.x, b) + nx, lerp(zigA.y, zigB.y, b) + ny);
    }
  }
}
