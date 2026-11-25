/**
 * Shot 6: the friends. Ruben is alone in the dark; the door slams open and the players burst in as
 * a tower (standing on each other's heads, as they will in the levels), topple into a line, and tie
 * everybody together with a rope: "On te laisse pas redoubler, srab." "Personne ne lâche personne."
 *
 * The line-up is the game's rope order: Ruben at one end, the last seat next to him, the first
 * seat leading. With no friend at all, nobody comes through the door: Ruben pulls himself together
 * and ties the rope to his USB key.
 */
import type Phaser from "phaser";
import { FONT_MARKER, FONT_TEXT, PAPER_CSS } from "../../../render/levelView";
import type { Actor, ActorPose } from "../actor";
import { arc, backOut, bump, clamp01, easeInOut, easeOut, elasticOut, lerp, noise, pop, seg, shake } from "../anim";
import { GANG_SPACING, gangLayout, ROPE_SAG, ROPE_WAIST, TAG_BASE, TAG_FONT_PX, TAG_ROW_STEP, type GangLayout } from "../layout";
import { usbKey } from "../props";
import { SCREEN_H, SCREEN_W, Shot, type Point, type ShotContext } from "../shot";
import { burst, darkness, drop, fillPoly, hatch, INK, ORANGE, panel, rays, rope, setHatch, sparkle, stroke, WHITE, type G } from "../sketch";
import { CUE, type Speaker } from "../timeline";

const C = CUE.rescue;
const FLOOR = 300;
const CENTER_X = 276;
const DOOR = { x: 520, y: 222, w: 50, h: 78 };
const TOWER_X = 488;
const STACK = 33;
/** Top of a body standing still on the floor. */
const STAND_TOP = FLOOR - 36;
const WIDE_ZOOM = 2.2;
const MAX_ZOOM = 3;
/** Where the floor line sits on screen, whatever the zoom. */
const FLOOR_SCREEN_Y = 566;
const WAIST = ROPE_WAIST;

export class RescueShot extends Shot {
  private readonly n: number;
  private readonly lay: GangLayout;
  private readonly room: G;
  private readonly ropeG: G;
  private readonly friends: Actor[] = [];
  private readonly ruben: Actor;
  private readonly front: G;
  private readonly dark: G;
  private readonly tags: Phaser.GameObjects.Text[] = [];
  private readonly slamText: Phaser.GameObjects.Text;
  private readonly cricket: Phaser.GameObjects.Text;
  private readonly rubenX: number;
  private readonly slotX: number[] = [];
  /** Where each body is this frame (feet x, top y), for the rope, the labels and the bubbles. */
  private readonly bodyX: number[] = [];
  private readonly bodyTop: number[] = [];
  private readonly bodyY: number[] = [];
  /** The close framing: centre of the line-up, and the zoom that fits it with its labels. */
  private readonly groupX: number;
  private readonly closeZoom: number;
  private rubenTop = 0;
  private tagLift = 0;
  private rubenNowX = 0;
  private rubenNowY = 0;
  private readonly pose: ActorPose = { x: 0, y: 0 };

  constructor(ctx: ShotContext) {
    super(ctx, "rescue");
    this.n = ctx.script.friendCount;
    this.lay = gangLayout(this.n);
    // Alone, Ruben stands a little to the left: his key will lie where a friend would have stood.
    this.rubenX = this.n === 0 ? CENTER_X - GANG_SPACING / 2 : CENTER_X + this.lay.ruben;
    for (let i = 0; i < this.n; i++) this.slotX.push(CENTER_X + this.lay.friends[i]!);

    const right = this.n === 0 ? this.rubenX + GANG_SPACING : this.slotX[0]!;
    this.groupX = (this.rubenX + right) / 2;
    const span = right - this.rubenX + this.lay.tagMaxWidth * (this.n === 0 ? 0.5 : 1) + 40;
    this.closeZoom = Math.max(WIDE_ZOOM, Math.min(MAX_ZOOM, (SCREEN_W * 0.86) / span));

    this.room = this.gfx();
    this.ropeG = this.gfx();
    for (let i = 0; i < this.n; i++) this.friends.push(this.actor(ctx.cast.friends[i]!.color));
    this.ruben = this.actor(ctx.cast.ruben.color, true);
    this.front = this.gfx();
    this.dark = this.gfx();
    for (let i = 0; i < this.n; i++) {
      this.tags.push(
        this.nameTag(this.world, ctx.cast.friends[i]!.pseudo, this.lay.tagMaxWidth, {
          font: FONT_TEXT,
          weight: "500",
          size: TAG_FONT_PX,
          res: 3,
          oy: 1,
          stroke: PAPER_CSS,
          strokeW: 3.5,
        }),
      );
    }
    this.slamText = this.text(this.world, 0, 0, ctx.script.cards.slam!.text, { font: FONT_MARKER, size: 24, res: 3, rot: -0.12 });
    this.cricket = this.text(this.world, 0, 0, "cri… cri…", { font: FONT_MARKER, size: 10, res: 3, rot: -0.06 });
  }

