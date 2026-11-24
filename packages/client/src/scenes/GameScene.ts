/**
 * Build step 3: the round loop on one machine with one player.
 *
 * Each round: placement (draw and place on a zoomed-out view of the whole level, with the
 * check that the finish stays reachable), a short countdown, the race (one life, timer),
 * then the score. The level is kept for the whole game, so objects and stains accumulate.
 * The game ends at the end of the round in which someone reaches the target score alone.
 *
 * The rules themselves (draw, scoring, end of game, reachability) live in the shared
 * package so the server can run the same code in build step 4.
 */
import Phaser from "phaser";
import {
  buildReachGraph,
  canPlaceAt,
  createRng,
  DEFAULT_GAME_CONFIG,
  drawOffer,
  gameWinner,
  OBJECT_DEFS,
  objectsForRound,
  parseLevel,
  placementKeepsPath,
  RACE_LEVELS,
  scoreRound,
  withSolidObjects,
  type GameConfig,
  type Level,
  type ObjectKind,
  type PlacedObject,
  type RaceResult,
  type ReachGraph,
} from "@game/shared";
import { FollowCamera } from "../camera";
import { CELL_PX, VIEW_CELLS_X, VIEW_CELLS_Y } from "../config";
import { drawDashedRect } from "../debug/editor";
import { debugView } from "../debug/debugState";
import { InputSource } from "../input";
import { drawLevel } from "../render/levelView";
import { ObjectViews } from "../render/objectViews";
import { PlayerView, PLAYER_COLORS } from "../render/playerView";
import { Stains } from "../render/stains";
import { LocalPlayer } from "../sim/localPlayer";
import { tuning } from "../tuningStore";
import { overlay, type TopBarState } from "../ui/overlay";

const MAX_FRAME_TIME = 0.25;
const COUNTDOWN_TIME = 1.5;
/** Pause after a death or a finish before the score appears, seconds. */
const RACE_END_PAUSE = 1.2;
/** Gap kept between the level and the top bar / tray in the placement view, CSS pixels. */
const PLACEMENT_MARGIN_PX = 8;

interface Player {
  id: string;
  name: string;
  color: number;
}

type Phase = "placement" | "countdown" | "race" | "score" | "over";

interface Verdict {
  ok: boolean;
  /** The cell holds one of this round's objects: clicking takes it back. */
  takeBack: boolean;
  text: string;
}

interface SceneData {
  targetScore?: number;
  levelIndex?: number;
}

export class GameScene extends Phaser.Scene {
  private cfg!: GameConfig;
  private levelIndex = 0;
  private level!: Level;
  private players: Player[] = [];
  private me!: Player;
  private scores = new Map<string, number>();
  private round = 0;
  private rng!: () => number;

  /** Objects validated in previous rounds. */
  private objects: PlacedObject[] = [];
  /** This round's placements, not validated yet. */
  private pending: Array<PlacedObject & { card: number }> = [];
  private nextObjectId = 1;
  private offer: Array<{ kind: ObjectKind; used: boolean }> = [];
  private selected: number | null = null;
  private needed = 0;
  private graph: ReachGraph | null = null;
  private verdicts = new Map<string, Verdict>();
  private hover: { x: number; y: number } | null = null;

  private phase: Phase = "placement";
  private phaseLeft = 0;
  private raceEnded = false;
  private raceResult: RaceResult | null = null;

  private player!: LocalPlayer;
  private playerView!: PlayerView;
  private followCam!: FollowCamera;
  private objectViews!: ObjectViews;
  private stains!: Stains;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private controls!: InputSource;
  private lastTopBar = "";
  private cleanup: Array<() => void> = [];

  constructor() {
    super("game");
  }

