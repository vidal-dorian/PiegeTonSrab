/**
 * Shot 7: the title card. "SAUVE TON SRAB" is stamped word by word; underneath, the whole team
 * hops in, roped together, Ruben last with his USB key held high, towards the classroom door. The
 * semester ahead is pencilled along the bottom, one stop per level.
 *
 * This is the frame the intro ends on: it keeps breathing (blinks, small hops, a swaying rope) for
 * as long as the game leaves it up.
 */
import type Phaser from "phaser";
import { FONT_MARKER, FONT_TEXT, FONT_TITLE, INK_CSS, ORANGE_CSS, PAPER_CSS } from "../../../render/levelView";
import type { Actor, ActorPose } from "../actor";
import { bump, clamp01, easeOut, elasticOut, hopWalk, lerp, pop, seg, shake, type HopStep } from "../anim";
import { GANG_SPACING, gangLayout, ROPE_SAG, ROPE_WAIST, TAG_BASE, TAG_FONT_PX, TAG_ROW_STEP, type GangLayout } from "../layout";
import { usbKey } from "../props";
import { Shot, type ShotContext } from "../shot";
import { disc, INK, ORANGE, panel, rays, ring, rope, setHatch, sparkle, stroke, swoosh, WHITE, type G } from "../sketch";
import { CUE, LEVEL_NAMES } from "../timeline";

const C = CUE.title;
const FLOOR = 300;
const CENTER_X = 250;
const DOOR = { x: 478, y: 218, w: 52, h: 82 };
const WAIST = ROPE_WAIST;
const WORD_Y = 150;
const WORD_SIZE = 128;
const WORD_GAP = 36;
/** Padding the text helper adds around a word of this size (both sides). */
const WORD_PAD = Math.ceil(WORD_SIZE * 0.25) * 2;
const ROUTE = { x0: 112, x1: 1094, y: 673 };

export class TitleShot extends Shot {
  private readonly n: number;
  private readonly lay: GangLayout;
  private readonly room: G;
  private readonly ropeG: G;
  private readonly friends: Actor[] = [];
  private readonly ruben: Actor;
  private readonly front: G;
  private readonly tags: Phaser.GameObjects.Text[] = [];
  private readonly rubenTag: Phaser.GameObjects.Text;
  private readonly uiG: G;
  private readonly words: Phaser.GameObjects.Text[] = [];
  private readonly wordX: number[] = [];
  private readonly tagline: Phaser.GameObjects.Text;
  private readonly stops: Phaser.GameObjects.Text[] = [];
  /** Feet x of every body, leader first, Ruben last: the rope's order. */
  private readonly slots: number[] = [];
  private readonly nowX: number[] = [];
  private readonly nowY: number[] = [];
  private readonly nowTop: number[] = [];
  private readonly hop: HopStep = { travel: 0, lift: 0, sx: 1, sy: 1 };
  private readonly pose: ActorPose = { x: 0, y: 0 };

  constructor(ctx: ShotContext) {
    super(ctx, "title");
    this.n = ctx.script.friendCount;
    this.lay = gangLayout(this.n);
    for (let i = 0; i < this.n; i++) this.slots.push(CENTER_X + this.lay.friends[i]!);
    this.slots.push(CENTER_X + this.lay.ruben);

    setHatch(6, 1.1);
    this.room = this.gfx();
    this.text(this.world, DOOR.x + DOOR.w / 2, DOOR.y - 17, "SALLE DE TP", { font: FONT_TITLE, weight: "700", size: 8.5, res: 3 });
    this.ropeG = this.gfx();
    for (let i = 0; i < this.n; i++) this.friends.push(this.actor(ctx.cast.friends[i]!.color));
    this.ruben = this.actor(ctx.cast.ruben.color, true);
    this.front = this.gfx();
    const tagStyle = { font: FONT_TEXT, weight: "500", size: TAG_FONT_PX, res: 3, oy: 1, stroke: PAPER_CSS, strokeW: 3.5 } as const;
    for (let i = 0; i < this.n; i++) this.tags.push(this.nameTag(this.world, ctx.cast.friends[i]!.pseudo, this.lay.tagMaxWidth, tagStyle));
    const played = ctx.script.playedBy;
    this.rubenTag = this.nameTag(this.world, played ? `Ruben · ${played}` : "Ruben", this.lay.tagMaxWidth, tagStyle);

    this.uiG = this.gfx(this.ui);
    const title = ctx.script.cards.title!.text.split(" ");
    let total = -WORD_GAP;
    title.forEach((word, i) => {
      const accent = i === title.length - 1;
      const t = this.text(this.ui, 0, WORD_Y, word, {
        font: FONT_TITLE,
        weight: "700",
        size: WORD_SIZE,
        color: accent ? ORANGE_CSS : "#ffffff",
        stroke: INK_CSS,
        strokeW: 14,
      });
      t.setShadow(6, 9, INK_CSS, 0, true, true);
      this.words.push(t);
      total += t.width - WORD_PAD + WORD_GAP;
    });
    let x = 640 - total / 2;
    for (const t of this.words) {
      const w = t.width - WORD_PAD;
      this.wordX.push(x + w / 2);
      x += w + WORD_GAP;
    }
    this.tagline = this.text(this.ui, 640, 268, ctx.script.cards.tagline!.text, { font: FONT_MARKER, size: 33, rot: -0.012 });
    LEVEL_NAMES.forEach((name, i) => {
      this.stops.push(this.text(this.ui, 0, 0, name, { font: FONT_MARKER, size: 15.5, rot: i % 2 === 0 ? -0.06 : 0.05 }));
    });
  }