  draw(u: number, life: number): void {
    setHatch(6, 1.1);
    const slam = shake(u, C.slam, 0.5) * 8;
    const land = shake(u, C.topple[1] - 0.25, 0.3) * 3 + shake(u, C.tug, 0.3) * 3;
    // Wide while they burst in, then closer: as close as the line-up and its labels allow.
    const push = easeInOut(seg(u, C.push[0], C.push[1]));
    const zoom = lerp(WIDE_ZOOM, this.closeZoom, push) + 0.05 * seg(u, 0, 11);
    this.setCam(
      lerp(300, this.groupX, push) + noise(life * 0.4, 31) * 0.8,
      FLOOR - (FLOOR_SCREEN_Y - SCREEN_H / 2) / zoom + noise(life * 0.36, 32) * 0.6,
      zoom,
      slam + land * 0.3,
      slam * 0.4 + land,
    );
    this.drawRoom(u);
    const g = this.front;
    g.clear();
    this.drawFriends(u, life, g);
    this.drawRuben(u, life, g);
    this.drawRope(u, life);
    this.drawTags(u);

    // The dark: it gives way when the door opens.
    const d = this.dark;
    d.clear();
    const open = easeOut(seg(u, C.slam, C.slam + 1.3));
    if (open < 1) {
      darkness(d, this.camX, this.camY, this.zoom, SCREEN_W, SCREEN_H, lerp(this.rubenX, 420, open), lerp(276, 250, open), lerp(58, 760, open * open));
    }
  }

  private drawRoom(u: number): void {
    const g = this.room;
    g.clear();
    g.fillStyle(WHITE, 1);
    g.fillRect(-300, FLOOR, 1300, 260);
    hatch(g, -300, FLOOR, 1300, 260);
    const opened = u >= C.slam;
    if (opened) {
      // Light from the corridor on the floor.
      const k = easeOut(seg(u, C.slam, C.slam + 0.3));
      fillPoly(g, [DOOR.x, FLOOR, DOOR.x + DOOR.w, FLOOR, DOOR.x + DOOR.w - 40, FLOOR + 70 * k, DOOR.x - 190 * k, FLOOR + 70 * k], WHITE);
    }
    stroke(g, -300, FLOOR, 1000, FLOOR);
    // The door: frame, then the leaf, shut or flung open.
    panel(g, DOOR.x - 5, DOOR.y - 5, DOOR.w + 10, DOOR.h + 5, { r: 3, shadow: 0.7 });
    if (!opened) {
      panel(g, DOOR.x, DOOR.y, DOOR.w, DOOR.h, { r: 1, hatch: true, outline: 2 });
      g.fillStyle(INK, 1);
      g.fillCircle(DOOR.x + 9, DOOR.y + 44, 3);
    } else {
      g.fillStyle(WHITE, 1);
      g.fillRect(DOOR.x, DOOR.y, DOOR.w, DOOR.h);
      stroke(g, DOOR.x, DOOR.y, DOOR.x, FLOOR, 2);
      stroke(g, DOOR.x + DOOR.w, DOOR.y, DOOR.x + DOOR.w, FLOOR, 2);
      stroke(g, DOOR.x, DOOR.y, DOOR.x + DOOR.w, DOOR.y, 2);
      const swing = elasticOut(seg(u, C.slam, C.slam + 0.5));
      panel(g, DOOR.x + DOOR.w + 5, DOOR.y, 9 + (1 - swing) * 12, DOOR.h, { r: 2, hatch: true, outline: 2, shadow: 0.5 });
      // Rays of light through the doorway, for a moment.
      const flash = bump(u, C.slam, 1.1);
      if (flash > 0) rays(g, DOOR.x + DOOR.w / 2, DOOR.y + DOOR.h / 2, 60, 90 + (1 - flash) * 30, 9, Math.PI * 0.62, 2.5, INK, flash, Math.PI * 0.8);
    }
    // What the last shot left behind him: the table, the laptop, the key, the note on the wall.
    const tx = this.rubenX - 96;
    panel(g, tx, 262, 62, 6, { r: 2, outline: 2, shadow: 0.5 });
    stroke(g, tx + 8, 268, tx + 8, FLOOR, 3);
    stroke(g, tx + 54, 268, tx + 54, FLOOR, 3);
    panel(g, tx + 11, 225, 40, 30, { r: 3, outline: 2, shadow: 0.5 });
    panel(g, tx + 6, 257, 50, 5, { r: 2, outline: 2 });
    if (this.n > 0) usbKey(g, tx + 62, 259, 0.55, 0, false);
    g.save();
    g.translateCanvas(tx + 30, 176);
    g.rotateCanvas(-0.05);
    panel(g, -34, -22, 68, 44, { r: 2, shadow: 0.6, outline: 2 });
    g.lineStyle(2, INK, 1);
    g.lineBetween(-20, -8, 18, -8);
    g.lineBetween(-22, 6, 22, 6);
    g.lineStyle(2.4, ORANGE, 1);
    g.strokeEllipse(0, 6, 56, 18);
    g.restore();
    // A shelf, to make it a room.
    panel(g, 330, 168, 96, 6, { r: 2, outline: 2, shadow: 0.5 });
    panel(g, 344, 144, 20, 24, { r: 3, outline: 2, hatch: true });
    panel(g, 372, 150, 34, 18, { r: 2, outline: 2 });
  }

