/**
 * Shot 1: "Rodez, lundi, 8 h". The pen sketches the IUT on a blank page, students walk in, then
 * the camera comes down to the pavement where Ruben arrives late, straight from the gym, shaker in
 * hand, and gets his character sheet (who plays him, and how he was chosen).
 */
import type Phaser from "phaser";
import { FONT_MARKER, FONT_TITLE } from "../../../render/levelView";
import type { Actor } from "../actor";
import { backOut, bump, clamp01, easeInOut, easeOut, elasticOut, hopWalk, lerp, noise, pop, seg, shake, typed, type HopStep } from "../anim";
import { shaker } from "../props";
import { Shot, type ShotContext } from "../shot";
import {
  burst,
  check,
  cloud,
  disc,
  setHatch,
  fillRR,
  GREY,
  hatch,
  hatchDisc,
  INK,
  LINE,
  ORANGE,
  OUTLINE,
  panel,
  partial,
  partialRing,
  rays,
  SHADOW_X,
  SHADOW_Y,
  sketchBox,
  sparkle,
  stroke,
  strokeRR,
  swoosh,
  WHITE,
  type G,
} from "../sketch";
import { CUE } from "../timeline";

const C = CUE.campus;
const GROUND = 572;
const DOOR_X = 650;
/** Where Ruben stops on the pavement. */
const RUBEN_X = 356;

const WINDOW_COLS = [374, 466, 558, 650, 742, 834, 926];
const HILLS = [-40, 520, 90, 486, 200, 506, 300, 478, 1000, 478, 1120, 500, 1230, 470, 1340, 498];
const CATHEDRAL = [84, 572, 84, 268, 78, 268, 78, 252, 90, 252, 90, 262, 100, 262, 100, 246, 112, 246, 112, 262, 122, 262, 122, 252, 134, 252, 134, 268, 128, 268, 128, 572];
const BIKE_FRAME = [232, 556, 246, 536, 266, 536, 272, 556, 252, 556, 246, 536];

interface Extra {
  actor: Actor;
  from: number;
  t0: number;
  t1: number;
}

const SHEET_W = 480;
const SHEET_H = 350;
/** Extra height at the bottom of the sheet for the "tiré au sort" stamp. */
const STAMP_ROOM = 62;
const BAR_X = -64;
const BAR_W = 236;
const BAR_H = 22;
const ROW_Y = [-26, 34, 94];
const STAMP_X = 28;
const STAMP_Y = 176;

export class CampusShot extends Shot {
  private readonly back: G;
  private readonly scenery: G;
  private readonly front: G;
  private readonly signText: Phaser.GameObjects.Text;
  private readonly bellText: Phaser.GameObjects.Text;
  private readonly extras: Extra[] = [];
  private readonly ruben: Actor;
  private readonly fx: G;

  private readonly uiG: G;
  private readonly placeText: Phaser.GameObjects.Text;
  private readonly tagText: Phaser.GameObjects.Text;
  private placeShown = -1;
  private signShown = -1;

  private readonly sheet: Phaser.GameObjects.Container;
  private readonly sheetG: G;
  private readonly portrait: Actor;
  private readonly sheetFront: G;
  private readonly stampText: Phaser.GameObjects.Text | null = null;
  private readonly hop: HopStep = { travel: 0, lift: 0, sx: 1, sy: 1 };

