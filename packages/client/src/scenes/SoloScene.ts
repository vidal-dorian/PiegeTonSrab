/**
 * Free practice: one player alone in a level, unlimited attempts, debug editor to place
 * objects by hand. Death on traps or in pits, respawn at the start, ink stains, finish
 * line with a timer. Useful for tuning movement and trying objects outside the round loop.
 */
import Phaser from "phaser";
import {
  canPlaceAt,
  OBJECT_DEFS,
  parseLevel,
  prepareObjects,
  RACE_LEVELS,
  testLevel,
  vinesOf,
  withSolidObjects,
  type Level,
  type LevelDefinition,
  type ObjectKind,
  type PlacedObject,
} from "@game/shared";
import { FollowCamera } from "../camera";
import { CELL_PX, RESPAWN_DELAY, VIEW_CELLS_X, VIEW_CELLS_Y } from "../config";
import { DebugEditor } from "../debug/editor";
import { debugView, liveStats } from "../debug/debugState";
import { InputSource } from "../input";
import { drawLevel } from "../render/levelView";
import { ObjectViews } from "../render/objectViews";
import { PlayerView, PLAYER_COLORS } from "../render/playerView";
import { Stains } from "../render/stains";
import { LocalPlayer } from "../sim/localPlayer";
import { tuning } from "../tuningStore";

/** Never simulate more than this much time in one frame (tab was in background, debugger pause...). */
const MAX_FRAME_TIME = 0.25;
const TRAIL_LENGTH = 120;

const LEVELS: LevelDefinition[] = [...RACE_LEVELS, testLevel];
/** Best time per level name, kept while the page is open. */
const bestTimes = new Map<string, number>();

type Phase = "playing" | "dead" | "finished";

interface SceneData {
  levelIndex?: number;
}

export class SoloScene extends Phaser.Scene {
  private levelIndex = 0;
  private level!: Level;
  private objects: PlacedObject[] = [];
  private nextObjectId = 1;

  private player!: LocalPlayer;
  private followCam!: FollowCamera;
  private controls!: InputSource;
  private editor!: DebugEditor;
  private objectViews!: ObjectViews;
  private playerView!: PlayerView;
  private stains!: Stains;

  private phase: Phase = "playing";
  private deadTimer = 0;
  private deaths = 0;
  private message = "";

  private gridGfx!: Phaser.GameObjects.Graphics;
  private trailGfx!: Phaser.GameObjects.Graphics;
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
    this.level = parseLevel(LEVELS[this.levelIndex] ?? LEVELS[0]!);
    this.objects = prepareObjects(this.level, this.level.initialObjects);
    this.nextObjectId = 1;
    this.deaths = 0;
    this.trail = [];

    this.player = new LocalPlayer(this.level, withSolidObjects(this.level, this.objects), tuning.movement);
    this.player.vines = vinesOf(this.objects);
    this.player.onBounce = (cell) => {
      const spring = this.objects.find((o) => o.kind === "spring" && o.y * this.level.width + o.x === cell);
      if (spring) this.objectViews.bounce(spring.id);
    };
    this.followCam = new FollowCamera(tuning.camera, VIEW_CELLS_X, VIEW_CELLS_Y, this.level.width, this.level.height);

    this.gridGfx = drawLevel(this, this.level).grid;
    this.stains = new Stains(this);
    this.objectViews = new ObjectViews(this);
    this.objectViews.sync(this.objects);
    this.trailGfx = this.add.graphics().setDepth(3);
    this.playerView = new PlayerView(this, PLAYER_COLORS[2]);

    this.hud = this.add
      .text(56, 12, "", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#161616",
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
      if (code === "Escape") this.scene.start("menu");
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
    this.player.controller.retune();
    this.playerView.applyTuning();
  }

  respawn(): void {
    this.player.reset();
    this.phase = "playing";
    this.message = "";
    this.trail = [];
    // Drop a jump pressed while dead so it doesn't fire on the first step.
    this.controls.takeStepInput();
    this.followCam.snapTo(this.cameraTarget());
  }

