/**
 * Shot 2: the lecture hall. The teacher writes a for loop on the board and asks Ruben, who was
 * dozing on the second row, what i is worth at the end. He thinks hard (of a dumbbell) and answers
 * "12 répétitions ?". The chalk does not survive.
 *
 * The room is seen from the side, like a level of the game: the tiers are steps of white hatched
 * blocks, the students sit on them facing the board.
 */
import type Phaser from "phaser";
import { FONT_MARKER, FONT_TITLE } from "../../../render/levelView";
import type { Actor } from "../actor";
import { arc, bump, clamp01, easeInOut, easeOut, lerp, noise, pop, seg, shake, typed } from "../anim";
import { dumbbell } from "../props";
import { Shot, type Point, type ShotContext } from "../shot";
import {
  cloud,
  disc,
  drop,
  fillRR,
  GREY,
  hatch,
  INK,
  MONO,
  ORANGE,
  OUTLINE,
  panel,
  partialRing,
  rays,
  ring,
  setHatch,
  stroke,
  strokeRR,
  WHITE,
  type G,
} from "../sketch";
import { CUE, type Speaker } from "../timeline";

const C = CUE.amphi;
const FLOOR = 300;
const STAGE = 288;
/** The blackboard (the ink surface, without its frame). */
const BOARD = { x: 158, y: 138, w: 300, h: 112 };
const CODE_X = 172;
const CODE_Y = 176;
const TIER_X = 528;
const TIER_W = 86;
const TIER_STEP = 26;
const TIERS = 4;
const TEACHER_SCALE = 1.15;
const TEACHER_X = 486;
/** Ruben sits on the second tier. */
const RUBEN_TIER = 1;

const tierTop = (k: number): number => FLOOR - (k + 1) * TIER_STEP;
const seatX = (k: number): number => TIER_X + k * TIER_W + 56;

export class AmphiShot extends Shot {
  private readonly codeText: Phaser.GameObjects.Text;
  private readonly noteText: Phaser.GameObjects.Text;
  private readonly teacher: Actor;
  private readonly extras: Actor[] = [];
  private readonly ruben: Actor;
  private readonly fx: G;
  private readonly crackText: Phaser.GameObjects.Text;
  private readonly thinkText: Phaser.GameObjects.Text;
  private readonly charW: number;
  private readonly codePad: number;
  private codeShown = -1;
  private teacherTop = 0;
  private rubenTop = 0;

  constructor(ctx: ShotContext) {
    super(ctx, "amphi");
    setHatch(5.5, 1);
    this.drawRoom(this.gfx());
    const code = ctx.script.cards.code!.text;
    this.codeText = this.text(this.world, CODE_X, CODE_Y, code, { font: MONO, weight: "bold", size: 15, color: "#ffffff", ox: 0, res: 3 });
    this.codePad = Math.ceil(15 * 0.25);
    this.charW = (this.codeText.width - this.codePad * 2) / code.length;
    this.codeText.setText("");
    this.noteText = this.text(this.world, BOARD.x + BOARD.w - 14, BOARD.y + BOARD.h - 26, ctx.script.cards.answer!.text, {
      font: FONT_MARKER,
      size: 19,
      color: "#ffffff",
      ox: 1,
      rot: -0.05,
      res: 3,
    });
    this.teacher = this.actor(GREY);
    for (let k = 0; k < TIERS; k++) if (k !== RUBEN_TIER) this.extras.push(this.actor(GREY));
    this.ruben = this.actor(ctx.cast.ruben.color, true);
    this.drawDesks(this.gfx());
    this.fx = this.gfx();
    this.crackText = this.text(this.world, 0, 0, "CRAC", { font: FONT_MARKER, size: 13, res: 3, rot: -0.15 });
    this.thinkText = this.text(this.world, 0, 0, "× 12", { font: FONT_MARKER, size: 12, res: 3, rot: -0.06 });
  }

  // --- Static scenery -----------------------------------------------------------------------