  constructor(ctx: ShotContext) {
    super(ctx, "campus");
    const cards = ctx.script.cards;
    this.back = this.gfx();
    this.scenery = this.gfx();
    this.signText = this.text(this.world, DOOR_X, 420, "", { font: FONT_TITLE, weight: "700", size: 23, res: 3 });
    for (const [from, t0, t1] of [
      [1180, 2.4, 5.4],
      [40, 3.1, 6.1],
      [1010, 3.9, 6.5],
    ] as const) {
      this.extras.push({ actor: this.actor(GREY), from, t0, t1 });
    }
    this.front = this.gfx();
    this.bellText = this.text(this.world, 968, 196, "DRIIING !", { font: FONT_MARKER, size: 34, res: 2, rot: -0.1 });
    this.ruben = this.actor(ctx.cast.ruben.color, true);
    this.fx = this.gfx();

    // Stuck to the screen: the location card, then the character sheet.
    this.uiG = this.gfx(this.ui);
    this.placeText = this.text(this.ui, 60, 34, "", { font: FONT_MARKER, size: 58, ox: 0, oy: 0, rot: -0.025 });
    this.tagText = this.text(this.ui, 0, 0, cards.tag!.text, { font: FONT_TITLE, weight: "600", size: 27 });

    this.sheet = this.layer(this.ui).setPosition(900, 262).setRotation(0.022);
    this.sheetG = this.gfx(this.sheet);
    this.text(this.sheet, -212, -160, cards.sheetName!.text, { font: FONT_TITLE, weight: "700", size: 62, ox: 0, oy: 0 });
    const played = cards.playedBy;
    this.nameTag(this.sheet, played ? played.text : "dans son propre rôle", 300, { font: FONT_MARKER, size: 25, ox: 0, oy: 0, rot: -0.02 }).setPosition(
      -208,
      -86,
    );
    const labels = ["MUSCU", "CODE", "CONFIANCE"];
    labels.forEach((label, i) => {
      this.text(this.sheet, -212, ROW_Y[i]! + BAR_H / 2, label, { font: FONT_TITLE, weight: "600", size: 21, ox: 0 });
    });
    this.portrait = this.actor(ctx.cast.ruben.color, true, this.sheet);
    this.sheetFront = this.gfx(this.sheet);
    this.text(this.sheet, BAR_X + 96, ROW_Y[1]! - 13, "ça charge…", { font: FONT_MARKER, size: 19, rot: -0.05, ox: 0 });
    if (cards.lotStamp) {
      this.stampText = this.text(this.sheet, 0, 0, cards.lotStamp.text, { font: FONT_MARKER, size: 31 });
    }
  }

  draw(u: number, life: number): void {
    const push = easeInOut(seg(u, C.push[0], C.push[1]));
    const side = easeInOut(seg(u, C.sheet - 0.5, C.sheet + 0.35));
    const overflowShake = shake(u, C.overflow, 0.45) * 5 + shake(u, C.stamp, 0.4) * (this.stampText ? 7 : 0);
    const zoom = lerp(1 + 0.035 * seg(u, 0, C.push[0]), 2.7, push);
    setHatch(8, 1.5);
    this.setCam(
      lerp(640, 392, push) + 76 * side + noise(life * 0.5, 1) * 1.2 * push,
      lerp(360, 492, push) + noise(life * 0.45, 2) * 0.9 * push,
      zoom,
      overflowShake,
      overflowShake * 0.4,
    );
    this.drawScenery(u, life);
    this.drawExtras(u, life);
    this.drawRuben(u, life);
    this.drawLocation(u);
    this.drawSheet(u, life);
  }

  // --- The school -------------------------------------------------------------------------