  create(data: SceneData): void {
    this.cfg = { ...DEFAULT_GAME_CONFIG, targetScore: data.targetScore ?? DEFAULT_GAME_CONFIG.targetScore };
    // Hand-made level; it starts with no objects, players fill it round after round.
    this.levelIndex = data.levelIndex ?? 0;
    this.level = parseLevel(RACE_LEVELS[this.levelIndex] ?? RACE_LEVELS[0]!);
    this.me = { id: "moi", name: "Toi", color: PLAYER_COLORS[2] };
    this.players = [this.me];
    this.scores = new Map(this.players.map((p) => [p.id, 0]));
    this.round = 0;
    this.rng = createRng(Date.now() >>> 0);
    this.objects = [];
    this.pending = [];
    this.nextObjectId = 1;
    this.lastTopBar = "";
    this.cleanup = [];

    this.gridGfx = drawLevel(this, this.level).grid;
    this.stains = new Stains(this);
    this.objectViews = new ObjectViews(this);
    this.preview = this.add.graphics().setDepth(5);
    this.playerView = new PlayerView(this, this.me.color);
    this.player = new LocalPlayer(this.level, this.level, tuning.movement);
    this.followCam = new FollowCamera(tuning.camera, VIEW_CELLS_X, VIEW_CELLS_Y, this.level.width, this.level.height);

    this.controls = new InputSource();
    this.controls.onKey = (code) => this.onKey(code);
    this.listenToPointer();
    // Wait a frame so Phaser has resized the canvas first.
    const onResize = () => requestAnimationFrame(() => this.fitPlacementView());
    window.addEventListener("resize", onResize);
    this.cleanup.push(() => window.removeEventListener("resize", onResize));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.controls.destroy();
      for (const fn of this.cleanup) fn();
      this.objectViews.destroy();
      overlay.hideAll();
    });

    this.startPlacement();
  }

  /** Called by the tuning panel whenever a value changes. */
  applyTuning(): void {
    this.player.controller.retune();
    this.playerView.applyTuning();
    if (this.phase === "placement") this.rebuildGraph();
  }

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_TIME);
    this.controls.poll();
    this.gridGfx.setVisible(debugView.showGrid);

    switch (this.phase) {
      case "placement":
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) this.endPlacement();
        else this.drawPreview();
        break;
      case "countdown":
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) this.startRace();
        break;
      case "race":
        this.updateRace(dt);
        break;
      case "score":
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) this.afterScore();
        break;
      case "over":
        break;
    }

    const pos = this.player.renderPosition();
    const dead = this.phase === "race" && this.raceEnded && this.raceResult?.finishTime === null;
    this.playerView.update(pos.x, pos.y, this.player.controller, !dead);
    this.objectViews.update(this.allObjects(), this.phase === "race" ? this.player.renderTime() : 0);

    if (this.phase === "race" || this.phase === "countdown") {
      if (!dead) this.followCam.update(dt, this.cameraTarget());
      this.cameras.main.setScroll(this.followCam.x * CELL_PX, this.followCam.y * CELL_PX);
    }
    this.updateTopBar();
  }

  // --- Placement -------------------------------------------------------------

  private startPlacement(): void {
    this.round++;
    this.phase = "placement";
    this.phaseLeft = this.cfg.placementTime;
    this.needed = objectsForRound(this.cfg, this.round);
    this.offer = drawOffer(this.rng, this.needed + this.cfg.extraOffered).map((kind) => ({ kind, used: false }));
    this.selected = 0;
    this.pending = [];
    this.player.reset();
    this.rebuildGraph();

    overlay.hideScores();
    overlay.hideBanner();
    overlay.setHelp("Clic : poser ou reprendre · 1 à 5 : choisir un objet · Échap : menu");
    this.renderTray();
    this.updateTopBar();
    this.fitPlacementView();
  }

  /** Zoom out so the whole level fits in the part of the screen not covered by the top bar and the tray. */
  private fitPlacementView(): void {
    if (this.phase !== "placement") return;
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    if (rect.height === 0) return;
    const toGame = this.scale.height / rect.height;
    const free = overlay.freeArea();
    const top = (Math.max(rect.top, free.top + PLACEMENT_MARGIN_PX) - rect.top) * toGame;
    const bottom = (Math.min(rect.bottom, free.bottom - PLACEMENT_MARGIN_PX) - rect.top) * toGame;
    const availH = Math.max(bottom - top, this.scale.height * 0.25);

    const w = this.level.width * CELL_PX;
    const h = this.level.height * CELL_PX;
    const zoom = Math.min(this.scale.width / w, availH / h);
    cam.setZoom(zoom);
    // centerOn puts a world point at the middle of the screen; shift it so the level sits in the free area.
    const wantedScreenY = top + availH / 2;
    cam.centerOn(w / 2, h / 2 + (this.scale.height / 2 - wantedScreenY) / zoom);
  }

  private allObjects(): PlacedObject[] {
    return [...this.objects, ...this.pending];
  }

  /** Recompute the reachability graph for the current objects; verdicts depend on it. */
  private rebuildGraph(): void {
    this.graph = buildReachGraph(this.level, this.allObjects(), tuning.movement);
    this.verdicts.clear();
    this.objectViews.sync(this.allObjects(), new Set(this.pending.map((p) => p.id)));
  }

  private verdictAt(x: number, y: number): Verdict {
    if (this.pending.some((p) => p.x === x && p.y === y)) {
      return { ok: true, takeBack: true, text: "Clic : reprendre cet objet" };
    }
    const kind = this.selected !== null ? this.offer[this.selected]?.kind : undefined;
    if (!kind) return { ok: false, takeBack: false, text: this.pending.length >= this.needed ? "Tout est posé : valide" : "Choisis un objet" };

    const key = `${x},${y},${kind}`;
    const cached = this.verdicts.get(key);
    if (cached) return cached;

    const all = this.allObjects();
    const l = this.level;
    let v: Verdict;
    if (x < 0 || x >= l.width || y < 0 || y >= l.height || l.solid[y * l.width + x]) {
      v = { ok: false, takeBack: false, text: "Pas dans le décor" };
    } else if ((x === l.start.x && y === l.start.y) || (l.finish && x === l.finish.x && y === l.finish.y)) {
      v = { ok: false, takeBack: false, text: "Pas sur le départ ni sur l'arrivée" };
    } else if (!canPlaceAt(l, all, x, y)) {
      v = { ok: false, takeBack: false, text: "Case déjà prise" };
    } else if (!placementKeepsPath(l, all, { id: 0, kind, x, y }, tuning.movement, this.graph ?? undefined)) {
      v = { ok: false, takeBack: false, text: "Bloquerait le chemin vers l'arrivée" };
    } else {
      v = { ok: true, takeBack: false, text: `Poser : ${OBJECT_DEFS[kind].name}` };
    }
    this.verdicts.set(key, v);
    return v;
  }

  private clickCell(x: number, y: number): void {
    if (this.phase !== "placement") return;
    const v = this.verdictAt(x, y);
    if (!v.ok) return;
    if (v.takeBack) {
      const i = this.pending.findIndex((p) => p.x === x && p.y === y);
      const [taken] = this.pending.splice(i, 1);
      if (taken) {
        this.offer[taken.card]!.used = false;
        this.selected = taken.card;
      }
    } else if (this.selected !== null) {
      const card = this.selected;
      const kind = this.offer[card]!.kind;
      this.pending.push({ id: this.nextObjectId++, kind, x, y, ownerId: this.me.id, card });
      this.offer[card]!.used = true;
      this.selected = this.pending.length < this.needed ? this.nextFreeCard() : null;
    }
    this.rebuildGraph();
    this.renderTray();
  }

  private nextFreeCard(): number | null {
    const i = this.offer.findIndex((c) => !c.used);
    return i >= 0 ? i : null;
  }

  private selectCard(i: number): void {
    if (this.phase !== "placement") return;
    const card = this.offer[i];
    if (!card || card.used || this.pending.length >= this.needed) return;
    this.selected = i;
    this.renderTray();
  }

  private currentHint(): { text: string; bad: boolean } {
    const v = this.hover ? this.verdictAt(this.hover.x, this.hover.y) : null;
    const idle = this.pending.length >= this.needed ? "Tout est posé : valide" : "Survole le niveau pour poser";
    return { text: v?.text ?? idle, bad: v !== null && !v.ok };
  }

  /** Rebuild the tray; only on state changes (selection, placement), never on hover. */
  private renderTray(): void {
    const hint = this.currentHint();
    overlay.showTray(
      {
        cards: this.offer,
        selected: this.selected,
        placed: this.pending.length,
        needed: this.needed,
        hint: hint.text,
        hintBad: hint.bad,
      },
      {
        onSelect: (i) => this.selectCard(i),
        onValidate: () => {
          if (this.pending.length >= this.needed) this.endPlacement();
        },
      },
    );
  }

  private refreshHint(): void {
    const hint = this.currentHint();
    overlay.setTrayHint(hint.text, hint.bad);
  }

  private drawPreview(): void {
    this.preview.clear();
    if (!this.hover) return;
    const v = this.verdictAt(this.hover.x, this.hover.y);
    const color = v.takeBack ? 0x161616 : v.ok ? 0xf07a2e : 0xb3361a;
    this.preview.lineStyle(4, color, 1);
    drawDashedRect(this.preview, this.hover.x * CELL_PX + 3, this.hover.y * CELL_PX + 3, CELL_PX - 6, CELL_PX - 6);
  }

  /** Placement over (validated or out of time): objects not placed are lost. */
  private endPlacement(): void {
    this.objects.push(...this.pending.map(({ card: _card, ...o }) => o));
    this.pending = [];
    this.preview.clear();
    this.objectViews.sync(this.objects);
    overlay.hideTray();
    this.startCountdown();
  }

  // --- Race ------------------------------------------------------------------

  private startCountdown(): void {
    this.phase = "countdown";
    this.phaseLeft = COUNTDOWN_TIME;
    this.cameras.main.setZoom(1);
    this.player.setCollision(withSolidObjects(this.level, this.objects));
    this.player.reset();
    this.followCam.snapTo(this.cameraTarget());
    overlay.showBanner("Prêt ?");
    overlay.setHelp("Q/A ← · D → · Espace/Z/↑ saut · Échap : menu");
  }

  private startRace(): void {
    this.phase = "race";
    this.phaseLeft = this.cfg.raceTime;
    this.raceEnded = false;
    this.raceResult = null;
    this.player.reset();
    // Drop keys pressed during the countdown.
    this.controls.takeStepInput();
    overlay.showBanner("Partez !");
    this.time.delayedCall(600, () => {
      if (this.phase === "race" && !this.raceEnded) overlay.hideBanner();
    });
  }

  private updateRace(dt: number): void {
    if (this.raceEnded) {
      this.phaseLeft -= dt;
      if (this.phaseLeft <= 0) this.showRoundScore();
      return;
    }
    this.phaseLeft -= dt;
    const outcome = this.player.advance(dt, () => this.controls.takeStepInput(), this.objects);
    if (outcome?.kind === "died") {
      if (!outcome.fell) {
        const c = this.player.centre();
        this.stains.add(c.x, c.y, this.me.color);
      }
      overlay.showBanner(outcome.killer ? `Touché : ${OBJECT_DEFS[outcome.killer.kind].name}` : "Tombé !", true);
      this.endRace({ playerId: this.me.id, finishTime: null, killedBy: outcome.killer?.ownerId ?? null });
    } else if (outcome?.kind === "finished") {
      overlay.showBanner(`Arrivée ! ${outcome.time.toFixed(2)} s`);
      this.endRace({ playerId: this.me.id, finishTime: outcome.time, killedBy: null });
    } else if (this.phaseLeft <= 0) {
      overlay.showBanner("Temps écoulé", true);
      this.endRace({ playerId: this.me.id, finishTime: null, killedBy: null });
    }
  }

  /** With one player, the round ends as soon as that player is done. */
  private endRace(result: RaceResult): void {
    this.raceEnded = true;
    this.raceResult = result;
    this.phaseLeft = RACE_END_PAUSE;
  }

  // --- Score -----------------------------------------------------------------

  private showRoundScore(): void {
    this.phase = "score";
    this.phaseLeft = this.cfg.scoreTime;
    overlay.hideBanner();

    const results = this.raceResult ? [this.raceResult] : [];
    const solo = this.players.length === 1;
    const rs = scoreRound(results, this.cfg, solo);
    for (const line of rs.lines) this.scores.set(line.playerId, (this.scores.get(line.playerId) ?? 0) + line.total);

    let verdict: string;
    if (rs.verdict === "nobody-finished") verdict = "Personne n'est arrivé : aucun point ce round.";
    else if (rs.verdict === "everyone-finished") verdict = "Tout le monde est arrivé : niveau trop facile, aucun point.";
    else verdict = solo ? "En solo, la règle « tout le monde arrive = 0 point » est ignorée." : "";

    overlay.showScores({
      title: `Fin du round ${this.round} · ${this.level.name}`,
      verdict,
      headers: ["Arrivée", "1er", "Seul", "Pièges", "Round", "Total"],
      rows: rs.lines.map((l) => ({
        name: this.players.find((p) => p.id === l.playerId)?.name ?? l.playerId,
        cells: [l.finish, l.first, l.onlyOne, l.kills, l.total, this.scores.get(l.playerId) ?? 0].map(String),
      })),
    });
  }

  private afterScore(): void {
    const winner = gameWinner(this.scores, this.cfg);
    if (!winner) {
      this.startPlacement();
      return;
    }
    this.phase = "over";
    const name = this.players.find((p) => p.id === winner)?.name ?? winner;
    overlay.setTopBar(null);
    overlay.showScores({
      title: this.players.length === 1 ? "Partie terminée" : `${name} gagne !`,
      verdict: `${this.round} rounds joués.`,
      headers: ["Points"],
      rows: [...this.scores].map(([id, s]) => ({ name: this.players.find((p) => p.id === id)?.name ?? id, cells: [String(s)] })),
      actions: [
        { label: "Rejouer", primary: true, onClick: () => this.scene.restart({ targetScore: this.cfg.targetScore, levelIndex: this.levelIndex }) },
        { label: "Menu", onClick: () => this.scene.start("menu") },
      ],
    });
  }

  // --- Input, camera, HUD ------------------------------------------------------

  private onKey(code: string): void {
    if (code === "Escape") {
      this.scene.start("menu");
      return;
    }
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit && this.phase === "placement") this.selectCard(Number(digit[1]) - 1);
  }

  private listenToPointer(): void {
    const canvas = this.game.canvas;
    const cellAt = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0) return null;
      const gx = ((e.clientX - rect.left) / rect.width) * this.scale.width;
      const gy = ((e.clientY - rect.top) / rect.height) * this.scale.height;
      const p = this.cameras.main.getWorldPoint(gx, gy);
      return { x: Math.floor(p.x / CELL_PX), y: Math.floor(p.y / CELL_PX) };
    };
    const move = (e: PointerEvent) => {
      if (this.phase !== "placement") return;
      const cell = cellAt(e);
      const changed = cell?.x !== this.hover?.x || cell?.y !== this.hover?.y;
      this.hover = cell;
      if (changed) this.refreshHint();
    };
    const leave = () => {
      this.hover = null;
      if (this.phase === "placement") this.refreshHint();
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || this.phase !== "placement") return;
      const cell = cellAt(e);
      if (cell) this.clickCell(cell.x, cell.y);
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerdown", down);
    this.cleanup.push(
      () => canvas.removeEventListener("pointermove", move),
      () => canvas.removeEventListener("pointerleave", leave),
      () => canvas.removeEventListener("pointerdown", down),
    );
  }

  private cameraTarget() {
    const p = this.player.renderPosition();
    const m = tuning.movement;
    const c = this.player.controller;
    return { cx: p.x + m.bodyWidth / 2, cy: p.y + m.bodyHeight / 2, vx: c.vx, grounded: c.grounded, facing: c.facing };
  }

  private updateTopBar(): void {
    if (this.phase === "over") return;
    const labels: Record<Phase, string> = {
      placement: "Pose",
      countdown: "Course",
      race: "Course",
      score: "Score",
      over: "",
    };
    const timeLeft =
      this.phase === "placement" || (this.phase === "race" && !this.raceEnded) ? Math.max(0, this.phaseLeft) : null;
    const s: TopBarState = {
      round: this.round,
      phase: labels[this.phase],
      timeLeft,
      score: this.scores.get(this.me.id) ?? 0,
      target: this.cfg.targetScore,
    };
    const key = JSON.stringify({ ...s, timeLeft: timeLeft === null ? null : Math.ceil(timeLeft) });
    if (key === this.lastTopBar) return;
    this.lastTopBar = key;
    overlay.setTopBar(s);
  }
}
