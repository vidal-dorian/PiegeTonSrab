/**
 * Drawing of the co-op level things, in the sketchbook style of the race mode: paper, felt-pen
 * outlines, flat offset shadows; red kills, orange helps, black and white is neutral. Every thing
 * reads without colour: counters on plates and pans, the same symbol at both ends of a wire, a
 * crossed symbol on inverted gates, letters and textures on the A/B shelves, cracks, "TUE" pits.
 *
 * What never moves is drawn once into atlas sprites (atlas.ts); moving things are images placed
 * every frame from the blended frame (propFrame.ts); lines that turn or stretch (planks, ropes,
 * cords, gate bars) go into three Graphics redrawn each frame. Counters are Phaser texts, changed
 * only when their text does. Nothing here touches the world: it only reads it.
 */
import Phaser from "phaser";
import type { Level } from "@game/shared";
import { COOP_DT, PROPS, resolveWeight, type CoopEvent, type CoopLevel, type CoopThing, type CoopWorld } from "@game/shared/coop";
import { CELL_PX } from "../../config";
import { FONT_TITLE, INK, INK_CSS, ORANGE, OUTLINE, RED, SHADOW_X, SHADOW_Y, WHITE } from "../../render/levelView";
import { Atlas } from "./atlas";
import {
  badge,
  CARD_CSS,
  dots,
  hatch,
  LINE_CSS,
  measure,
  monoFont,
  ORANGE_CSS,
  panel,
  RED_CSS,
  rr,
  symbolPath,
  text,
  titleFont,
  WHITE_CSS,
  wrap,
} from "./paper";
import type { PropFrame } from "./propFrame";
import {
  alongPath,
  balanceRig,
  cellGroups,
  crateStopCells,
  doorPebbles,
  groundBelow,
  levelWires,
  linkMarks,
  PAN_BRIDLE,
  plateLabel,
  seesawPose,
  variantWallCells,
  wireCurve,
  type BalanceRig,
  type LinkMark,
  type Point,
  type Wire,
} from "./thingLayout";

const C = CELL_PX;

/** Depths: under the stains and the players, the things, then what must cover them. */
const DEPTH = {
  under: 0.6,
  back: 1.9,
  props: 2,
  cap: 2.05,
  door: 2.2,
  front: 2.45,
  lintel: 2.5,
  label: 2.6,
  keyHome: 2.62,
  over: 2.7,
  keyCarried: 5,
  deadline: 5.5,
} as const;

/** Height of one tile of the deadline's front edge, pixels. */
const DEADLINE_TILE = 6 * C;
const DEADLINE_EDGE = 46;
/** A terminal's screen lights up this long after it is used, ms. */
const TERMINAL_FLASH_MS = 700;
/** A switch block jumps this long when it is hit, ms. */
const BUMP_MS = 160;
/** Height of the striped band drawn on top of a non-slip floor, pixels. */
const GRIP_BAND = 9;

/** Terrain as drawn by the level view: glass and team-size walls are drawn by the things instead. */
export function drawableTerrain(level: CoopLevel): Level {
  const walls = variantWallCells(level);
  return { ...level.terrain, solid: level.terrain.solid.map((s, i) => s && !level.glass.has(i) && !walls.has(i)) };
}

interface Label {
  text: Phaser.GameObjects.Text;
  shown: string;
}

export class ThingViews {
  private atlas: Atlas;
  private back: Phaser.GameObjects.Graphics;
  private front: Phaser.GameObjects.Graphics;
  private top: Phaser.GameObjects.Graphics;
  private objects: Phaser.GameObjects.GameObject[] = [];
  private marks: Map<string, LinkMark>;
  private wires: Array<{ wire: Wire; pts: Point[] }> = [];
  private plates: Array<{ cap: Phaser.GameObjects.Image; label: Label; w: number }> = [];
  private gates: Array<{ ghost: Phaser.GameObjects.Image; hint: Phaser.GameObjects.Image }> = [];
  private crates: Phaser.GameObjects.Image[] = [];
  private seesaws: Array<{ left: Phaser.GameObjects.Image; right: Phaser.GameObjects.Image }> = [];
  private balances: Array<{ left: Phaser.GameObjects.Image; right: Phaser.GameObjects.Image; loadL: Label; loadR: Label; rig: BalanceRig }> = [];
  private movers: Array<{ img: Phaser.GameObjects.Image; label: Label | null }> = [];
  private switches: Array<{ img: Phaser.GameObjects.Image; bumpAt: number }> = [];
  private shelves: Phaser.GameObjects.Image[] = [];
  private terminals: Array<{ flash: Phaser.GameObjects.Image; flashUntil: number; ring: Point }> = [];
  /** Built with the sprites, used when the images are made. */
  private rigs: BalanceRig[] = [];
  private rings: Point[] = [];
  private fragiles: Array<{ img: Phaser.GameObjects.Image; name: string }> = [];
  private key: Phaser.GameObjects.Image | null = null;
  private door: { img: Phaser.GameObjects.Image; count: Label } | null = null;
  private deadline: Phaser.GameObjects.Image[] = [];

  constructor(
    private scene: Phaser.Scene,
    private level: CoopLevel,
  ) {
    this.atlas = new Atlas(scene);
    this.marks = linkMarks(level.things);
    this.back = this.track(scene.add.graphics().setDepth(DEPTH.back));
    this.front = this.track(scene.add.graphics().setDepth(DEPTH.front));
    this.top = this.track(scene.add.graphics().setDepth(DEPTH.deadline));
    this.defineSprites();
    this.atlas.build();
    this.createImages();
  }

  private track<T extends Phaser.GameObjects.GameObject>(o: T): T {
    this.objects.push(o);
    return o;
  }

  private img(name: string, x: number, y: number, depth: number): Phaser.GameObjects.Image {
    return this.track(this.atlas.image(name, x, y, depth));
  }