  private drawScenery(u: number, life: number): void {
    const s0 = C.sketch[0];
    const b = this.back;
    b.clear();
    // Far away, faint: the hills and the cathedral's tower.
    partial(b, HILLS, seg(u, s0 + 0.2, s0 + 1.3), 2, LINE);
    partial(b, CATHEDRAL, seg(u, s0 + 0.5, s0 + 1.7), 2, LINE);
    if (u > s0 + 1.5) {
      const a = seg(u, s0 + 1.5, s0 + 1.9);
      b.lineStyle(2, LINE, a);
      for (const y of [300, 350, 400]) b.lineBetween(106, y, 106, y + 22);
    }
    // Sun and clouds.
    const sun = pop(u, s0 + 2.75, 0.35);
    if (sun > 0) {
      rays(b, 1090, 138, 44 * sun, 58 * sun, 10, life * 0.25, 3);
      disc(b, 1090, 138, 31 * sun, ORANGE, OUTLINE, 0);
    }
    for (const [cx, cy, w, h, at, drift] of [
      [700, 118, 190, 56, s0 + 2.5, 5],
      [1196, 268, 120, 38, s0 + 2.85, -3],
    ] as const) {
      const k = pop(u, at, 0.35);
      if (k > 0) cloud(b, cx + drift * u, cy, w * k, h * k);
    }

    const g = this.scenery;
    g.clear();
    // Ground first, then the building rises on it.
    sketchBox(g, u, s0, s0 + 1.1, -300, GROUND, 1900, 260, WHITE, true);
    // Side wing, main block, roof slab.
    sketchBox(g, u, s0 + 1.5, s0 + 2.0, 1000, 404, 150, GROUND - 404, WHITE, false, 1);
    sketchBox(g, u, s0 + 0.35, s0 + 1.15, 300, 264, 700, GROUND - 264, WHITE, false, 1);
    sketchBox(g, u, s0 + 0.95, s0 + 1.35, 286, 246, 728, 18, WHITE, true, 1);
    sketchBox(g, u, s0 + 1.3, s0 + 1.55, 372, 218, 46, 28, WHITE, true);
    sketchBox(g, u, s0 + 1.4, s0 + 1.65, 860, 226, 30, 20, WHITE, true);
    // Windows, one after the other.
    let n = 0;
    for (let row = 0; row < 2; row++) {
      for (const cx of WINDOW_COLS) {
        if (row === 1 && Math.abs(cx - DOOR_X) < 100) continue;
        const t0 = s0 + 1.15 + n * 0.07;
        n++;
        const x = cx - 28;
        const y = row === 0 ? 292 : 404;
        sketchBox(g, u, t0, t0 + 0.3, x, y, 56, 62, WHITE, true);
        if (u > t0 + 0.3) {
          g.lineStyle(2, INK, 1);
          g.lineBetween(cx, y, cx, y + 62);
          g.lineBetween(x, y + 26, x + 56, y + 26);
        }
      }
    }
    sketchBox(g, u, s0 + 2.0, s0 + 2.25, 1046, 440, 56, 62, WHITE, true);
    // The entrance: sign, canopy, open doorway, step.
    sketchBox(g, u, s0 + 1.25, s0 + 1.6, 548, 396, 204, 48, WHITE, false, 0.7);
    sketchBox(g, u, s0 + 1.7, s0 + 1.95, 572, 456, 156, 12, WHITE, true, 0.7);
    sketchBox(g, u, s0 + 1.8, s0 + 2.15, 612, 474, 76, GROUND - 474, INK);
    sketchBox(g, u, s0 + 2.1, s0 + 2.3, 598, GROUND - 7, 104, 7, WHITE);
    const sign = this.script.cards.sign!.text;
    const shown = typed(sign.length, u, s0 + 1.45, 26);
    if (shown !== this.signShown) {
      this.signShown = shown;
      this.signText.setText(sign.slice(0, shown));
    }

    // Trees, lamp post, bench, bike.
    for (const [tx, ty, r, t0] of [
      [176, 432, 60, s0 + 2.0],
      [1222, 452, 48, s0 + 2.3],
    ] as const) {
      sketchBox(g, u, t0, t0 + 0.25, tx - 6, ty + r - 14, 12, GROUND - ty - r + 14, WHITE);
      const p = seg(u, t0 + 0.2, t0 + 0.6);
      const inked = seg(u, t0 + 0.52, t0 + 0.75);
      if (inked > 0) {
        g.fillStyle(INK, inked);
        g.fillCircle(tx + SHADOW_X, ty + SHADOW_Y, r);
        g.fillStyle(WHITE, inked);
        g.fillCircle(tx, ty, r);
        hatchDisc(g, tx, ty, r - 2, 9, LINE, 2, inked);
      }
      partialRing(g, tx, ty, r, p);
    }
    partial(g, [96, GROUND, 96, 430, 118, 424], seg(u, s0 + 2.5, s0 + 2.8), 3);
    if (u > s0 + 2.8) disc(g, 122, 428, 7 * pop(u, s0 + 2.8, 0.2), WHITE, 2);
    sketchBox(g, u, s0 + 2.6, s0 + 2.8, 1046, 540, 92, 9, WHITE);
    partial(g, [1056, 549, 1056, GROUND], seg(u, s0 + 2.75, s0 + 2.85), 2.5);
    partial(g, [1128, 549, 1128, GROUND], seg(u, s0 + 2.8, s0 + 2.9), 2.5);
    partialRing(g, 232, 557, 13, seg(u, s0 + 2.55, s0 + 2.8), 2);
    partialRing(g, 272, 557, 13, seg(u, s0 + 2.7, s0 + 2.95), 2);
    partial(g, BIKE_FRAME, seg(u, s0 + 2.85, s0 + 3.1), 2);
    partial(g, [246, 536, 242, 528, 250, 528], seg(u, s0 + 3.0, s0 + 3.1), 2);
    partial(g, [266, 536, 264, 526, 271, 524], seg(u, s0 + 3.05, s0 + 3.15), 2);

    // The 8 o'clock bell.
    const bell = bump(u, C.bell, 1.5);
    this.bellText.setVisible(bell > 0);
    if (bell > 0) {
      const wob = Math.sin(u * 46) * 0.05;
      this.bellText.setScale(0.7 + 0.3 * backOut(seg(u, C.bell, C.bell + 0.2))).setRotation(-0.1 + wob);
      this.bellText.setAlpha(clamp01(bell * 3));
      rays(g, 875, 222, 24, 36 + 6 * Math.sin(u * 40), 5, Math.PI * 1.1, 2.5, INK, clamp01(bell * 3), Math.PI * 0.75);
    }
  }

