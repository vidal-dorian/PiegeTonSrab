/**
 * Shot 5: the deadline. A note slams on the wall: "SAÉ à rendre DEMAIN 8 h". Ruben plugs his USB
 * key in: the folder is empty (a spider has moved in). He reaches for his shaker: one drop.
 *
 * Still night: the same ink hatching as the previous shot, lit by the laptop.
 */
import type Phaser from "phaser";
import { FONT_MARKER, FONT_TEXT, FONT_TITLE } from "../../../render/levelView";
import type { Actor } from "../actor";
import { backOut, bump, clamp01, easeIn, easeInOut, easeOut, elasticOut, lerp, noise, pop, seg, shake } from "../anim";
import { shaker, usbKey } from "../props";
import { SCREEN_H, SCREEN_W, Shot, type ShotContext } from "../shot";
import {
  darkness,
  dashed,
  disc,
  drop,
  hatch,
  INK,
  LINE,
  ORANGE,
  OUTLINE,
  panel,
  partial,
  rays,
  setHatch,
  stroke,
  WHITE,
  type G,
} from "../sketch";
import { CUE } from "../timeline";

const C = CUE.deadline;
const FLOOR = 300;
const RUBEN_X = 246;
const TABLE = { x: 284, y: 262, w: 72 };
/** The laptop's screen, world pixels. */
const LAP = { x: 300, y: 226, w: 42, h: 30 };
const NOTE = { x: 300, y: 226, w: 440, h: 290 };
const WIN = { x: 724, y: 60, w: 492, h: 262 };
const WIN_TITLE = 46;

/** The scribbled ring around "DEMAIN 8 h": two loops of a slightly squashed ellipse. */
const RING: number[] = [];
for (let i = 0; i <= 44; i++) {
  const a = -2.4 + (i / 44) * Math.PI * 4.15;
  const grow = 1 + (i / 44) * 0.06;
  RING.push(Math.cos(a) * 186 * grow + Math.sin(a * 2) * 4, 32 + Math.sin(a) * 56 * grow);
}

export class DeadlineShot extends Shot {
  private readonly room: G;
  private readonly ruben: Actor;
  private readonly front: G;
  private readonly dark: G;

  private readonly linkG: G;
  private readonly note: Phaser.GameObjects.Container;
  private readonly noteG: G;
  private readonly win: Phaser.GameObjects.Container;
  private readonly winG: G;
  private readonly plicText: Phaser.GameObjects.Text;
  private readonly p = { x: 0, y: 0 };
  private readonly q = { x: 0, y: 0 };

  constructor(ctx: ShotContext) {
    super(ctx, "deadline");
    const cards = ctx.script.cards;
    this.room = this.gfx();
    this.ruben = this.actor(ctx.cast.ruben.color, true);
    this.front = this.gfx();
    this.dark = this.gfx();
    this.plicText = this.text(this.world, 0, 0, "plic", { font: FONT_MARKER, size: 11, res: 3, rot: -0.12 });

    this.linkG = this.gfx(this.ui);
    this.note = this.layer(this.ui).setPosition(NOTE.x, NOTE.y);
    this.noteG = this.gfx(this.note);
    const [line1, line2] = cards.sae!.text.split("\n");
    this.text(this.note, -14, -84, line1 ?? "", { font: FONT_MARKER, size: 46 });
    this.text(this.note, 0, 30, line2 ?? "", { font: FONT_MARKER, size: 64 });

    this.win = this.layer(this.ui);
    this.winG = this.gfx(this.win);
    this.text(this.win, 62, WIN_TITLE / 2 + 1, cards.drive!.text, { font: FONT_TITLE, weight: "600", size: 22, ox: 0 });
    this.text(this.win, WIN.w / 2, WIN_TITLE + (WIN.h - WIN_TITLE) / 2 + 26, cards.empty!.text, { font: FONT_TEXT, weight: "500", size: 21 }).setAlpha(0.8);
  }

  draw(u: number, life: number): void {
    setHatch(5.5, 1);
    const slam = shake(u, C.note + 0.14, 0.45) * 9;
    this.setCam(RUBEN_X + noise(life * 0.4, 21) * 0.7, 223 + noise(life * 0.35, 22) * 0.5, 2.6 + 0.08 * seg(u, 0, 7), slam * 0.5, slam);
    this.drawRoom(u, life);
    this.drawNote(u);
    this.drawFolder(u, life);
  }

