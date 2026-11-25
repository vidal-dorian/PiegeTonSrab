/**
 * Shot 3: the gym. "Sauf une": the one loop Ruben masters is a set of twelve reps. He presses a
 * barbell that bends under its plates while a counter written like a for loop goes from 8 to 12;
 * the last rep is a fight, the stop condition is respected, the bar hits the floor.
 */
import type Phaser from "phaser";
import { FONT_MARKER, FONT_TITLE } from "../../../render/levelView";
import type { Actor } from "../actor";
import { backOut, bump, clamp01, easeInOut, easeOut, lerp, noise, seg, shake, typed } from "../anim";
import { dumbbell } from "../props";
import { Shot, type ShotContext } from "../shot";
import {
  burst,
  check,
  drop,
  fillRR,
  GREY,
  hatch,
  INK,
  MONO,
  ORANGE,
  panel,
  rays,
  ring,
  setHatch,
  sparkle,
  stroke,
  strokeRR,
  swoosh,
  WHITE,
  type G,
} from "../sketch";
import { CUE } from "../timeline";

const C = CUE.gym;
const FLOOR = 300;
const RUBEN_X = 286;
const BAR_HALF = 74;
const FIRST_COUNT = 8;

/** How far up the bar is (0 on the shoulders, 1 at arm's length... if he had arms) and how hard he strains. */
function repState(u: number, out: { up: number; squat: number; strain: number; count: number }): void {
  out.up = 0;
  out.squat = 0;
  out.strain = 0;
  out.count = FIRST_COUNT;
  for (let i = 0; i < C.reps.length; i++) {
    const start = C.reps[i]!;
    const last = i === C.reps.length - 1;
    const dur = last ? C.lastRepDur : C.repDur;
    if (u < start) break;
    const p = (u - start) / dur;
    if (!last) {
      if (p >= 0.66) out.count = FIRST_COUNT + i + 1;
      if (p >= 1) continue;
      out.squat = bump(p, 0, 0.36);
      out.up = p < 0.3 ? 0 : p < 0.66 ? easeOut(seg(p, 0.3, 0.66)) : 1 - easeInOut(seg(p, 0.78, 1));
    } else {
      // The twelfth: halfway up, it stalls, shakes, and goes.
      out.squat = bump(p, 0, 0.3);
      const stall = 0.55 + noise(u * 9, 7) * 0.03;
      out.up = p < 0.22 ? 0 : p < 0.5 ? easeOut(seg(p, 0.22, 0.5)) * stall : p < 0.78 ? stall : lerp(stall, 1, easeInOut(seg(p, 0.78, 1)));
      out.strain = p < 1 ? bump(p, 0.25, 0.75) : 0;
      if (p >= 1) {
        out.count = FIRST_COUNT + i + 1;
        out.up = 1;
      }
    }
  }
}

export class GymShot extends Shot {
  private readonly runner: Actor;
  private readonly machine: G;
  private readonly ruben: Actor;
  private readonly fx: G;
  private readonly countText: Phaser.GameObjects.Text;
  private readonly noteText: Phaser.GameObjects.Text;
  private readonly boomText: Phaser.GameObjects.Text;
  private readonly uiG: G;
  private readonly placeText: Phaser.GameObjects.Text;
  private readonly rep = { up: 0, squat: 0, strain: 0, count: FIRST_COUNT };
  private countShown = -1;
  private placeShown = -1;

  constructor(ctx: ShotContext) {
    super(ctx, "gym");
    const cards = ctx.script.cards;
    setHatch(6, 1.2);
    this.drawRoom(this.gfx(), cards.poster!.text, cards.gymCode!.text);
    this.runner = this.actor(GREY);
    this.machine = this.gfx();
    this.ruben = this.actor(ctx.cast.ruben.color, true);
    this.fx = this.gfx();
    this.text(this.world, 384, 152, "rep =", { font: MONO, weight: "bold", size: 12, ox: 0, res: 3 });
    this.countText = this.text(this.world, 447, 151, "8", { font: FONT_TITLE, weight: "700", size: 30, res: 3 });
    this.noteText = this.text(this.world, 0, 0, cards.gymNote!.text, { font: FONT_MARKER, size: 11.5, res: 3, rot: -0.04, ox: 0 });
    this.boomText = this.text(this.world, 0, 0, "BOUM", { font: FONT_MARKER, size: 22, res: 3, rot: -0.1 });
    this.uiG = this.gfx(this.ui);
    this.placeText = this.text(this.ui, 56, 30, "", { font: FONT_MARKER, size: 50, ox: 0, oy: 0, rot: -0.025 });
  }