  private drawRoom(g: G): void {
    // Floor, the teacher's platform, the tiers.
    g.fillStyle(WHITE, 1);
    g.fillRect(-200, FLOOR, 1400, 260);
    hatch(g, -200, FLOOR, 1400, 260);
    stroke(g, -200, FLOOR, 1200, FLOOR);
    panel(g, 120, STAGE, 392, FLOOR - STAGE + 6, { r: 2, hatch: true });
    for (let k = TIERS - 1; k >= 0; k--) {
      const x = TIER_X + k * TIER_W;
      const top = tierTop(k);
      panel(g, x, top, TIER_W + (k === TIERS - 1 ? 300 : 0), FLOOR - top + 8, { r: 2, hatch: true });
    }
    // The blackboard: white frame, ink surface, chalk tray.
    panel(g, BOARD.x - 9, BOARD.y - 9, BOARD.w + 18, BOARD.h + 18, { r: 5, shadow: true });
    fillRR(g, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 2, INK);
    panel(g, BOARD.x + 10, BOARD.y + BOARD.h + 9, BOARD.w - 20, 7, { r: 2, shadow: 0.5, outline: 2 });
    panel(g, BOARD.x + 26, BOARD.y + BOARD.h + 3, 20, 7, { r: 2, outline: 1.5, fill: GREY });
    // Old chalk, half wiped.
    g.lineStyle(1.5, WHITE, 0.16);
    for (let i = 0; i < 5; i++) g.lineBetween(BOARD.x + 30 + i * 46, BOARD.y + 14, BOARD.x + 62 + i * 46, BOARD.y + 22);
    // Wall: a clock, the room's plate, two hanging lamps, a window.
    disc(g, 500, 104, 15, WHITE, 2.5, 0.6);
    stroke(g, 500, 104, 500, 94, 2);
    stroke(g, 500, 104, 506, 108, 2);
    for (const x of [262, 590]) {
      stroke(g, x, -60, x, 42, 2);
      g.fillStyle(WHITE, 1);
      g.fillTriangle(x - 20, 62, x + 20, 62, x, 36);
      g.lineStyle(OUTLINE, INK, 1);
      g.beginPath();
      g.moveTo(x - 20, 62);
      g.lineTo(x + 20, 62);
      g.lineTo(x + 6, 42);
      g.lineTo(x - 6, 42);
      g.closePath();
      g.strokePath();
    }
    panel(g, 664, 64, 112, 84, { r: 3, hatch: true, shadow: 0.7 });
    stroke(g, 720, 64, 720, 148, 2);
    stroke(g, 664, 106, 776, 106, 2);
    panel(g, 272, 92, 72, 24, { r: 5, shadow: 0.6, outline: 2 });
    this.text(this.world, 308, 104, "AMPHI A", { font: FONT_TITLE, weight: "700", size: 11, res: 3 });
  }

  /** The little desks, drawn over the students. */
  private drawDesks(g: G): void {
    for (let k = 0; k < TIERS; k++) {
      const x = TIER_X + k * TIER_W + 6;
      const top = tierTop(k);
      stroke(g, x + 12, top - 15, x + 12, top, 3);
      panel(g, x, top - 21, 36, 6, { r: 2, shadow: 0.5, outline: 2 });
    }
  }

  // --- Frame ---------------------------------------------------------------------------------

  draw(u: number, life: number): void {
    setHatch(5.5, 1);
    // In on Ruben for the question, back out for the damage.
    const push = easeInOut(seg(u, C.push[0], C.push[1])) - easeInOut(seg(u, C.note - 0.35, C.note + 0.75));
    const jolt = shake(u, C.crack, 0.35) * 3;
    this.setCam(
      lerp(478, 578, push) + noise(life * 0.4, 3) * 0.8,
      lerp(180, 214, push) + noise(life * 0.37, 4) * 0.6,
      lerp(1.9, 2.55, push) * (1 + 0.03 * seg(u, 0, C.push[0])),
      jolt,
      jolt * 0.5,
    );
    const g = this.fx;
    g.clear();
    this.drawBoard(u, g);
    this.drawTeacher(u, life, g);
    this.drawStudents(u, life, g);
  }