  private drawRoom(u: number, life: number): void {
    const g = this.room;
    g.clear();
    g.fillStyle(WHITE, 1);
    g.fillRect(-300, FLOOR, 1200, 260);
    hatch(g, -300, FLOOR, 1200, 260);
    stroke(g, -300, FLOOR, 900, FLOOR);
    // The table and the laptop.
    panel(g, TABLE.x, TABLE.y, TABLE.w, 6, { r: 2, outline: 2, shadow: 0.5 });
    stroke(g, TABLE.x + 8, TABLE.y + 6, TABLE.x + 8, FLOOR, 3);
    stroke(g, TABLE.x + TABLE.w - 8, TABLE.y + 6, TABLE.x + TABLE.w - 8, FLOOR, 3);
    panel(g, LAP.x - 3, LAP.y - 3, LAP.w + 6, LAP.h + 6, { r: 3, outline: 2, shadow: 0.5 });
    panel(g, LAP.x, LAP.y, LAP.w, LAP.h, { r: 1, outline: 1.2 });
    panel(g, LAP.x - 8, TABLE.y - 5, LAP.w + 16, 5, { r: 2, outline: 2 });

    // Ruben.
    const startled = bump(u, C.note + 0.1, 0.5);
    const sees = u >= C.note;
    const holdKey = seg(u, C.key, C.key + 0.25);
    const plug = easeInOut(seg(u, C.key + 0.25, C.folder - 0.05));
    const stare = u >= C.folder && u < C.drop - 0.8;
    const lift = easeOut(seg(u, C.drop - 0.75, C.drop - 0.35));
    const tip = easeInOut(seg(u, C.drop - 0.4, C.drop - 0.05));
    const plicAt = C.drop + 0.4;
    const hitHead = bump(u, plicAt, 0.3);
    const wilt = easeOut(seg(u, plicAt + 0.2, plicAt + 1));
    const gulp = bump(u, C.folder + 0.25, 0.45);
    const sy = 1 + startled * 0.18 - gulp * 0.1 - hitHead * 0.08 - wilt * 0.2 + Math.sin(life * 2.8) * 0.012;
    let lookX = 0.6;
    let lookY = 0;
    if (lift > 0) {
      lookX = lerp(0.6, 0.15, lift);
      lookY = lerp(0, -1, lift) + wilt * 1.2;
    } else if (u >= C.key) {
      lookX = 0.95;
      lookY = lerp(-0.2, -0.5, seg(u, C.folder, C.folder + 0.2));
    } else if (sees) {
      lookX = -0.9;
      lookY = -0.8;
    }
    this.ruben.draw(
      {
        x: RUBEN_X,
        y: FLOOR - startled * 10,
        facing: 1,
        sx: 1 - startled * 0.08 + gulp * 0.07 + wilt * 0.14,
        sy,
        lean: stare ? -2 : 0,
        lookX,
        lookY,
        ...(wilt > 0.6 ? { blink: true } : {}),
      },
      life,
    );
    const headY = FLOOR - 36 * sy - startled * 10;

    const f = this.front;
    f.clear();
    if (startled > 0) rays(f, RUBEN_X, headY + 14, 24, 32, 9, Math.PI, 2, INK, startled, Math.PI);
    // Sweat while he stares at the empty folder.
    if (stare) {
      for (let i = 0; i < 2; i++) {
        const p = (u * 1.3 + i * 0.5) % 1;
        drop(f, RUBEN_X - 15 + i * 30, headY + 6 + p * 18, 2.3, WHITE, 1 - p);
      }
    }
    // The USB key: out of nowhere above his head, then into the laptop.
    if (u >= C.key) {
      const kx = lerp(RUBEN_X + 12, LAP.x - 14, plug);
      const ky = lerp(headY - 12, TABLE.y - 3, plug) - Math.sin(plug * Math.PI) * 10;
      usbKey(f, kx, ky, lerp(0.2, 0.62, backOut(holdKey)), lerp(-0.5, 0, plug), plug < 1);
      const shine = bump(u, C.key + 0.05, 0.5);
      if (shine > 0) rays(f, kx, ky, 12, 17 + (1 - shine) * 4, 8, u, 1.6, INK, shine);
    }
    // The shaker: lifted, turned over. One drop.
    {
      const sxp = lerp(RUBEN_X + 22, RUBEN_X + 5, lift);
      const syp = lerp(FLOOR - 13, headY - 24, lift);
      shaker(f, sxp, syp, 0.82, lerp(0.12, Math.PI + 0.12, tip), 0);
      const fall = seg(u, C.drop, plicAt);
      if (fall > 0 && fall < 1) drop(f, RUBEN_X + 4, lerp(syp + 14, headY - 1, easeIn(fall)), 2.6, ORANGE);
      this.plicText.setVisible(hitHead > 0);
      if (hitHead > 0) {
        this.plicText.setPosition(RUBEN_X - 24, headY - 6 - (1 - hitHead) * 5).setAlpha(clamp01(hitHead * 2));
        rays(f, RUBEN_X + 4, headY, 5, 9 + (1 - hitHead) * 4, 5, Math.PI * 1.15, 1.6, INK, hitHead, Math.PI * 0.7);
      }
    }

    const d = this.dark;
    d.clear();
    darkness(d, this.camX, this.camY, this.zoom, SCREEN_W, SCREEN_H, 286, 250, 92 + Math.sin(life * 6) * 1.5);
  }

