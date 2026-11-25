/**
 * Shot 4: night. Ruben opens a chat with Claude and asks, in five words and three mistakes, for his
 * whole project. Claude politely asks for the assignment; Ruben sends a photo of his biceps. Then he
 * pastes the whole conversation into main.c and compiles: the error boxes pile up.
 *
 * The room stays in the picture, small, in the bottom left corner; what is on the monitor is shown
 * enlarged in a call-out, the way a sketch zooms in on a detail. The chat window is generic on
 * purpose: a title, messages, an input box. No logo. Errors are ink crosses, never red.
 */
import type Phaser from "phaser";
import { FONT_TEXT, FONT_TITLE } from "../../../render/levelView";
import type { Actor } from "../actor";
import { backOut, bump, clamp01, easeInOut, easeOut, elasticOut, hash, lerp, noise, pop, seg, shake, typed } from "../anim";
import { dumbbell, shaker } from "../props";
import { SCREEN_H, SCREEN_W, Shot, type Point, type ShotContext } from "../shot";
import {
  cross,
  darkness,
  dashed,
  disc,
  fillPoly,
  fillRR,
  GREY,
  hatch,
  INK,
  MONO,
  ORANGE,
  OUTLINE,
  panel,
  polyline,
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
import { CHAT, CUE } from "../timeline";

const C = CUE.night;
const FLOOR = 300;
const SEAT_Y = 268;
const RUBEN_X = 302;
/** The monitor's screen, world pixels. */
const MON = { x: 352, y: 158, w: 100, h: 68 };
/** Light of the screen: the hatched darkness stays outside this circle. */
const GLOW = { x: 372, y: 206, r: 104 };

/** The chat window once it is out of the monitor, screen pixels. */
const CARD = { x: 500, y: 26, w: 744, h: 566 };
const TITLE_H = 50;
const RIGHT = CARD.w - 26;
const INPUT = { x: 24, y: CARD.h - 76, w: CARD.w - 104, h: 52 };
const THUMB = { w: 150, h: 100 };
const TYPE_CPS = 10;

/** A flexed arm, for the photo: closed outline in a 150 x 100 frame. */
const BICEPS = [14, 92, 74, 94, 108, 92, 124, 78, 128, 56, 124, 38, 130, 26, 124, 12, 106, 8, 93, 16, 92, 30, 96, 44, 92, 58, 80, 40, 60, 30, 40, 36, 26, 50, 14, 68];

const ERR_W = 600;
const ERR_H = 56;
const ERR_AT = (i: number): Point => ({ x: 468 + i * 30, y: 44 + i * 66 });
const SUMMARY = { x: 606, y: 446, w: 470, h: 132 };
const KEYS = ["Ctrl + A", "Ctrl + C", "Ctrl + V"];
const KEY_POS: Array<[number, number, number]> = [
  [150, 300, -0.09],
  [300, 250, 0.06],
  [205, 190, -0.04],
];

export class NightShot extends Shot {
  private readonly room: G;
  private readonly ruben: Actor;
  private readonly front: G;
  private readonly dark: G;

  private readonly linkG: G;
  private readonly chat: Phaser.GameObjects.Container;
  private readonly chatG: G;
  private readonly msg1: Phaser.GameObjects.Text;
  private readonly reply1: Phaser.GameObjects.Text;
  private readonly fileName: Phaser.GameObjects.Text;
  private readonly msg2: Phaser.GameObjects.Text;
  private readonly reply2: Phaser.GameObjects.Text;
  private readonly inputText: Phaser.GameObjects.Text;
  private readonly avatar1: Phaser.GameObjects.Text;
  private readonly avatar2: Phaser.GameObjects.Text;
  private readonly chatFront: G;
  private readonly msg1W: number;
  private readonly msg2W: number;
  private readonly reply1H: number;

  private readonly keyG: G;
  private readonly keyTexts: Phaser.GameObjects.Text[] = [];
  private readonly errG: G;
  private readonly errTexts: Phaser.GameObjects.Text[] = [];
  private readonly sumTitle: Phaser.GameObjects.Text;
  private readonly sumText: Phaser.GameObjects.Text;
  private readonly sumOk: Phaser.GameObjects.Text;
  private readonly shown = { input: "\u0000", r1: -1, r2: -1 };
  private readonly p = { x: 0, y: 0 };
  private readonly q = { x: 0, y: 0 };

  constructor(ctx: ShotContext) {
    super(ctx, "night");
    const cards = ctx.script.cards;
    setHatch(6, 1.1);
    this.room = this.gfx();
    this.ruben = this.actor(ctx.cast.ruben.color, true);
    this.front = this.gfx();
    this.dark = this.gfx();

    this.linkG = this.gfx(this.ui);
    this.chat = this.layer(this.ui);
    this.chatG = this.gfx(this.chat);
    this.text(this.chat, CARD.w / 2, TITLE_H / 2 + 1, cards.chatTitle!.text, { font: FONT_TITLE, weight: "600", size: 25 });
    const body = { font: FONT_TEXT, weight: "500", size: 21 } as const;
    this.msg1 = this.text(this.chat, 0, 0, cards.msg1!.text, { ...body, color: "#ffffff", ox: 1 });
    this.msg1W = this.msg1.width + 18;
    this.reply1 = this.text(this.chat, 70, 126, cards.reply1!.text, { ...body, ox: 0, oy: 0, wrap: 560, align: "left", spacing: 4 });
    this.reply1H = this.reply1.height;
    this.fileName = this.text(this.chat, 0, 0, CHAT.attachmentName, { font: MONO, size: 12.5, ox: 1, oy: 0 });
    this.msg2 = this.text(this.chat, 0, 0, cards.msg2!.text, { ...body, color: "#ffffff", ox: 1 });
    this.msg2W = this.msg2.width + 18;
    this.reply2 = this.text(this.chat, 70, 0, cards.reply2!.text, { ...body, ox: 0, oy: 0, wrap: 560, align: "left", spacing: 4 });
    this.inputText = this.text(this.chat, INPUT.x + 14, INPUT.y + INPUT.h / 2, "", { ...body, ox: 0 });
    this.avatar1 = this.text(this.chat, 0, 0, "C", { font: FONT_TITLE, weight: "700", size: 17 });
    this.avatar2 = this.text(this.chat, 0, 0, "C", { font: FONT_TITLE, weight: "700", size: 17 });
    this.chatFront = this.gfx(this.chat);

    this.keyG = this.gfx(this.ui);
    for (const label of KEYS) this.keyTexts.push(this.text(this.ui, 0, 0, label, { font: FONT_TITLE, weight: "600", size: 25 }));
    this.errG = this.gfx(this.ui);
    for (let i = 0; i < C.errors.length; i++) {
      this.errTexts.push(this.nameTag(this.ui, cards[`err${i}`]!.text, ERR_W - 78, { font: FONT_TEXT, weight: "500", size: 19, ox: 0 }));
    }
    this.sumTitle = this.text(this.ui, 0, 0, "Compilation terminée", { font: FONT_TITLE, weight: "600", size: 18, color: "#ffffff", ox: 0 });
    this.sumText = this.text(this.ui, 0, 0, cards.summary!.text, { font: FONT_TITLE, weight: "700", size: 29 });
    this.sumOk = this.text(this.ui, 0, 0, "OK…", { font: FONT_TITLE, weight: "600", size: 17 });
  }

  draw(u: number, life: number): void {
    setHatch(6, 1.1);
    const dive = easeInOut(seg(u, C.dive[0], C.dive[1]));
    const errShake = this.errorShake(u);
    this.setCam(
      lerp(350, 531.8, dive) + noise(life * 0.4, 11) * 0.7,
      lerp(186, 158.9, dive) + noise(life * 0.36, 12) * 0.5,
      lerp(1.95, 2.2, dive),
      errShake * 0.6,
      errShake,
    );
    this.drawRoom(u, life);
    this.drawChat(u, life);
    this.drawKeys(u);
    this.drawErrors(u, life);
  }

  private errorShake(u: number): number {
    let s = shake(u, C.summary, 0.5) * 8;
    for (const at of C.errors) s += shake(u, at, 0.25) * 3;
    return s;
  }

  // --- The room -------------------------------------------------------------------------------

  private drawRoom(u: number, life: number): void {
    const g = this.room;
    g.clear();
    g.fillStyle(WHITE, 1);
    g.fillRect(-300, FLOOR, 1400, 260);
    hatch(g, -300, FLOOR, 1400, 260);
    stroke(g, -300, FLOOR, 1100, FLOOR);
    // The window: night, a moon, three stars.
    panel(g, 108, 96, 104, 104, { r: 4, shadow: 0.8 });
    g.fillStyle(INK, 1);
    g.fillRect(116, 104, 88, 88);
    g.fillStyle(WHITE, 1);
    g.fillCircle(176, 132, 13);
    g.fillStyle(INK, 1);
    g.fillCircle(170, 127, 12);
    for (const [sx, sy, r] of [
      [132, 124, 1.6],
      [146, 164, 1.2],
      [188, 172, 1.5],
      [128, 178, 1],
    ] as const) {
      g.fillStyle(WHITE, 0.6 + 0.4 * Math.sin(life * 2 + sx));
      g.fillCircle(sx, sy, r);
    }
    stroke(g, 160, 104, 160, 192, 2, WHITE);
    panel(g, 100, 200, 120, 7, { r: 2, outline: 2, shadow: 0.5 });
    // A shelf: a trophy for nothing in particular, a tub of protein.
    panel(g, 486, 150, 96, 6, { r: 2, outline: 2, shadow: 0.5 });
    panel(g, 496, 122, 26, 28, { r: 4, outline: 2, hatch: true });
    fillRR(g, 494, 117, 30, 7, 2, INK);
    g.fillStyle(ORANGE, 1);
    g.fillRect(550, 132, 10, 12);
    g.lineStyle(2, INK, 1);
    g.strokeRect(550, 132, 10, 12);
    ring(g, 555, 126, 7, 2);
    fillRR(g, 546, 144, 18, 6, 1, INK);
    // The desk, the stool, what lies around.
    panel(g, 262, 238, 224, 8, { r: 2, shadow: 0.6 });
    stroke(g, 274, 246, 274, FLOOR, 3);
    stroke(g, 474, 246, 474, FLOOR, 3);
    panel(g, RUBEN_X - 17, SEAT_Y, 34, 7, { r: 2, outline: 2 });
    stroke(g, RUBEN_X, SEAT_Y + 7, RUBEN_X, FLOOR, 3);
    stroke(g, RUBEN_X - 12, FLOOR, RUBEN_X + 12, FLOOR, 3);
    dumbbell(g, 206, FLOOR - 7, 0.9, 0);
    shaker(g, 464, 228, 0.8, 0, 0.35);
    // The monitor.
    stroke(g, MON.x + MON.w / 2, MON.y + MON.h, MON.x + MON.w / 2, 238, 4);
    stroke(g, MON.x + MON.w / 2 - 14, 238, MON.x + MON.w / 2 + 14, 238, 4);
    panel(g, MON.x - 5, MON.y - 5, MON.w + 10, MON.h + 10, { r: 6, shadow: 0.8 });
    panel(g, MON.x, MON.y, MON.w, MON.h, { r: 2, outline: 1.5 });
    const errors = u >= C.errors[0];
    if (errors) {
      for (let i = 0; i < C.errors.length; i++) {
        if (u < C.errors[i]!) continue;
        panel(g, MON.x + 8 + i * 6, MON.y + 6 + i * 7, 52, 14, { r: 2, outline: 1.2, shadow: 0.25 });
        cross(g, MON.x + 15 + i * 6, MON.y + 13 + i * 7, 2.5, 1.4);
      }
    } else {
      g.lineStyle(1.6, INK, 0.75);
      for (let i = 0; i < 5; i++) {
        const w = 26 + hash(i * 3.3 + Math.floor(u * 0.8)) * 52;
        g.lineBetween(MON.x + 10, MON.y + 12 + i * 11, MON.x + 10 + w, MON.y + 12 + i * 11);
      }
    }
    // The keyboard.
    panel(g, 316, 231, 44, 7, { r: 2, outline: 1.8 });

    // Ruben, on his stool.
    const typing =
      (u > C.type1 && u < C.type1 + CHAT.typing1.length / TYPE_CPS) ||
      (u > C.attach + 0.1 && u < C.send2) ||
      (u > C.keys[0] - 0.1 && u < C.keys[2] + 0.35);
    const tap = typing ? Math.abs(Math.sin(u * 21)) : 0;
    const proud = bump(u, C.attach - 0.45, 0.6);
    const read1 = u > C.reply1[0] && u < C.attach - 0.5;
    const read2 = u > C.reply2[0] && u < C.keys[0] - 0.2;
    let flinch = bump(u, C.summary, 0.5);
    for (const at of C.errors) flinch = Math.max(flinch, bump(u, at, 0.3) * 0.7);
    const beaten = easeOut(seg(u, C.summary + 0.1, C.summary + 0.7));
    const reading = read1 || read2;
    const sy = 1 - tap * 0.07 + proud * 0.1 - flinch * 0.16 - beaten * 0.18 + Math.sin(life * 2.6) * 0.012;
    this.ruben.draw(
      {
        x: RUBEN_X + (typing ? Math.sin(u * 42) * 0.6 : 0),
        y: SEAT_Y - flinch * 4,
        facing: 1,
        sx: 1 + tap * 0.04 + proud * 0.16 + flinch * 0.1 + beaten * 0.12,
        sy,
        lean: typing ? 3 : reading ? 1 : -flinch * 4,
        lookX: reading ? 0.55 + Math.sin(u * 5) * 0.4 : 0.85,
        lookY: typing ? 0.5 : -0.45,
        dizzy: u >= C.summary + 0.15,
      },
      life,
    );
    const f = this.front;
    f.clear();
    const headY = SEAT_Y - 36 * sy;
    if (typing) {
      // tac tac tac
      const k = (u * 7) % 1;
      f.lineStyle(1.6, INK, 1 - k);
      f.lineBetween(330 + k * 4, 226 - k * 6, 327 + k * 5, 219 - k * 9);
      f.lineBetween(344 + k * 3, 225 - k * 7, 346 + k * 5, 217 - k * 9);
    }
    if (proud > 0.05) {
      sparkle(f, RUBEN_X - 22, headY + 8, 5 * proud);
      sparkle(f, RUBEN_X + 6, headY - 10, 4 * proud);
    }
    if (flinch > 0.05) rays(f, RUBEN_X, headY + 16, 24, 30, 7, Math.PI * 0.9, 1.8, INK, clamp01(flinch * 1.4), Math.PI * 1.2);

    // Night: the room is hatched in ink, except where the screen lights it.
    const d = this.dark;
    d.clear();
    const lit = GLOW.r * (1 + 0.03 * Math.sin(life * 7) + (errors ? 0.04 * Math.sin(u * 30) : 0));
    darkness(d, this.camX, this.camY, this.zoom, SCREEN_W, SCREEN_H, GLOW.x, GLOW.y, lit);
  }

  // --- The chat window ----------------------------------------------------------------------

  private drawChat(u: number, life: number): void {
    const out = seg(u, C.dive[0] + 0.55, C.dive[1] + 0.25);
    const link = this.linkG;
    link.clear();
    if (out <= 0) {
      this.chat.setVisible(false);
      return;
    }
    // It grows out of the monitor.
    const k = backOut(out, 1.1);
    const a = this.toScreen(MON.x + MON.w / 2, MON.y + MON.h / 2, this.p);
    const s = lerp((MON.w * this.zoom) / CARD.w, 1, k);
    const cx = lerp(a.x, CARD.x + CARD.w / 2, k);
    const cy = lerp(a.y, CARD.y + CARD.h / 2, k);
    this.chat.setVisible(true).setScale(s).setPosition(cx - (CARD.w * s) / 2, cy - (CARD.h * s) / 2);
    // Call-out lines from the screen's corners to the window's.
    if (out > 0.6) {
      const alpha = seg(out, 0.6, 1);
      const m0 = this.toScreen(MON.x + MON.w, MON.y, this.p);
      dashed(link, m0.x, m0.y, CARD.x, CARD.y + 14, alpha);
      const m1 = this.toScreen(MON.x + MON.w, MON.y + MON.h, this.q);
      dashed(link, m1.x, m1.y, CARD.x, CARD.y + CARD.h - 14, alpha);
    }

    const g = this.chatG;
    g.clear();
    setHatch(9, 2);
    panel(g, 0, 0, CARD.w, CARD.h, { r: 18, shadow: 1.4 });
    stroke(g, 0, TITLE_H, CARD.w, TITLE_H, OUTLINE);
    disc(g, 26, TITLE_H / 2, 7, INK, 0);
    disc(g, 48, TITLE_H / 2, 7, GREY, 2);
    disc(g, 70, TITLE_H / 2, 7, WHITE, 2);
    const f = this.chatFront;
    f.clear();

    // 1. "fé mon proje stp"
    let y = TITLE_H + 20;
    const b1 = pop(u, C.send1, 0.28);
    userBubble(g, this.msg1, RIGHT, y, this.msg1W, b1);
    y += 44 + 20;
    // Claude answers.
    this.replyBlock(g, u, this.reply1, this.avatar1, y, C.reply1, "r1");
    y += this.reply1H + 18;
    // 2. The photo, and "tien".
    const b2 = pop(u, C.send2, 0.3);
    const tx = RIGHT - THUMB.w;
    this.fileName.setVisible(b2 > 0);
    if (b2 > 0) {
      g.save();
      g.translateCanvas(RIGHT, y);
      g.scaleCanvas(b2, b2);
      panel(g, -THUMB.w, 0, THUMB.w, THUMB.h, { r: 8, hatch: true, shadow: 0.8 });
      g.translateCanvas(-THUMB.w, 0);
      fillPoly(g, BICEPS, WHITE);
      polyline(g, BICEPS, 2.6, INK, true);
      g.lineStyle(2, INK, 1);
      g.beginPath();
      g.moveTo(40, 62);
      g.lineTo(50, 50);
      g.lineTo(64, 46);
      g.lineTo(78, 52);
      g.lineTo(86, 62);
      g.strokePath();
      g.lineBetween(100, 20, 116, 22);
      g.lineBetween(100, 28, 115, 30);
      g.restore();
      const shine = bump(u, C.send2 + 0.25, 0.9);
      if (shine > 0) sparkle(f, tx + 40, y + 22, 9 * shine);
      this.fileName.setPosition(RIGHT, y + THUMB.h + 5).setAlpha(clamp01(b2));
    }
    y += THUMB.h + 32;
    userBubble(g, this.msg2, RIGHT, y, this.msg2W, pop(u, C.send2 + 0.12, 0.28));
    y += 44 + 14;
    this.reply2.setY(y - 6);
    this.replyBlock(g, u, this.reply2, this.avatar2, y, C.reply2, "r2");

    // The input box.
    panel(g, INPUT.x, INPUT.y, INPUT.w, INPUT.h, { r: 16, shadow: 0.6 });
    const send = Math.max(bump(u, C.send1 - 0.12, 0.3), bump(u, C.send2 - 0.12, 0.3));
    const bx = CARD.w - 46;
    const by = INPUT.y + INPUT.h / 2;
    disc(g, bx, by + send * 2, 22 - send * 2, ORANGE, OUTLINE, 0.7 * (1 - send));
    stroke(g, bx, by + 9, bx, by - 9, 3.4);
    polyline(g, [bx - 8, by - 2, bx, by - 10, bx + 8, by - 2], 3.4);

    let value = "";
    let placeholder = false;
    let chip = 0;
    if (u < C.type1) {
      placeholder = true;
      value = "Écris ton message…";
    } else if (u < C.send1) {
      value = CHAT.typing1.slice(0, typed(CHAT.typing1.length, u, C.type1, TYPE_CPS));
    } else if (u >= C.attach && u < C.send2) {
      chip = pop(u, C.attach, 0.25);
      value = CHAT.caption2.slice(0, typed(CHAT.caption2.length, u, C.attach + 0.15, TYPE_CPS));
    } else if (u >= C.send1) {
      placeholder = true;
      value = "Écris ton message…";
    }
    if (value !== this.shown.input) {
      this.shown.input = value;
      this.inputText.setText(value);
    }
    let textX = INPUT.x + 16;
    if (chip > 0) {
      // The file waiting to be sent.
      const w = 150 * chip;
      panel(g, INPUT.x + 12, INPUT.y + 10, w, INPUT.h - 20, { r: 9, outline: 2, hatch: true });
      if (chip > 0.9) {
        panel(g, INPUT.x + 20, INPUT.y + 16, 22, 20, { r: 3, outline: 1.8 });
        g.lineStyle(1.6, INK, 1);
        g.lineBetween(INPUT.x + 24, INPUT.y + 31, INPUT.x + 30, INPUT.y + 24);
        g.lineBetween(INPUT.x + 30, INPUT.y + 24, INPUT.x + 38, INPUT.y + 31);
        g.lineBetween(INPUT.x + 50, INPUT.y + 22, INPUT.x + 150, INPUT.y + 22);
        g.lineBetween(INPUT.x + 50, INPUT.y + 31, INPUT.x + 120, INPUT.y + 31);
      }
      textX += 158;
    }
    this.inputText.setX(textX).setAlpha(placeholder ? 0.38 : 1);
    if (!placeholder && Math.floor(life * 2.4) % 2 === 0) {
      const cxr = textX + this.inputText.width - 6;
      stroke(g, cxr, INPUT.y + 14, cxr, INPUT.y + INPUT.h - 14, 2.4);
    }
  }

  /** One answer from Claude: three dots while it "thinks", then the text streams in. */
  private replyBlock(
    g: G,
    u: number,
    text: Phaser.GameObjects.Text,
    avatar: Phaser.GameObjects.Text,
    y: number,
    window: readonly [number, number],
    key: "r1" | "r2",
  ): void {
    const full = this.script.cards[key === "r1" ? "reply1" : "reply2"]!.text;
    const thinking = u >= window[0] - 0.6 && u < window[0];
    const started = u >= window[0];
    const av = pop(u, window[0] - 0.6, 0.25);
    avatar.setVisible(av > 0);
    if (av > 0) {
      disc(g, 44, y + 12, 15 * av, GREY, 2.2, 0.5);
      avatar.setPosition(44, y + 12).setScale(av);
    }
    if (thinking) {
      for (let i = 0; i < 3; i++) {
        const hopK = Math.max(0, Math.sin(u * 9 - i * 0.9));
        g.fillStyle(INK, 1);
        g.fillCircle(78 + i * 14, y + 14 - hopK * 6, 4);
      }
    }
    const n = started ? typed(full.length, u, window[0], full.length / (window[1] - window[0])) : 0;
    if (n !== this.shown[key]) {
      this.shown[key] = n;
      text.setText(full.slice(0, n));
    }
    text.setVisible(started);
    if (key === "r1") text.setY(y - 6);
  }

  // --- Ctrl+A, Ctrl+C, Ctrl+V ------------------------------------------------------------------

  private drawKeys(u: number): void {
    const g = this.keyG;
    g.clear();
    const gone = seg(u, C.errors[0] - 0.25, C.errors[0]);
    for (let i = 0; i < KEYS.length; i++) {
      const t = this.keyTexts[i]!;
      const k = u < C.keys[i]! ? 0 : elasticOut(seg(u, C.keys[i]!, C.keys[i]! + 0.45)) * (1 - gone);
      t.setVisible(k > 0.01);
      if (k <= 0.01) continue;
      const [x, y, rot] = KEY_POS[i]!;
      const w = t.width / t.scaleX + 22;
      const press = bump(u, C.keys[i]!, 0.2) * 4;
      g.save();
      g.translateCanvas(x, y);
      g.rotateCanvas(rot);
      g.scaleCanvas(k, k);
      fillRR(g, -w / 2 + 4, -24 + 7, w, 48, 11, INK);
      fillRR(g, -w / 2, -24 + press, w, 48, 11, WHITE);
      strokeRR(g, -w / 2, -24 + press, w, 48, 11, OUTLINE);
      g.restore();
      t.setPosition(x - Math.sin(rot) * press, y + press - 1).setRotation(rot).setScale(k);
      const clack = bump(u, C.keys[i]!, 0.35);
      if (clack > 0) rays(g, x, y, w / 2 + 12, w / 2 + 22 + (1 - clack) * 8, 10, rot, 2.5, INK, clack);
    }
  }

  // --- The errors -----------------------------------------------------------------------------

  private drawErrors(u: number, life: number): void {
    const g = this.errG;
    g.clear();
    for (let i = 0; i < C.errors.length; i++) {
      const t = this.errTexts[i]!;
      const at = C.errors[i]!;
      const k = u < at ? 0 : backOut(seg(u, at, at + 0.22));
      t.setVisible(k > 0);
      if (k <= 0) continue;
      const pos = ERR_AT(i);
      const rot = (hash(i * 9.1) - 0.5) * 0.035;
      const cx = pos.x + ERR_W / 2;
      const cy = pos.y + ERR_H / 2;
      g.save();
      g.translateCanvas(cx, cy);
      g.rotateCanvas(rot);
      g.scaleCanvas(k, k);
      panel(g, -ERR_W / 2, -ERR_H / 2, ERR_W, ERR_H, { r: 10, shadow: true });
      // An ink cross, and a wobbly orange underline: an error, without a drop of red.
      disc(g, -ERR_W / 2 + 30, 0, 14, INK, 0);
      cross(g, -ERR_W / 2 + 30, 0, 5.5, 3, WHITE);
      g.restore();
      t.setPosition(cx - (ERR_W / 2 - 56) * k, cy + rot * 40).setRotation(rot).setScale(k);
      if (k >= 1) swoosh(g, pos.x + 58, pos.y + ERR_H - 9, pos.x + 58 + Math.min(ERR_W - 90, t.width - 8), seg(u, at + 0.2, at + 0.45), 3, ORANGE, 2);
    }
    const s = u < C.summary ? 0 : elasticOut(seg(u, C.summary, C.summary + 0.6));
    this.sumTitle.setVisible(s > 0);
    this.sumText.setVisible(s > 0);
    this.sumOk.setVisible(s > 0);
    if (s <= 0) return;
    const cx = SUMMARY.x + SUMMARY.w / 2;
    const cy = SUMMARY.y + SUMMARY.h / 2;
    const hit = bump(u, C.summary, 0.5);
    if (hit > 0) rays(g, cx, cy, SUMMARY.w / 2 + 14, SUMMARY.w / 2 + 40 + (1 - hit) * 20, 16, life, 3.5, INK, hit);
    g.save();
    g.translateCanvas(cx, cy);
    g.rotateCanvas(-0.025);
    g.scaleCanvas(s, s);
    panel(g, -SUMMARY.w / 2, -SUMMARY.h / 2, SUMMARY.w, SUMMARY.h, { r: 14, shadow: 1.6 });
    // An ink title strip: rounded at the top, square at the bottom.
    fillRR(g, -SUMMARY.w / 2, -SUMMARY.h / 2, SUMMARY.w, 48, 14, INK);
    g.fillStyle(WHITE, 1);
    g.fillRect(-SUMMARY.w / 2 + 1, -SUMMARY.h / 2 + 34, SUMMARY.w - 2, 16);
    g.lineStyle(OUTLINE, INK, 1);
    g.lineBetween(-SUMMARY.w / 2, -SUMMARY.h / 2 + 34, -SUMMARY.w / 2, -SUMMARY.h / 2 + 52);
    g.lineBetween(SUMMARY.w / 2, -SUMMARY.h / 2 + 34, SUMMARY.w / 2, -SUMMARY.h / 2 + 52);
    cross(g, SUMMARY.w / 2 - 22, -SUMMARY.h / 2 + 17, 6, 2.6, WHITE);
    panel(g, SUMMARY.w / 2 - 92, SUMMARY.h / 2 - 44, 74, 30, { r: 9, outline: 2, shadow: 0.5 });
    g.restore();
    this.sumTitle.setPosition(cx - (SUMMARY.w / 2 - 14) * s, cy - (SUMMARY.h / 2 - 17) * s).setRotation(-0.025).setScale(s);
    this.sumText.setPosition(cx - 2, cy + 2 * s).setRotation(-0.025).setScale(s);
    this.sumOk.setPosition(cx + (SUMMARY.w / 2 - 55) * s, cy + (SUMMARY.h / 2 - 29) * s).setRotation(-0.025).setScale(s);
  }
}

/** A message from Ruben: an ink bubble on the right, white text. */
function userBubble(g: G, text: Phaser.GameObjects.Text, right: number, y: number, w: number, k: number): void {
  text.setVisible(k > 0);
  if (k <= 0) return;
  const h = 44;
  g.save();
  g.translateCanvas(right, y + h);
  g.scaleCanvas(k, k);
  fillRR(g, -w, -h, w, h, 14, INK);
  g.fillStyle(INK, 1);
  g.fillTriangle(-16, -8, 4, 3, -30, -2);
  g.restore();
  text.setPosition(right - 9 * k, y + h - (h / 2) * k).setScale(k);
}
