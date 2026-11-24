/**
 * Build step 2 scene: one player alone in a level with objects.
 * Death on traps or in pits, respawn at the start, ink stains where you died,
 * finish line with a timer. Plain shapes on purpose: the art direction comes in step 5.
 *
 * The character advances in fixed steps (SIM_HZ per second) and the round clock advances
 * with them, so object logic (a pure function of the round clock) stays deterministic.
 * Rendering happens at the display's own rate and interpolates between the last two
 * simulation states, so motion is smooth on 60 Hz and 120 Hz screens alike.
 */
import Phaser from "phaser";
import {
  canPlaceAt,
  findKiller,
  level1,
  OBJECT_DEFS,
  parseLevel,
  testLevel,
  withSolidObjects,
  type Box,
  type Level,
  type LevelDefinition,
  type ObjectKind,
  type PlacedObject,
} from "@game/shared";
import { CharacterController } from "../character/controller";
import { FollowCamera } from "../camera";
import { CELL_PX, HAZARD_INSET, RESPAWN_DELAY, SIM_HZ, VIEW_CELLS_X, VIEW_CELLS_Y } from "../config";
import { DebugEditor } from "../debug/editor";
import { debugView, liveStats } from "../debug/debugState";
import { InputSource } from "../input";
import { ObjectViews } from "../render/objectViews";
import { tuning } from "../tuningStore";

const STEP = 1 / SIM_HZ;
/** Never simulate more than this much time in one frame (tab was in background, debugger pause...). */
const MAX_FRAME_TIME = 0.25;
const TRAIL_LENGTH = 120;

const LEVELS: LevelDefinition[] = [level1, testLevel];
/** Best time per level name, kept while the page is open. */
const bestTimes = new Map<string, number>();

const COLORS = {
  grid: 0xdcd8cc,
  solid: 0x161616,
  player: 0x2b59c3,
  playerWallSlide: 0x3fa35c,
  trail: 0x2b59c3,
  start: 0x161616,
  finish: 0xf07a2e,
  label: "#161616",
  hud: "#161616",
};

type Phase = "playing" | "dead" | "finished";

interface SceneData {
  levelIndex?: number;
}

export class SoloScene extends Phaser.Scene {
  private levelIndex = 0;
  private level!: Level;
  /** Level terrain plus solid objects; what the character collides with. */
  private collision!: Level;
  private objects: PlacedObject[] = [];
  private nextObjectId = 1;

  private controller!: CharacterController;
  private followCam!: FollowCamera;
  private controls!: InputSource;
  private editor!: DebugEditor;
  private objectViews!: ObjectViews;

  private phase: Phase = "playing";
  /** Seconds since the current attempt started. Drives objects and the timer. */
  private roundTime = 0;
  private deadTimer = 0;
  private deaths = 0;
  private message = "";

  private accumulator = 0;
  private prevX = 0;
  private prevY = 0;

  private playerRect!: Phaser.GameObjects.Rectangle;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private trailGfx!: Phaser.GameObjects.Graphics;
  private stainGfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private trail: Array<{ x: number; y: number }> = [];
  private trailStepCounter = 0;

  constructor() {
    super("solo");
  }