  private drawExtras(u: number, life: number): void {
    for (const e of this.extras) {
      const p = seg(u, e.t0, e.t1);
      if (p <= 0 || p >= 1) {
        e.actor.hide();
        continue;
      }
      const dist = Math.abs(DOOR_X - e.from);
      const step = hopWalk(p, Math.max(3, Math.round(dist / 52)), this.hop);
      const enter = seg(p, 0.93, 1);
      e.actor.draw(
        {
          x: lerp(e.from, DOOR_X, step.travel),
          y: GROUND - step.lift * 9 - enter * 4,
          facing: e.from < DOOR_X ? 1 : -1,
          sx: step.sx,
          sy: step.sy,
          lean: 2,
          lookX: 0.8,
          scale: 1 - enter * 0.35,
        },
        life,
      );
      e.actor.g.setAlpha(1 - enter);
    }
  }

  // --- Ruben ------------------------------------------------------------------------------

  private drawRuben(u: number, life: number): void {
    const fx = this.fx;
    fx.clear();
    this.front.clear();
    if (u < C.enter[0]) {
      this.ruben.hide();
      return;
    }
    const walk = seg(u, C.enter[0], C.enter[1]);
    const step = hopWalk(walk, 6, this.hop);
    const sip = seg(u, C.sip[0], C.sip[1]);
    const sipK = bump(u, C.sip[0], C.sip[1] - C.sip[0]);
    const flex = seg(u, C.flex[0], C.flex[1]);
    const flexK = flex > 0 && flex < 1 ? Math.sin(flex * Math.PI * 3) ** 2 : 0;
    const proud = bump(u, C.overflow + 0.1, 0.5);
    const startled = this.stampText ? bump(u, C.stamp, 0.45) : 0;
    const breathe = walk >= 1 ? Math.sin(life * 3.1) * 0.018 : 0;

    let sx = step.sx * (1 + flexK * 0.2 + startled * 0.1) - breathe;
    let sy = step.sy * (1 - flexK * 0.07 - startled * 0.14) + breathe;
    if (sip > 0.25 && sip < 0.9) sy *= 1 + 0.035 * Math.sin(sip * Math.PI * 7);
    sx = Math.max(0.6, sx);
    sy = Math.max(0.6, sy);
    const watching = seg(u, C.sheet - 0.2, C.sheet + 0.3);
    this.ruben.draw(
      {
        x: lerp(120, RUBEN_X, step.travel),
        y: GROUND - step.lift * 17 - proud * 12,
        facing: 1,
        sx,
        sy,
        lean: walk < 1 ? -1.5 : -5 * sipK,
        lookX: lerp(0.65, 0.95, watching) - flexK * 0.6,
        lookY: -0.55 * watching - 0.3 * sipK + startled * 0.4,
        ...(sipK > 0.45 ? { blink: true } : {}),
      },
      life,
    );
    // The shaker, in his "hand": at his side, swung up to drink.
    const [hx, hy] = this.ruben.local(lerp(21, 14, sipK), lerp(-13, -25, sipK) + Math.sin(walk * Math.PI * 12) * (walk < 1 ? 1.5 : 0));
    shaker(this.ruben.g, hx, hy, 0.82, lerp(0.12, -1.95, easeOut(sipK)), lerp(0.75, 0.3, clamp01((u - C.sip[0]) / 0.8)));

    const rx = this.ruben.g.x;
    const top = this.ruben.g.y - 36 * sy;
    // Landing puffs while he hops in.
    if (walk > 0 && walk < 1) {
      const f = (walk * 6) % 1;
      if (f < 0.25) {
        const a = 1 - f / 0.25;
        fx.lineStyle(2, INK, a);
        fx.lineBetween(rx - 20 - (1 - a) * 8, GROUND - 3, rx - 28 - (1 - a) * 10, GROUND - 7);
        fx.lineBetween(rx - 22 - (1 - a) * 8, GROUND - 1, rx - 33 - (1 - a) * 10, GROUND - 1);
      }
    }
    // "Aaah": a little puff after the sip.
    const ah = bump(u, C.sip[1] - 0.05, 0.5);
    if (ah > 0) {
      const k = seg(u, C.sip[1] - 0.05, C.sip[1] + 0.45);
      disc(fx, rx + 24 + k * 12, top + 18 - k * 8, 2 + k * 4, WHITE, 1.5);
      disc(fx, rx + 30 + k * 18, top + 10 - k * 12, 1.5 + k * 3, WHITE, 1.5);
    }
    // Flexing: shine.
    if (flexK > 0.02) {
      for (const [dx, dy, r, ph] of [
        [-30, 4, 7, 0],
        [28, -8, 9, 0.6],
        [-16, -20, 5, 1.2],
        [38, 18, 6, 1.8],
      ] as const) {
        const k = Math.max(0, Math.sin(flex * Math.PI * 3 + ph));
        if (k > 0.05) sparkle(fx, rx + dx, top + 14 + dy, r * k);
      }
      rays(fx, rx, top + 18, 30, 36 + flexK * 5, 9, flex * 2, 2, INK, flexK, Math.PI * 2);
    }
  }