  draw(u: number, life: number): void {
    setHatch(6, 1.1);
    let jolt = 0;
    for (const at of C.words) jolt += shake(u, at + 0.1, 0.3) * 6;
    this.setCam(300, 196, 2.2, jolt * 0.4, jolt);
    this.drawStage(u, life);
    this.drawGang(u, life);
    this.drawTitle(u, life);
    this.drawRoute(u, life);
  }

  private drawStage(u: number, life: number): void {
    const g = this.room;
    g.clear();
    // A platform, as in the levels, and the classroom door at its end.
    panel(g, -40, FLOOR, 640, 12, { r: 3, hatch: true, shadow: 0.8 });
    panel(g, DOOR.x - 5, DOOR.y - 5, DOOR.w + 10, DOOR.h + 5, { r: 3, shadow: 0.7 });
    panel(g, DOOR.x, DOOR.y, DOOR.w, DOOR.h, { r: 1, hatch: true, outline: 2 });
    panel(g, DOOR.x + 8, DOOR.y + 10, DOOR.w - 16, 22, { r: 2, outline: 1.8 });
    // The lock: orange, it is what the key is for.
    disc(g, DOOR.x + 11, DOOR.y + 48, 4.6, ORANGE, 1.8);
    g.fillStyle(INK, 1);
    g.fillRect(DOOR.x + 10.2, DOOR.y + 47, 1.6, 4);
    panel(g, DOOR.x - 4, DOOR.y - 27, DOOR.w + 8, 17, { r: 3, outline: 1.8, shadow: 0.4 });
    const glow = 0.5 + 0.5 * Math.sin(life * 2.4);
    rays(g, DOOR.x + 11, DOOR.y + 48, 8, 11 + glow * 2.5, 8, life * 0.6, 1.4, INK, seg(u, 2.6, 3.2));
  }

  private drawGang(u: number, life: number): void {
    const n = this.n;
    const f = this.front;
    f.clear();
    const bodies = n + 1;
    for (let b = 0; b < bodies; b++) {
      const isRuben = b === n;
      const actor = isRuben ? this.ruben : this.friends[b]!;
      // The leader arrives first; everyone hops in from the left edge.
      const t0 = C.gang[0] + b * 0.16;
      const t1 = C.gang[1] - (bodies - 1 - b) * 0.1;
      const walk = seg(u, t0, t1);
      const target = this.slots[b]!;
      const from = target - 330;
      const step = hopWalk(walk, 5, this.hop);
      // Once in place: a little hop now and then, passed down the line, for ever.
      const idleT = (life * 0.55 - b * 0.09) % 1.6;
      const idle = walk >= 1 ? bump(idleT, 0, 0.42) : 0;
      const land = walk >= 1 ? bump(u, t1, 0.25) : 0;
      const x = lerp(from, target, step.travel);
      const y = FLOOR - step.lift * 16 - idle * 9;
      const sy = step.sy * (1 - land * 0.2) * (1 + idle * 0.07) + Math.sin(life * 2.6 + b) * 0.012;
      const pose = this.pose;
      pose.x = x;
      pose.y = y;
      pose.facing = 1;
      pose.sx = step.sx * (1 + land * 0.2) * (1 - idle * 0.04);
      pose.sy = sy;
      pose.lean = walk < 1 ? 3 : 0.5;
      pose.lookX = 0.85;
      pose.lookY = isRuben && walk >= 1 ? -0.5 : -0.1;
      actor.draw(pose, life);
      this.nowX[b] = x;
      this.nowY[b] = y;
      this.nowTop[b] = y - 36 * sy;
      if (isRuben) {
        const kx = x + 3;
        const ky = this.nowTop[b]! - 10 + Math.sin(life * 3) * 1.2;
        const shine = seg(u, t1, t1 + 0.4);
        if (shine > 0) rays(f, kx, ky, 15, 19 + Math.sin(life * 4) * 1.5, 10, life * 0.7, 1.6, INK, shine);
        usbKey(f, kx, ky, 1, -0.3 + Math.sin(life * 2.2) * 0.06);
        if (shine > 0) sparkle(f, kx + 17, ky - 9, 4.5 * shine * (0.6 + 0.4 * Math.sin(life * 5)));
      }
    }
    // The labels rise together with whoever hops highest: they never bump into each other.
    let lift = 0;
    for (let b = 0; b < bodies; b++) {
      if (u >= C.gang[1] - (bodies - 1 - b) * 0.1) lift = Math.max(lift, FLOOR - 36 - this.nowTop[b]!);
    }
    for (let b = 0; b < bodies; b++) {
      const isRuben = b === n;
      const tag = isRuben ? this.rubenTag : this.tags[b]!;
      const row = isRuben ? this.lay.rubenTagRow : this.lay.tagRow[b]!;
      const k = pop(u, C.gang[1] - (bodies - 1 - b) * 0.1 + 0.05, 0.25);
      tag.setVisible(k > 0);
      if (k > 0) tag.setPosition(this.nowX[b]!, FLOOR - 36 - lift + TAG_BASE - row * TAG_ROW_STEP).setScale(k);
    }
    // The rope, from the leader down to Ruben. Alone, it trails behind him.
    const r = this.ropeG;
    r.clear();
    if (n === 0) {
      // Alone, the rope ties him to his key (he promised), and its loose end trails behind.
      const x = this.nowX[0]!;
      const y = this.nowY[0]! - WAIST;
      const top = this.nowTop[0]!;
      rope(r, x - 14, y, x - 14 - GANG_SPACING * 0.8, FLOOR - 2, 7 + Math.sin(life * 2) * 1.5, 2.6);
      rope(r, x - 14, y, x - 24, top + 4, -2, 2.6);
      rope(r, x - 24, top + 4, x - 5, top - 9 + Math.sin(life * 3) * 1.2, -4, 2.6);
      r.fillStyle(INK, 1);
      r.fillCircle(x - 14, y, 2.6);
      return;
    }
    for (let b = 0; b < n; b++) {
      const ax = this.nowX[b]!;
      const ay = this.nowY[b]! - WAIST;
      const bx = this.nowX[b + 1]!;
      const by = this.nowY[b + 1]! - WAIST;
      const slack = clamp01(1 - (Math.abs(ax - bx) - GANG_SPACING) / 40);
      rope(r, ax, ay, bx, by, ROPE_SAG * slack + Math.sin(life * 2.2 + b) * 0.9, 2.6);
      r.fillStyle(INK, 1);
      r.fillCircle(ax, ay, 2.6);
      r.fillCircle(bx, by, 2.6);
    }
  }