  create(data: SceneData): void {
    // The scene object is reused when it restarts, so reset everything here, not in field initialisers.
    this.levelIndex = data.levelIndex ?? 0;
    this.level = parseLevel(LEVELS[this.levelIndex] ?? level1);
    this.objects = this.level.initialObjects.map((o) => ({ ...o }));
    this.nextObjectId = 1;
    this.collision = withSolidObjects(this.level, this.objects);
    this.deaths = 0;
    this.trail = [];

    this.controller = new CharacterController(this.collision, tuning.movement);
    this.followCam = new FollowCamera(tuning.camera, VIEW_CELLS_X, VIEW_CELLS_Y, this.level.width, this.level.height);

    this.drawLevel();
    this.stainGfx = this.add.graphics().setDepth(1);
    this.objectViews = new ObjectViews(this);
    this.objectViews.sync(this.objects);
    this.trailGfx = this.add.graphics().setDepth(3);
    const m = tuning.movement;
    this.playerRect = this.add
      .rectangle(0, 0, m.bodyWidth * CELL_PX, m.bodyHeight * CELL_PX, COLORS.player)
      .setOrigin(0, 0)
      .setDepth(4);

    this.hud = this.add
      .text(56, 12, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: COLORS.hud,
        lineSpacing: 4,
        backgroundColor: "#f5f2ea",
        padding: { x: 8, y: 6 },
      })
      .setScrollFactor(0)
      .setDepth(10);
    this.banner = this.add
      .text(this.scale.width / 2, this.scale.height / 2 - 60, "", {
        fontFamily: "sans-serif",
        fontSize: "40px",
        fontStyle: "bold",
        color: "#161616",
        align: "center",
        backgroundColor: "#ffffff",
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(11);

    this.controls = new InputSource();
    this.editor = new DebugEditor(this, {
      onCellClicked: (x, y, kind) => this.toggleObjectAt(x, y, kind),
      canPlace: (x, y) => this.canPlace(x, y),
      hasObjectAt: (x, y) => this.objects.some((o) => o.x === x && o.y === y),
    });
    this.controls.onKey = (code) => {
      if (this.editor.handleKey(code)) return;
      if (code === "KeyR") this.respawn();
      if (code === "KeyN") this.scene.restart({ levelIndex: (this.levelIndex + 1) % LEVELS.length });
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.controls.destroy();
      this.editor.destroy();
      this.objectViews.destroy();
    });

    this.respawn();
  }

  /** Called by the tuning panel whenever a value changes. */
  applyTuning(): void {
    this.controller.retune();
    const m = tuning.movement;
    this.playerRect.setSize(m.bodyWidth * CELL_PX, m.bodyHeight * CELL_PX);
  }

  respawn(): void {
    this.controller.respawn();
    this.prevX = this.controller.x;
    this.prevY = this.controller.y;
    this.accumulator = 0;
    this.roundTime = 0;
    this.phase = "playing";
    this.message = "";
    this.trail = [];
    // Drop a jump pressed while dead so it doesn't fire on the first step.
    this.controls.takeStepInput();
    this.followCam.snapTo(this.cameraTarget(this.controller.x, this.controller.y));
  }

  override update(_time: number, deltaMs: number): void {
    const frameDt = Math.min(deltaMs / 1000, MAX_FRAME_TIME);
    this.controls.poll();

    if (this.phase === "playing") {
      this.accumulator += frameDt;
      while (this.accumulator >= STEP && this.phase === "playing") {
        this.prevX = this.controller.x;
        this.prevY = this.controller.y;
        this.controller.step(STEP, this.controls.takeStepInput());
        this.roundTime += STEP;
        this.accumulator -= STEP;
        this.checkOutcome();
        this.recordTrail();
      }
    } else if (this.phase === "dead") {
      this.deadTimer -= frameDt;
      if (this.deadTimer <= 0) this.respawn();
    }

    // Interpolate between the previous and current simulation states.
    const alpha = this.phase === "playing" ? this.accumulator / STEP : 1;
    const rx = this.prevX + (this.controller.x - this.prevX) * alpha;
    const ry = this.prevY + (this.controller.y - this.prevY) * alpha;

    this.playerRect.setVisible(this.phase !== "dead");
    this.playerRect.setPosition(rx * CELL_PX, ry * CELL_PX);
    this.playerRect.setFillStyle(this.controller.wallSliding ? COLORS.playerWallSlide : COLORS.player);

    this.objectViews.update(this.objects, this.roundTime + (this.phase === "playing" ? this.accumulator : 0));

    if (this.phase !== "dead") this.followCam.update(frameDt, this.cameraTarget(rx, ry));
    this.cameras.main.setScroll(this.followCam.x * CELL_PX, this.followCam.y * CELL_PX);

    this.editor.update();
    this.drawTrail();
    this.updateHud();
  }