  // --- Location card ------------------------------------------------------------------------

  private drawLocation(u: number): void {
    const g = this.uiG;
    g.clear();
    const cards = this.script.cards;
    const place = cards.place!;
    const out = easeInOut(seg(u, place.u1 - 0.5, place.u1));
    const visible = u >= place.u0 && out < 1;
    this.placeText.setVisible(visible);
    this.tagText.setVisible(false);
    if (!visible) return;
    const dx = -out * 760;
    const shown = typed(place.text.length, u, place.u0, 15);
    if (shown !== this.placeShown) {
      this.placeShown = shown;
      this.placeText.setText(place.text.slice(0, shown));
    }
    this.placeText.setPosition(60 + dx, 34);
    const typedAt = place.u0 + place.text.length / 15;
    swoosh(g, 66 + dx, 122, 500 + dx, seg(u, typedAt, typedAt + 0.35), 7, ORANGE, 3);

    const tag = cards.tag!;
    const k = u < tag.u0 ? 0 : elasticOut(seg(u, tag.u0, tag.u0 + 0.5));
    if (k > 0) {
      const w = this.tagText.width + 30;
      const h = 48;
      const cx = 74 + w / 2 + dx;
      const cy = 172;
      g.save();
      g.translateCanvas(cx, cy);
      g.rotateCanvas(-0.03);
      g.scaleCanvas(k, k);
      panel(g, -w / 2, -h / 2, w, h, { r: 10, shadow: true });
      g.restore();
      this.tagText.setVisible(true).setPosition(cx, cy - 1).setScale(k).setRotation(-0.03);
    }
  }

  // --- Character sheet ----------------------------------------------------------------------

