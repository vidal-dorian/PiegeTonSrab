/**
 * A game, online or offline: the scene only reacts to messages from the game session
 * (through a GameLink) and sends the player's actions back. The session, on the server or
 * in the browser, runs the timers and the rules.
 *
 * Each round: placement (hidden, on a zoomed-out view of the whole level, with the check
 * that the finish stays reachable), a short countdown, the race (this machine simulates
 * its own character and shows the others as interpolated ghosts), then the score.
 * Dead players can place one platform during the race and choose whom to watch.
 * Players collide (build step 5 extra): landing on a head bounces you up and slams the other
 * player down, touching sideways pushes both apart (see contacts.ts in the shared package).
 */
import Phaser from "phaser";
import {
  bodiesOverlap,
  buildReachGraph,
  canPlaceAt,
  contactWith,
  DEFAULT_MOVEMENT,
  OBJECT_DEFS,
  parseLevel,
  PathGuard,
  placementKeepsPath,
  prepareObjects,
  RACE_LEVELS,
  TIMING,
  vinesOf,
  withSolidObjects,
  type Dir,
  type Ghost,
  type Level,
  type LobbyInfo,
  type ObjectKind,
  type PlacedObject,
  type ReachGraph,
  type ServerMessage,
  type ServerMessageOf,
} from "@game/shared";
import { FollowCamera } from "../camera";
import { CELL_PX, VIEW_CELLS_X, VIEW_CELLS_Y } from "../config";
import { drawDashedRect } from "../debug/editor";
import { debugView } from "../debug/debugState";
import { InputSource } from "../input";
import type { GameLink } from "../net/link";
import { GhostView, INTERPOLATION_DELAY_MS } from "../render/ghostView";
import { Effects } from "../render/effects";
import { drawLevel } from "../render/levelView";
import { ObjectViews } from "../render/objectViews";
import { PlayerView, PLAYER_COLORS } from "../render/playerView";
import { Stains } from "../render/stains";
import { LocalPlayer } from "../sim/localPlayer";
import { tuning } from "../tuningStore";
import { overlay, type TopBarState } from "../ui/overlay";
import { carouselScreen } from "../ui/screens";

const MAX_FRAME_TIME = 0.25;
/** Gap kept between the level and the top bar / tray in the placement view, CSS pixels. */
const PLACEMENT_MARGIN_PX = 8;
/** Arrows used in the interface for a direction. */
export const DIR_ARROWS: Record<Dir, string> = { 0: "→", 1: "↓", 2: "←", 3: "↑" };
/** The same player can't be stomped again by us this soon, seconds. */
const STOMP_REPEAT = TIMING.stompCooldown / 1000;
/** Ids of this round's objects before the server numbers them; far from map objects' ids (-1, -2...). */
const LOCAL_ID_START = -1_000_000;
/** If our simulated clock falls this far behind the round clock (frozen tab), jump it forward, seconds. */
const MAX_CLOCK_LAG = 0.1;

type Phase = "carousel" | "placement" | "countdown" | "race" | "raceEnd" | "score" | "over";
type MyStatus = "running" | "dead" | "finished" | "timeout";

interface Verdict {
  ok: boolean;
  /** The cell holds one of this round's objects: clicking takes it back. */
  takeBack: boolean;
  text: string;
}

export interface GameSceneData {
  link: GameLink;
  /** The "gameStart" message that opened this scene. */
  start: ServerMessageOf<"gameStart">;
  lobby: LobbyInfo | null;
}

export class GameScene extends Phaser.Scene {
  private link!: GameLink;
  private lobby: LobbyInfo | null = null;
  private level!: Level;
  private phase: Phase = "carousel";
  private round = 0;
  private totals: Record<string, number> = {};
  private targetScore = 10;

  /** Objects validated by the session (all players). */
  private objects: PlacedObject[] = [];
  // Placement
  private pending: Array<PlacedObject & { card: number }> = [];
  private offer: Array<{ kind: ObjectKind; used: boolean }> = [];
  private selected: number | null = null;
  private needed = 0;
  private validated = false;
  private doneIds: string[] = [];
  private endsAt = 0;
  private graph: ReachGraph | null = null;
  /** Graph for the session's objects only (fixed during placement), reused by order checks. */
  private baseGraph: ReachGraph | null = null;
  private verdicts = new Map<string, Verdict>();
  private hover: { x: number; y: number } | null = null;
  private nextLocalId = -1;
  /** Direction the next cannon is placed with (R or right click turns it). */
  private placeDir: Dir = 2;
  /** Objects as drawn: this round's pending ones included, with cannon lines measured. */
  private shown: PlacedObject[] = [];
  // Race
  private raceStartsAt = 0;
  private raceEndsAt = 0;
  private myStatus: MyStatus = "running";
  private poseTimer = 0;
  private blocks: Array<{ block: PlacedObject; appearsAt: number; active: boolean }> = [];
  private blockRequested = false;
  private spectating: string | null = null;
  /** Vine id -> player holding it, as last told by the session. */
  private vineHolders = new Map<number, string>();
  /** Other players our body touched on the last step, and when we last stomped each one. */
  private touching = new Set<string>();
  private lastStompAt = new Map<string, number>();
  private leaderId: string | null = null;

  private player!: LocalPlayer;
  private playerView!: PlayerView;
  private ghosts = new Map<string, GhostView>();
  private followCam!: FollowCamera;
  private objectViews!: ObjectViews;
  private stains!: Stains;
  private effects!: Effects;
  private gridGfx!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private arrows!: Phaser.GameObjects.Graphics;
  private controls!: InputSource;
  private lastTopBar = "";
  private cleanup: Array<() => void> = [];

  constructor() {
    super("game");
  }

