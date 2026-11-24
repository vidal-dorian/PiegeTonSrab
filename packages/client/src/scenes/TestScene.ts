/**
 * Step 1 scene: one character alone in the test level.
 * Plain rectangles on purpose: the art direction comes in step 5.
 *
 * The character advances in fixed steps (SIM_HZ per second). Rendering happens at the
 * display's own rate and interpolates between the last two simulation states, so motion
 * is smooth on 60 Hz and 120 Hz screens alike.
 */
import Phaser from "phaser";
import { parseLevel, testLevel, type Level } from "@game/shared";
import { CharacterController } from "../character/controller";
import { FollowCamera } from "../camera";
import { CELL_PX, SIM_HZ, VIEW_CELLS_X, VIEW_CELLS_Y } from "../config";
import { InputSource } from "../input";
import { tuning } from "../tuningStore";

const STEP = 1 / SIM_HZ;
/** Never simulate more than this much time in one frame (tab was in background, debugger pause...). */
const MAX_FRAME_TIME = 0.25;
const TRAIL_LENGTH = 120;

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

/** Debug display switches, toggled from the tuning panel. */
export const debugView = {
  showTrail: true,
  showGrid: true,
  showHud: true,
};

/** Live values the tuning panel displays. */
export const liveStats = {
  vx: 0,
  vy: 0,
  state: "",
};

export class TestScene extends Phaser.Scene {
  private level!: Level;
  private controller!: CharacterController;
  private followCam!: FollowCamera;
  private controls!: InputSource;

  private accumulator = 0;
  private prevX = 0;
  private prevY = 0;

  private playerRect!: Phaser.GameObjects.Rectangle;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private trailGfx!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private trail: Array<{ x: number; y: number }> = [];
  private trailStepCounter = 0;

  constructor() {
    super("test");
  }

  create(): void {
    this.level = parseLevel(testLevel);
    this.controller = new CharacterController(this.level, tuning.movement);
    this.followCam = new FollowCamera(tuning.camera, VIEW_CELLS_X, VIEW_CELLS_Y, this.level.width, this.level.height);
    this.controls = new InputSource();
    this.controls.onKey = (code) => {
      if (code === "KeyR") this.respawn();
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.controls.destroy());

    this.drawLevel();
    this.trailGfx = this.add.graphics();
    const m = tuning.movement;
    this.playerRect = this.add
      .rectangle(0, 0, m.bodyWidth * CELL_PX, m.bodyHeight * CELL_PX, COLORS.player)
      .setOrigin(0, 0);

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
    this.trail = [];
    this.followCam.snapTo(this.cameraTarget(this.controller.x, this.controller.y));
  }

  override update(_time: number, deltaMs: number): void {
    const frameDt = Math.min(deltaMs / 1000, MAX_FRAME_TIME);
    this.controls.poll();

    this.accumulator += frameDt;
    while (this.accumulator >= STEP) {
      this.prevX = this.controller.x;
      this.prevY = this.controller.y;
      this.controller.step(STEP, this.controls.takeStepInput());
      this.accumulator -= STEP;

      if (this.controller.fellOut) {
        this.respawn();
        break;
      }
      this.recordTrail();
    }

    // Interpolate between the previous and current simulation states.
    const alpha = this.accumulator / STEP;
    const rx = this.prevX + (this.controller.x - this.prevX) * alpha;
    const ry = this.prevY + (this.controller.y - this.prevY) * alpha;

    this.playerRect.setPosition(rx * CELL_PX, ry * CELL_PX);
    this.playerRect.setFillStyle(this.controller.wallSliding ? COLORS.playerWallSlide : COLORS.player);

    this.followCam.update(frameDt, this.cameraTarget(rx, ry));
    this.cameras.main.setScroll(this.followCam.x * CELL_PX, this.followCam.y * CELL_PX);

    this.drawTrail();
    this.updateHud();
  }

  private cameraTarget(x: number, y: number) {
    const m = tuning.movement;
    return { cx: x + m.bodyWidth / 2, cy: y + m.bodyHeight / 2, facing: this.controller.facing };
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
      markers.fillStyle(COLORS.finish, 1);
      markers.fillRect(f.x * CELL_PX + 6, f.y * CELL_PX + 6, CELL_PX - 12, CELL_PX - 12);
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

    const c = this.controller;
    let state = c.grounded ? "au sol" : c.vy < 0 ? "en saut" : "en chute";
    if (c.wallSliding) state = "glisse au mur";
    else if (!c.grounded && c.wallSide !== 0) state += c.wallSide < 0 ? " · mur à gauche" : " · mur à droite";
    liveStats.vx = c.vx;
    liveStats.vy = c.vy;
    liveStats.state = state;

    if (!debugView.showHud) return;
    this.hud.setText([
      "Q/A ← · D → · Espace/Z/↑ saut · R recommencer · manette compatible",
      `état : ${state}`,
    ]);
  }
}