  private label(x: number, y: number, size: number, chip: boolean): Label {
    const t = this.scene.add
      .text(x, y, "", {
        fontFamily: FONT_TITLE,
        fontSize: `${size}px`,
        fontStyle: "700",
        color: INK_CSS,
        ...(chip ? { backgroundColor: WHITE_CSS, padding: { x: 4, y: 1 } } : {}),
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DEPTH.label);
    this.track(t);
    return { text: t, shown: "" };
  }

  private setLabel(l: Label, s: string): void {
    if (l.shown === s) return;
    l.shown = s;
    l.text.setText(s);
  }

  // --- Sprites ---------------------------------------------------------------------------------

  private defineSprites(): void {
    const level = this.level;
    const a = this.atlas;
    const thingsOf = <K extends CoopThing["def"]["kind"]>(kind: K) => level.things.filter((t) => t.def.kind === kind);

    // Wires and their badges (static, world pixels).
    const inverted = new Set(thingsOf("gate").filter((t) => t.def.kind === "gate" && t.def.inverted).map((t) => t.index));
    const badges = new Map<string, { p: Point; mark: LinkMark; crossed: boolean }>();
    levelWires(level).forEach((wire, i) => {
      const mark = this.marks.get(wire.link)!;
      const pts = wireCurve(wire.from, wire.to).map((p) => ({ x: p.x * C, y: p.y * C }));
      this.wires.push({ wire, pts });
      const box = bounds(pts, 4);
      a.add(`wire-${i}`, box.x, box.y, box.w, box.h, (ctx) => {
        ctx.fillStyle = INK_CSS;
        ctx.globalAlpha = 0.5;
        for (const d of alongPath(pts, 8, 4)) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      badges.set(`${wire.from.x},${wire.from.y}`, { p: wire.from, mark, crossed: false });
      badges.set(`${wire.to.x},${wire.to.y}`, { p: wire.to, mark, crossed: inverted.has(wire.target) });
    });
    [...badges.values()].forEach((b, i) => {
      a.add(`badge-${i}`, b.p.x * C - 11, b.p.y * C - 11, 24, 25, (ctx) => badge(ctx, b.p.x * C, b.p.y * C, b.mark, b.crossed, 7.5));
    });

    // Plates: a housing in the floor, a cap on top (white, orange when pressed).
    for (const t of thingsOf("plate")) {
      const X = t.x * C;
      const Y = t.y * C;
      const W = t.w * C;
      a.add(`plate-${t.index}`, X - 2, Y - 2, W + 4, C + 4, (ctx) => {
        ctx.fillStyle = "#efebe1";
        ctx.fillRect(X, Y, W, C);
        ctx.strokeStyle = LINE_CSS;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = X + 5; x < X + W - 2; x += 6) {
          ctx.moveTo(x, Y + 12);
          ctx.lineTo(x, Y + C - 2);
        }
        ctx.stroke();
        rr(ctx, X + 3, Y + 1, W - 6, 9, 3);
        ctx.fillStyle = INK_CSS;
        ctx.fill();
        const cw = Math.min(W - 4, 40);
        panel(ctx, X + W / 2 - cw / 2, Y + 11, cw, 15, 7, { shadow: false, line: 1.5 });
        ctx.strokeStyle = INK_CSS;
        ctx.lineWidth = OUTLINE;
        ctx.strokeRect(X + 1.2, Y + 0.5, W - 2.4, C - 1.7);
      });
      for (const on of [false, true]) {
        a.add(`cap-${t.w}-${on ? "on" : "off"}`, 0, -9, W, 14, (ctx) =>
          panel(ctx, 4, -6, W - 8, 9, 3.5, { fill: on ? ORANGE_CSS : WHITE_CSS, shadow: false, line: 2 }),
        );
      }
    }

    // Gates: a lintel the bars slide into, a dashed outline when open, an hourglass when blocked.
    for (const t of thingsOf("gate")) {
      const X = t.x * C;
      const Y = t.y * C;
      const W = t.w * C;
      const H = t.h * C;
      const vertical = t.h >= t.w;
      a.add(`lintel-${t.index}`, X - 6, Y - 6, W + 16, H + 16, (ctx) => {
        if (vertical) panel(ctx, X - 3, Y - 2, W + 6, 10, 3, { line: 2.5 });
        else panel(ctx, X - 2, Y - 3, 10, H + 6, 3, { line: 2.5 });
      });
      a.add(`ghost-${t.index}`, X, Y, W, H, (ctx) => {
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = INK_CSS;
        ctx.globalAlpha = 0.45;
        if (vertical) ctx.strokeRect(X + 3, Y + 9, W - 6, H - 10);
        else ctx.strokeRect(X + 9, Y + 3, W - 10, H - 6);
      });
      const hx = vertical ? X + W / 2 : X - 14;
      const hy = vertical ? Y - 16 : Y + H / 2;
      a.add(`hint-${t.index}`, hx - 12, hy - 12, 28, 28, (ctx) => {
        panel(ctx, hx - 10, hy - 10, 20, 20, 6, { line: 2 });
        ctx.beginPath();
        ctx.moveTo(hx - 5, hy - 6);
        ctx.lineTo(hx + 5, hy - 6);
        ctx.lineTo(hx - 5, hy + 6);
        ctx.lineTo(hx + 5, hy + 6);
        ctx.closePath();
        ctx.fillStyle = INK_CSS;
        ctx.fill();
      });
    }

    // Crates: a cardboard box, a PC tower, a server rack, or a plain box, with their number.
    for (const t of thingsOf("crate")) {
      const need = this.crateNeed(t);
      a.add(`crate-${t.index}`, -2, -2, t.w * C + 8, t.h * C + 10, (ctx) => drawCrate(ctx, t, need));
    }

    // Seesaws: pads, the cap on the fulcrum, the fulcrum down to the ground.
    for (const t of thingsOf("seesaw")) {
      const half = (t.w - 1) / 2;
      const k = PROPS.plankThickness * C;
      a.add(`pad-${half}`, -2, -2, half * C + 8, k + 10, (ctx) => {
        panel(ctx, 0, 0, half * C, k, 3, { line: 2.5 });
        ctx.strokeStyle = INK_CSS;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 8; x < half * C - 4; x += 10) {
          ctx.moveTo(x, 3);
          ctx.lineTo(x, k - 3);
        }
        ctx.stroke();
      });
      const px = (t.x + half + 0.5) * C;
      const top = t.y * C;
      const ground = groundBelow(this.level.terrain, t.x + half, t.y + PROPS.plankThickness, 6);
      const bottom = ground !== null ? ground * C : top + 1.6 * C;
      a.add(`fulcrum-${t.index}`, px - C, top - 4, 2 * C + 8, bottom - top + 12, (ctx) => {
        const apex = top + k;
        if (bottom - apex > 6) {
          const half2 = Math.min(0.8 * C, (bottom - apex) * 0.7);
          ctx.beginPath();
          ctx.moveTo(px + SHADOW_X, apex + SHADOW_Y);
          ctx.lineTo(px + half2 + SHADOW_X, bottom);
          ctx.lineTo(px - half2 + SHADOW_X, bottom);
          ctx.closePath();
          ctx.fillStyle = INK_CSS;
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(px, apex);
          ctx.lineTo(px + half2, bottom);
          ctx.lineTo(px - half2, bottom);
          ctx.closePath();
          ctx.fillStyle = WHITE_CSS;
          ctx.fill();
          ctx.save();
          ctx.clip();
          hatch(ctx, px - half2, apex, 2 * half2, bottom - apex, 7, LINE_CSS, 2);
          ctx.restore();
          ctx.lineWidth = OUTLINE;
          ctx.strokeStyle = INK_CSS;
          ctx.stroke();
        }
        panel(ctx, px - C / 2, top, C, k, 3, { line: 2.5 });
        ctx.beginPath();
        ctx.arc(px, top + k / 2, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = INK_CSS;
        ctx.fill();
      });
    }

    // Balances: the beam with two wheels hung from the ceiling, and the pans.
    for (const b of this.balancePairs()) {
      const travel = b.left.def.kind === "pan" ? (b.left.def.travel ?? PROPS.panTravel) : PROPS.panTravel;
      const rig = balanceRig(this.level.terrain, b.left, b.right, travel);
      const lx = rig.leftX * C;
      const rx = rig.rightX * C;
      const by = rig.beamY * C;
      const hx = rig.hangX * C;
      const ht = rig.hangTop * C;
      a.add(`beam-${b.left.index}`, lx - 22, ht - 4, rx - lx + 48, by - ht + 34, (ctx) => {
        ctx.strokeStyle = INK_CSS;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(hx, ht + 3);
        ctx.lineTo(hx, by);
        ctx.stroke();
        panel(ctx, hx - 10, ht, 20, 6, 2, { shadow: false, line: 2 });
        panel(ctx, lx - 14, by - 4, rx - lx + 28, 9, 4, { line: 2.5 });
        for (const x of [lx, rx]) {
          ctx.beginPath();
          ctx.arc(x + 2, by + 7, 10, 0, Math.PI * 2);
          ctx.fillStyle = INK_CSS;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, by + 5, 10, 0, Math.PI * 2);
          ctx.fillStyle = WHITE_CSS;
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = INK_CSS;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, by + 5, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = INK_CSS;
          ctx.fill();
        }
        // The rope over both wheels.
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(lx, by - 5);
        ctx.lineTo(rx, by - 5);
        ctx.stroke();
      });
      for (const pan of [b.left, b.right]) {
        a.add(`pan-${pan.w}`, -4, -6, pan.w * C + 12, 22, (ctx) => {
          panel(ctx, 0, 0, pan.w * C, PROPS.plankThickness * C, 3, { line: 2.5 });
          for (const x of [5, pan.w * C - 5]) {
            ctx.beginPath();
            ctx.arc(x, 0, 3, 0, Math.PI * 2);
            ctx.fillStyle = INK_CSS;
            ctx.fill();
          }
        });
      }
      this.rigs.push(rig);
    }

    // Platforms: a board (one-way: dashed underside), its rail, lamps on their cord.
    for (const t of thingsOf("mover")) {
      if (t.def.kind !== "mover") continue;
      const W = t.w * C;
      const k = PROPS.moverThickness * C;
      const d = t.def;
      if (d.arc) {
        const px = (d.arc.px + 0.5) * C;
        const py = (d.arc.py + 0.5) * C;
        a.add(`hook-${t.index}`, px - 12, py - 12, 26, 22, (ctx) => {
          panel(ctx, px - 9, py - 9, 18, 5, 2, { shadow: false, line: 2 });
          ctx.beginPath();
          ctx.arc(px, py, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = WHITE_CSS;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = INK_CSS;
          ctx.stroke();
        });
        a.add(`shade-${t.w}`, -10, -4, W + 24, k + 22, (ctx) => {
          const shade = (dx: number, dy: number) => {
            ctx.beginPath();
            ctx.moveTo(dx, dy);
            ctx.lineTo(W + dx, dy);
            ctx.lineTo(W + 6 + dx, k + dy);
            ctx.lineTo(-6 + dx, k + dy);
            ctx.closePath();
          };
          shade(SHADOW_X, SHADOW_Y);
          ctx.fillStyle = INK_CSS;
          ctx.fill();
          shade(0, 0);
          ctx.fillStyle = WHITE_CSS;
          ctx.fill();
          ctx.lineWidth = OUTLINE;
          ctx.strokeStyle = INK_CSS;
          ctx.stroke();
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-2, k * 0.55);
          ctx.lineTo(W + 2, k * 0.55);
          ctx.stroke();
          for (const x of [W * 0.3, W * 0.7]) {
            ctx.beginPath();
            ctx.arc(x, k + 3.5, 4, 0, Math.PI);
            ctx.fillStyle = ORANGE_CSS;
            ctx.fill();
            ctx.lineWidth = 1.8;
            ctx.stroke();
          }
        });
        continue;
      }
      const dx = (d.dx ?? 0) * C;
      const dy = (d.dy ?? 0) * C;
      if (dx !== 0 || dy !== 0) {
        const x0 = (t.x + t.w / 2) * C;
        const y0 = (t.y + PROPS.moverThickness / 2) * C;
        a.add(`rail-${t.index}`, Math.min(x0, x0 + dx) - 6, Math.min(y0, y0 + dy) - 6, Math.abs(dx) + 12, Math.abs(dy) + 12, (ctx) => {
          ctx.fillStyle = INK_CSS;
          ctx.globalAlpha = 0.4;
          for (const p of alongPath([{ x: x0, y: y0 }, { x: x0 + dx, y: y0 + dy }], 9)) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 2;
          ctx.strokeStyle = INK_CSS;
          for (const [x, y] of [
            [x0, y0],
            [x0 + dx, y0 + dy],
          ] as const) {
            ctx.beginPath();
            ctx.arc(x, y, 3.5, 0, Math.PI * 2);
            ctx.stroke();
          }
        });
      }
      const mark = d.link !== undefined ? this.marks.get(d.link) : undefined;
      a.add(`board-${t.index}`, -2, -2, W + 8, k + 10, (ctx) => {
        rr(ctx, SHADOW_X, SHADOW_Y, W, k, 4);
        ctx.fillStyle = INK_CSS;
        ctx.fill();
        rr(ctx, 0, 0, W, k, 4);
        ctx.fillStyle = WHITE_CSS;
        ctx.fill();
        hatch(ctx, 2, 2, W - 4, k - 4, 8, LINE_CSS, 2);
        ctx.lineWidth = OUTLINE;
        ctx.strokeStyle = INK_CSS;
        ctx.beginPath();
        ctx.moveTo(1, k - 1);
        ctx.lineTo(1, 2);
        ctx.quadraticCurveTo(1, 1, 3, 1);
        ctx.lineTo(W - 3, 1);
        ctx.quadraticCurveTo(W - 1, 1, W - 1, 3);
        ctx.lineTo(W - 1, k - 1);
        ctx.stroke();
        // One-way: the underside is dashed, you jump through it.
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(2, k - 1);
        ctx.lineTo(W - 2, k - 1);
        ctx.stroke();
        ctx.setLineDash([]);
        for (const x of [6, W - 6]) {
          ctx.beginPath();
          ctx.arc(x, k / 2, 2, 0, Math.PI * 2);
          ctx.fillStyle = INK_CSS;
          ctx.fill();
        }
        if (mark) badge(ctx, W / 2, k / 2, mark, false, 7);
      });
    }

    // Switch blocks: "A ⇄ B", the active letter filled.
    for (const t of thingsOf("switch")) {
      for (const active of ["A", "B"] as const) a.add(`switch-${t.w}x${t.h}-${active}`, -2, -2, t.w * C + 8, t.h * C + 10, (ctx) => drawSwitch(ctx, t.w * C, t.h * C, active));
    }

    // Shelves: A hatched, B dotted, the letter drawn; a ghost when off, dashes while waiting.
    for (const g of ["A", "B"] as const) {
      for (const state of ["solid", "ghost", "wait"] as const) a.add(`shelf-${g}-${state}`, -2, -2, C + 8, C + 10, (ctx) => drawShelf(ctx, g, state));
    }

    // Terminals: a monitor showing the prompt, labelled Claude; its screen flashes when used.
    for (const t of thingsOf("terminal")) {
      if (t.def.kind !== "terminal") continue;
      const geo = terminalGeometry(t, t.def.prompt);
      const mark = this.marks.get(t.def.link);
      a.add(`terminal-${t.index}`, geo.x - 4, geo.y - 4, geo.w + 12, geo.floor - geo.y + 10, (ctx) => drawTerminal(ctx, geo, mark));
      a.add(`screen-${t.index}`, geo.sx, geo.sy, geo.sw, geo.sh, (ctx) => {
        ctx.globalAlpha = 0.55;
        rr(ctx, geo.sx, geo.sy, geo.sw, geo.sh, 3);
        ctx.fillStyle = ORANGE_CSS;
        ctx.fill();
      });
      this.rings.push({ x: geo.x + geo.w - 2, y: geo.y + 2 });
    }

    // Fragile floors: cracks; more of them when someone stands on it; crumbs once broken.
    for (const t of thingsOf("fragile")) {
      for (const state of ["intact", "stress", "broken"] as const) {
        a.add(`fragile-${t.w}x${t.h}-${state}`, -2, -2, t.w * C + 6, t.h * C + 8, (ctx) => drawFragile(ctx, t.w * C, t.h * C, state));
      }
    }

    // Spikes things: the race's red teeth, pointing their way.
    for (const t of thingsOf("spikes")) {
      if (t.def.kind !== "spikes") continue;
      const dir = t.def.dir;
      a.add(`spikes-${t.index}`, t.x * C - 4, t.y * C - 4, t.w * C + 12, t.h * C + 12, (ctx) => drawSpikes(ctx, t, dir));
    }

    // Deadly pits ("~"): a dark bottom, a red edge and "TUE".
    cellGroups(level.voids, level.width).forEach((g, i) => {
      a.add(`void-${i}`, g.x * C - 4, g.y * C - 22, g.w * C + 10, g.h * C + 28, (ctx) => drawVoid(ctx, g.cells, level.width, g));
    });
    // Glass ("%"): windows.
    cellGroups(level.glass, level.width).forEach((g, i) => {
      a.add(`glass-${i}`, g.x * C - 2, g.y * C - 2, g.w * C + 4, g.h * C + 4, (ctx) => drawGlass(ctx, g.cells, level.glass, level.width));
    });
    // Crate stops ("|"): a faint post.
    cellGroups(crateStopCells(level), level.width).forEach((g, i) => {
      a.add(`stop-${i}`, g.x * C, g.y * C, g.w * C, g.h * C, (ctx) => {
        ctx.globalAlpha = 0.38;
        ctx.strokeStyle = INK_CSS;
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 5]);
        for (let x = g.x; x < g.x + g.w; x++) {
          ctx.beginPath();
          ctx.moveTo((x + 0.5) * C, g.y * C + 3);
          ctx.lineTo((x + 0.5) * C, (g.y + g.h) * C - 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = INK_CSS;
        for (let x = g.x; x < g.x + g.w; x++) ctx.fillRect((x + 0.5) * C - 7, (g.y + g.h) * C - 4, 14, 4);
      });
    });
    // Walls that exist only for this team size: a dashed block.
    const walls = variantWallCells(level);
    cellGroups(walls, level.width).forEach((g, i) => {
      a.add(`wall-${i}`, g.x * C - 2, g.y * C - 2, g.w * C + 8, g.h * C + 10, (ctx) => drawVariantWall(ctx, g.cells, walls, level.width));
    });
    // Non-slip floors (an idle anchor does not slide on them): a striped band on their top.
    cellGroups(level.grip, level.width).forEach((g, i) => {
      a.add(`grip-${i}`, g.x * C - 2, g.y * C - 2, g.w * C + 4, GRIP_BAND + 4, (ctx) => drawGrip(ctx, g.cells, level.width));
    });

    // Ruben's USB key.
    if (level.key) a.add("key", -24, -10, 48, 24, drawKey);
    // The door.
    const door = level.door;
    if (door) {
      for (const open of [false, true]) a.add(`door-${open ? "open" : "closed"}`, -8, -8, door.w * C + 20, door.h * C + 14, (ctx) => drawDoor(ctx, door.w * C, door.h * C, open));
    }
    // The deadline's front edge.
    if (level.deadline) a.add("deadline", -DEADLINE_EDGE - 2, 0, DEADLINE_EDGE + 10, DEADLINE_TILE, drawDeadlineTile);
  }

  private balancePairs(): Array<{ left: CoopThing; right: CoopThing }> {
    // The same pairs as the world's balances (props.ts), in its order.
    const byId = new Map<string, CoopThing[]>();
    for (const t of this.level.things) {
      if (t.def.kind !== "pan") continue;
      const list = byId.get(t.def.balance) ?? [];
      list.push(t);
      byId.set(t.def.balance, list);
    }
    const out: Array<{ left: CoopThing; right: CoopThing }> = [];
    for (const list of byId.values()) {
      if (list.length !== 2) continue;
      list.sort((p, q) => p.x - q.x);
      out.push({ left: list[0]!, right: list[1]! });
    }
    return out;
  }

  private crateNeed(t: CoopThing): number {
    return t.def.kind === "crate" ? resolveWeight(t.def.need, this.level.players) : 0;
  }

  private createImages(): void {
    const level = this.level;
    const thingsOf = (kind: string) => level.things.filter((t) => t.def.kind === kind);
    this.wires.forEach((_, i) => this.img(`wire-${i}`, 0, 0, DEPTH.under));
    for (let i = 0; this.atlas.has(`badge-${i}`); i++) this.img(`badge-${i}`, 0, 0, DEPTH.under + 0.01);
    for (const t of thingsOf("plate")) {
      this.img(`plate-${t.index}`, 0, 0, DEPTH.under);
      const cap = this.img(`cap-${t.w}-off`, t.x * C, t.y * C, DEPTH.cap);
      this.plates.push({ cap, label: this.label((t.x + t.w / 2) * C, t.y * C + 18.5, 12, false), w: t.w });
    }
    for (const t of thingsOf("gate")) {
      this.img(`lintel-${t.index}`, 0, 0, DEPTH.lintel);
      this.gates.push({ ghost: this.img(`ghost-${t.index}`, 0, 0, DEPTH.props), hint: this.img(`hint-${t.index}`, 0, 0, DEPTH.label) });
    }
    for (const t of thingsOf("crate")) this.crates.push(this.img(`crate-${t.index}`, t.x * C, t.y * C, DEPTH.props));
    for (const t of thingsOf("seesaw")) {
      this.img(`fulcrum-${t.index}`, 0, 0, DEPTH.under);
      const half = (t.w - 1) / 2;
      this.seesaws.push({ left: this.img(`pad-${half}`, 0, 0, DEPTH.props), right: this.img(`pad-${half}`, 0, 0, DEPTH.props) });
    }
    this.balancePairs().forEach((pair, i) => {
      this.img(`beam-${pair.left.index}`, 0, 0, DEPTH.under);
      this.balances.push({
        left: this.img(`pan-${pair.left.w}`, 0, 0, DEPTH.props),
        right: this.img(`pan-${pair.right.w}`, 0, 0, DEPTH.props),
        loadL: this.label(0, 0, 12, true),
        loadR: this.label(0, 0, 12, true),
        rig: this.rigs[i]!,
      });
    });
    for (const t of thingsOf("mover")) {
      if (t.def.kind !== "mover") continue;
      if (t.def.arc) {
        this.img(`hook-${t.index}`, 0, 0, DEPTH.under);
        this.movers.push({ img: this.img(`shade-${t.w}`, 0, 0, DEPTH.props), label: null });
        continue;
      }
      if (this.atlas.has(`rail-${t.index}`)) this.img(`rail-${t.index}`, 0, 0, DEPTH.under);
      this.movers.push({ img: this.img(`board-${t.index}`, 0, 0, DEPTH.props), label: t.def.need !== undefined ? this.label(0, 0, 11, true) : null });
    }
    for (const t of thingsOf("switch")) this.switches.push({ img: this.img(`switch-${t.w}x${t.h}-A`, t.x * C, t.y * C, DEPTH.props), bumpAt: -Infinity });
    for (const s of this.shelfCells()) this.shelves.push(this.img(`shelf-${s.group}-ghost`, s.x * C, s.y * C, DEPTH.props));
    thingsOf("terminal").forEach((t, k) => {
      this.img(`terminal-${t.index}`, 0, 0, DEPTH.under);
      const flash = this.img(`screen-${t.index}`, 0, 0, DEPTH.under + 0.02).setVisible(false);
      this.terminals.push({ flash, flashUntil: 0, ring: this.rings[k]! });
    });
    for (const t of thingsOf("fragile")) {
      const name = `fragile-${t.w}x${t.h}-intact`;
      this.fragiles.push({ img: this.img(name, t.x * C, t.y * C, DEPTH.props), name });
    }
    for (const t of thingsOf("spikes")) this.img(`spikes-${t.index}`, 0, 0, DEPTH.over);
    for (let i = 0; this.atlas.has(`void-${i}`); i++) this.img(`void-${i}`, 0, 0, DEPTH.over);
    for (let i = 0; this.atlas.has(`glass-${i}`); i++) this.img(`glass-${i}`, 0, 0, DEPTH.over);
    for (let i = 0; this.atlas.has(`stop-${i}`); i++) this.img(`stop-${i}`, 0, 0, DEPTH.under);
    for (let i = 0; this.atlas.has(`wall-${i}`); i++) this.img(`wall-${i}`, 0, 0, DEPTH.under);
    for (let i = 0; this.atlas.has(`grip-${i}`); i++) this.img(`grip-${i}`, 0, 0, DEPTH.under);
    if (level.key) this.key = this.img("key", 0, 0, DEPTH.keyHome);
    if (level.door) {
      const d = level.door;
      this.door = { img: this.img("door-closed", d.x * C, d.y * C, DEPTH.door), count: this.label((d.x + d.w / 2) * C, d.y * C - 14, 12, true) };
    }
    if (level.deadline) {
      const tiles = Math.ceil((level.height * C + 2 * C) / DEADLINE_TILE);
      for (let i = 0; i < tiles; i++) this.deadline.push(this.img("deadline", 0, i * DEADLINE_TILE - C, DEPTH.deadline + 0.01).setVisible(false));
    }
  }

  /** The shelf cells in the world's order (props.ts makes one per cell, in reading order per thing). */
  private shelfCells(): Array<{ x: number; y: number; group: "A" | "B" }> {
    const out: Array<{ x: number; y: number; group: "A" | "B" }> = [];
    for (const t of this.level.things) {
      if (t.def.kind !== "shelf") continue;
      for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) out.push({ x, y, group: t.def.group });
    }
    return out;
  }