  create(data: GameSceneData): void {
    this.link = data.link;
    this.lobby = data.lobby;
    this.targetScore = data.lobby?.targetScore ?? 10;
    this.level = parseLevel(RACE_LEVELS[data.start.levelIndex] ?? RACE_LEVELS[0]!);
    this.phase = "carousel";
    this.round = 0;
    this.totals = {};
    this.objects = [];
    this.pending = [];
    this.blocks = [];
    this.ghosts = new Map();
    this.lastTopBar = "";
    this.cleanup = [];
    this.myStatus = "running";

    this.gridGfx = drawLevel(this, this.level).grid;
    this.stains = new Stains(this);
    this.effects = new Effects(this);
    this.objectViews = new ObjectViews(this);
    this.preview = this.add.graphics().setDepth(5);
    this.arrows = this.add.graphics().setDepth(9).setScrollFactor(0);
    this.playerView = new PlayerView(this, this.colorOf(this.link.myId));
    this.player = new LocalPlayer(this.level, this.level, tuning.movement);
    this.vineHolders = new Map();
    this.leaderId = null;
    this.player.canHoldVine = (id) => {
      const holder = this.vineHolders.get(id);
      return holder === undefined || holder === this.link.myId;
    };
    this.player.onVine = (id, hold) => {
      if (hold) this.vineHolders.set(id, this.link.myId);
      else if (this.vineHolders.get(id) === this.link.myId) this.vineHolders.delete(id);
      if (this.phase === "race") this.link.send({ type: "vine", id, hold });
    };
    this.player.onBounce = (cell) => {
      const x = cell % this.level.width;
      const y = Math.floor(cell / this.level.width);
      const spring = this.objects.find((o) => o.kind === "spring" && o.x === x && o.y === y);
      if (spring) this.objectViews.bounce(spring.id);
    };
    this.followCam = new FollowCamera(tuning.camera, VIEW_CELLS_X, VIEW_CELLS_Y, this.level.width, this.level.height);
    this.showWholeLevel();

    this.controls = new InputSource();
    this.controls.onKey = (code) => this.onKey(code);
    this.listenToPointer();
    const onResize = () => requestAnimationFrame(() => this.phase === "placement" && this.showWholeLevel());
    window.addEventListener("resize", onResize);
    this.cleanup.push(() => window.removeEventListener("resize", onResize));
    this.link.onStatus = (status) => {
      if (status === "lost") overlay.showNotice("Connexion perdue, reconnexion…", 0);
      else if (status === "back") overlay.showNotice("Reconnecté");
      else this.quit("Déconnecté du serveur.");
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.link.setHandler(null);
      this.link.onStatus = null;
      this.controls.destroy();
      for (const fn of this.cleanup) fn();
      for (const g of this.ghosts.values()) g.destroy();
      this.objectViews.destroy();
      carouselScreen.hide();
      overlay.hideAll();
    });