  private drawFriends(u: number, life: number, g: G): void {
    const n = this.n;
    const hit = bump(u, C.slam, 0.9);
    this.slamText.setVisible(hit > 0);
    if (hit > 0) {
      const k = backOut(seg(u, C.slam, C.slam + 0.16));
      burst(g, DOOR.x + 18, DOOR.y - 18, 44 * k, 26 * k, 11, 0.3, WHITE, 2.5, clamp01(hit * 2.5));
      this.slamText
        .setPosition(DOOR.x + 18, DOOR.y - 19)
        .setScale(0.5 + 0.5 * k)
        .setAlpha(clamp01(hit * 2.5));
    }
    this.cricket.setVisible(false);
    if (n === 0) {
      // Nobody. A draught, a ball of dust, a cricket.
      const roll = seg(u, C.slam + 0.3, C.slam + 3.4);
      if (roll > 0 && roll < 1) {
        const x = lerp(DOOR.x + 10, 150, roll);
        const y = FLOOR - 8 - Math.abs(Math.sin(roll * 14)) * 7;
        g.lineStyle(1.6, INK, 1 - roll * 0.5);
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.arc(x, y, 3 + i * 2.4, roll * 22 + i * 2, roll * 22 + i * 2 + 4.6);
          g.strokePath();
        }
        g.lineStyle(1.6, INK, 0.6);
        for (let i = 0; i < 3; i++) g.lineBetween(x + 12 + i * 9, y - 4 + i * 4, x + 26 + i * 9, y - 4 + i * 4);
      }
      const chirp = bump(u, C.slam + 0.7, 1.7);
      if (chirp > 0) this.cricket.setVisible(true).setPosition(DOOR.x - 6, DOOR.y + 36 + Math.sin(u * 20) * 0.8).setAlpha(clamp01(chirp * 2));
      return;
    }