  // --- Every frame ------------------------------------------------------------------------------

  /** Something happened that the views animate on their own (a switch hit, a terminal used). */
  onEvent(e: CoopEvent, nowMs: number): void {
    if (e.kind === "switch") for (const s of this.switches) s.bumpAt = nowMs;
    else if (e.kind === "terminal") {
      const i = this.level.things.filter((t) => t.def.kind === "terminal").findIndex((t) => t.index === e.thing);
      const term = this.terminals[i];
      if (term) term.flashUntil = nowMs + TERMINAL_FLASH_MS;
    }
  }

  /**
   * `world` is the drawn world; `authority` the one whose key and door are shown (the server's
   * latest world when the drawn one is predicted: who holds the key is the server's word).
   */
  update(frame: PropFrame, world: CoopWorld, nowMs: number, colors: readonly number[], authority: CoopWorld = world): void {
    const p = world.props;
    const said = authority.props;
    const t = nowMs / 1000;
    const back = this.back;
    const front = this.front;
    back.clear();
    front.clear();
    this.top.clear();

    // Live wires: orange dots march from the plate to what it drives.
    for (const { wire, pts } of this.wires) {
      if (p.signals.get(wire.link) !== true) continue;
      for (const d of alongPath(pts, 14, t * 42)) {
        back.fillStyle(INK, 1);
        back.fillCircle(d.x, d.y, 3.4);
        back.fillStyle(ORANGE, 1);
        back.fillCircle(d.x, d.y, 2.2);
      }
    }

    // Plates.
    p.plates.forEach((s, i) => {
      const v = this.plates[i]!;
      this.atlas.set(v.cap, `cap-${v.w}-${s.active ? "on" : "off"}`);
      v.cap.y = s.thing.y * C + (s.active ? 6 : s.load > 0 ? 3 : 0);
      this.setLabel(v.label, plateLabel(s.load, s.need, s.exact));
    });

    // Gates: bars from the lintel down to what is left closed.
    p.gates.forEach((g, i) => {
      const v = this.gates[i]!;
      const anim = frame.gates[i] ?? g.anim;
      v.ghost.setAlpha(anim);
      v.hint.setVisible(g.blocked && Math.floor(t * 3) % 2 === 0);
      const shown = g.blocked ? Math.max(1 - anim, 0.2 + 0.03 * Math.sin(t * 40)) : 1 - anim;
      if (shown > 0.005) drawBars(front, g.thing, shown);
    });

    // Crates, with motion lines behind a pushed one.
    p.crates.forEach((c, i) => {
      const x = (frame.crates[2 * i] ?? c.x) * C;
      const y = (frame.crates[2 * i + 1] ?? c.y) * C;
      this.crates[i]!.setPosition(x, y);
      if (c.pushDir !== 0) {
        const side = c.pushDir > 0 ? x - 5 : x + c.w * C + 5;
        front.lineStyle(2.5, INK, 1);
        for (let k = 0; k < 3; k++) {
          const ly = y + ((k + 1) * c.h * C) / 4;
          const len = 8 + 4 * Math.sin(t * 30 + k * 2);
          front.lineBetween(side, ly, side - c.pushDir * len, ly);
        }
      }
    });

    // Seesaws: pads where the world has them, the plank through them.
    p.seesaws.forEach((s, i) => {
      const v = this.seesaws[i]!;
      const pose = seesawPose(s.thing, s.travel, frame.seesaws[i] ?? s.t);
      v.left.setPosition(pose.left.x * C, pose.left.y * C);
      v.right.setPosition(pose.right.x * C, pose.right.y * C);
      const [a, b] = pose.beam;
      back.lineStyle(11, INK, 1);
      back.lineBetween(a.x * C, a.y * C, b.x * C, b.y * C);
      back.lineStyle(5.5, WHITE, 1);
      back.lineBetween(a.x * C, a.y * C, b.x * C, b.y * C);
    });

    // Balances: pans on their ropes, the weight on each.
    p.balances.forEach((b, i) => {
      const v = this.balances[i]!;
      const off = frame.balances[i] ?? b.offset;
      const ly = b.left.thing.y + off;
      const ry = b.right.thing.y - off;
      v.left.setPosition(b.left.thing.x * C, ly * C);
      v.right.setPosition(b.right.thing.x * C, ry * C);
      for (const [pan, y] of [
        [b.left.thing, ly],
        [b.right.thing, ry],
      ] as const) {
        const cx = (pan.x + pan.w / 2) * C;
        const ring = (y - PAN_BRIDLE) * C;
        back.lineStyle(2.5, INK, 1);
        back.lineBetween(cx, v.rig.beamY * C + 15, cx, ring);
        back.lineBetween(cx, ring, pan.x * C + 5, y * C);
        back.lineBetween(cx, ring, (pan.x + pan.w) * C - 5, y * C);
        back.fillStyle(WHITE, 1);
        back.fillCircle(cx, ring, 3.5);
        back.strokeCircle(cx, ring, 3.5);
      }
      this.setLabel(v.loadL, String(b.loadL));
      this.setLabel(v.loadR, String(b.loadR));
      v.loadL.text.setPosition((b.left.thing.x + b.left.thing.w / 2) * C, ly * C + 22);
      v.loadR.text.setPosition((b.right.thing.x + b.right.thing.w / 2) * C, ry * C + 22);
    });

    // Platforms and lamps.
    p.movers.forEach((m, i) => {
      const v = this.movers[i]!;
      const x = (frame.movers[2 * i] ?? m.collider.x) * C;
      const y = (frame.movers[2 * i + 1] ?? m.collider.y) * C;
      v.img.setPosition(x, y);
      const arc = m.def.arc;
      if (arc) {
        back.lineStyle(2.5, INK, 1);
        back.lineBetween((arc.px + 0.5) * C, (arc.py + 0.5) * C, x + (m.thing.w * C) / 2, y);
      }
      if (v.label && m.need !== null) {
        this.setLabel(v.label, `${m.load}/${m.need}`);
        v.label.text.setPosition(x + (m.thing.w * C) / 2, y + PROPS.moverThickness * C + 12);
      }
    });

    // Switch blocks.
    p.switches.forEach((s, i) => {
      const v = this.switches[i]!;
      this.atlas.set(v.img, `switch-${s.thing.w}x${s.thing.h}-${p.active}`);
      const since = nowMs - v.bumpAt;
      v.img.y = s.thing.y * C - (since >= 0 && since < BUMP_MS ? 7 * Math.sin((since / BUMP_MS) * Math.PI) : 0);
    });

    // Shelves: solid, off, or waiting for whoever is in the way (blinking dashes).
    const blink = Math.floor(t * 4) % 2 === 0;
    p.shelves.forEach((s, i) => {
      const waiting = s.group === p.active && !s.solid;
      this.atlas.set(this.shelves[i]!, `shelf-${s.group}-${s.solid ? "solid" : waiting && blink ? "wait" : "ghost"}`);
    });

    // Terminals: a flash when used, a countdown while waiting for the other one.
    p.terminals.forEach((term, i) => {
      const v = this.terminals[i]!;
      v.flash.setVisible(nowMs < v.flashUntil && Math.floor(nowMs / 90) % 2 === 0);
      if (term.def.together !== undefined && term.usedAt >= 0) {
        const left = 1 - (frame.levelTick - term.usedAt) / Math.round(PROPS.togetherWindow / COOP_DT);
        if (left > 0) {
          front.fillStyle(WHITE, 1);
          front.fillCircle(v.ring.x, v.ring.y, 9);
          front.fillStyle(ORANGE, 1);
          front.beginPath();
          front.slice(v.ring.x, v.ring.y, 8, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2, false);
          front.fillPath();
          front.lineStyle(2, INK, 1);
          front.strokeCircle(v.ring.x, v.ring.y, 9);
        }
      }
    });

    // Fragile floors.
    p.fragiles.forEach((f, i) => {
      const v = this.fragiles[i]!;
      const state = f.broken ? "broken" : f.load > 0 ? "stress" : "intact";
      const name = `fragile-${f.thing.w}x${f.thing.h}-${state}`;
      if (name !== v.name) {
        this.atlas.set(v.img, name);
        v.name = name;
      }
      v.img.x = f.thing.x * C + (state === "stress" ? Math.sin(t * 70) * 1.2 : 0);
    });

    // The key: at its place, above its carrier, or in the lock.
    if (this.key && this.level.key) {
      const c = said.keyCarrier;
      const box = c >= 0 ? frame.bodies[c] : undefined;
      if (c >= 0 && box) {
        const carrying = world.bodies[c]?.hasRider === true;
        const kx = carrying ? box.x + box.w + 0.4 : box.x + box.w / 2;
        // Above the name label (or at the side when a friend stands on the carrier's head).
        const ky = carrying ? box.y + 0.35 : box.y - 1.0;
        this.key.setPosition(kx * C, ky * C + Math.sin(t * 6) * 1.2).setDepth(DEPTH.keyCarried);
      } else if (c === -1) {
        const k = this.level.key;
        this.key.setPosition((k.x + 0.5) * C, (k.y + 0.55) * C + Math.sin(t * 2.6) * 3).setDepth(DEPTH.keyHome);
        // A little glint so it is noticed.
        if (Math.floor(t * 1.5) % 3 === 0) sparkle(front, (k.x + 0.88) * C, (k.y + 0.15) * C, 4 + 2 * Math.sin(t * 9));
      } else if (this.level.door) {
        const d = this.level.door;
        this.key.setPosition((d.x + d.w) * C + 4, (d.y + d.h * 0.58) * C).setDepth(DEPTH.keyHome);
      }
    }

    // The door and whoever is inside it.
    if (this.door && this.level.door) {
      const d = this.level.door;
      this.atlas.set(this.door.img, said.doorOpen ? "door-open" : "door-closed");
      const inside = authority.inside.flatMap((x, i) => (x ? [i] : []));
      doorPebbles(d, inside.length).forEach((pos, k) => {
        const color = colors[inside[k]!] ?? WHITE;
        front.fillStyle(INK, 1);
        front.fillCircle(pos.x * C + 1.5, pos.y * C + 2, 6.5);
        front.fillStyle(color, 1);
        front.fillCircle(pos.x * C, pos.y * C, 6.5);
        front.lineStyle(2, INK, 1);
        front.strokeCircle(pos.x * C, pos.y * C, 6.5);
        front.fillStyle(color === WHITE ? INK : WHITE, 1);
        front.fillCircle(pos.x * C + 1, pos.y * C - 1.5, 1.4);
        front.fillCircle(pos.x * C + 3.8, pos.y * C - 1.5, 1.4);
      });
      this.door.count.text.setVisible(inside.length > 0);
      this.setLabel(this.door.count, `${inside.length}/${world.bodies.length}`);
    }

    // The deadline wall.
    const dl = p.deadlineX(frame.levelTick);
    const showWall = dl !== null && dl > -2;
    for (const tile of this.deadline) tile.setVisible(showWall).setX((dl ?? 0) * C);
    if (showWall && dl !== null) {
      const fx = dl * C - DEADLINE_EDGE + 1;
      if (fx > -3 * C) {
        this.top.fillStyle(RED, 1);
        this.top.fillRect(-3 * C, -2 * C, fx + 3 * C, (this.level.height + 4) * C);
      }
    }
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects = [];
    this.atlas.destroy();
  }
}