  // --- "SAÉ à rendre DEMAIN 8 h" ------------------------------------------------------------

  private drawNote(u: number): void {
    if (u < C.note) {
      this.note.setVisible(false);
      return;
    }
    const s = seg(u, C.note, C.note + 0.15);
    this.note.setVisible(true).setScale(lerp(2.3, 1, easeOut(s))).setRotation(lerp(-0.2, -0.045, easeOut(s))).setAlpha(clamp01(s * 3));
    const g = this.noteG;
    g.clear();
    setHatch(9, 2);
    panel(g, -NOTE.w / 2, -NOTE.h / 2, NOTE.w, NOTE.h, { r: 6, shadow: 1.6 });
    // Tape.
    g.save();
    g.translateCanvas(0, -NOTE.h / 2);
    g.rotateCanvas(0.05);
    g.fillStyle(WHITE, 1);
    g.fillRect(-60, -15, 120, 30);
    hatch(g, -60, -15, 120, 30, 7, LINE, 2);
    g.lineStyle(2, INK, 1);
    g.lineBetween(-60, -15, -60, 15);
    g.lineBetween(60, -15, 60, 15);
    g.restore();
    // Circled twice in orange, and underlined in case it was not clear.
    partial(g, RING, seg(u, C.note + 0.35, C.note + 1.05), 6, ORANGE);
    const hit = bump(u, C.note + 0.13, 0.4);
    if (hit > 0) rays(g, 0, 0, NOTE.w / 2 + 16, NOTE.w / 2 + 44 + (1 - hit) * 20, 18, 0.1, 4, INK, hit);
    // !!!
    for (let i = 0; i < 3; i++) {
      const k = pop(u, C.note + 0.9 + i * 0.1, 0.2);
      if (k <= 0) continue;
      const x = 146 + i * 19;
      const y = -92 - i * 4;
      stroke(g, x + 3, y - 22 * k, x, y, 6);
      g.fillStyle(INK, 1);
      g.fillCircle(x - 1.5, y + 12, 3.6 * k);
    }
  }

  // --- The empty folder -----------------------------------------------------------------------

