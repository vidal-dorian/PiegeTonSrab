/**
 * Interactive tutorial, 20 to 30 s (hard requirement from the game designer): run and jump,
 * drop a saw in a scripted rival's path and watch it die there (+1), stomp the rival (and
 * learn that a push into your own trap is worth +2), then reach the flag (+2, +1 if first).
 *
 * The script and its timings are a pure state machine (tutorial/flow.ts); this scene acts it
 * out with the real game pieces: the level drawing, LocalPlayer, the same contact rules as
 * GameScene (contactWith: stomp bounce, slam and stun, sideways shove), the same hazard check
 * for deaths. Deaths never end anything: the player is back at the step's checkpoint at once.
 * Every step can be skipped (Entrée / "Étape suivante"), and so can the whole tutorial (Échap /
 * "Passer le tuto"). Finishing or skipping sets localStorage "pts.tutorialDone" for the menu.
 */
import Phaser from "phaser";
import {
  bodiesOverlap,
  contactWith,
  parseLevel,
  prepareObjects,
  TIMING,
  withSolidObjects,
  type Level,
  type PlacedObject,
} from "@game/shared";
import { CELL_PX } from "../config";
import { drawDashedRect } from "../debug/editor";
import { InputSource } from "../input";
import { Effects } from "../render/effects";
import { drawLevel, FONT_MARKER, INK, INK_CSS, ORANGE, RED } from "../render/levelView";
import { ObjectViews } from "../render/objectViews";
import { PlayerView, PLAYER_COLORS } from "../render/playerView";
import { Stains } from "../render/stains";
import { LocalPlayer, STEP } from "../sim/localPlayer";
import { tuning } from "../tuningStore";
import { TutorialFlow, TUTORIAL_BURSTS, type FlowEvent, type GoalId } from "../tutorial/flow";
import { TutorialHud } from "../tutorial/hud";
import { CHECKPOINTS, isLaneCell, TUTO, TUTORIAL_LEVEL, type Cell } from "../tutorial/level";
import { ScriptedRival, type RivalDeath } from "../tutorial/rival";
import { overlay } from "../ui/overlay";
import { menuScreen } from "../ui/screens";

/** Read by the menu (ui/screens.ts) to stop pointing first-time players at the tutorial. */
const DONE_KEY = "pts.tutorialDone";
/** Never simulate more than this much time in one frame (tab in background, debugger pause...). */
const MAX_FRAME_TIME = 0.25;
/** Owner id of the player's saw: any id other than the rival's, so the kill is "in YOUR trap". */
const ME = "me";
const SAW_ID = 1;
/** Id of the see-through saw that follows the mouse over the lane (placement preview). */
const GHOST_ID = 99;
const PLAYER_COLOR = PLAYER_COLORS[2];
const RIVAL_COLOR = PLAYER_COLORS[3];
const STOMP_REPEAT = TIMING.stompCooldown / 1000;
/** Entrée on the end card only counts as "Jouer" after this long, ms. */
const END_KEY_DELAY_MS = 700;

export class TutorialScene extends Phaser.Scene {
  private level!: Level;
  private objects: PlacedObject[] = [];
  private flow!: TutorialFlow;
  private hud!: TutorialHud;
  private controls!: InputSource;
  private player!: LocalPlayer;
  private rival!: ScriptedRival;
  private checkpoint: Cell = CHECKPOINTS.move;

  private playerView!: PlayerView;
  private rivalView!: PlayerView;
  private objectViews!: ObjectViews;
  private stains!: Stains;
  private effects!: Effects;
  private laneGfx!: Phaser.GameObjects.Graphics;
  private arrowGfx!: Phaser.GameObjects.Graphics;
  private rivalLabel!: Phaser.GameObjects.Text;

  private hover: Cell | null = null;
  /** What the placement preview currently shows ("" for nothing), to resync views only on change. */
  private ghostKey = "";
  private touching = false;
  private lastStompAt = -Infinity;
  private cleanup: Array<() => void> = [];
  /** performance.now() at the previous frame: the script runs on real time (see update). */
  private lastNow = 0;
  private endShownAt = 0;

  constructor() {
    super("tutorial");
  }

