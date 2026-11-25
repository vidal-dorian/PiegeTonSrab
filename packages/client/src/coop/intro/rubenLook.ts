/**
 * Ruben's look: the sports sweatband he always wears (he lives at the gym). Shared by the intro and
 * by the game, so the player who plays Ruben looks the same in the story and in the levels.
 *
 * Contract: drawRubenBand(g, pose) draws the band for a blob drawn with drawBlob(g2, pose), with the
 * same pose, into `g` WITHOUT clearing it (draw it after the body, on a graphics object at the same
 * depth or above). It follows the pose's squash, lean, facing and tilt through blobFrame.
 * Players are never orange or red (art direction), so the band is white with ink stripes.
 *
 * The band hugs the pebble's own outline (same curve as drawBlob), sits just above the eyes and
 * rises a little towards the back, where a knot holds two loose ends. It stays readable at the
 * in-game size (body 32 x 36 px) on every player colour, white included: the ink edge and the two
 * stripes carry it. The optional `timeMs` makes the loose ends flutter; without it they hang still.
 */
import type Phaser from "phaser";
import { INK, WHITE } from "../../render/levelView";
import { blobFrame, type BlobPose } from "../../render/playerView";

/** Height of the band's lower edge above the body centre, as a fraction of the half height. */
const BAND_LOW = 0.5;
/** Band thickness, same unit. */
const BAND_THICK = 0.31;
/** How much higher the band sits at the back of the head than at the front. */
const BAND_TILT = 0.1;
const STEPS = 8;
const SIDE_STEPS = 3;

/**
 * Half width of the pebble at height `v` (0 at the body centre, 1 at the top of the head), and how
 * far its middle is pushed forward there: the same curve as drawBlob's upper half.
 */
function contour(v: number, rx: number): { half: number; mid: number } {
  const k = Math.min(Math.max(v, 0), 0.985);
  const s = k ** (2.3 / 2);
  const c = Math.sqrt(Math.max(0, 1 - s * s));
  return { half: rx * c ** (2 / 2.3) * (1 - 0.06 * k), mid: 1.6 * k };
}

export function drawRubenBand(g: Phaser.GameObjects.Graphics, pose: BlobPose, timeMs?: number): void {
  const { w, h, tx } = blobFrame(pose);
  const rx = w / 2;
  const ry = h / 2;
  const unit = w / 32;
  /** A point of the band: `side` -1 at the back of the head, +1 at the front; v as in contour(). */
  const at = (side: number, v: number, proud: number): [number, number] => {
    const { half, mid } = contour(v, rx);
    return tx(mid + side * (half + proud), -ry - v * ry);
  };
  // Lower and upper edges, from the back (k = 0) to the front (k = 1). The band wraps a round
  // head: it bulges up a little in the middle, and it sits a little proud of the body.
  const low = (k: number) => BAND_LOW + BAND_TILT * (1 - k) + 0.07 * Math.sin(k * Math.PI);
  const edge = (k: number, v: number): [number, number] => at(k * 2 - 1, v, 0.9 * unit);

  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    for (let i = 0; i <= STEPS; i++) {
      const k = i / STEPS;
      const [x, y] = edge(k, low(k));
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    for (let i = 1; i < SIDE_STEPS; i++) {
      const [x, y] = edge(1, low(1) + (BAND_THICK * i) / SIDE_STEPS);
      g.lineTo(x, y);
    }
    for (let i = STEPS; i >= 0; i--) {
      const k = i / STEPS;
      const [x, y] = edge(k, low(k) + BAND_THICK);
      g.lineTo(x, y);
    }
    for (let i = SIDE_STEPS - 1; i >= 1; i--) {
      const [x, y] = edge(0, low(0) + (BAND_THICK * i) / SIDE_STEPS);
      g.lineTo(x, y);
    }
    g.closePath();
    if (pass === 0) {
      g.fillStyle(WHITE, 1);
      g.fillPath();
    } else {
      g.lineStyle(2 * unit, INK, 1);
      g.strokePath();
    }
  }

  // Two slanted ink stripes towards the front, like a tennis band.
  g.lineStyle(1.7 * unit, INK, 1);
  for (const k of [0.56, 0.7]) {
    const [x0, y0] = edge(k + 0.035, low(k) + 0.05);
    const [x1, y1] = edge(k - 0.035, low(k) + BAND_THICK - 0.05);
    g.lineBetween(x0, y0, x1, y1);
  }

  // The knot at the back of the head and its two loose ends. They trail behind when the body
  // leans into a run, and flutter when a clock is given.
  const vKnot = low(0) + BAND_THICK / 2;
  const { half, mid } = contour(vKnot, rx);
  const kx = mid - half - 1.2 * unit;
  const ky = -ry - vKnot * ry;
  const t = timeMs === undefined ? 0 : timeMs / 1000;
  const wave = timeMs === undefined ? 0 : 1;
  const drag = Math.max(-1, Math.min(1, pose.lean / 4));
  const ends: Array<[number, number, number]> = [
    [-0.25, 0.1, 0],
    [-0.17, 0.2, 1.7],
  ];
  for (const [ex, ey, phase] of ends) {
    const flutterX = wave * Math.sin(t * 5.2 + phase) * 0.025;
    const flutterY = wave * Math.cos(t * 4.1 + phase * 1.3) * 0.03;
    const [x0, y0] = tx(kx, ky);
    const [x1, y1] = tx(kx + w * (ex * 0.55 - drag * 0.05), ky + h * (ey * 0.45 - drag * 0.02) + h * flutterY * 0.5);
    const [x2, y2] = tx(kx + w * (ex - drag * 0.1 + flutterX), ky + h * (ey - drag * 0.07 + flutterY));
    for (let pass = 0; pass < 2; pass++) {
      g.lineStyle((pass === 0 ? 5 : 2.2) * unit, pass === 0 ? INK : WHITE, 1);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.lineTo(x2, y2);
      g.strokePath();
      g.fillStyle(pass === 0 ? INK : WHITE, 1);
      g.fillCircle(x2, y2, (pass === 0 ? 2.5 : 1.1) * unit);
    }
  }
  const [cx, cy] = tx(kx, ky);
  g.fillStyle(INK, 1);
  g.fillCircle(cx, cy, 3.6 * unit);
  g.fillStyle(WHITE, 1);
  g.fillCircle(cx, cy, 2.1 * unit);
}