  private drawFolder(u: number, life: number): void {
    const link = this.linkG;
    link.clear();
    if (u < C.folder) {
      this.win.setVisible(false);
      return;
    }
    const k = elasticOut(seg(u, C.folder, C.folder + 0.55));
    const a = this.toScreen(LAP.x + LAP.w / 2, LAP.y + LAP.h / 2, this.p);
    const s = lerp(0.2, 1, k);
    const cx = lerp(a.x, WIN.x + WIN.w / 2, k);
    const cy = lerp(a.y, WIN.y + WIN.h / 2, k);
    this.win.setVisible(true).setScale(s).setPosition(cx - (WIN.w * s) / 2, cy - (WIN.h * s) / 2);
    const alpha = seg(u, C.folder + 0.25, C.folder + 0.5);
    if (alpha > 0) {
      const m0 = this.toScreen(LAP.x, LAP.y, this.p);
      dashed(link, m0.x, m0.y, WIN.x + 14, WIN.y + WIN.h, alpha);
      const m1 = this.toScreen(LAP.x + LAP.w, LAP.y, this.q);
      dashed(link, m1.x, m1.y, WIN.x + WIN.w - 14, WIN.y + WIN.h, alpha);
    }

    const g = this.winG;
    g.clear();
    setHatch(9, 2);
    panel(g, 0, 0, WIN.w, WIN.h, { r: 16, shadow: 1.4 });
    stroke(g, 0, WIN_TITLE, WIN.w, WIN_TITLE, OUTLINE);
    usbKey(g, 34, WIN_TITLE / 2, 1.25, 0, false);
    disc(g, WIN.w - 26, WIN_TITLE / 2, 7, WHITE, 2);
    disc(g, WIN.w - 48, WIN_TITLE / 2, 7, LINE, 2);
    // A dashed frame around nothing.
    const bx = 22;
    const by = WIN_TITLE + 18;
    const bw = WIN.w - 44;
    const bh = WIN.h - WIN_TITLE - 36;
    g.lineStyle(2, INK, 0.45);
    for (let x = bx; x < bx + bw; x += 16) {
      g.lineBetween(x, by, Math.min(x + 9, bx + bw), by);
      g.lineBetween(x, by + bh, Math.min(x + 9, bx + bw), by + bh);
    }
    for (let y = by; y < by + bh; y += 16) {
      g.lineBetween(bx, y, bx, Math.min(y + 9, by + bh));
      g.lineBetween(bx + bw, y, bx + bw, Math.min(y + 9, by + bh));
    }
    // The cobweb in the corner, and its tenant on a thread.
    const wx = bx + bw;
    const wy = by;
    g.lineStyle(1.6, INK, 1);
    for (const ang of [Math.PI * 0.5, Math.PI * 0.64, Math.PI * 0.78, Math.PI * 0.9, Math.PI]) {
      g.lineBetween(wx, wy, wx + Math.cos(ang) * 84, wy + Math.sin(ang) * 84);
    }
    for (const r of [26, 46, 66]) {
      g.beginPath();
      for (let i = 0; i <= 4; i++) {
        const ang = Math.PI * 0.5 + (i / 4) * Math.PI * 0.5;
        const rr = r * (i % 2 === 0 ? 1 : 0.86);
        const px = wx + Math.cos(ang) * rr;
        const py = wy + Math.sin(ang) * rr;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.strokePath();
    }
    const hang = 44 + Math.sin(life * 1.7) * 12;
    const spx = wx - 118;
    g.lineBetween(spx, by, spx, by + hang);
    g.fillStyle(INK, 1);
    g.fillCircle(spx, by + hang + 5, 5.5);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        g.lineBetween(spx, by + hang + 4, spx + side * (9 + i), by + hang + (i - 1) * 5 + 6 + Math.sin(life * 9 + i) * 1.2);
      }
    }
    // A fly, bored.
    const ft = life * 1.3;
    const fx = bx + 96 + Math.cos(ft) * 62 + Math.cos(ft * 2.3) * 14;
    const fy = by + 44 + Math.sin(ft * 1.4) * 20 + Math.sin(ft * 3.1) * 6;
    g.lineStyle(1.4, INK, 0.5);
    for (let i = 1; i <= 5; i++) {
      const t0 = ft - i * 0.16;
      const t1 = t0 + 0.07;
      g.lineBetween(
        bx + 96 + Math.cos(t0) * 62 + Math.cos(t0 * 2.3) * 14,
        by + 44 + Math.sin(t0 * 1.4) * 20 + Math.sin(t0 * 3.1) * 6,
        bx + 96 + Math.cos(t1) * 62 + Math.cos(t1 * 2.3) * 14,
        by + 44 + Math.sin(t1 * 1.4) * 20 + Math.sin(t1 * 3.1) * 6,
      );
    }
    g.fillStyle(INK, 1);
    g.fillCircle(fx, fy, 3.2);
    g.fillStyle(WHITE, 1);
    g.fillEllipse(fx - 3, fy - 4, 6, 4);
    g.fillEllipse(fx + 3, fy - 4, 6, 4);
    g.lineStyle(1, INK, 1);
    g.strokeEllipse(fx - 3, fy - 4, 6, 4);
    g.strokeEllipse(fx + 3, fy - 4, 6, 4);
  }
}