  create(): void {
    // The scene object is reused by "Revoir", so reset everything here, not in field initialisers.
    overlay.hideAll();
    menuScreen.hide();
    this.level = parseLevel(TUTORIAL_LEVEL);
    this.objects = [];
    this.hover = null;
    this.ghostKey = "";
    this.touching = false;
    this.lastStompAt = -Infinity;
    this.cleanup = [];
    this.lastNow = performance.now();
    this.checkpoint = CHECKPOINTS.move;
    // The whole level is one screen.
    this.cameras.main.setZoom(1).setScroll(0, 0);

    drawLevel(this, this.level);
    this.stains = new Stains(this);
    this.objectViews = new ObjectViews(this);
    this.laneGfx = this.add.graphics().setDepth(3);
    this.rivalView = new PlayerView(this, RIVAL_COLOR);
    this.playerView = new PlayerView(this, PLAYER_COLOR);
    this.arrowGfx = this.add.graphics().setDepth(5);
    this.effects = new Effects(this);
    this.rivalLabel = this.add
      .text(0, 0, "le rival", { fontFamily: FONT_MARKER, fontSize: "20px", color: INK_CSS, stroke: "#ffffff", strokeThickness: 5 })
      .setOrigin(0.5, 1)
      .setDepth(5)
      .setRotation(-0.06)
      .setVisible(false);

    const collision = withSolidObjects(this.level, this.objects);
    // No finish for LocalPlayer: the flag only counts in the last step, and this scene checks it.
    this.player = new LocalPlayer({ ...this.level, finish: null }, collision, tuning.movement);
    this.rival = new ScriptedRival(collision, tuning.movement);

    this.controls = new InputSource();
    this.controls.onKey = (code) => {
      if (code === "Escape") this.leave();
      else if (code === "Enter" || code === "NumpadEnter") {
        // A focused HUD button gets this Entrée as its own click: acting here too would do twice.
        if (this.hud.buttonFocused) return;
        // On the end card Entrée means "Jouer", but not straight away: someone pressing Entrée
        // repeatedly to skip the lines must get to see the card.
        if (!this.hud.endShown) this.handle(this.flow.next());
        else if (performance.now() - this.endShownAt > END_KEY_DELAY_MS) this.leave();
      }
    };
    this.hud = new TutorialHud({
      next: () => this.handle(this.flow.next()),
      skip: () => this.leave(),
      play: () => this.leave(),
      replay: () => this.scene.restart(),
    });
    this.listenToPointer();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.controls.destroy();
      this.objectViews.destroy();
      this.hud.destroy();
      for (const fn of this.cleanup) fn();
      this.game.canvas.style.cursor = "";
    });

    this.flow = new TutorialFlow();
    this.handle(this.flow.start());
    this.hud.fitTo(this.game.canvas, this.scale.width);
  }

  /** Called by the tuning panel whenever a value changes. */
  applyTuning(): void {
    this.player.controller.retune();
    this.rival.controller.retune();
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_TIME);
    // The 30 s budget is in real seconds, but Phaser's frame delta is smoothed and runs slow
    // when the frame rate drops (measured: 30 s of deltas in 32 s at 28 fps). So the script's
    // timers use the real time between frames, still capped (tab in background...).
    const now = performance.now();
    const realDt = Math.min((now - this.lastNow) / 1000, MAX_FRAME_TIME);
    this.lastNow = now;
    this.hud.fitTo(this.game.canvas, this.scale.width);
    this.hud.update(realDt);
    this.controls.poll();
    this.handle(this.flow.update(realDt));

    const outcome = this.player.advance(dt, () => this.controls.takeStepInput(), this.objects, () => this.afterStep());
    if (outcome?.kind === "died") this.playerDied(!outcome.fell);
    this.checkGoals();
    this.draw();
  }

  // --- Script ----------------------------------------------------------------------------

  private handle(events: FlowEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case "step":
          this.hud.setStep(e.number, this.flow.stepCount);
          this.checkpoint = CHECKPOINTS[e.step];
          if (e.step === "trap") this.spawnRival(TUTO.rivalLedge);
          if (e.step === "stomp") this.spawnRival(TUTO.rivalGround);
          break;
        case "goal":
          this.hud.setPrompt(e.goal.prompt, e.goal.sub, false);
          if (e.goal.id === "rivalDies") this.rival.mode = "runLeft";
          break;
        case "help":
          this.help(e.goal);
          break;
        case "outro":
          this.hud.setPrompt(e.outro.text, e.outro.sub, true);
          break;
        case "done":
          this.markDone();
          this.hud.showEnd();
          this.endShownAt = performance.now();
          break;
      }
    }
  }

  /** The player took too long (or skipped): act the goal out so the next one makes sense. */
  private help(goal: GoalId): void {
    const m = tuning.movement;
    switch (goal) {
      case "marker":
        this.teleport(TUTO.marker);
        break;
      case "place":
        if (!this.objects.some((o) => o.id === SAW_ID)) this.placeSaw(TUTO.autoSaw);
        break;
      case "rivalDies":
        if (this.rival.alive) this.rivalDied({ killer: this.objects.find((o) => o.id === SAW_ID) ?? null, fell: false });
        break;
      case "stomp": {
        // Drop the player right on the rival's head: the same stomp as the real one.
        const r = this.rival.controller;
        const c = this.player.controller;
        c.standInCell(Math.floor(r.x + m.bodyWidth / 2), Math.floor(r.y + m.bodyHeight / 2));
        c.y = r.y - m.bodyHeight;
        this.player.prevX = c.x;
        this.player.prevY = c.y;
        this.stomp();
        break;
      }
      case "flag":
        this.teleport(TUTO.flag);
        break;
    }
  }

  private checkGoals(): void {
    const goal = this.flow.goal;
    if (!goal) return;
    const c = this.player.controller;
    const m = tuning.movement;
    if (goal === "marker" && this.player.centre().x >= TUTO.marker.x) this.handle(this.flow.reach("marker"));
    if (goal === "flag") {
      const f = TUTO.flag;
      if (c.x < f.x + 1 && c.x + m.bodyWidth > f.x && c.y < f.y + 1 && c.y + m.bodyHeight > f.y) {
        const p = this.player.centre();
        this.effects.pof(p.x, p.y - m.bodyHeight / 2, TUTORIAL_BURSTS.flag);
        this.handle(this.flow.reach("flag"));
      }
    }
  }

  private leave(): void {
    this.markDone();
    this.scene.start("menu");
  }

  private markDone(): void {
    try {
      localStorage.setItem(DONE_KEY, "1");
    } catch {
      // Storage blocked (private window...): the menu will just keep suggesting the tutorial.
    }
  }

  // --- World ---------------------------------------------------------------------------------

  /** After every player step: the rival moves too, then contacts between the two bodies. */
  private afterStep(): void {
    const death = this.rival.step(STEP, this.objects, this.player.time);
    if (death) this.rivalDied(death);
    if (!this.rival.alive) {
      this.touching = false;
      return;
    }
    // Same rules as GameScene.checkContacts, with the rival's real position.
    const m = tuning.movement;
    const c = this.player.controller;
    const r = this.rival.controller;
    const me = { x: c.x, y: c.y };
    const other = { x: r.x, y: r.y };
    const contact = contactWith(me, this.player.prevY, c.vy, other, m.bodyWidth, m.bodyHeight, this.touching);
    if (contact === "stomp" && this.player.time - this.lastStompAt >= STOMP_REPEAT) this.stomp();
    else if (contact === "bump") {
      const away = Math.sign(c.x - r.x) || -1;
      c.shove(away * m.shoveSpeed, m.shoveLock);
      r.shove(-away * m.shoveSpeed, m.shoveLock);
      this.effects.puff((c.x + r.x) / 2 + m.bodyWidth / 2, c.y + m.bodyHeight / 2);
    }
    this.touching = bodiesOverlap({ x: c.x, y: c.y }, { x: r.x, y: r.y }, m.bodyWidth, m.bodyHeight);
  }

  /** The player lands on the rival's head: bounce up, the rival is slammed and stunned. */
  private stomp(): void {
    const m = tuning.movement;
    const r = this.rival.controller;
    this.lastStompAt = this.player.time;
    this.player.controller.launch(m.stompBounceHeight, true);
    r.slam(m.stompSlamSpeed, m.stunTime);
    this.rivalView.squash();
    this.effects.pof(r.x + m.bodyWidth / 2, r.y);
    this.handle(this.flow.reach("stomp"));
  }

  private spawnRival(cell: Cell): void {
    this.rival.spawn(cell.x, cell.y, -1);
    const p = this.rival.centre();
    this.effects.puff(p.x, p.y);
    this.touching = false;
  }

  private rivalDied(death: RivalDeath): void {
    const p = this.rival.centre();
    this.rival.kill();
    if (!death.fell) this.stains.add(p.x, p.y, RIVAL_COLOR);
    // In the player's trap: the trap owner scores, which is the lesson.
    if (death.killer?.ownerId === ME) this.effects.pof(p.x, p.y - 0.4, TUTORIAL_BURSTS.kill);
    this.handle(this.flow.reach("rivalDies"));
  }

  private playerDied(leaveStain: boolean): void {
    if (leaveStain) {
      const p = this.player.centre();
      this.stains.add(p.x, p.y, PLAYER_COLOR);
    }
    this.teleport(this.checkpoint);
    this.hud.flashSub("Oups ! On reprend d'ici.", 1.2);
  }

  /** Put the player standing in `cell` at once, with a puff. */
  private teleport(cell: Cell): void {
    const c = this.player.controller;
    c.standInCell(cell.x, cell.y);
    this.player.prevX = c.x;
    this.player.prevY = c.y;
    // Drop a jump pressed meanwhile so it doesn't fire on arrival.
    this.controls.takeStepInput();
    const p = this.player.centre();
    this.effects.puff(p.x, p.y);
  }

  private placeSaw(cell: Cell): void {
    const saw: PlacedObject = { id: SAW_ID, kind: "saw", x: cell.x, y: cell.y, ownerId: ME };
    this.objects = prepareObjects(this.level, [...this.objects.filter((o) => o.id !== SAW_ID), saw]);
    const collision = withSolidObjects(this.level, this.objects);
    this.player.setCollision(collision);
    this.rival.setCollision(collision);
    this.ghostKey = "";
    this.objectViews.sync(this.objects);
    this.effects.puff(cell.x + 0.5, cell.y + 0.5);
  }

  private canPlace(cell: Cell): boolean {
    return isLaneCell(cell.x, cell.y) && !this.objects.some((o) => o.id === SAW_ID);
  }

  private listenToPointer(): void {
    const canvas = this.game.canvas;
    const cellAt = (e: PointerEvent): Cell | null => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return null;
      const gx = ((e.clientX - rect.left) / rect.width) * this.scale.width;
      const gy = ((e.clientY - rect.top) / rect.height) * this.scale.height;
      const p = this.cameras.main.getWorldPoint(gx, gy);
      return { x: Math.floor(p.x / CELL_PX), y: Math.floor(p.y / CELL_PX) };
    };
    const move = (e: PointerEvent) => {
      this.hover = cellAt(e);
    };
    const leave = () => {
      this.hover = null;
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || this.flow.goal !== "place") return;
      const cell = cellAt(e);
      if (!cell) return;
      if (!this.canPlace(cell)) {
        this.hud.flashSub("Pas là : sur une case orange !", 1.2);
        return;
      }
      this.placeSaw(cell);
      this.handle(this.flow.reach("place"));
    };
    const menu = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("contextmenu", menu);
    this.cleanup.push(
      () => canvas.removeEventListener("pointermove", move),
      () => canvas.removeEventListener("pointerleave", leave),
      () => canvas.removeEventListener("pointerdown", down),
      () => canvas.removeEventListener("contextmenu", menu),
    );
  }

  // --- Drawing ---------------------------------------------------------------------------------

  private draw(): void {
    const m = tuning.movement;
    const now = this.time.now;
    const pos = this.player.renderPosition();
    this.playerView.update(pos.x, pos.y, this.player.controller, true);

    // The rival keeps looking at the player while it waits.
    const r = this.rival.controller;
    if (this.rival.alive && this.rival.mode === "idle" && r.stunTimer <= 0 && this.flow.phase.kind !== "done") {
      if (this.flow.goal !== "place") r.facing = this.player.controller.x < r.x ? -1 : 1;
    }
    const alpha = (this.player.renderTime() - this.player.time) / STEP;
    const rp = this.rival.renderPosition(alpha);
    this.rivalView.update(rp.x, rp.y, r, this.rival.alive);
    const step = this.flow.phase.kind === "done" ? null : this.flow.phase.step.id;
    const g = this.flow.goal;
    this.rivalLabel.setVisible(this.rival.alive && (g === "place" || g === "rivalDies" || g === "stomp"));
    // Above the path arrow on the ledge, above the goal arrow on the ground.
    this.rivalLabel.setPosition((rp.x + m.bodyWidth / 2) * CELL_PX, (rp.y - 0.15) * CELL_PX - (step === "stomp" ? 34 : 20));

    this.drawPlacement(now);
    this.objectViews.update(this.objects, this.player.renderTime());

    // A bobbing arrow over what to reach.
    this.arrowGfx.clear();
    const goal = this.flow.goal;
    const bob = Math.sin(now / 160) * 5;
    if (goal === "marker") this.drawArrow(TUTO.marker.x + 0.5, TUTO.marker.y + 0.1, bob);
    else if (goal === "stomp" && this.rival.alive) this.drawArrow(rp.x + m.bodyWidth / 2, rp.y - 0.15, bob);
    else if (goal === "flag") this.drawArrow(TUTO.flag.x + 0.3, TUTO.flag.y - 1.2, bob);
  }

  /** Lane highlight, hover box and the see-through saw under the mouse while placing. */
  private drawPlacement(now: number): void {
    const g = this.laneGfx;
    g.clear();
    const placing = this.flow.goal === "place";
    const hover = placing ? this.hover : null;
    const ok = hover !== null && this.canPlace(hover);
    this.game.canvas.style.cursor = ok ? "pointer" : "";

    const key = ok ? `${hover.x},${hover.y}` : "";
    if (key !== this.ghostKey) {
      this.ghostKey = key;
      if (ok) {
        const ghost: PlacedObject = { id: GHOST_ID, kind: "saw", x: hover.x, y: hover.y };
        this.objectViews.sync([...this.objects, ghost], new Set([GHOST_ID]));
      } else this.objectViews.sync(this.objects);
    }
    if (!placing) return;

    const { y, x0, x1 } = TUTO.lane;
    const pulse = 0.16 + 0.1 * Math.sin(now / 180);
    for (let x = x0; x <= x1; x++) {
      g.fillStyle(ORANGE, pulse);
      g.fillRect(x * CELL_PX + 2, y * CELL_PX + 2, CELL_PX - 4, CELL_PX - 4);
      g.lineStyle(2, ORANGE, 1);
      drawDashedRect(g, x * CELL_PX + 4, y * CELL_PX + 4, CELL_PX - 8, CELL_PX - 8);
    }
    // The rival's path, right to left, just above the lane.
    const py = (y - 0.35) * CELL_PX;
    const from = (TUTO.rivalLedge.x - 0.2) * CELL_PX;
    const to = (x0 + 0.1) * CELL_PX;
    g.lineStyle(3, INK, 0.8);
    for (let s = from; s > to + 6; s -= 14) g.lineBetween(s, py, Math.max(s - 7, to), py);
    g.fillStyle(INK, 0.8);
    g.fillTriangle(to - 4, py, to + 8, py - 7, to + 8, py + 7);

    if (hover) {
      g.lineStyle(4, ok ? ORANGE : RED, 1);
      drawDashedRect(g, hover.x * CELL_PX + 3, hover.y * CELL_PX + 3, CELL_PX - 6, CELL_PX - 6);
    }
  }

  /** Orange arrow pointing down at (x, y) cells, felt-pen outline and solid shadow. */
  private drawArrow(x: number, y: number, bob: number): void {
    const g = this.arrowGfx;
    const tx = x * CELL_PX;
    const ty = y * CELL_PX - 4 + bob;
    const shape = [
      [0, 0],
      [-15, -17],
      [-6, -17],
      [-6, -36],
      [6, -36],
      [6, -17],
      [15, -17],
    ];
    const pts = (dx: number, dy: number) => shape.map(([sx, sy]) => new Phaser.Math.Vector2(tx + sx! + dx, ty + sy! + dy));
    g.fillStyle(INK, 1);
    g.fillPoints(pts(3, 4), true);
    g.fillStyle(ORANGE, 1);
    g.fillPoints(pts(0, 0), true);
    g.lineStyle(2.5, INK, 1);
    g.strokePoints(pts(0, 0), true, true);
  }
}