// --- Drawing (Canvas 2D) ----------------------------------------------------------------------

function bounds(pts: readonly Point[], pad: number): { x: number; y: number; w: number; h: number } {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

/** A gate's bars, `shown` of the way down from the lintel (sideways for a trapdoor). */
function drawBars(g: Phaser.GameObjects.Graphics, t: CoopThing, shown: number): void {
  const X = t.x * C;
  const Y = t.y * C;
  const W = t.w * C;
  const H = t.h * C;
  const bar = (x: number, y: number, w: number, h: number) => {
    g.fillStyle(INK, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(WHITE, 1);
    if (w > h) g.fillRect(x + 1.5, y + 1.5, Math.max(0, w - 3), Math.max(0, h - 3));
    else g.fillRect(x + 1.5, y + 1.5, Math.max(0, w - 3), Math.max(0, h - 3));
  };
  if (t.h >= t.w) {
    const len = (H - 8) * shown;
    const n = Math.max(2, Math.round(t.w * 3));
    for (let k = 0; k < n; k++) bar(X + 4 + ((W - 14) * k) / (n - 1), Y + 7, 6, len);
    bar(X + 1, Y + 7 + len - 7, W - 2, 7);
    if (len > 2.2 * C) bar(X + 1, Y + 7 + len / 2 - 3, W - 2, 6);
  } else {
    const len = (W - 8) * shown;
    const n = Math.max(2, Math.round(t.h * 3));
    for (let k = 0; k < n; k++) bar(X + 7, Y + 4 + ((H - 14) * k) / (n - 1), len, 6);
    bar(X + 7 + len - 7, Y + 1, 7, H - 2);
  }
}

function sparkle(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number): void {
  const pts = [0, 1, 2, 3, 4, 5, 6, 7].map((j) => {
    const rad = j % 2 === 0 ? r : r * 0.3;
    const a = (j / 8) * Math.PI * 2;
    return new Phaser.Math.Vector2(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  });
  g.fillStyle(WHITE, 1);
  g.fillPoints(pts, true);
  g.lineStyle(1.5, INK, 1);
  g.strokePoints(pts, true, true);
}

function drawCrate(ctx: CanvasRenderingContext2D, t: CoopThing, need: number): void {
  const W = t.w * C;
  const H = t.h * C;
  const label = t.def.kind === "crate" ? t.def.label : undefined;
  const number = (cx: number, cy: number, r: number, size: number) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = WHITE_CSS;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
    text(ctx, String(need), cx, cy + 1, titleFont(size), INK_CSS);
  };
  if (t.w === 1 && t.h === 1) {
    // A cardboard box: flaps, a strip of tape, the number.
    panel(ctx, 1, 1, W - 2, H - 2, 4, { fill: CARD_CSS });
    ctx.fillStyle = LINE_CSS;
    ctx.fillRect(W / 2 - 4, 2.5, 8, 11);
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(3, 13);
    ctx.lineTo(W - 3, 13);
    ctx.moveTo(W / 2, 2.5);
    ctx.lineTo(W / 2, 13);
    ctx.stroke();
    text(ctx, String(need), W / 2, 26, titleFont(19), INK_CSS);
  } else if (t.w === 1 && t.h === 2) {
    // A PC tower: two drive bays, the power button, vents.
    panel(ctx, 2, 1, W - 4, H - 2, 5);
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = 1.6;
    for (const y of [8, 17]) {
      rr(ctx, 8, y, W - 16, 6, 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(10, 11);
    ctx.lineTo(16, 11);
    ctx.stroke();
    ctx.beginPath();
    for (let y = H - 22; y < H - 6; y += 4) {
      ctx.moveTo(9, y);
      ctx.lineTo(W - 9, y);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W - 12, 32, 3, 0, Math.PI * 2);
    ctx.fillStyle = ORANGE_CSS;
    ctx.fill();
    ctx.stroke();
    number(W / 2, H / 2 + 6, 11, 16);
  } else if (t.w === 3 && t.h === 1) {
    // A server rack: dark, three units with their lights, ears, the number in the middle.
    panel(ctx, 1, 1, W - 2, H - 2, 4, { fill: INK_CSS });
    ctx.strokeStyle = WHITE_CSS;
    ctx.lineWidth = 1.5;
    for (const y of [11, 20, 29]) {
      ctx.beginPath();
      ctx.moveTo(9, y);
      ctx.lineTo(W / 2 - 16, y);
      ctx.moveTo(W / 2 + 16, y);
      ctx.lineTo(W - 9, y);
      ctx.stroke();
    }
    for (const [x, y, on] of [
      [14, 8, true],
      [20, 8, false],
      [14, 17, false],
      [20, 17, true],
      [W - 20, 26, true],
      [W - 14, 26, true],
    ] as const) {
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = on ? ORANGE_CSS : WHITE_CSS;
      ctx.fill();
    }
    ctx.fillStyle = WHITE_CSS;
    ctx.fillRect(3, H / 2 - 6, 3, 12);
    ctx.fillRect(W - 6, H / 2 - 6, 3, 12);
    number(W / 2, H / 2, 12, 16);
  } else {
    panel(ctx, 1, 1, W - 2, H - 2, 5);
    hatch(ctx, 3, 3, W - 6, H - 6, 9, LINE_CSS, 2);
    ctx.lineWidth = OUTLINE;
    ctx.strokeStyle = INK_CSS;
    rr(ctx, 1, 1, W - 2, H - 2, 5);
    ctx.stroke();
    number(W / 2, H / 2, 12, 17);
  }
  if (label) text(ctx, label, W / 2, H - 7, titleFont(9, 600), t.w === 3 ? WHITE_CSS : INK_CSS);
}

function drawSwitch(ctx: CanvasRenderingContext2D, W: number, H: number, active: "A" | "B"): void {
  panel(ctx, 1, 1, W - 2, H - 2, 7, { line: 3 });
  const cy = H / 2 - 3;
  for (const [g, x] of [
    ["A", W / 2 - 9],
    ["B", W / 2 + 9],
  ] as const) {
    const on = g === active;
    ctx.beginPath();
    ctx.arc(x, cy, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = on ? INK_CSS : WHITE_CSS;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
    text(ctx, g, x, cy + 0.5, titleFont(11), on ? WHITE_CSS : INK_CSS);
  }
  // A double arrow under the letters: hitting it swaps them.
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = 1.8;
  const y = H - 9;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 10, y);
  ctx.lineTo(W / 2 + 10, y);
  ctx.moveTo(W / 2 - 10, y);
  ctx.lineTo(W / 2 - 6, y - 3);
  ctx.moveTo(W / 2 - 10, y);
  ctx.lineTo(W / 2 - 6, y + 3);
  ctx.moveTo(W / 2 + 10, y);
  ctx.lineTo(W / 2 + 6, y - 3);
  ctx.moveTo(W / 2 + 10, y);
  ctx.lineTo(W / 2 + 6, y + 3);
  ctx.stroke();
}

function drawShelf(ctx: CanvasRenderingContext2D, group: "A" | "B", state: "solid" | "ghost" | "wait"): void {
  const pattern = (alpha: number) => {
    if (group === "A") hatch(ctx, 3, 3, C - 6, C - 6, 7, INK_CSS, 1.6, alpha);
    else dots(ctx, 3, 3, C - 6, C - 6, 7.5, 1.7, INK_CSS, alpha);
  };
  const letter = (alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(C / 2, C / 2, 8, 0, Math.PI * 2);
    ctx.fillStyle = WHITE_CSS;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
    ctx.restore();
    text(ctx, group, C / 2, C / 2 + 0.5, titleFont(12), INK_CSS, { alpha });
  };
  if (state === "solid") {
    panel(ctx, 1, 1, C - 2, C - 2, 3, { line: 2.5 });
    pattern(0.5);
    rr(ctx, 1, 1, C - 2, C - 2, 3);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
    letter(1);
    return;
  }
  pattern(state === "wait" ? 0.3 : 0.14);
  ctx.save();
  ctx.setLineDash(state === "wait" ? [7, 4] : [4, 4]);
  ctx.lineWidth = state === "wait" ? 2.8 : 2;
  ctx.globalAlpha = state === "wait" ? 0.95 : 0.4;
  ctx.strokeStyle = INK_CSS;
  rr(ctx, 2.5, 2.5, C - 5, C - 5, 3);
  ctx.stroke();
  ctx.restore();
  letter(state === "wait" ? 0.95 : 0.45);
}

interface TerminalGeo {
  /** Monitor box, the screen inside it, the floor line, pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  floor: number;
  lines: string[];
}

function terminalGeometry(t: CoopThing, prompt: string): TerminalGeo {
  const font = monoFont(10);
  const lines = wrap(`> ${prompt}`, font, 92, 2);
  const textW = Math.max(...lines.map((l) => measure(l, font)));
  const w = Math.max(64, Math.min(112, Math.ceil(textW) + 16));
  const h = 30 + lines.length * 12;
  const cx = (t.x + t.w / 2) * C;
  const floor = (t.y + t.h) * C;
  const y = floor - h - 22;
  const x = cx - w / 2;
  return { x, y, w, h, sx: x + 5, sy: y + 14, sw: w - 10, sh: h - 19, floor, lines };
}

function drawTerminal(ctx: CanvasRenderingContext2D, g: TerminalGeo, mark: LinkMark | undefined): void {
  const cx = g.x + g.w / 2;
  // Stand and foot.
  ctx.fillStyle = INK_CSS;
  ctx.fillRect(cx - 4 + SHADOW_X, g.y + g.h, 8, g.floor - g.y - g.h - 3);
  panel(ctx, cx - 4, g.y + g.h - 2, 8, g.floor - g.y - g.h - 2, 2, { shadow: false, line: 2 });
  panel(ctx, cx - 16, g.floor - 6, 32, 6, 3, { line: 2 });
  // Monitor, with "Claude" on its bezel.
  panel(ctx, g.x, g.y, g.w, g.h, 6, { line: 2.5 });
  ctx.beginPath();
  ctx.arc(g.x + 10, g.y + 7.5, 5, 0, Math.PI * 2);
  ctx.fillStyle = INK_CSS;
  ctx.fill();
  text(ctx, "C", g.x + 10, g.y + 8, titleFont(7.5), WHITE_CSS);
  text(ctx, "Claude", g.x + 18, g.y + 8, titleFont(9, 600), INK_CSS, { align: "left" });
  if (mark) {
    ctx.save();
    symbolPath(ctx, mark.symbol, g.x + g.w - 9, g.y + 7.5, 3.6);
    ctx.fillStyle = INK_CSS;
    ctx.fill();
    ctx.restore();
  }
  rr(ctx, g.sx, g.sy, g.sw, g.sh, 3);
  ctx.fillStyle = INK_CSS;
  ctx.fill();
  g.lines.forEach((l, i) => text(ctx, l, g.sx + 5, g.sy + 9 + i * 12, monoFont(10), WHITE_CSS, { align: "left" }));
}

function drawFragile(ctx: CanvasRenderingContext2D, W: number, H: number, state: "intact" | "stress" | "broken"): void {
  if (state === "broken") {
    ctx.save();
    ctx.setLineDash([4, 5]);
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = INK_CSS;
    ctx.strokeRect(2, 2, W - 4, H - 4);
    ctx.restore();
    ctx.fillStyle = WHITE_CSS;
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = 1.5;
    for (const [x, y, s] of [
      [5, H - 6, 6],
      [W - 12, H - 5, 5],
      [W / 2, H - 4, 4],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + s, y - s * 0.8);
      ctx.lineTo(x + s * 1.6, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    return;
  }
  ctx.fillStyle = "#f7f3ea";
  ctx.fillRect(0, 0, W, H);
  hatch(ctx, 0, 0, W, H, 9, LINE_CSS, 2);
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = OUTLINE;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  // Cracks from the top: zigzags, more of them under a weight.
  ctx.lineWidth = state === "stress" ? 2.2 : 1.6;
  const crack = (x0: number, depth: number, lean: number) => {
    ctx.beginPath();
    ctx.moveTo(x0, 1);
    let x = x0;
    for (let y = 6; y < depth; y += 6) {
      x += (y / 6) % 2 ? lean : -lean * 0.6;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  };
  const step = Math.max(C * 0.7, W / 3);
  for (let x = step / 2; x < W; x += step) crack(x, H * (state === "stress" ? 0.85 : 0.55), 4);
  if (state === "stress") {
    for (let x = step; x < W - 4; x += step) crack(x, H * 0.6, -4);
    ctx.fillStyle = INK_CSS;
    for (const x of [W * 0.25, W * 0.6, W * 0.85]) ctx.fillRect(x, H - 2, 3, 3);
  }
}

function drawSpikes(ctx: CanvasRenderingContext2D, t: CoopThing, dir: "up" | "down" | "left" | "right"): void {
  const d = PROPS.spikeDepth * C;
  const teeth = (bx: number, by: number, ux: number, uy: number, nx: number, ny: number) => {
    // Base from (bx, by) along u for one cell; teeth point along n.
    const n = 3;
    const pts: Array<[number, number]> = [[bx + ux * 2, by + uy * 2]];
    const span = C - 4;
    for (let i = 0; i < n; i++) {
      const mid = 2 + (i + 0.5) * (span / n);
      const end = 2 + (i + 1) * (span / n);
      pts.push([bx + ux * mid + nx * d, by + uy * mid + ny * d]);
      pts.push([bx + ux * end + nx * (i < n - 1 ? 3 : 0), by + uy * end + ny * (i < n - 1 ? 3 : 0)]);
    }
    const path = (ox: number, oy: number) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x + ox, y + oy) : ctx.lineTo(x + ox, y + oy)));
      ctx.closePath();
    };
    path(SHADOW_X * 0.7, SHADOW_Y * 0.4);
    ctx.fillStyle = INK_CSS;
    ctx.fill();
    path(0, 0);
    ctx.fillStyle = RED_CSS;
    ctx.fill();
    ctx.lineWidth = OUTLINE;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
    ctx.lineWidth = OUTLINE + 0.5;
    ctx.beginPath();
    ctx.moveTo(bx + ux, by + uy);
    ctx.lineTo(bx + ux * (C - 1), by + uy * (C - 1));
    ctx.stroke();
  };
  const X = t.x * C;
  const Y = t.y * C;
  if (dir === "up" || dir === "down") {
    for (let i = 0; i < t.w; i++) {
      if (dir === "up") teeth(X + i * C, Y + t.h * C - 1, 1, 0, 0, -1);
      else teeth(X + i * C, Y + 1, 1, 0, 0, 1);
    }
  } else {
    for (let i = 0; i < t.h; i++) {
      if (dir === "left") teeth(X + t.w * C - 1, Y + i * C, 0, 1, -1, 0);
      else teeth(X + 1, Y + i * C, 0, 1, 1, 0);
    }
  }
}

function drawVoid(ctx: CanvasRenderingContext2D, cells: readonly number[], width: number, g: { x: number; y: number; w: number; h: number }): void {
  const set = new Set(cells);
  ctx.fillStyle = INK_CSS;
  for (const c of cells) ctx.fillRect((c % width) * C, Math.floor(c / width) * C, C, C);
  // A red jagged edge on top: it kills.
  ctx.fillStyle = RED_CSS;
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = 2;
  for (const c of cells) {
    if (set.has(c - width)) continue;
    const x = (c % width) * C;
    const y = Math.floor(c / width) * C;
    ctx.beginPath();
    ctx.moveTo(x, y + 9);
    for (let i = 0; i <= 4; i++) ctx.lineTo(x + i * (C / 4), y + (i % 2 ? 2 : 9));
    ctx.lineTo(x + C, y + 9);
    ctx.lineTo(x + C, y + 12);
    ctx.lineTo(x, y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  const tx = (g.x + g.w / 2) * C;
  const ty = g.y * C - 9;
  panel(ctx, tx - 19, ty - 9, 38, 18, 9, { fill: RED_CSS, line: 2 });
  text(ctx, "TUE", tx, ty + 0.5, titleFont(11), WHITE_CSS);
}

function drawGlass(ctx: CanvasRenderingContext2D, cells: readonly number[], glass: ReadonlySet<number>, width: number): void {
  for (const c of cells) {
    const x = (c % width) * C;
    const y = Math.floor(c / width) * C;
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillRect(x, y, C, C);
    ctx.strokeStyle = "rgba(22, 22, 22, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 3, y + 3, C - 6, C - 6);
    // Two glints.
    ctx.strokeStyle = WHITE_CSS;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 20);
    ctx.lineTo(x + 18, y + 8);
    ctx.moveTo(x + 12, y + 28);
    ctx.lineTo(x + 28, y + 10);
    ctx.stroke();
    ctx.strokeStyle = "rgba(22, 22, 22, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 22, y + 32);
    ctx.lineTo(x + 31, y + 22);
    ctx.stroke();
    // The frame on the sides that are not more glass.
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = OUTLINE;
    ctx.beginPath();
    if (!glass.has(c - width)) {
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + C, y + 1);
    }
    if (!glass.has(c + width)) {
      ctx.moveTo(x, y + C - 1);
      ctx.lineTo(x + C, y + C - 1);
    }
    if (c % width === 0 || !glass.has(c - 1)) {
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + 1, y + C);
    }
    if (c % width === width - 1 || !glass.has(c + 1)) {
      ctx.moveTo(x + C - 1, y);
      ctx.lineTo(x + C - 1, y + C);
    }
    ctx.stroke();
  }
}

function drawVariantWall(ctx: CanvasRenderingContext2D, cells: readonly number[], walls: ReadonlySet<number>, width: number): void {
  for (const c of cells) {
    const x = (c % width) * C;
    const y = Math.floor(c / width) * C;
    ctx.fillStyle = WHITE_CSS;
    ctx.fillRect(x, y, C, C);
    hatch(ctx, x, y, C, C, 9, LINE_CSS, 2);
  }
  ctx.save();
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = OUTLINE;
  ctx.strokeStyle = INK_CSS;
  ctx.beginPath();
  for (const c of cells) {
    const x = (c % width) * C;
    const y = Math.floor(c / width) * C;
    if (!walls.has(c - width)) {
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + C, y + 1);
    }
    if (!walls.has(c + width)) {
      ctx.moveTo(x, y + C - 1);
      ctx.lineTo(x + C, y + C - 1);
    }
    if (!walls.has(c - 1)) {
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + 1, y + C);
    }
    if (!walls.has(c + 1)) {
      ctx.moveTo(x + C - 1, y);
      ctx.lineTo(x + C - 1, y + C);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** A non-slip floor: an orange band with ink stripes along the top of its cells (it helps: orange). */
function drawGrip(ctx: CanvasRenderingContext2D, cells: readonly number[], width: number): void {
  for (const c of cells) {
    const x = (c % width) * C;
    const y = Math.floor(c / width) * C;
    ctx.fillStyle = ORANGE_CSS;
    ctx.fillRect(x, y, C, GRIP_BAND);
    hatch(ctx, x, y, C, GRIP_BAND, 10, INK_CSS, 3);
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK_CSS;
    ctx.strokeRect(x + 1, y + 1, C - 2, GRIP_BAND - 1);
  }
}

/** Ruben's USB key, around (0, 0): an orange stick, its metal plug, a key ring. */
function drawKey(ctx: CanvasRenderingContext2D): void {
  panel(ctx, -12, -7, 22, 14, 4, { fill: ORANGE_CSS, line: 2.2 });
  panel(ctx, 10, -5, 10, 10, 1.5, { line: 2, shadow: false });
  ctx.fillStyle = INK_CSS;
  ctx.fillRect(13, -3, 3, 2.5);
  ctx.fillRect(13, 1, 3, 2.5);
  ctx.beginPath();
  ctx.arc(-16, 0, 4.5, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
  ctx.strokeStyle = WHITE_CSS;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-8, -3);
  ctx.lineTo(4, -3);
  ctx.stroke();
}

function drawDoor(ctx: CanvasRenderingContext2D, W: number, H: number, open: boolean): void {
  // Frame.
  panel(ctx, -5, -5, W + 10, H + 5, 4, { line: 2.5 });
  if (!open) {
    ctx.fillStyle = CARD_CSS;
    ctx.fillRect(0, 0, W, H);
    hatch(ctx, 0, 0, W, H, 10, LINE_CSS, 1.5);
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, W, H);
    // A small window, the handle, the lock.
    panel(ctx, 7, 7, W - 14, Math.min(20, H * 0.25), 2, { shadow: false, line: 1.8, fill: "rgba(255,255,255,0.9)" });
    ctx.beginPath();
    ctx.arc(W - 8, H * 0.52, 3, 0, Math.PI * 2);
    ctx.fillStyle = INK_CSS;
    ctx.fill();
    panel(ctx, W - 12, H * 0.52 + 6, 8, 14, 2, { shadow: false, line: 1.8 });
    ctx.beginPath();
    ctx.arc(W - 8, H * 0.52 + 11, 1.8, 0, Math.PI * 2);
    ctx.moveTo(W - 8, H * 0.52 + 11);
    ctx.lineTo(W - 9.5, H * 0.52 + 17);
    ctx.lineTo(W - 6.5, H * 0.52 + 17);
    ctx.closePath();
    ctx.fill();
    return;
  }
  // Open: the dark room behind, the door leaf turned on its hinges.
  ctx.fillStyle = INK_CSS;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, H - 10);
  ctx.lineTo(W - 4, H - 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(11, 5);
  ctx.lineTo(11, H - 2);
  ctx.lineTo(0, H);
  ctx.closePath();
  ctx.fillStyle = CARD_CSS;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
}

function drawDeadlineTile(ctx: CanvasRenderingContext2D): void {
  const w = DEADLINE_EDGE;
  const h = DEADLINE_TILE;
  ctx.fillStyle = RED_CSS;
  ctx.fillRect(-w, 0, w, h);
  hatch(ctx, -w, 0, w, h, 12, INK_CSS, 3, 0.22);
  // A jagged ink edge facing the players.
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  for (let y = 0; y <= h; y += 20) ctx.lineTo(y % 40 === 0 ? -6 : 2, y);
  ctx.lineTo(-6, h);
  ctx.closePath();
  ctx.fillStyle = RED_CSS;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
  ctx.save();
  ctx.translate(-w / 2 - 2, h / 2);
  ctx.rotate(-Math.PI / 2);
  text(ctx, "DEADLINE", 0, 0, titleFont(21), WHITE_CSS, { stroke: INK_CSS, strokeWidth: 5 });
  ctx.restore();
}