  private drawRoom(g: G, poster: string, code: string): void {
    g.fillStyle(WHITE, 1);
    g.fillRect(-300, FLOOR, 1300, 260);
    hatch(g, -300, FLOOR, 1300, 260);
    stroke(g, -300, FLOOR, 1000, FLOOR);
    // The lifting mat.
    fillRR(g, 176, FLOOR - 4, 300, 7, 2, INK);
    // The poster. Blobs have no arms: they know.
    g.save();
    g.translateCanvas(128, 158);
    g.rotateCanvas(-0.05);
    panel(g, -50, -30, 100, 60, { r: 3, shadow: 0.7 });
    g.fillStyle(GREY, 1);
    g.fillRect(-14, -37, 28, 11);
    g.restore();
    this.text(this.world, 128, 158, poster, { font: FONT_TITLE, weight: "700", size: 9.5, res: 3, rot: -0.05, spacing: 2 });
    // The dumbbell rack.
    for (const y of [246, 272]) {
      panel(g, 66, y, 96, 5, { r: 1, outline: 2, shadow: 0.5 });
    }
    stroke(g, 72, 240, 72, FLOOR, 3);
    stroke(g, 156, 240, 156, FLOOR, 3);
    dumbbell(g, 94, 240, 0.9, 0);
    dumbbell(g, 134, 240, 0.7, 0);
    dumbbell(g, 92, 266, 0.75, 0);
    dumbbell(g, 132, 265, 1, 0);
    // A kettlebell by the mat.
    ring(g, 176, 278, 6, 3);
    g.fillStyle(INK, 1);
    g.fillCircle(176, 288, 8.5);
    g.fillStyle(WHITE, 1);
    g.fillRect(172, 286, 8, 2);
    // The loop, pinned on the wall like the session's programme.
    panel(g, 262, 96, 232, 78, { r: 6, shadow: true });
    g.fillStyle(INK, 1);
    g.fillCircle(378, 96, 4);
    this.text(this.world, 274, 114, code, { font: MONO, weight: "bold", size: 10.5, ox: 0, res: 3 });
    panel(g, 422, 132, 50, 37, { r: 5, outline: 2, hatch: true });
  }