    const slide = easeOut(seg(u, C.tower[0], C.tower[1]));
    const stop = bump(u, C.tower[1], 0.3);
    const cheer = C.cheer;
    for (let i = 0; i < n; i++) {
      const a = this.friends[i]!;
      if (u < C.tower[0]) {
        a.hide();
        this.bodyX[i] = 700;
        this.bodyY[i] = FLOOR;
        this.bodyTop[i] = FLOOR - 36;
        continue;
      }
      // In the tower: i = 0 carries everyone. The higher, the more it sways.
      const sway = Math.sin(u * 10 + i * 0.4) * i * 1.4 * (1 - slide * 0.5) + stop * i * -5;
      const towerX = lerp(660, TOWER_X, slide) + sway;
      const towerY = FLOOR - i * STACK * (1 - stop * 0.08);
      // Then each one is thrown to its place: the top one flies the furthest.
      const t0 = C.topple[0] + (n - 1 - i) * 0.07;
      const t1 = t0 + 0.42 + i * 0.16;
      const p = seg(u, t0, t1);
      const e = easeInOut(p);
      const target = this.slotX[i]!;
      let x = lerp(towerX, target, e);
      let y = lerp(towerY, FLOOR, p * p) - arc(p) * (10 + i * 12);
      let sx = 1 + stop * 0.14 * (i === 0 ? 1 : 0.4);
      let sy = 1 - stop * 0.16 * (i === 0 ? 1 : 0.4) - (i === 0 && p <= 0 ? 0.03 * (n - 1) : 0);
      let rot = i > 0 ? -e * Math.PI * 2 : 0;
      if (p >= 1) {
        const k = bump(u, t1, 0.28);
        sx = 1 + k * 0.26;
        sy = 1 - k * 0.26;
        rot = 0;
        // The wave of hops at the end, and a little jolt when the rope is pulled tight.
        const wave = bump(u, cheer + (n - 1 - i) * 0.12, 0.42);
        const again = bump(u, cheer + 0.62 + (n - 1 - i) * 0.12, 0.4);
        const tug = bump(u, C.tug, 0.3);
        y = FLOOR - (wave + again * 0.7) * 16;
        sy += (wave + again) * 0.08 - tug * 0.06 + Math.sin(life * 2.7 + i) * 0.012;
        x = target - tug * 2.5;
        // The one who speaks leans in.
        if (this.speaks(i, u)) sy += Math.abs(Math.sin(u * 9)) * 0.035;
      }
      const pose = this.pose;
      pose.x = x;
      pose.y = y;
      pose.facing = -1;
      pose.sx = sx;
      pose.sy = sy;
      pose.rot = rot;
      pose.lean = p > 0 && p < 1 ? 3 : 1.5;
      pose.lookX = 0.8;
      pose.lookY = p >= 1 ? -0.1 : 0.3;
      a.draw(pose, life);
      this.bodyX[i] = x;
      this.bodyY[i] = y;
      this.bodyTop[i] = y - 36 * sy;
      if (p >= 1) {
        const k = bump(u, t1, 0.3);
        if (k > 0) {
          g.lineStyle(1.8, INK, k);
          g.lineBetween(x - 20, FLOOR - 2, x - 30 - (1 - k) * 6, FLOOR - 6);
          g.lineBetween(x + 20, FLOOR - 2, x + 30 + (1 - k) * 6, FLOOR - 6);
        }
      }
    }
  }

  private speaks(i: number, u: number): boolean {
    for (const line of this.script.lines) {
      if (line.shot === "rescue" && line.speaker === `friend${i}` && u >= line.u0 && u < line.u1) return true;
    }
    return false;
  }

  private drawRuben(u: number, life: number, g: G): void {
    const n = this.n;
    const opened = u >= C.slam;
    const jump = bump(u, C.slam, 0.45);
    const tug = bump(u, C.tug, 0.35);
    const wave = bump(u, C.cheer + n * 0.12, 0.42) + bump(u, C.cheer + 0.62 + n * 0.12, 0.4) * 0.7;
    const moved = u >= C.cheer - 0.6;
    const hope = easeOut(seg(u, C.slam + 0.2, C.slam + 1));
    // Alone, he sags again when nobody comes in, then squares up.
    const lonely = n === 0 ? bump(u, C.slam + 1, 1.7) : 0;
    const sy = lerp(0.82, 1, hope) + jump * 0.2 - tug * 0.1 + wave * 0.1 - lonely * 0.12 + Math.sin(life * 2.6) * 0.012;
    const x = this.rubenX + tug * 7;
    const y = FLOOR - jump * 12 - wave * 18;
    this.ruben.draw(
      {
        x,
        y,
        facing: opened ? 1 : -1,
        sx: lerp(1.12, 1, hope) - jump * 0.08 + tug * 0.08,
        sy,
        lean: tug * 6,
        lookX: opened ? 0.9 : 0.3,
        lookY: opened ? (u < C.topple[1] && n > 1 ? -0.7 : -0.15) : 0.8,
        ...(opened ? {} : { blink: true }),
      },
      life,
    );
    this.rubenTop = y - 36 * sy;
    this.rubenNowX = x;
    this.rubenNowY = y;
    if (jump > 0) rays(g, x + 4, this.rubenTop + 14, 24, 32, 7, -Math.PI * 0.1, 2, INK, jump, Math.PI * 1.1);
    // Moved: shiny eyes, one tear he will deny.
    if (moved && n > 0) {
      const k = seg(u, C.cheer - 0.6, C.cheer - 0.2);
      sparkle(g, x - 20, this.rubenTop + 2, 5 * k * (0.7 + 0.3 * Math.sin(life * 6)));
      sparkle(g, x + 26, this.rubenTop - 8, 4 * k * (0.7 + 0.3 * Math.cos(life * 5)));
      const p = (u * 0.9) % 1;
      drop(g, x + 15, this.rubenTop + 18 + p * 12, 2, WHITE, 1 - p);
    }
    // Alone: the key, on the floor, where a friend would have stood.
    if (n === 0) {
      const hopK = bump(u, C.cheer + 0.14, 0.42) + bump(u, C.cheer + 0.76, 0.4) * 0.7;
      const kx = this.rubenX + GANG_SPACING - tug * 10;
      const ky = FLOOR - 7 - hopK * 14 - tug * 4;
      usbKey(g, kx, ky, 1.15, -0.08 + tug * 0.3 + hopK * 0.3);
      this.bodyX[0] = kx - 12;
      this.bodyY[0] = ky + 7 - WAIST;
    }
  }

  // --- The rope -----------------------------------------------------------------------------

  private drawRope(u: number, life: number): void {
    const g = this.ropeG;
    g.clear();
    if (u < C.rope[0]) return;
    const n = this.n;
    // The chain: first seat, ..., last seat, Ruben. Alone: the key, then Ruben.
    const links = Math.max(1, n);
    const progress = seg(u, C.rope[0], C.rope[1]) * links;
    const tight = bump(u, C.tug, 0.3);
    for (let j = 0; j < links; j++) {
      const k = clamp01(progress - j);
      if (k <= 0) break;
      const ax = n === 0 ? this.rubenNowX : this.bodyX[j]!;
      const ay = n === 0 ? this.rubenNowY - WAIST : this.bodyY[j]! - WAIST;
      const last = j === links - 1;
      const bx = n === 0 ? this.bodyX[0]! : last ? this.rubenNowX : this.bodyX[j + 1]!;
      const by = n === 0 ? this.bodyY[0]! + WAIST - 6 : last ? this.rubenNowY - WAIST : this.bodyY[j + 1]! - WAIST;
      // The end is thrown: it whips on its way, then the link hangs slack.
      const flying = k < 1;
      const whip = flying ? Math.sin(k * Math.PI * 3) * 8 * (1 - k) : 0;
      const sag = flying ? lerp(-16, ROPE_SAG, k) + whip : ROPE_SAG - tight * 8 + Math.sin(life * 2.2 + j) * 0.8;
      rope(g, ax, ay, bx, by, sag, 2.6, INK, easeOut(k));
      if (!flying) {
        g.fillStyle(INK, 1);
        g.fillCircle(ax, ay, 2.6);
        g.fillCircle(bx, by, 2.6);
      }
    }
  }

  private drawTags(u: number): void {
    // The labels rise together with whoever hops highest: they never bump into each other.
    let lift = 0;
    for (let i = 0; i < this.n; i++) {
      if (u >= this.landAt(i)) lift = Math.max(lift, STAND_TOP - this.bodyTop[i]!);
    }
    this.tagLift = lift;
    for (let i = 0; i < this.n; i++) {
      const t = this.tags[i]!;
      const k = pop(u, this.landAt(i) + 0.1, 0.25);
      t.setVisible(k > 0);
      if (k <= 0) continue;
      t.setPosition(this.bodyX[i]!, STAND_TOP - lift + TAG_BASE - this.lay.tagRow[i]! * TAG_ROW_STEP).setScale(k);
    }
  }

  /** When friend i lands on its place in the line. */
  private landAt(i: number): number {
    return C.topple[0] + (this.n - 1 - i) * 0.07 + 0.42 + i * 0.16;
  }

  override anchor(who: Speaker, out: Point): boolean {
    // With friends around, every bubble floats above the two rows of name labels.
    const labels = STAND_TOP - this.tagLift - 3 - 2 * TAG_ROW_STEP;
    if (who === "ruben") {
      this.toScreen(this.rubenNowX + 2, this.n === 0 ? this.rubenTop - 5 : Math.min(labels, this.rubenTop - 5), out);
      return true;
    }
    const i = Number(who.slice(6));
    if (!(who.startsWith("friend") && i < this.n)) return false;
    this.toScreen(this.bodyX[i]! - 2, labels, out);
    return true;
  }
}