  private drawSheet(u: number, life: number): void {
    if (u < C.sheet) {
      this.sheet.setVisible(false);
      return;
    }
    const k = elasticOut(seg(u, C.sheet, C.sheet + 0.6));
    this.sheet.setVisible(true).setScale(0.55 + 0.45 * k);
    const g = this.sheetG;
    g.clear();
    setHatch(9, 2);
    panel(g, -SHEET_W / 2, -SHEET_H / 2, SHEET_W, SHEET_H + (this.stampText ? STAMP_ROOM : 0), { r: 16, shadow: 1.4 });
    // A strip of tape at the top, as if the sheet were stuck on the page.
    g.save();
    g.translateCanvas(-20, -SHEET_H / 2);
    g.rotateCanvas(-0.07);
    g.fillStyle(WHITE, 1);
    g.fillRect(-52, -13, 104, 26);
    hatch(g, -52, -13, 104, 26, 7, LINE, 2);
    g.lineStyle(2, INK, 1);
    g.lineBetween(-52, -13, -52, 13);
    g.lineBetween(52, -13, 52, 13);
    g.restore();
    swoosh(g, -208, -92, -10, seg(u, C.sheet + 0.3, C.sheet + 0.6), 6, ORANGE, 2.5);
    // Portrait.
    panel(g, 112, -154, 104, 104, { r: 10, hatch: true, shadow: 0.6 });
    this.portrait.draw({ x: 162, y: -58, scale: 2.2, facing: -1, lookX: 0.4, lookY: Math.sin(life * 0.9) * 0.2 }, life);

    const f = this.sheetFront;
    f.clear();
    const fills = [
      easeOut(seg(u, C.bars[0], C.bars[0] + 0.45)),
      0.045 * easeOut(seg(u, C.bars[0] + 0.5, C.bars[0] + 0.7)),
      easeOut(seg(u, C.bars[0] + 0.75, C.bars[1])) + 0.44 * elasticOut(seg(u, C.overflow, C.overflow + 0.5)),
    ];
    for (let i = 0; i < 3; i++) {
      const y = ROW_Y[i]!;
      const w = BAR_W * fills[i]!;
      fillRR(f, BAR_X + SHADOW_X * 0.6, y + SHADOW_Y * 0.6, BAR_W, BAR_H, 6, INK);
      fillRR(f, BAR_X, y, BAR_W, BAR_H, 6, WHITE);
      if (i === 2 && w > 2) {
        // Confidence does not fit in its bar. Nor on the sheet.
        fillRR(f, BAR_X, y, w, BAR_H, 6, ORANGE);
        strokeRR(f, BAR_X, y, Math.max(w, BAR_W), BAR_H, 6);
        if (w > BAR_W + 4) {
          strokeRR(f, BAR_X, y, w, BAR_H, 6);
          const tip = BAR_X + w;
          const b = pop(u, C.overflow + 0.12, 0.3);
          if (b > 0) {
            burst(f, tip + 6, y + BAR_H / 2, 30 * b, 17 * b, 9, life * 0.6, WHITE, OUTLINE);
            stroke(f, tip + 1, y + 4, tip + 1, y + 12, 3.5);
            f.fillStyle(INK, 1);
            f.fillCircle(tip + 1, y + 18.5, 2.3);
            stroke(f, tip + 11, y + 4, tip + 11, y + 12, 3.5);
            f.fillCircle(tip + 11, y + 18.5, 2.3);
          }
        }
      } else {
        if (w > 2) fillRR(f, BAR_X, y, Math.max(w, 9), BAR_H, 6, INK);
        strokeRR(f, BAR_X, y, BAR_W, BAR_H, 6);
      }
    }
    check(f, BAR_X + BAR_W + 22, ROW_Y[0]! + BAR_H / 2, 9, 3.5, INK, seg(u, C.bars[0] + 0.4, C.bars[0] + 0.6));

    // "Tiré au sort": the stamp comes down hard.
    if (this.stampText) {
      const s = seg(u, C.stamp, C.stamp + 0.16);
      this.stampText.setVisible(s > 0);
      if (s > 0) {
        const scale = lerp(2.6, 1, easeOut(s));
        const w = this.stampText.width / this.stampText.scaleX + 26;
        f.save();
        f.translateCanvas(STAMP_X, STAMP_Y);
        f.rotateCanvas(-0.1);
        f.scaleCanvas(scale, scale);
        fillRR(f, -w / 2, -29, w, 58, 9, WHITE, 0.92);
        strokeRR(f, -w / 2, -29, w, 58, 9, 4);
        strokeRR(f, -w / 2 + 6, -23, w - 12, 46, 5, 1.6);
        f.restore();
        this.stampText.setPosition(STAMP_X, STAMP_Y - 1).setRotation(-0.1).setScale(scale);
        const hit = bump(u, C.stamp + 0.14, 0.3);
        if (hit > 0) rays(f, STAMP_X, STAMP_Y, 150 + (1 - hit) * 20, 172 + (1 - hit) * 26, 12, 0.2, 3, INK, hit);
      }
    }
  }
}