  draw(u: number, life: number): void {
    setHatch(6, 1.2);
    repState(u, this.rep);
    const { up, squat, strain, count } = this.rep;
    const punch = 1 - easeOut(seg(u, 0, 0.35));
    const fallT = seg(u, C.drop, C.drop + 0.3);
    const landed = u >= C.drop + 0.3;
    const boom = shake(u, C.drop + 0.3, 0.5) * 9;
    this.setCam(
      306 + noise(life * 0.5, 5) * 1 + strain * noise(u * 30, 6) * 0.8,
      206 - punch * 10 + noise(life * 0.45, 8) * 0.7,
      lerp(2.55, 2.75, seg(u, 0, C.drop)) + punch * 0.5,
      boom * 0.3,
      boom,
    );

    // Background life: somebody runs on the treadmill and gets nowhere.
    const m = this.machine;
    m.clear();
    const stride = (life * 2.6) % 1;
    this.runner.draw(
      {
        x: 512 + Math.sin(life * 2.6 * Math.PI * 2) * 2,
        y: FLOOR - 15 - bump(stride, 0, 1) * 5,
        facing: -1,
        sx: 1 - bump(stride, 0, 1) * 0.05,
        sy: 1 + bump(stride, 0, 1) * 0.07,
        lean: 4,
        lookX: 0.9,
      },
      life,
    );
    panel(m, 474, FLOOR - 15, 82, 9, { r: 4, outline: 2, shadow: 0.5 });
    m.lineStyle(1.5, INK, 1);
    for (let i = 0; i < 5; i++) {
      const bx = 478 + ((i * 16 + life * 60) % 76);
      m.lineBetween(bx, FLOOR - 13, bx - 3, FLOOR - 8);
    }
    stroke(m, 480, FLOOR - 15, 470, FLOOR - 52, 3);
    panel(m, 458, FLOOR - 60, 24, 12, { r: 3, outline: 2 });
    stroke(m, 484, FLOOR - 6, 484, FLOOR, 3);
    stroke(m, 548, FLOOR - 6, 548, FLOOR, 3);

    // Ruben and the bar.
    const tremble = strain * noise(u * 34, 2) * 1.6;
    const cheer = bump(u, C.drop + 0.45, 0.5);
    const sy = Math.max(0.6, 1 - squat * 0.3 + up * 0.2 * (1 - squat) + cheer * 0.12);
    const sx = 1 + squat * 0.24 - up * 0.1 * (1 - squat) - cheer * 0.06;
    const holding = u < C.drop;
    const feetY = FLOOR - 4 - cheer * 14;
    this.ruben.draw(
      {
        x: RUBEN_X + tremble,
        y: feetY,
        facing: 1,
        sx,
        sy,
        lookX: holding ? 0.15 : 0.7,
        lookY: holding ? lerp(0.2, -0.85, up) : -0.3,
        ...(strain > 0.35 ? { blink: true } : {}),
      },
      life,
    );
    const headY = feetY - 36 * sy;
    const g = this.fx;
    g.clear();

    let barY = headY - lerp(1, 15, up);
    let barRot = tremble * 0.012;
    let barX = RUBEN_X + tremble;
    let flex = squat * 5 + (1 - up) * 1.5 + strain * 2;
    if (!holding) {
      const y0 = FLOOR - 4 - 36 * 1.2 - 15;
      const ground = FLOOR - 4 - 23;
      const bounce = landed ? Math.abs(Math.sin((u - C.drop - 0.3) * 13)) * 7 * Math.max(0, 1 - (u - C.drop - 0.3) / 0.5) : 0;
      barY = landed ? ground - bounce : lerp(y0, ground, fallT * fallT);
      barX = RUBEN_X + 6 + easeOut(seg(u, C.drop, C.drop + 0.6)) * 98;
      barRot = landed ? 0 : 0.05 * fallT;
      flex = landed ? bounce * 0.3 : -2;
    }
    barbell(g, barX, barY, barRot, flex);

    // Effort: sweat on every rep, a lot of it on the last one.
    if (holding && u > C.reps[0]) {
      const drops = strain > 0.1 ? 4 : 2;
      for (let i = 0; i < drops; i++) {
        const p = (u * (1.1 + i * 0.13) + i * 0.37) % 1;
        const side = i % 2 === 0 ? -1 : 1;
        drop(g, RUBEN_X + side * (17 + p * 14), headY + 8 + p * p * 30 - p * 8, 2.2 + (i % 2) * 0.6, WHITE, 1 - p);
      }
      if (strain > 0.1) rays(g, RUBEN_X, headY + 16, 26, 31 + strain * 3, 8, u * 3, 1.8, INK, clamp01(strain * 1.5));
    }
    // Lockout: twelve, clean.
    const win = bump(u, C.lockout, C.drop - C.lockout + 0.2);
    if (win > 0 && holding) {
      for (const [dx, dy, r, ph] of [
        [-52, -6, 7, 0],
        [50, -16, 9, 0.9],
        [-30, -30, 5, 1.7],
        [34, 14, 6, 2.4],
      ] as const) {
        const k = Math.max(0, Math.sin((u - C.lockout) * 9 + ph));
        if (k > 0.05) sparkle(g, RUBEN_X + dx, headY + dy, r * k);
      }
    }
    // The bar hits the floor.
    const hit = bump(u, C.drop + 0.3, 0.6);
    this.boomText.setVisible(hit > 0);
    if (hit > 0) {
      const k = backOut(seg(u, C.drop + 0.3, C.drop + 0.45));
      burst(g, barX, FLOOR - 4, 46 * k, 26 * k, 11, 0.2, WHITE, 2, clamp01(hit * 2));
      this.boomText
        .setPosition(barX + 6, FLOOR - 52 - (1 - hit) * 6)
        .setScale(0.6 + 0.4 * k)
        .setAlpha(clamp01(hit * 2.5));
      g.lineStyle(2, INK, clamp01(hit * 2));
      for (const s of [-1, 1]) {
        g.lineBetween(barX + s * 84, FLOOR - 8, barX + s * (96 + (1 - hit) * 10), FLOOR - 14);
        g.lineBetween(barX + s * 86, FLOOR - 2, barX + s * (102 + (1 - hit) * 10), FLOOR - 2);
      }
    }

    // The counter: the loop variable, live.
    if (count !== this.countShown) {
      this.countShown = count;
      this.countText.setText(String(count));
    }
    let tick = 0;
    for (let i = 0; i < C.reps.length; i++) {
      const last = i === C.reps.length - 1;
      const at = last ? C.lockout : C.reps[i]! + C.repDur * 0.66;
      tick = Math.max(tick, bump(u, at, 0.3));
    }
    this.countText.setScale(1 + tick * 0.45).setRotation(tick * -0.1);
    if (count >= FIRST_COUNT + C.reps.length) swoosh(g, 427, 173, 468, seg(u, C.lockout + 0.1, C.lockout + 0.35), 3, ORANGE, 1.5);

    // "Condition d'arrêt : respectée", noted by hand under the loop.
    const note = seg(u, C.note + 0.45, C.note + 0.7);
    this.noteText.setVisible(note > 0);
    if (note > 0) {
      this.noteText.setPosition(268, 190).setAlpha(note);
      check(g, 268 + this.noteText.width + 4, 190, 6, 2.6, INK, seg(u, C.note + 0.7, C.note + 0.9));
    }

    this.drawPlace(u);
  }