    overlay.hideAll();
    // Hide the level while the carousel spins, so it does not give the result away.
    this.cameras.main.setAlpha(0);
    carouselScreen.show(RACE_LEVELS, data.start.levelIndex, data.start.spinMs);
    overlay.setHelp("Échap : quitter la partie");
    this.link.setHandler((msg) => this.onMessage(msg));
  }

  /** Called by the tuning panel whenever a value changes. */
  applyTuning(): void {
    this.player.controller.retune();
    this.playerView.applyTuning();
  }

  // --- Messages from the session ------------------------------------------------------

  private onMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "lobby":
        this.lobby = msg.lobby;
        this.targetScore = msg.lobby.targetScore;
        // Back to the lobby after the end of a game (online).
        if (!msg.lobby.inGame && this.phase === "over" && this.link.online) {
          this.scene.start("lobby", { link: this.link, lobby: msg.lobby });
        }
        break;
      case "gameStart":
        // A new game in the same room ("Rejouer"), or a reconnection. The restart happens on the
        // next frame: detach now so the messages that follow wait in the link for the new scene.
        if (this.phase !== "carousel") {
          this.link.setHandler(null);
          this.scene.restart({ link: this.link, start: msg, lobby: this.lobby });
        }
        break;
      case "placement":
        this.startPlacement(msg);
        break;
      case "placedStatus":
        this.doneIds = msg.done;
        if (this.phase === "placement") this.renderTray();
        break;
      case "countdown":
        this.startCountdown(msg);
        break;
      case "ghosts":
        this.onGhosts(msg.t, msg.players);
        break;
      case "playerDied":
        if (msg.id !== this.link.myId) this.stains.add(msg.x, msg.y, this.colorOf(msg.id));
        if (msg.id === this.spectating) this.pickSpectateTarget(1);
        this.announceKill(msg);
        break;
      case "playerFinished":
        if (msg.id !== this.link.myId) overlay.showNotice(`${this.nameOf(msg.id)} est arrivé en ${msg.time.toFixed(2)} s`);
        if (msg.id === this.spectating) this.pickSpectateTarget(1);
        break;
      case "block":
        this.blocks.push({ block: msg.block, appearsAt: msg.appearsAt, active: false });
        if (msg.block.ownerId === this.link.myId) {
          this.blockRequested = true;
          this.preview.clear();
        }
        this.syncObjectViews();
        break;
      case "blockRefused":
        this.blockRequested = false;
        overlay.showNotice(msg.reason);
        break;
      case "stomped":
        this.onStomped(msg.by, msg.victim);
        break;
      case "vine":
        if (msg.holder === null) this.vineHolders.delete(msg.id);
        else this.vineHolders.set(msg.id, msg.holder);
        // Someone else got there first: let go.
        if (msg.holder !== null && msg.holder !== this.link.myId && this.player.controller.swing?.vineId === msg.id) {
          this.player.letGo();
        }
        break;
      case "score":
        this.showScore(msg);
        break;
      case "over":
        this.showGameOver(msg);
        break;
      case "error":
        overlay.showNotice(msg.message, 5000);
        break;
      case "pong":
        break;
    }
  }

  // --- Placement ---------------------------------------------------------------------

  private startPlacement(msg: ServerMessageOf<"placement">): void {
    carouselScreen.hide();
    this.cameras.main.setAlpha(1);
    overlay.hideScores();
    overlay.hideBanner();
    this.phase = "placement";
    this.round = msg.round;
    this.needed = msg.needed;
    this.endsAt = msg.endsAt;
    this.objects = msg.objects;
    this.blocks = [];
    // Rejoining after validating: the session ignores changes, so don't offer any.
    this.validated = msg.done === true;
    this.doneIds = [];
    this.nextLocalId = LOCAL_ID_START;
    this.baseGraph = null;
    this.offer = msg.offer.map((kind) => ({ kind, used: false }));
    // Rebuild our own choice when rejoining in the middle of placement.
    this.pending = [];
    for (const c of msg.mine) {
      const card = this.offer.findIndex((o) => !o.used && o.kind === c.kind);
      if (card < 0) continue;
      this.offer[card]!.used = true;
      const obj: PlacedObject & { card: number } = { id: this.nextLocalId--, kind: c.kind, x: c.x, y: c.y, ownerId: this.link.myId, card };
      if (c.dir !== undefined) obj.dir = c.dir;
      this.pending.push(obj);
    }
    this.selected = this.pending.length < this.needed && !this.validated ? this.nextFreeCard() : null;
    for (const g of this.ghosts.values()) g.clear();
    this.player.reset();
    this.rebuildGraph();
    overlay.setHelp("Clic : poser ou reprendre · 1 à 3 : choisir l'objet · R ou clic droit : tourner le canon · Échap : quitter");
    this.renderTray();
    this.updateTopBar();
    this.showWholeLevel();
  }

  private allObjects(): PlacedObject[] {
    return [...this.objects, ...this.pending, ...this.blocks.map((b) => b.block)];
  }

  /** Copy of a pending object without the card index, as the rules see it. */
  private plain(o: PlacedObject & { card?: number }): PlacedObject {
    const { card: _card, ...rest } = o;
    return rest;
  }

  /**
   * Graph for the hover check. It uses DEFAULT_MOVEMENT, like the server, so the answer on
   * screen matches the server's (tuning panel values only change how this client moves).
   */
  private rebuildGraph(): void {
    this.graph = buildReachGraph(this.level, [...this.objects, ...this.pending.map((p) => this.plain(p))], DEFAULT_MOVEMENT);
    this.verdicts.clear();
    this.syncObjectViews();
  }

  private syncObjectViews(): void {
    const dimmed = new Set<number>([
      ...this.pending.map((p) => p.id),
      ...this.blocks.filter((b) => !b.active).map((b) => b.block.id),
    ]);
    // During placement, pending objects change cannon lines: measure everything again.
    // During the race the session's objects are already measured; dead players' blocks
    // don't stop cannon balls (the lines were fixed when the race started).
    this.shown =
      this.phase === "placement"
        ? prepareObjects(this.level, [...this.objects, ...this.pending.map((p) => this.plain(p))])
        : [...this.objects, ...this.blocks.map((b) => b.block)];
    this.objectViews.sync(this.shown, dimmed);
  }

  /** Direction a placed object of this kind gets right now. */
  private dirFor(kind: ObjectKind): Dir | undefined {
    return OBJECT_DEFS[kind].rotatable ? this.placeDir : undefined;
  }

  /** R or right click: turn the cannon under the cursor, or the direction of the next one. */
  private rotate(): void {
    if (this.phase !== "placement" || this.validated) return;
    const next = (d: Dir) => ((d + 1) % 4) as Dir;
    const h = this.hover;
    const target = h ? this.pending.find((p) => p.x === h.x && p.y === h.y && OBJECT_DEFS[p.kind].rotatable) : undefined;
    if (target) {
      // Turning a placed cannon must keep the path open, with the whole hand applied in order.
      let d = target.dir ?? 2;
      for (let i = 0; i < 3; i++) {
        d = next(d);
        const hand = this.pending.map((p) => (p === target ? { ...this.plain(p), dir: d } : this.plain(p)));
        if (this.wholeHandAccepted(hand)) {
          target.dir = d;
          this.placeDir = d;
          this.sendPlacement(false);
          this.rebuildGraph();
          break;
        }
      }
    } else {
      this.placeDir = next(this.placeDir);
      this.verdicts.clear();
    }
    this.renderTray();
  }

  /**
   * Whether the session will accept all of these pending objects, applied one after the other
   * in this order as it does at the end of placement. One object can make another legal (a
   * platform shielding a cannon's line), so taking back or turning one must keep the rest valid.
   */
  private wholeHandAccepted(pending: readonly PlacedObject[]): boolean {
    this.baseGraph ??= buildReachGraph(this.level, this.objects, DEFAULT_MOVEMENT);
    const guard = new PathGuard(this.level, this.objects, DEFAULT_MOVEMENT, { graph: this.baseGraph });
    return pending.every((p) => canPlaceAt(this.level, guard.objects, p.x, p.y) && guard.tryAdd(p));
  }

  private verdictAt(x: number, y: number): Verdict {
    if (this.validated) return { ok: false, takeBack: false, text: "Pose validée : en attente des autres" };
    const mine = this.pending.find((p) => p.x === x && p.y === y);
    if (mine) {
      const key = `back,${x},${y}`;
      const cached = this.verdicts.get(key);
      if (cached) return cached;
      const rest = this.pending.filter((p) => p !== mine).map((p) => this.plain(p));
      const v = this.wholeHandAccepted(rest)
        ? { ok: true, takeBack: true, text: "Clic : reprendre cet objet" }
        : { ok: false, takeBack: true, text: "Sans lui, un autre de tes objets couperait le chemin : reprends l'autre d'abord" };
      this.verdicts.set(key, v);
      return v;
    }
    const kind = this.selected !== null ? this.offer[this.selected]?.kind : undefined;
    if (!kind) {
      return { ok: false, takeBack: false, text: this.pending.length >= this.needed ? "Tout est posé : valide" : "Choisis un objet" };
    }
    const dir = this.dirFor(kind);
    const key = `${x},${y},${kind},${dir ?? ""}`;
    const cached = this.verdicts.get(key);
    if (cached) return cached;

    const all = [...this.objects, ...this.pending.map((p) => this.plain(p))];
    const l = this.level;
    let v: Verdict;
    if (x < 0 || x >= l.width || y < 0 || y >= l.height || l.solid[y * l.width + x]) {
      v = { ok: false, takeBack: false, text: "Pas dans le décor" };
    } else if ((x === l.start.x && y === l.start.y) || (l.finish && x === l.finish.x && y === l.finish.y)) {
      v = { ok: false, takeBack: false, text: "Pas sur le départ ni sur l'arrivée" };
    } else if (!canPlaceAt(l, all, x, y)) {
      v = { ok: false, takeBack: false, text: "Case déjà prise" };
    } else if (!placementKeepsPath(l, all, { id: 0, kind, x, y, ...(dir !== undefined ? { dir } : {}) }, DEFAULT_MOVEMENT, this.graph ?? undefined)) {
      v = {
        ok: false,
        takeBack: false,
        text: dir !== undefined ? "Bloquerait le chemin vers l'arrivée (essaie de le tourner : R)" : "Bloquerait le chemin vers l'arrivée",
      };
    } else {
      v = { ok: true, takeBack: false, text: `Poser : ${OBJECT_DEFS[kind].name}${dir !== undefined ? ` ${DIR_ARROWS[dir]}` : ""}` };
    }
    this.verdicts.set(key, v);
    return v;
  }

  private clickPlacementCell(x: number, y: number): void {
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
      const obj: PlacedObject & { card: number } = { id: this.nextLocalId--, kind, x, y, ownerId: this.link.myId, card };
      const dir = this.dirFor(kind);
      if (dir !== undefined) obj.dir = dir;
      this.pending.push(obj);
      this.offer[card]!.used = true;
      this.selected = this.pending.length < this.needed ? this.nextFreeCard() : null;
    }
    this.sendPlacement(false);
    this.rebuildGraph();
    this.renderTray();
  }

  private sendPlacement(done: boolean): void {
    this.link.send({
      type: "placement",
      objects: this.pending.map(({ kind, x, y, dir }) => (dir !== undefined ? { kind, x, y, dir } : { kind, x, y })),
      done,
    });
  }

  private nextFreeCard(): number | null {
    const i = this.offer.findIndex((c) => !c.used);
    return i >= 0 ? i : null;
  }

  private selectCard(i: number): void {
    const card = this.offer[i];
    if (this.phase !== "placement" || this.validated || !card || card.used || this.pending.length >= this.needed) return;
    this.selected = i;
    this.renderTray();
  }

  private currentHint(): { text: string; bad: boolean } {
    const v = this.hover ? this.verdictAt(this.hover.x, this.hover.y) : null;
    const idle = this.validated
      ? "Pose validée : en attente des autres"
      : this.pending.length >= this.needed
        ? "Tout est posé : valide"
        : "Survole le niveau pour poser";
    return { text: v?.text ?? idle, bad: v !== null && !v.ok && !this.validated };
  }

  /** Rebuild the tray; only on state changes (selection, placement), never on hover. */
  private renderTray(): void {
    const hint = this.currentHint();
    const others = (this.lobby?.players ?? [])
      .filter((p) => p.id !== this.link.myId)
      .map((p) => ({ name: p.name, done: this.doneIds.includes(p.id) }));
    overlay.showTray(
      {
        cards: this.offer.map((c, i) => {
          const placed = this.pending.find((p) => p.card === i);
          const dir = OBJECT_DEFS[c.kind].rotatable ? (placed?.dir ?? this.placeDir) : undefined;
          return { ...c, arrow: dir !== undefined ? DIR_ARROWS[dir] : undefined };
        }),
        selected: this.validated ? null : this.selected,
        placed: this.pending.length,
        needed: this.needed,
        hint: hint.text,
        hintBad: hint.bad,
        others,
        waiting: this.validated,
      },
      {
        onSelect: (i) => this.selectCard(i),
        onValidate: () => {
          if (this.validated || this.pending.length < this.needed) return;
          this.validated = true;
          this.sendPlacement(true);
          this.preview.clear();
          this.renderTray();
        },
      },
    );
  }

  private refreshHint(): void {
    const hint = this.currentHint();
    overlay.setTrayHint(hint.text, hint.bad);
  }

  private drawPlacementPreview(): void {
    this.preview.clear();
    if (!this.hover || this.validated) return;
    const v = this.verdictAt(this.hover.x, this.hover.y);
    const color = v.takeBack && v.ok ? 0x161616 : v.ok ? 0xf07a2e : 0xb3361a;
    this.preview.lineStyle(4, color, 1);
    drawDashedRect(this.preview, this.hover.x * CELL_PX + 3, this.hover.y * CELL_PX + 3, CELL_PX - 6, CELL_PX - 6);
    // A cannon about to be placed: show where it would fire.
    const kind = this.selected !== null ? this.offer[this.selected]?.kind : undefined;
    if (!v.takeBack && kind && OBJECT_DEFS[kind].rotatable) {
      const all = [...this.objects, ...this.pending.map((p) => this.plain(p))];
      const ghost = prepareObjects(this.level, [...all, { id: 0, kind, x: this.hover.x, y: this.hover.y, dir: this.placeDir }]).pop()!;
      const { x, y } = this.hover;
      const d = { 0: [1, 0], 1: [0, 1], 2: [-1, 0], 3: [0, -1] }[this.placeDir];
      const sx = (x + 0.5 + d[0]! * 0.5) * CELL_PX;
      const sy = (y + 0.5 + d[1]! * 0.5) * CELL_PX;
      const len = (ghost.range ?? 0) * CELL_PX;
      this.preview.lineStyle(3, 0xb3361a, 0.7);
      for (let s = 0; s < len; s += 14) {
        const e = Math.min(s + 7, len);
        this.preview.lineBetween(sx + d[0]! * s, sy + d[1]! * s, sx + d[0]! * e, sy + d[1]! * e);
      }
    }
  }

  /** Zoom out so the whole level fits in the part of the screen not covered by the top bar and the tray. */
  private showWholeLevel(): void {
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
    cam.centerOn(w / 2, h / 2 + (this.scale.height / 2 - (top + availH / 2)) / zoom);
  }

  // --- Race ----------------------------------------------------------------------------

  private startCountdown(msg: ServerMessageOf<"countdown">): void {
    carouselScreen.hide();
    this.cameras.main.setAlpha(1);
    overlay.hideTray();
    overlay.hideScores();
    this.preview.clear();
    this.phase = "countdown";
    this.round = msg.round;
    // Already measured by the session; measured again here so an older session can't break the drawing.
    this.objects = prepareObjects(this.level, msg.objects);
    this.pending = [];
    this.blocks = [];
    this.blockRequested = false;
    this.spectating = null;
    this.myStatus = "running";
    this.vineHolders.clear();
    this.touching.clear();
    this.lastStompAt.clear();
    this.player.vines = vinesOf(this.objects);
    this.raceStartsAt = msg.raceStartsAt;
    this.raceEndsAt = msg.raceEndsAt;
    this.syncObjectViews();
    this.player.setCollision(withSolidObjects(this.level, this.objects));
    this.player.reset();
    for (const g of this.ghosts.values()) g.clear();
    this.updateCrowns();
    this.cameras.main.setZoom(1);
    this.followCam.snapTo(this.cameraTarget());
    overlay.showBanner("Prêt ?");
    overlay.setHelp("Q/A ← · D → · Espace/Z/↑ saut · Échap : quitter");
    if (msg.refused > 0) {
      overlay.showNotice(
        `${msg.refused} de tes objets refusé${msg.refused > 1 ? "s" : ""} : avec ceux des autres, ils auraient bloqué le chemin.`,
        5000,
      );
    }
  }

  private startRace(): void {
    this.phase = "race";
    this.player.reset();
    this.poseTimer = 0;
    // Drop keys pressed during the countdown.
    this.controls.takeStepInput();
    overlay.showBanner("Partez !");
    this.time.delayedCall(600, () => {
      if (this.phase === "race" && this.myStatus === "running") overlay.hideBanner();
    });
  }

  /** Round clock (seconds since the race started), from the server's clock. */
  private roundTime(): number {
    return (this.link.serverNow() - this.raceStartsAt) / 1000;
  }

  private updateRace(dt: number): void {
    // Blocks placed by dead players become solid at their round time.
    this.activateBlocks();

    if (this.myStatus === "running") {
      // Traps run on the round clock. If this tab froze, our simulated clock fell behind:
      // jump it forward so what can kill us is what everyone sees.
      if (this.roundTime() - this.player.time > MAX_CLOCK_LAG) this.player.catchUp(this.roundTime());
      const outcome = this.player.advance(dt, () => this.controls.takeStepInput(), this.objects, () => this.checkContacts());
      if (outcome?.kind === "died") {
        const c = this.player.centre();
        if (!outcome.fell) this.stains.add(c.x, c.y, this.colorOf(this.link.myId));
        // Pushed into a trap shortly before: say by whom (push-kill). Pits never count.
        const pushedBy = outcome.killer ? this.player.creditedPusher() : null;
        this.link.send({ type: "died", killerId: outcome.killer?.id ?? null, x: c.x, y: c.y, fell: outcome.fell, pushedBy });
        this.myStatus = "dead";
        overlay.showBanner(outcome.killer ? `Touché : ${OBJECT_DEFS[outcome.killer.kind].name}` : "Tombé !", true);
        this.time.delayedCall(1200, () => this.phase === "race" && overlay.hideBanner());
        this.pickSpectateTarget(0);
      } else if (outcome?.kind === "finished") {
        this.link.send({ type: "finished", time: outcome.time });
        this.myStatus = "finished";
        overlay.showBanner(`Arrivée ! ${outcome.time.toFixed(2)} s`);
        this.time.delayedCall(1500, () => this.phase === "race" && overlay.hideBanner());
        this.pickSpectateTarget(0);
      } else if (this.link.serverNow() >= this.raceEndsAt) {
        this.myStatus = "timeout";
        overlay.showBanner("Temps écoulé", true);
      } else {
        this.sendPose(dt);
      }
    }
    this.updateSpectatorHelp();
  }

  /**
   * After each simulation step: did our body land on another player's head (stomp) or start
   * touching one sideways (bump)? See contacts.ts. Other players are where we see them.
   */
  private checkContacts(): void {
    const t = this.player.time;
    const m = tuning.movement;
    const c = this.player.controller;
    const me = { x: c.x, y: c.y };
    if (t < TIMING.contactGrace / 1000) {
      // Everyone starts on the same cell: remember who we overlap, so that only a touch that
      // starts after the grace period counts.
      for (const g of this.ghosts.values()) {
        const other = g.current;
        if (other && other.status === "running" && bodiesOverlap(me, other, m.bodyWidth, m.bodyHeight)) this.touching.add(g.id);
        else this.touching.delete(g.id);
      }
      return;
    }
    for (const g of this.ghosts.values()) {
      const other = g.current;
      if (!other || other.status !== "running") {
        this.touching.delete(g.id);
        continue;
      }
      const touching = this.touching.has(g.id);
      const contact = contactWith(me, this.player.prevY, c.vy, other, m.bodyWidth, m.bodyHeight, touching);
      if (contact === "stomp" && t - (this.lastStompAt.get(g.id) ?? -Infinity) >= STOMP_REPEAT) {
        this.lastStompAt.set(g.id, t);
        c.launch(m.stompBounceHeight, true);
        this.link.send({ type: "stomp", victim: g.id });
        g.stomped(m.stunTime);
        this.effects.pof(other.x + m.bodyWidth / 2, other.y);
      } else if (contact === "bump") {
        // Same x on both machines: break the tie by id, so the two players go opposite ways.
        const away = Math.sign(c.x - other.x) || (this.link.myId < g.id ? -1 : 1);
        // A bump is mutual: each side counts the other as its pusher. On a vine the shove does nothing.
        if (!c.swing) this.player.pushedBy(g.id);
        c.shove(away * m.shoveSpeed, m.shoveLock);
        this.effects.puff((c.x + other.x) / 2 + m.bodyWidth / 2, c.y + m.bodyHeight / 2);
      }
      if (bodiesOverlap({ x: c.x, y: c.y }, other, m.bodyWidth, m.bodyHeight)) this.touching.add(g.id);
      else this.touching.delete(g.id);
    }
  }

  /** The session says `by` stomped on `victim`. Our own character is pushed down if it is the victim. */
  private onStomped(by: string, victim: string): void {
    const m = tuning.movement;
    if (victim === this.link.myId) {
      if (this.myStatus !== "running") return;
      this.player.controller.slam(m.stompSlamSpeed, m.stunTime);
      this.player.pushedBy(by);
      this.player.syncVine();
      this.playerView.squash();
      const c = this.player.centre();
      this.effects.pof(c.x, c.y - m.bodyHeight / 2, "AÏE !");
      overlay.showNotice(`${this.nameOf(by)} t'a écrasé !`, 1500);
      return;
    }
    if (by === this.link.myId) {
      overlay.showNotice(`Tu as écrasé ${this.nameOf(victim)} !`, 1500);
      return;
    }
    // Two other players: show it, the victim's own machine does the rest.
    const g = this.ghosts.get(victim);
    if (g?.current) {
      g.stomped(m.stunTime);
      this.effects.pof(g.current.x + m.bodyWidth / 2, g.current.y);
    }
  }

  /**
   * Tell everyone who died in whose trap, and who pushed them in. A push into the pusher's
   * own trap is the big one (worth 2): it gets a "+2" burst where the victim died. Pits and
   * map objects score nothing and the victim already has its own banner, so they stay quiet.
   */
  private announceKill(msg: ServerMessageOf<"playerDied">): void {
    const owner = msg.killerOwner;
    if (!owner) return;
    const me = this.link.myId;
    const victim = msg.id;
    const pusher = msg.pushedBy;
    const name = (id: string) => this.nameOf(id);
    let text: string;
    if (owner === victim) {
      text = victim === me ? "Tu es mort dans ton propre piège !" : `${name(victim)} est mort dans son propre piège !`;
    } else if (pusher === owner) {
      if (owner === me) text = `Tu as poussé ${name(victim)} dans ton piège ! +2`;
      else if (victim === me) text = `${name(owner)} t'a poussé dans son piège ! +2`;
      else text = `${name(owner)} a poussé ${name(victim)} dans son piège ! +2`;
      this.effects.pof(msg.x, msg.y - 0.6, "+2");
    } else {
      // The owner gets the kill (1 point); someone else pushing the victim in gets nothing.
      const trap = owner === me ? "ton piège" : `le piège de ${name(owner)}`;
      if (pusher === me) text = `Tu as poussé ${name(victim)} dans ${trap}`;
      else if (pusher && victim === me) text = `${name(pusher)} t'a poussé dans ${trap}`;
      else if (pusher) text = `${name(pusher)} a poussé ${name(victim)} dans ${trap}`;
      else if (victim === me) text = `Tu es mort dans ${trap}`;
      else text = `${name(victim)} est mort dans ${trap}`;
    }
    overlay.showNotice(text, 2500);
  }

  /** The score leader (alone in first place, with points) wears a crown. */
  private updateCrowns(): void {
    let best = 0;
    let leaders: string[] = [];
    for (const [id, s] of Object.entries(this.totals)) {
      if (s > best) {
        best = s;
        leaders = [id];
      } else if (s === best && s > 0) leaders.push(id);
    }
    this.leaderId = leaders.length === 1 ? leaders[0]! : null;
    this.playerView.setCrown(this.leaderId === this.link.myId);
    for (const g of this.ghosts.values()) g.setCrown(this.leaderId === g.id);
  }

  private sendPose(dt: number): void {
    this.poseTimer += dt;
    if (this.poseTimer < TIMING.ghostInterval / 1000) return;
    this.poseTimer = 0;
    const c = this.player.controller;
    this.link.send({ type: "pose", x: c.x, y: c.y, facing: c.facing, slide: c.wallSliding });
  }

  private activateBlocks(): void {
    const t = this.myStatus === "running" ? this.player.time : this.roundTime();
    const m = tuning.movement;
    const c = this.player.controller;
    let changed = false;
    for (const b of this.blocks) {
      if (b.active || t < b.appearsAt) continue;
      // Never turn solid inside our own character: wait until it has moved away.
      const { x, y } = b.block;
      if (this.myStatus === "running" && c.x < x + 1 && c.x + m.bodyWidth > x && c.y < y + 1 && c.y + m.bodyHeight > y) continue;
      b.active = true;
      changed = true;
    }
    if (!changed) return;
    const active = this.blocks.filter((b) => b.active).map((b) => b.block);
    this.player.setCollision(withSolidObjects(this.level, [...this.objects, ...active]));
    this.syncObjectViews();
  }

  private onGhosts(t: number, players: Ghost[]): void {
    for (const g of players) {
      if (g.id === this.link.myId) continue;
      let view = this.ghosts.get(g.id);
      if (!view) {
        view = new GhostView(this, g.id, this.nameOf(g.id), this.colorOf(g.id));
        view.setCrown(this.leaderId === g.id);
        this.ghosts.set(g.id, view);
      }
      view.push(t, g);
    }
  }

  /** Living players this one can watch. */
  private livingGhosts(): GhostView[] {
    return [...this.ghosts.values()].filter((g) => g.current?.status === "running");
  }

  /** Watch the next (step 1) or previous (step -1) living player; step 0 keeps the current one if alive. */
  private pickSpectateTarget(step: number): void {
    const living = this.livingGhosts();
    if (living.length === 0) {
      this.spectating = null;
      return;
    }
    const i = living.findIndex((g) => g.id === this.spectating);
    if (i >= 0 && step === 0) return;
    const next = i < 0 ? 0 : (i + step + living.length) % living.length;
    this.spectating = living[next]!.id;
  }

  private updateSpectatorHelp(): void {
    if (this.myStatus === "running") return;
    if (this.spectating && !this.livingGhosts().some((g) => g.id === this.spectating)) this.pickSpectateTarget(1);
    const parts: string[] = [];
    if (this.spectating) parts.push(`Tu regardes ${this.nameOf(this.spectating)} · ←/→ pour changer`);
    if (this.myStatus === "dead" && !this.blockRequested) parts.push("Clic : poser ton bloc (1 par round)");
    overlay.setHelp(parts.join(" · ") || "Échap : quitter");
  }

  private drawBlockPreview(): void {
    this.preview.clear();
    if (this.phase !== "race" || this.myStatus !== "dead" || this.blockRequested || !this.hover) return;
    const { x, y } = this.hover;
    const ok = canPlaceAt(this.level, this.allObjects(), x, y);
    this.preview.lineStyle(3, ok ? 0x161616 : 0xb3361a, 1);
    drawDashedRect(this.preview, x * CELL_PX + 3, y * CELL_PX + 3, CELL_PX - 6, CELL_PX - 6);
  }

  /** Arrows on the screen edges pointing to other players who are off screen. */
  private drawArrows(): void {
    this.arrows.clear();
    if (this.phase !== "race" && this.phase !== "countdown") return;
    const cam = this.cameras.main;
    const w = this.scale.width;
    const h = this.scale.height;
    const m = tuning.movement;
    for (const g of this.ghosts.values()) {
      if (!g.current || g.current.status !== "running" || g.id === this.spectating) continue;
      const sx = (g.current.x + m.bodyWidth / 2) * CELL_PX - cam.scrollX;
      const sy = (g.current.y + m.bodyHeight / 2) * CELL_PX - cam.scrollY;
      if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) continue;
      const ax = Math.min(Math.max(sx, 24), w - 24);
      const ay = Math.min(Math.max(sy, 24), h - 24);
      const angle = Math.atan2(sy - ay, sx - ax);
      const tip = { x: ax + Math.cos(angle) * 16, y: ay + Math.sin(angle) * 16 };
      const left = { x: ax + Math.cos(angle + 2.5) * 14, y: ay + Math.sin(angle + 2.5) * 14 };
      const right = { x: ax + Math.cos(angle - 2.5) * 14, y: ay + Math.sin(angle - 2.5) * 14 };
      this.arrows.fillStyle(g.color, 1);
      this.arrows.fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
      this.arrows.lineStyle(2.5, 0x161616, 1);
      this.arrows.strokeTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    }
  }

  // --- Score and end of game -------------------------------------------------------------

  private showScore(msg: ServerMessageOf<"score">): void {
    this.phase = "score";
    this.totals = msg.totals;
    this.updateCrowns();
    overlay.hideBanner();
    overlay.setHelp("");
    let verdict: string;
    if (msg.verdict === "nobody-finished") verdict = "Personne n'est arrivé : aucun point ce round.";
    else if (msg.verdict === "everyone-finished") verdict = "Tout le monde est arrivé : niveau trop facile, aucun point.";
    else verdict = msg.lines.length === 1 ? "En solo, la règle « tout le monde arrive = 0 point » est ignorée." : "";
    overlay.showScores({
      title: `Fin du round ${msg.round} · ${this.level.name}`,
      verdict,
      headers: ["Arrivée", "1er", "Seul", "Pièges", "Round", "Total"],
      rows: msg.lines.map((l) => ({
        name: this.nameOf(l.playerId),
        cells: [
          String(l.finish),
          String(l.first),
          String(l.onlyOne),
          // Kill points; push-kills (2 points each) are pointed out so a "3" with one victim makes sense.
          l.pushKills > 0 ? `${l.kills} (${l.pushKills} poussé${l.pushKills > 1 ? "s" : ""})` : String(l.kills),
          String(l.total),
          String(msg.totals[l.playerId] ?? 0),
        ],
      })),
    });
  }

  private showGameOver(msg: ServerMessageOf<"over">): void {
    this.phase = "over";
    overlay.setTopBar(null);
    overlay.setHelp("");
    const isHost = !this.link.online || this.lobby?.hostId === this.link.myId;
    const actions = !this.link.online
      ? [
          { label: "Rejouer", primary: true, onClick: () => this.link.send({ type: "start" }) },
          { label: "Menu", onClick: () => this.quit() },
        ]
      : isHost
        ? [
            { label: "Rejouer", primary: true, onClick: () => this.link.send({ type: "start" }) },
            { label: "Retour au salon", onClick: () => this.link.send({ type: "backToLobby" }) },
          ]
        : [{ label: "Quitter", onClick: () => this.quit() }];
    const solo = Object.keys(msg.totals).length === 1;
    overlay.showScores({
      title: solo ? "Partie terminée" : `${this.nameOf(msg.winner)} gagne !`,
      verdict: `${msg.rounds} rounds joués.${this.link.online && !isHost ? " L'hôte peut relancer une partie." : ""}`,
      headers: ["Points"],
      rows: Object.entries(msg.totals)
        .sort((a, b) => b[1] - a[1])
        .map(([id, s]) => ({ name: this.nameOf(id), cells: [String(s)] })),
      actions,
    });
  }

  // --- Frame update --------------------------------------------------------------------

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, MAX_FRAME_TIME);
    this.controls.poll();
    this.gridGfx.setVisible(debugView.showGrid);

    if (this.phase === "placement") this.drawPlacementPreview();
    if (this.phase === "countdown" && this.link.serverNow() >= this.raceStartsAt) this.startRace();
    if (this.phase === "race") {
      this.updateRace(dt);
      this.drawBlockPreview();
    }

    // Other players, drawn slightly in the past so movement is smooth.
    const renderT = this.link.serverNow() - INTERPOLATION_DELAY_MS;
    for (const g of this.ghosts.values()) g.update(renderT);

    const pos = this.player.renderPosition();
    const racing = this.phase === "race" || this.phase === "countdown";
    this.playerView.update(pos.x, pos.y, this.player.controller, racing && this.myStatus !== "dead");
    // Draw traps on the clock that decides whether they kill us (ours while we run).
    const objectTime = !racing ? 0 : this.myStatus === "running" && this.phase === "race" ? this.player.renderTime() : Math.max(0, this.roundTime());
    this.objectViews.update(this.shown, objectTime, {
      holders: this.vineHolderPositions(),
      showLines: this.phase === "placement",
    });

    if (racing) {
      this.followCam.update(dt, this.cameraTarget());
      this.cameras.main.setScroll(this.followCam.x * CELL_PX, this.followCam.y * CELL_PX);
    }
    this.drawArrows();
    this.updateTopBar();
  }

  /** Centre of whoever holds each vine, so the rope can be drawn to them. */
  private vineHolderPositions(): Map<number, { x: number; y: number }> {
    const m = tuning.movement;
    const out = new Map<number, { x: number; y: number }>();
    const mine = this.player.controller.swing;
    if (mine && this.myStatus === "running") {
      const p = this.player.renderPosition();
      out.set(mine.vineId, { x: p.x + m.bodyWidth / 2, y: p.y + m.bodyHeight / 2 });
    }
    for (const [id, holder] of this.vineHolders) {
      if (holder === this.link.myId) continue;
      const g = this.ghosts.get(holder)?.current;
      if (g && g.status === "running") out.set(id, { x: g.x + m.bodyWidth / 2, y: g.y + m.bodyHeight / 2 });
    }
    return out;
  }

  /** Follow our own character, or the watched player once we are out. */
  private cameraTarget() {
    const m = tuning.movement;
    const watched = this.myStatus !== "running" && this.spectating ? this.ghosts.get(this.spectating)?.current : null;
    if (watched) {
      return {
        cx: watched.x + m.bodyWidth / 2,
        cy: watched.y + m.bodyHeight / 2,
        vx: watched.vx,
        grounded: true,
        facing: (watched.vx < 0 ? -1 : 1) as -1 | 1,
      };
    }
    const p = this.player.renderPosition();
    const c = this.player.controller;
    return { cx: p.x + m.bodyWidth / 2, cy: p.y + m.bodyHeight / 2, vx: c.vx, grounded: c.grounded, facing: c.facing };
  }

  private updateTopBar(): void {
    if (this.phase === "over" || this.phase === "carousel") return;
    const now = this.link.serverNow();
    let timeLeft: number | null = null;
    if (this.phase === "placement") timeLeft = Math.max(0, (this.endsAt - now) / 1000);
    else if (this.phase === "race") timeLeft = Math.max(0, (this.raceEndsAt - now) / 1000);
    const labels: Record<Phase, string> = {
      carousel: "",
      placement: "Pose",
      countdown: "Course",
      race: "Course",
      raceEnd: "Course",
      score: "Score",
      over: "",
    };
    const s: TopBarState = {
      round: this.round,
      phase: labels[this.phase],
      timeLeft,
      score: this.totals[this.link.myId] ?? 0,
      target: this.targetScore,
    };
    const key = JSON.stringify({ ...s, timeLeft: timeLeft === null ? null : Math.ceil(timeLeft) });
    if (key === this.lastTopBar) return;
    this.lastTopBar = key;
    overlay.setTopBar(s);
  }

  // --- Input -----------------------------------------------------------------------------

  private onKey(code: string): void {
    if (code === "Escape") {
      this.quit();
      return;
    }
    const digit = /^Digit([1-9])$/.exec(code);
    if (digit && this.phase === "placement") this.selectCard(Number(digit[1]) - 1);
    if (code === "KeyR") this.rotate();
    if (this.phase === "race" && this.myStatus !== "running") {
      if (code === "ArrowLeft" || code === "KeyA") this.pickSpectateTarget(-1);
      if (code === "ArrowRight" || code === "KeyD") this.pickSpectateTarget(1);
    }
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
      const cell = cellAt(e);
      const changed = cell?.x !== this.hover?.x || cell?.y !== this.hover?.y;
      this.hover = cell;
      if (changed && this.phase === "placement") this.refreshHint();
    };
    const leave = () => {
      this.hover = null;
      if (this.phase === "placement") this.refreshHint();
    };
    const down = (e: PointerEvent) => {
      if (e.button === 2) {
        this.rotate();
        return;
      }
      if (e.button !== 0) return;
      const cell = cellAt(e);
      if (!cell) return;
      if (this.phase === "placement" && !this.validated) this.clickPlacementCell(cell.x, cell.y);
      else if (this.phase === "race" && this.myStatus === "dead" && !this.blockRequested) {
        this.blockRequested = true;
        this.link.send({ type: "block", x: cell.x, y: cell.y });
      }
    };
    const menu = (e: MouseEvent) => e.preventDefault();
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("contextmenu", menu);
    this.cleanup.push(
      () => canvas.removeEventListener("contextmenu", menu),
      () => canvas.removeEventListener("pointermove", move),
      () => canvas.removeEventListener("pointerleave", leave),
      () => canvas.removeEventListener("pointerdown", down),
    );
  }

  // --- Helpers -----------------------------------------------------------------------------

  private nameOf(id: string): string {
    return this.lobby?.players.find((p) => p.id === id)?.name ?? (id === this.link.myId ? "Toi" : "?");
  }

  private colorOf(id: string): number {
    const index = this.lobby?.players.find((p) => p.id === id)?.color ?? 2;
    return PLAYER_COLORS[index] ?? PLAYER_COLORS[2];
  }

  private quit(message = ""): void {
    this.link.leave();
    this.scene.start("menu", { message });
  }
}