  private drawBoard(u: number, g: G): void {
    const code = this.script.cards.code!.text;
    const shown = typed(code.length, u, C.write[0], code.length / (C.write[1] - C.write[0]));
    if (shown !== this.codeShown) {
      this.codeShown = shown;
      this.codeText.setText(code.slice(0, shown));
    }
    // The answer, too late: the n is circled, and a note is chalked under it.
    const circled = seg(u, C.note, C.note + 0.4);
    this.noteText.setVisible(u >= C.note + 0.3).setAlpha(seg(u, C.note + 0.3, C.note + 0.5));
    if (circled > 0) {
      const nx = CODE_X + this.codePad + (code.indexOf("< n") + 2.5) * this.charW;
      partialRing(g, nx, CODE_Y + 1, 9.5, circled, 2.4, ORANGE, -2.2);
      if (circled >= 1) {
        g.lineStyle(1.6, WHITE, 0.9);
        g.beginPath();
        g.moveTo(nx + 3, CODE_Y + 13);
        g.lineTo(nx + 14, CODE_Y + 30);
        g.lineTo(nx + 30, CODE_Y + 42);
        g.strokePath();
      }
    }
  }

  private drawTeacher(u: number, life: number, g: G): void {
    const writing = seg(u, C.write[0], C.write[1]);
    const caretX = CODE_X + this.codePad + Math.max(0, this.codeShown) * this.charW;
    const walk = easeInOut(seg(u, C.write[1] + 0.02, C.turn + 0.05));
    const turned = u >= C.turn;
    const asking = bump(u, C.turn, 0.35);
    const stunned = seg(u, C.crack - 0.3, C.crack);
    const wilt = easeOut(seg(u, C.crack, C.crack + 0.5));
    const isWriting = writing > 0 && writing < 1;
    const x = lerp(Math.min(caretX + 30, TEACHER_X), TEACHER_X, walk);
    const talk = u > C.turn + 0.2 && u < 6.6 ? Math.abs(Math.sin(u * 9)) * 0.03 : 0;
    const sy = (1 + (isWriting ? Math.sin(u * 22) * 0.025 : 0) + asking * 0.1 + talk - wilt * 0.14) * (1 - arc(walk) * 0.06);
    this.teacher.draw(
      {
        x,
        y: STAGE - asking * 7 - arc(walk) * 5,
        scale: TEACHER_SCALE,
        facing: turned ? 1 : -1,
        sx: 1 - asking * 0.06 + wilt * 0.1,
        sy,
        lean: turned ? lerp(4, -1, stunned) : 1,
        lookX: turned ? 0.9 : 0.6,
        lookY: turned ? lerp(-0.5, 0.2, wilt) : -0.9,
        dizzy: u > C.crack && u < C.crack + 1.4,
        ...(u >= C.crack + 1.4 && u < C.crack + 2.1 ? { blink: true } : {}),
      },
      life,
    );
    this.teacherTop = STAGE - 36 * TEACHER_SCALE * sy - asking * 7;
    // Glasses, and a little tie: this one is a teacher.
    const tg = this.teacher.g;
    const slip = wilt * 5;
    const [e0x, e0y] = this.teacher.local(-2, -21.6 + slip);
    const [e1x, e1y] = this.teacher.local(8.3, -21.6 + slip);
    ring(tg, e0x, e0y, 6.2, 1.8);
    ring(tg, e1x, e1y, 6.2, 1.8);
    const [b0x, b0y] = this.teacher.local(-13, -24 + slip * 0.6);
    tg.lineStyle(1.8, INK, 1);
    tg.lineBetween(e0x - (turned ? 6.2 : -6.2) * 1, e0y, b0x, b0y);
    const [t0x, t0y] = this.teacher.local(4, -10);
    const [t1x, t1y] = this.teacher.local(1, -3);
    const [t2x, t2y] = this.teacher.local(4, 2);
    const [t3x, t3y] = this.teacher.local(7, -3);
    tg.fillStyle(INK, 1);
    tg.fillTriangle(t0x, t0y, t1x, t1y, t3x, t3y);
    tg.fillTriangle(t1x, t1y, t2x, t2y, t3x, t3y);

    // The chalk: it writes on the board, then waits by the teacher, then snaps.
    this.crackText.setVisible(false);
    if (u < C.crack) {
      let cx = x + (turned ? 24 : -22);
      let cy = this.teacherTop + 22;
      let rot = turned ? -0.5 : 0.5;
      if (u < C.write[1] + 0.1) {
        const k = isWriting ? 1 : seg(u, C.write[0] - 0.4, C.write[0]);
        cx = lerp(cx, caretX + 4, k);
        cy = lerp(cy, CODE_Y + 4 + (isWriting ? Math.sin(u * 40) * 2.5 : 0), k);
        rot = lerp(rot, 0.6, k);
        if (isWriting) {
          const dust = (u * 9) % 1;
          g.fillStyle(WHITE, 0.7 * (1 - dust));
          g.fillCircle(caretX - 2 + dust * 6, CODE_Y + 10 + dust * 14, 1.6);
          g.fillCircle(caretX - 8 + dust * 3, CODE_Y + 12 + dust * 18, 1.2);
        }
      }
      chalk(g, cx, cy, 13, rot);
    } else {
      const fall = seg(u, C.crack, C.crack + 0.55);
      const cx = x + 24;
      const cy0 = this.teacherTop + 22;
      const ground = STAGE - 3;
      chalk(g, cx - 5 - fall * 9, Math.min(ground, cy0 + fall * fall * 70), 6, -0.5 - fall * 5);
      chalk(g, cx + 5 + fall * 14, Math.min(ground, cy0 + fall * fall * 76), 6, -0.5 + fall * 7);
      const snap = bump(u, C.crack, 0.7);
      if (snap > 0) {
        rays(g, cx, cy0, 8, 15 + (1 - snap) * 6, 7, 0.3, 1.8, INK, clamp01(snap * 2));
        this.crackText.setVisible(true).setPosition(cx + 16, cy0 - 20 - (1 - snap) * 4).setAlpha(clamp01(snap * 2.5));
      }
    }
  }