  private drawPlace(u: number): void {
    const g = this.uiG;
    g.clear();
    const card = this.script.cards.gymPlace!;
    const out = easeInOut(seg(u, 3.4, 3.9));
    const visible = u >= card.u0 && out < 1;
    this.placeText.setVisible(visible);
    if (!visible) return;
    const shown = typed(card.text.length, u, card.u0, 24);
    if (shown !== this.placeShown) {
      this.placeShown = shown;
      this.placeText.setText(card.text.slice(0, shown));
    }
    const dx = -out * 700;
    this.placeText.setPosition(56 + dx, 30);
    const done = card.u0 + card.text.length / 24;
    swoosh(g, 62 + dx, 106, 62 + this.placeText.width - 10 + dx, seg(u, done, done + 0.3), 6, ORANGE, 2.5);
  }
}

/** The barbell, centred on (x, y): the bar bends under its plates. */
function barbell(g: G, x: number, y: number, rot: number, flex: number): void {
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(rot);
  g.lineStyle(3.4, INK, 1);
  g.beginPath();
  g.moveTo(-BAR_HALF - 12, flex);
  g.lineTo(-BAR_HALF * 0.5, flex * 0.35);
  g.lineTo(0, 0);
  g.lineTo(BAR_HALF * 0.5, flex * 0.35);
  g.lineTo(BAR_HALF + 12, flex);
  g.strokePath();
  for (const side of [-1, 1]) {
    const px = side * BAR_HALF;
    for (const [off, w, h] of [
      [0, 8, 46],
      [-9, 6, 38],
      [-16, 5, 26],
    ] as const) {
      const cx = px + side * off;
      fillRR(g, cx - w / 2 + 1.5, flex - h / 2 + 2.5, w, h, 2.5, INK);
      fillRR(g, cx - w / 2, flex - h / 2, w, h, 2.5, off === 0 ? INK : WHITE);
      strokeRR(g, cx - w / 2, flex - h / 2, w, h, 2.5, 2);
    }
    g.lineStyle(1.2, WHITE, 1);
    g.lineBetween(px, flex - 14, px, flex + 14);
  }
  g.restore();
}