  /** After each simulation step: fell out, killed by an object, or reached the finish. */
  private checkOutcome(): void {
    const c = this.controller;
    if (c.fellOut) {
      this.die(null, false);
      return;
    }
    const killer = findKiller(this.objects, this.hazardBox(), c.vy, this.roundTime);
    if (killer) {
      this.die(killer, true);
      return;
    }
    const f = this.level.finish;
    const m = tuning.movement;
    if (f && c.x < f.x + 1 && c.x + m.bodyWidth > f.x && c.y < f.y + 1 && c.y + m.bodyHeight > f.y) {
      this.finish();
    }
  }

  private hazardBox(): Box {
    const m = tuning.movement;
    const c = this.controller;
    return {
      x: c.x + HAZARD_INSET,
      y: c.y + HAZARD_INSET,
      w: m.bodyWidth - 2 * HAZARD_INSET,
      h: m.bodyHeight - 2 * HAZARD_INSET,
    };
  }

  private die(killer: PlacedObject | null, leaveStain: boolean): void {
    this.phase = "dead";
    this.deadTimer = RESPAWN_DELAY;
    this.deaths++;
    this.message = killer ? `Touché : ${OBJECT_DEFS[killer.kind].name}` : "Tombé !";
    if (leaveStain) this.drawStain();
  }

  private finish(): void {
    this.phase = "finished";
    const t = this.roundTime;
    const best = bestTimes.get(this.level.name);
    const record = best === undefined || t < best;
    if (record) bestTimes.set(this.level.name, t);
    this.message = `Arrivée ! ${t.toFixed(2)} s${record ? " · record" : ""}\nR pour rejouer`;
  }