  override update(_time: number, deltaMs: number): void {
    const frameDt = Math.min(deltaMs / 1000, MAX_FRAME_TIME);
    this.controls.poll();

    if (this.phase === "playing") {
      const outcome = this.player.advance(
        frameDt,
        () => this.controls.takeStepInput(),
        this.objects,
        () => this.recordTrail(),
      );
      if (outcome?.kind === "died") this.die(outcome.killer, !outcome.fell);
      else if (outcome?.kind === "finished") this.finish(outcome.time);
    } else if (this.phase === "dead") {
      this.deadTimer -= frameDt;
      if (this.deadTimer <= 0) this.respawn();
    }

    const pos = this.player.renderPosition();
    this.playerView.update(pos.x, pos.y, this.player.controller, this.phase !== "dead");
    const swing = this.player.controller.swing;
    const m = tuning.movement;
    const holders = new Map<number, { x: number; y: number }>();
    if (swing && this.phase !== "dead") holders.set(swing.vineId, { x: pos.x + m.bodyWidth / 2, y: pos.y + m.bodyHeight / 2 });
    this.objectViews.update(this.objects, this.player.renderTime(), { holders });

    if (this.phase !== "dead") this.followCam.update(frameDt, this.cameraTarget());
    this.cameras.main.setScroll(this.followCam.x * CELL_PX, this.followCam.y * CELL_PX);

    this.editor.update();
    this.drawTrail();
    this.updateHud();
  }

  private die(killer: PlacedObject | null, leaveStain: boolean): void {
    this.phase = "dead";
    this.deadTimer = RESPAWN_DELAY;
    this.deaths++;
    this.message = killer ? `Touché : ${OBJECT_DEFS[killer.kind].name}` : "Tombé !";
    if (leaveStain) {
      const c = this.player.centre();
      this.stains.add(c.x, c.y, this.playerView.color);
    }
  }

  private finish(t: number): void {
    this.phase = "finished";
    const best = bestTimes.get(this.level.name);
    const record = best === undefined || t < best;
    if (record) bestTimes.set(this.level.name, t);
    this.message = `Arrivée ! ${t.toFixed(2)} s${record ? " · record" : ""}\nR pour rejouer`;
  }

  private canPlace(x: number, y: number): boolean {
    if (!canPlaceAt(this.level, this.objects, x, y)) return false;
    // Never place a platform inside the character.
    const m = tuning.movement;
    const c = this.player.controller;
    return !(c.x < x + 1 && c.x + m.bodyWidth > x && c.y < y + 1 && c.y + m.bodyHeight > y);
  }

  private toggleObjectAt(x: number, y: number, kind: ObjectKind): void {
    const existing = this.objects.findIndex((o) => o.x === x && o.y === y);
    if (existing >= 0) this.objects.splice(existing, 1);
    else if (this.canPlace(x, y)) {
      const obj: PlacedObject = { id: this.nextObjectId++, kind, x, y };
      if (OBJECT_DEFS[kind].rotatable) obj.dir = this.editor.dir;
      this.objects.push(obj);
    } else return;
    this.objects = prepareObjects(this.level, this.objects);
    this.player.setCollision(withSolidObjects(this.level, this.objects));
    this.player.vines = vinesOf(this.objects);
    // Removed (or shortened) the vine we hang from: let go.
    const s = this.player.controller.swing;
    if (s && !this.player.vines.some((v) => v.id === s.vineId && s.length <= v.length + 1e-9)) {
      this.player.letGo();
    }
    this.objectViews.sync(this.objects);
  }

  private cameraTarget() {
    const p = this.player.renderPosition();
    const m = tuning.movement;
    const c = this.player.controller;
    return { cx: p.x + m.bodyWidth / 2, cy: p.y + m.bodyHeight / 2, vx: c.vx, grounded: c.grounded, facing: c.facing };
  }

  private recordTrail(): void {
    // One point every 2 steps: at 120 Hz that is a dot every 1/60 s, about 1 s of history.
    if (++this.trailStepCounter % 2 !== 0) return;
    const m = tuning.movement;
    const c = this.player.controller;
    this.trail.push({ x: c.x + m.bodyWidth / 2, y: c.y + m.bodyHeight });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
  }

  private drawTrail(): void {
    this.trailGfx.clear();
    if (!debugView.showTrail) return;
    this.trail.forEach((p, i) => {
      this.trailGfx.fillStyle(this.playerView.color, 0.15 + (0.45 * i) / this.trail.length);
      this.trailGfx.fillRect(p.x * CELL_PX - 2, p.y * CELL_PX - 2, 4, 4);
    });
  }

  private updateHud(): void {
    this.gridGfx.setVisible(debugView.showGrid);
    this.hud.setVisible(debugView.showHud);
    this.banner.setVisible(this.message !== "");
    this.banner.setText(this.message);
    this.banner.setColor(this.phase === "dead" ? "#b3361a" : "#161616");

    const c = this.player.controller;
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
      "Q/A ← · D → · Espace/Z/↑ saut · S/↓ lâcher la liane · R recommencer · N niveau suivant · Échap menu",
      `${this.level.name} · temps ${this.player.time.toFixed(2)} s · record ${best !== undefined ? best.toFixed(2) + " s" : "-"} · morts ${this.deaths}`,
      this.editor.status(),
    ]);
  }
}