  private drawTitle(u: number, life: number): void {
    const g = this.uiG;
    g.clear();
    this.words.forEach((t, i) => {
      const at = C.words[i] ?? C.words[C.words.length - 1]!;
      const p = seg(u, at, at + 0.12);
      t.setVisible(p > 0);
      if (p <= 0) return;
      const settle = elasticOut(seg(u, at + 0.1, at + 0.7));
      const s = lerp(2.6, 1, easeOut(p)) * (0.92 + 0.08 * settle);
      const tilt = [-0.035, 0.03, -0.025][i % 3]!;
      t.setPosition(this.wordX[i]!, WORD_Y + Math.sin(life * 1.3 + i * 1.1) * 2.5)
        .setScale(s)
        .setRotation(tilt + (1 - settle) * 0.12)
        .setAlpha(clamp01(p * 2.5));
      const hit = bump(u, at + 0.1, 0.4);
      if (hit > 0) rays(g, this.wordX[i]!, WORD_Y, t.width * 0.56, t.width * 0.56 + 40 + (1 - hit) * 30, 14, i, 4, INK, hit);
    });
    const k = pop(u, C.tagline, 0.3);
    this.tagline.setVisible(k > 0).setScale(k);
    if (k > 0) {
      const w = this.tagline.width;
      swoosh(g, 640 - w / 2 + 14, 296, 640 + w / 2 - 14, seg(u, C.tagline + 0.3, C.tagline + 0.75), 6, ORANGE, 2.5);
    }
  }

  /** The semester, level by level, as a dotted road along the bottom of the page. */
  private drawRoute(u: number, life: number): void {
    const g = this.uiG;
    const count = this.stops.length;
    const drawn = seg(u, C.route, C.route + 1.8);
    for (let i = 0; i < count; i++) this.stops[i]!.setVisible(false);
    if (drawn <= 0) return;
    const reach = lerp(ROUTE.x0, ROUTE.x1, drawn);
    g.lineStyle(3, INK, 0.55);
    for (let x = ROUTE.x0; x < reach; x += 15) g.lineBetween(x, ROUTE.y, Math.min(x + 8, reach), ROUTE.y);
    for (let i = 0; i < count; i++) {
      const x = lerp(ROUTE.x0, ROUTE.x1, i / (count - 1));
      const k = pop(u, C.route + (i / (count - 1)) * 1.8, 0.25);
      if (k <= 0) continue;
      const last = i === count - 1;
      disc(g, x, ROUTE.y, (last ? 9 : 6.5) * k, last ? ORANGE : WHITE, 2.5);
      if (i === 0) ring(g, x, ROUTE.y, 11 + Math.sin(life * 4) * 1.5, 2, INK, 0.7);
      const up = i % 2 === 0;
      stroke(g, x, ROUTE.y + (up ? -10 : 10), x, ROUTE.y + (up ? -17 : 17), 2);
      this.stops[i]!
        .setVisible(true)
        .setPosition(x, ROUTE.y + (up ? -29 : 29))
        .setScale(k);
    }
  }
}