  /** Ink stain where the character died. Stains stay for the whole session (the whole game, later). */
  private drawStain(): void {
    const m = tuning.movement;
    const cx = (this.controller.x + m.bodyWidth / 2) * CELL_PX;
    const cy = (this.controller.y + m.bodyHeight / 2) * CELL_PX;
    const g = this.stainGfx;
    g.fillStyle(COLORS.player, 0.55);
    g.fillCircle(cx, cy, CELL_PX * 0.45);
    // A few deterministic splashes around it, so stains don't all look identical.
    const seed = this.deaths * 97 + Math.floor(cx + cy);
    for (let i = 0; i < 5; i++) {
      const a = ((seed * (i + 3)) % 360) * (Math.PI / 180);
      const d = CELL_PX * (0.45 + ((seed * (i + 7)) % 30) / 100);
      g.fillCircle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, CELL_PX * (0.08 + ((seed + i) % 5) / 50));
    }
  }

  private canPlace(x: number, y: number): boolean {
    if (!canPlaceAt(this.level, this.objects, x, y)) return false;
    // Never place a platform inside the character.
    const m = tuning.movement;
    const c = this.controller;
    return !(c.x < x + 1 && c.x + m.bodyWidth > x && c.y < y + 1 && c.y + m.bodyHeight > y);
  }

  private toggleObjectAt(x: number, y: number, kind: ObjectKind): void {
    const existing = this.objects.findIndex((o) => o.x === x && o.y === y);
    if (existing >= 0) this.objects.splice(existing, 1);
    else if (this.canPlace(x, y)) this.objects.push({ id: this.nextObjectId++, kind, x, y });
    else return;
    this.collision = withSolidObjects(this.level, this.objects);
    this.controller.replaceLevel(this.collision);
    this.objectViews.sync(this.objects);
  }

  private cameraTarget(x: number, y: number) {
    const m = tuning.movement;
    const c = this.controller;
    return { cx: x + m.bodyWidth / 2, cy: y + m.bodyHeight / 2, vx: c.vx, grounded: c.grounded, facing: c.facing };
  }

  private recordTrail(): void {
    // One point every 2 steps: at 120 Hz that is a dot every 1/60 s, about 1 s of history.
    if (++this.trailStepCounter % 2 !== 0) return;
    const m = tuning.movement;
    this.trail.push({ x: this.controller.x + m.bodyWidth / 2, y: this.controller.y + m.bodyHeight });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
  }

  private drawTrail(): void {
    this.trailGfx.clear();
    if (!debugView.showTrail) return;
    this.trail.forEach((p, i) => {
      this.trailGfx.fillStyle(COLORS.trail, 0.15 + (0.45 * i) / this.trail.length);
      this.trailGfx.fillRect(p.x * CELL_PX - 2, p.y * CELL_PX - 2, 4, 4);
    });
  }

  private drawLevel(): void {
    const { width, height } = this.level;

    this.gridGfx = this.add.graphics();
    this.gridGfx.lineStyle(1, COLORS.grid, 1);
    for (let x = 0; x <= width; x++) this.gridGfx.lineBetween(x * CELL_PX, 0, x * CELL_PX, height * CELL_PX);
    for (let y = 0; y <= height; y++) this.gridGfx.lineBetween(0, y * CELL_PX, width * CELL_PX, y * CELL_PX);

    const solids = this.add.graphics();
    solids.fillStyle(COLORS.solid, 1);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (this.level.solid[y * width + x]) solids.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
      }
    }

    const markers = this.add.graphics();
    const s = this.level.start;
    markers.lineStyle(2, COLORS.start, 1);
    markers.strokeRect(s.x * CELL_PX + 4, s.y * CELL_PX + 4, CELL_PX - 8, CELL_PX - 8);
    const f = this.level.finish;
    if (f) {
      // Flag: pole and pennant.
      const px = f.x * CELL_PX;
      const py = f.y * CELL_PX;
      markers.fillStyle(COLORS.solid, 1);
      markers.fillRect(px + 10, py - CELL_PX, 3, CELL_PX * 2);
      markers.fillStyle(COLORS.finish, 1);
      markers.fillTriangle(px + 13, py - CELL_PX, px + 13, py - CELL_PX + 22, px + 36, py - CELL_PX + 11);
    }

    for (const l of this.level.labels) {
      this.add
        .text(l.x * CELL_PX, l.y * CELL_PX, l.text, { fontFamily: "sans-serif", fontSize: "18px", color: COLORS.label })
        .setOrigin(0.5, 0.5);
    }
  }

  private updateHud(): void {
    this.gridGfx.setVisible(debugView.showGrid);
    this.hud.setVisible(debugView.showHud);
    this.banner.setVisible(this.message !== "");
    this.banner.setText(this.message);
    this.banner.setColor(this.phase === "dead" ? "#b3361a" : "#161616");

    const c = this.controller;
    let state: string;
    if (this.phase === "dead") state = "mort";
    else if (this.phase === "finished") state = "arrivé";
    else if (c.wallSliding) state = "glisse au mur";
    else {
      state = c.grounded ? "au sol" : c.vy < 0 ? "en saut" : "en chute";
      if (!c.grounded && c.wallSide !== 0) state += c.wallSide < 0 ? " · mur à gauche" : " · mur à droite";
    }
    liveStats.vx = c.vx;
    liveStats.vy = c.vy;
    liveStats.state = state;

    if (!debugView.showHud) return;
    const best = bestTimes.get(this.level.name);
    this.hud.setText([
      "Q/A ← · D → · Espace/Z/↑ saut · R recommencer · N niveau suivant",
      `${this.level.name} · temps ${this.roundTime.toFixed(2)} s · record ${best !== undefined ? best.toFixed(2) + " s" : "-"} · morts ${this.deaths}`,
      this.editor.status(),
    ]);
  }
}
