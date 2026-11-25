/**
 * The co-op mode's story intro: how Ruben, student in BUT Informatique at the IUT de Rodez, lost in
 * class, always at the gym, ends up tied to his friends by a rope (see introContract.ts for how the
 * game uses this scene).
 *
 * The story itself is a pure script (timeline.ts): shots, timings and words. This scene only keeps
 * the clock, listens for "skip", and asks the current shot to paint the picture for the current
 * second. Nothing is tweened or accumulated, so the intro can start anywhere (startAt) and be
 * started again and again on the same scene object.
 *
 * Contract kept here: onDone is called exactly once (false at the end, true on skip); after it the
 * last frame stays up and the scene starts nothing; when the game stops the scene, everything it
 * added (the HTML layer, the listeners) is removed and onDone is not called.
 */
import Phaser from "phaser";
import { drawCover } from "./covers";
import { INTRO_SCENE_KEY, type IntroSceneData } from "./introContract";
import { IntroHud } from "./introHud";
import { SCREEN_H, SCREEN_W, type Point, type Shot, type ShotContext } from "./shot";
import { AmphiShot } from "./shots/amphi";
import { CampusShot } from "./shots/campus";
import { DeadlineShot } from "./shots/deadline";
import { GymShot } from "./shots/gym";
import { NightShot } from "./shots/night";
import { RescueShot } from "./shots/rescue";
import { TitleShot } from "./shots/title";
import type { G } from "./sketch";
import { buildScript, hudLinesAt, sanitizeCast, stateAt, type Line, type Script, type ShotId } from "./timeline";

/** Never advance the story by more than this in one frame (tab in the background, a stall...). */
const MAX_FRAME_TIME = 0.25;
const SKIP_KEYS = new Set(["Enter", "NumpadEnter", "Space"]);
/** Gamepad buttons that skip: A and Start (standard mapping). */
const SKIP_PAD_BUTTONS = [0, 9];

export class IntroScene extends Phaser.Scene {
  private sceneData!: IntroSceneData;
  private script!: Script;
  private shots = new Map<ShotId, Shot>();
  private coverG!: G;
  private hud: IntroHud | null = null;
  /** Story time, seconds. Stops at the end, and freezes as soon as the player skips. */
  private t = 0;
  /** Clock for what goes on after the story has ended (blinks, wobbles): it only stops on a skip. */
  private life = 0;
  private lastNow = 0;
  private done = false;
  private frozen = false;
  private debugPaused = false;
  /** True while a skip button of a gamepad is held, so that one press skips once. */
  private padHeld = true;
  private shown: ShotId | null = null;
  private hudLines: Line[] = [];
  private anchorPoint: Point = { x: 0, y: 0 };

  private onKey = (e: KeyboardEvent): void => {
    if (!SKIP_KEYS.has(e.code)) return;
    const target = e.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    e.preventDefault();
    // A key still held from the previous screen must not skip the intro it has just started.
    if (e.repeat) return;
    this.finish(true);
  };

  constructor() {
    super(INTRO_SCENE_KEY);
  }

  create(data: IntroSceneData): void {
    // Phaser reuses the scene object: everything is rebuilt from scratch on every start.
    this.sceneData = data;
    const cast = sanitizeCast(data?.cast);
    this.script = buildScript(cast);
    this.t = Math.min(Math.max(0, Number.isFinite(data?.startAt) ? (data.startAt as number) : 0), this.script.duration);
    this.life = 0;
    this.lastNow = performance.now();
    this.done = false;
    this.frozen = false;
    this.debugPaused = false;
    this.padHeld = true;
    this.shown = null;
    this.hudLines.length = 0;
    this.cameras.main.setZoom(1).setScroll(0, 0);

    const ctx: ShotContext = { scene: this, cast, script: this.script };
    this.shots.clear();
    for (const shot of [
      new CampusShot(ctx),
      new AmphiShot(ctx),
      new GymShot(ctx),
      new NightShot(ctx),
      new DeadlineShot(ctx),
      new RescueShot(ctx),
      new TitleShot(ctx),
    ]) {
      this.shots.set(shot.id, shot);
    }
    this.coverG = this.add.graphics().setDepth(10);

    this.hud = new IntroHud(SCREEN_W, SCREEN_H, this.script.shots.length, () => this.finish(true));
    window.addEventListener("keydown", this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.onKey);
      this.hud?.destroy();
      this.hud = null;
      this.shots.clear();
      this.shown = null;
      // Stopped from outside: onDone is not called.
      this.done = true;
    });
    this.paint();
  }

  override update(): void {
    const now = performance.now();
    const dt = Math.min(MAX_FRAME_TIME, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;
    this.pollGamepads();
    if (this.done && this.hud === null) return;
    if (!this.debugPaused && !this.frozen) {
      this.t = Math.min(this.script.duration, this.t + dt);
      this.life += dt;
    }
    this.paint();
    if (this.t >= this.script.duration) this.finish(false);
  }

  /** Development aid (browser tests, screenshots): jump to second `t`, optionally holding there. */
  debugSeek(t: number, pause = true): void {
    this.t = Math.min(Math.max(0, t), this.script.duration);
    this.debugPaused = pause;
    this.lastNow = performance.now();
  }

  private paint(): void {
    const hud = this.hud;
    if (!hud) return;
    const state = stateAt(this.script, this.t);
    if (this.shown !== state.shot.id) {
      if (this.shown) this.shots.get(this.shown)?.setVisible(false);
      this.shown = state.shot.id;
      this.shots.get(this.shown)?.setVisible(true);
    }
    const shot = this.shots.get(state.shot.id);
    shot?.draw(state.u, this.life);

    this.coverG.clear();
    if (state.cover) drawCover(this.coverG, state.cover.kind, state.cover.p);

    hud.fitTo(this.game.canvas);
    hud.setProgress(state.shot.index, this.done);
    let caption: Line | null = null;
    let bubbles = 0;
    const lines = this.frozen ? this.hudLines : hudLinesAt(this.script, state.t, this.hudLines);
    for (const line of lines) {
      if (line.kind === "caption") caption = line;
      else if (line.kind === "bubble" && line.speaker && bubbles < 2 && shot?.anchor(line.speaker, this.anchorPoint)) {
        hud.setBubble(bubbles++, line.id, line.text, this.anchorPoint.x, this.anchorPoint.y);
      }
    }
    for (let i = bubbles; i < 2; i++) hud.setBubble(i, null, "", 0, 0);
    hud.setCaption(caption ? caption.id : null, caption ? caption.text : "");
  }

  private pollGamepads(): void {
    if (this.done) return;
    let held = false;
    const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      for (const b of SKIP_PAD_BUTTONS) if (pad.buttons[b]?.pressed) held = true;
    }
    // Only a fresh press counts: a button held since the previous screen is ignored until released.
    if (held && !this.padHeld) this.finish(true);
    this.padHeld = held;
  }

  private finish(skipped: boolean): void {
    if (this.done) return;
    this.done = true;
    // A skipped intro freezes on its current frame; a finished one keeps breathing on its title.
    if (skipped) this.frozen = true;
    this.hud?.setProgress(stateAt(this.script, this.t).shot.index, true);
    this.sceneData?.onDone?.(skipped);
  }
}