  private drawStudents(u: number, life: number, g: G): void {
    // The others: they follow the lesson, then turn round to look at Ruben.
    const react = seg(u, C.answer + 0.5, C.answer + 0.9);
    let n = 0;
    for (let k = 0; k < TIERS; k++) {
      if (k === RUBEN_TIER) continue;
      const a = this.extras[n++]!;
      const laugh = k === 3 && u > C.answer + 0.8 ? Math.abs(Math.sin(u * 15)) * 0.07 : 0;
      const facepalm = k === 2 ? easeOut(react) : 0;
      const looksBack = k === 0 && u > C.startle + 0.6;
      a.draw(
        {
          x: seatX(k),
          y: tierTop(k) - laugh * 40,
          facing: looksBack ? 1 : -1,
          sx: 1 + facepalm * 0.1,
          sy: 1 + Math.sin(life * 2.3 + k) * 0.012 - facepalm * 0.16,
          lean: facepalm * 4,
          lookX: looksBack ? 0.9 : k === 0 ? 0.7 : lerp(0.7, 0.2, clamp01((u - C.startle) / 0.5)),
          lookY: looksBack ? -0.5 : k > RUBEN_TIER && u > C.startle ? 0.7 : -0.3,
          ...(facepalm > 0.5 ? { blink: true } : {}),
        },
        life,
      );
    }

    // Ruben: asleep, startled, thinking, answering.
    const rx = seatX(RUBEN_TIER);
    const ry = tierTop(RUBEN_TIER);
    const asleep = u < C.startle;
    const jump = bump(u, C.startle, 0.4);
    const think = u >= C.think[0] && u < C.answer;
    const answer = bump(u, C.answer, 0.4);
    const after = u >= C.answer + 0.4;
    let lookX = 0.8;
    let lookY = 0;
    if (think) {
      const t = (u - C.think[0]) / (C.answer - C.think[0]);
      lookX = t < 0.45 ? Math.sin(u * 7) * 0.9 : 0.1;
      lookY = t < 0.45 ? 0.2 : -0.95;
    } else if (after) {
      lookX = 0.6 + Math.sin(u * 2.5) * 0.35;
      lookY = -0.2;
    }
    const sy = asleep ? 0.9 + Math.sin(life * 1.6) * 0.03 : 1 + jump * 0.16 + answer * 0.1 + Math.sin(life * 3) * 0.012;
    this.ruben.draw(
      {
        x: rx,
        y: ry - jump * 9 - answer * 4,
        facing: -1,
        sx: asleep ? 1.06 : 1 - jump * 0.08,
        sy,
        lean: asleep ? 5 : think ? -1 : 2 + answer * 3,
        lookX,
        lookY,
        ...(asleep ? { blink: true } : jump > 0.1 ? { blink: false } : {}),
      },
      life,
    );
    this.rubenTop = ry - 36 * sy - jump * 9 - answer * 4;

    if (asleep) {
      // z z z
      for (let i = 0; i < 3; i++) {
        const p = (life * 0.45 + i / 3) % 1;
        const s = 3 + p * 4;
        const zx = rx - 6 - p * 22 + Math.sin(p * 7 + i) * 3;
        const zy = this.rubenTop - 2 - p * 34;
        g.lineStyle(1.8, INK, 1 - p);
        g.beginPath();
        g.moveTo(zx - s, zy - s);
        g.lineTo(zx + s, zy - s);
        g.lineTo(zx - s, zy + s);
        g.lineTo(zx + s, zy + s);
        g.strokePath();
      }
    }
    // Surprise marks, then sweat.
    if (jump > 0) rays(g, rx - 4, this.rubenTop + 14, 24, 31, 7, Math.PI * 0.95, 2, INK, jump, Math.PI * 1.1);
    if (!asleep && u < C.answer) {
      const d = (u * 0.9) % 1;
      drop(g, rx + 15, this.rubenTop + 6 + d * 16, 2.6, WHITE, 1 - d);
    }
    if (after) {
      const d = (u * 0.7 + 0.3) % 1;
      drop(g, rx + 16, this.rubenTop + 8 + d * 14, 2.4, WHITE, 1 - d);
    }

    // What goes on in his head: a dumbbell, of course.
    this.thinkText.setVisible(false);
    const cloudK = pop(u, C.think[0] + 0.15, 0.3) * (1 - seg(u, C.answer - 0.05, C.answer + 0.1));
    if (cloudK > 0.01) {
      const cx = rx + 36;
      const cy = this.rubenTop - 36;
      disc(g, rx + 12, this.rubenTop - 6, 2.4 * cloudK, WHITE, 1.6);
      disc(g, rx + 19, this.rubenTop - 14, 3.6 * cloudK, WHITE, 1.6);
      cloud(g, cx, cy, 78 * cloudK, 28 * cloudK);
      const idea = seg(u, C.think[0] + 1.05, C.think[0] + 1.25);
      if (idea <= 0) {
        // First, nothing at all.
        for (let i = 0; i < 3; i++) {
          g.fillStyle(INK, 1);
          g.fillCircle(cx - 8 + i * 8, cy + Math.sin(u * 8 + i) * 1.5, 1.8 * cloudK);
        }
      } else {
        const rep = Math.sin(u * 7);
        dumbbell(g, cx - 13, cy + 2 - rep * 3, 0.72 * cloudK * idea, -0.25 + rep * 0.18);
        this.thinkText.setVisible(true).setPosition(cx + 13, cy + 2).setScale(cloudK * idea);
      }
    }
  }

  override anchor(who: Speaker, out: Point): boolean {
    if (who === "teacher") {
      this.toScreen(TEACHER_X + 4, this.teacherTop - 4, out);
      return true;
    }
    if (who === "ruben") {
      this.toScreen(seatX(RUBEN_TIER) - 4, this.rubenTop - 5, out);
      return true;
    }
    return false;
  }
}

/** A stick of chalk centred on (x, y). */
function chalk(g: G, x: number, y: number, len: number, rot: number): void {
  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(rot);
  fillRR(g, -2.2, -len / 2, 4.4, len, 1.2, WHITE);
  strokeRR(g, -2.2, -len / 2, 4.4, len, 1.2, 1.4);
  g.restore();
}
