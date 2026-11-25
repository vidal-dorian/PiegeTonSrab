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
  cardInfo,
  contactWith,
  DEFAULT_MOVEMENT,
  erasableAt,
  erasureKeepsPath,
  isSpawnPadCell,
  OBJECT_DEFS,
  parseLevel,
  PathGuard,
  placementKeepsPath,
  POINTS,
  prepareObjects,
  RACE_LEVELS,
  TIMING,
  vinesOf,
  withSolidObjects,
  type CardKind,
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
import { guarded } from "../errors";
import { InputSource } from "../input";
import type { GameLink } from "../net/link";
import { GhostView, INTERPOLATION_DELAY_MS } from "../render/ghostView";
import { Effects } from "../render/effects";
import { drawLevel } from "../render/levelView";
import { ObjectViews } from "../render/objectViews";
import { PlayerView, PLAYER_COLORS } from "../render/playerView";
import { Stains } from "../render/stains";
import { LocalPlayer } from "../sim/localPlayer";
import { RoundKills, statusAfterOwnReport, statusFromCountdown, type MyStatus } from "../sim/raceResume";
import { tuning } from "../tuningStore";
import type { RoomReply, RoomRequest } from "../sim/placementRoomProtocol";
import { noRoomText, refusedText, unplacedText } from "../ui/feedback";
import { overlay, type CardOut, type TopBarState } from "../ui/overlay";
import { formatPoints, trapCell } from "../ui/points";
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
/** How long the dashed preview shakes in red after a refused click, milliseconds. */
const REFUSAL_SHAKE_MS = 450;
/** The "vine already taken" notice is repeated at most this often for the same vine, milliseconds. */
const VINE_NOTICE_MS = 2000;
/**
 * Escape quits only when pressed twice within this long, milliseconds. One press is easy to
 * make by reflex (leaving full screen, closing a panel), and it used to throw the player out
 * of the game at once.
 */
const ESCAPE_CONFIRM_MS = 2000;
/** How long the end-of-placement messages stay on screen, milliseconds. */
const PLACEMENT_RESULT_MS = 6500;

type Phase = "carousel" | "placement" | "countdown" | "race" | "raceEnd" | "score" | "over";

interface Verdict {
  ok: boolean;
  /** The cell holds one of this round's objects or erasures: clicking takes it back. */
  takeBack: boolean;
  text: string;
}

/** An object of another player that this player chose to erase this round. */
interface Erasure {
  card: number;
  target: PlacedObject;
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
  /** Other players killed by each trap owner this round, so a kill notice shows its real gain. */
  private roundKills = new RoundKills();
  private targetScore = 10;

  /** Objects validated by the session (all players). */
  private objects: PlacedObject[] = [];
  // Placement
  private pending: Array<PlacedObject & { card: number }> = [];
  /** Objects of other players this player erases this round (at most one: one eraser per hand). */
  private erasing: Erasure[] = [];
  private offer: Array<{ kind: CardKind; used: boolean }> = [];
  private selected: number | null = null;
  private needed = 0;
  private validated = false;
  private doneIds: string[] = [];
  private endsAt = 0;
  private levelIndex = 0;
  /** Cards the player discarded ("Défausser"); clicking one takes it back into the hand. */
  private discarded = new Set<number>();
  /** Kinds with no accepted cell left anywhere on the map (their cards are discarded). */
  private noRoom = new Set<ObjectKind>();
  /** Kinds already announced as having no room this round (the notice is shown once). */
  private announcedNoRoom = new Set<ObjectKind>();
  /** Searches for room off the main thread (placementRoom.worker.ts); null if workers are unavailable. */
  private roomWorker: Worker | null = null;
  private roomGen = 0;
  /** Last refused click: the dashed preview shakes in red there for a moment. */
  private refusal: { x: number; y: number; at: number } | null = null;
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
  /** A block request is waiting for the session's answer, or our block was accepted. */
  private blockRequested = false;
  private blockPlaced = false;
  /** Cell of the last block request, to show a refusal there. */
  private blockCell: { x: number; y: number } | null = null;
  /** When we last said that a vine was taken, per vine (performance.now()). */
  private vineNoticeAt = new Map<number, number>();
  /** The "over" message, kept to show the end screen again if the host changes. */
  private overMsg: ServerMessageOf<"over"> | null = null;
  private spectating: string | null = null;
  /** When Escape was last pressed (performance.now), for the second press that quits. */
  private escapeAt = -Infinity;
  /** Bumped by each run of the scene, so a handler attached late never lands on a stopped one. */
  private handlerGen = 0;
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
  /** Ink crosses over the objects this player erases. */
  private eraseMarks!: Phaser.GameObjects.Graphics;
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
    this.levelIndex = RACE_LEVELS[data.start.levelIndex] ? data.start.levelIndex : 0;
    this.level = parseLevel(RACE_LEVELS[this.levelIndex]!);
    this.phase = "carousel";
    this.round = 0;
    // Scores so far: a player joining a running game again gets them with the gameStart.
    this.totals = { ...(data.start.totals ?? {}) };
    this.objects = [];
    this.pending = [];
    this.erasing = [];
    this.blocks = [];
    this.ghosts = new Map();
    this.lastTopBar = "";
    this.cleanup = [];
    this.myStatus = "running";
    this.overMsg = null;
    this.roomGen = 0;
    this.escapeAt = -Infinity;

    this.gridGfx = drawLevel(this, this.level).grid;
    this.stains = new Stains(this);
    this.effects = new Effects(this);
    this.objectViews = new ObjectViews(this);
    this.preview = this.add.graphics().setDepth(5);
    this.eraseMarks = this.add.graphics().setDepth(4);
    this.arrows = this.add.graphics().setDepth(9).setScrollFactor(0);
    this.playerView = new PlayerView(this, this.colorOf(this.link.myId));
    this.player = new LocalPlayer(this.level, this.level, tuning.movement);
    this.player.selfId = this.link.myId;
    this.player.seat = this.seatOf(this.link.myId);
    this.player.reset();
    this.vineHolders = new Map();
    this.leaderId = null;
    this.player.canHoldVine = (id) => {
      const holder = this.vineHolders.get(id);
      const free = holder === undefined || holder === this.link.myId;
      // Touching a vine someone else holds does nothing: say why, once in a while.
      if (!free && this.phase === "race") {
        const now = performance.now();
        if (now - (this.vineNoticeAt.get(id) ?? -Infinity) > VINE_NOTICE_MS) {
          this.vineNoticeAt.set(id, now);
          overlay.showNotice(`Liane déjà prise par ${this.nameOf(holder!)}`, 1500);
        }
      }
      return free;
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
      else this.quit(this.link.closeMessage ?? "Déconnecté du serveur.");
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.handlerGen++;
      this.link.setHandler(null);
      this.link.onStatus = null;
      this.controls.destroy();
      for (const fn of this.cleanup) fn();
      for (const g of this.ghosts.values()) g.destroy();
      this.objectViews.destroy();
      this.roomWorker?.terminate();
      this.roomWorker = null;
      carouselScreen.hide();
      overlay.hideAll();
    });

    overlay.hideAll();
    // Hide the level while the carousel spins, so it does not give the result away.
    this.cameras.main.setAlpha(0);
    carouselScreen.show(RACE_LEVELS, data.start.levelIndex, data.start.spinMs);
    overlay.setHelp("Échap deux fois : quitter la partie");
    // Messages that waited while the scene (re)started are replayed as soon as the handler is
    // set. Not from here: create() runs inside a Phaser frame, and the frame must not carry
    // a whole backlog (a reconnection, a tab left in the background). The microtask runs once
    // the frame is over, before any new message can arrive.
    const gen = ++this.handlerGen;
    queueMicrotask(() => {
      if (gen === this.handlerGen) this.link.setHandler((msg) => this.onMessage(msg));
    });
  }

  /** Called by the tuning panel whenever a value changes. */
  applyTuning(): void {
    this.player.controller.retune();
    this.playerView.applyTuning();
  }

  // --- Messages from the session ------------------------------------------------------

  /** One message from the session. An error in it is reported, never thrown (errors.ts). */
  private onMessage(msg: ServerMessage): void {
    guarded(`le message « ${msg.type} »`, () => this.handleMessage(msg));
  }

  private handleMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "lobby": {
        const hostBefore = this.lobby?.hostId;
        this.lobby = msg.lobby;
        this.targetScore = msg.lobby.targetScore;
        this.player.seat = this.seatOf(this.link.myId);
        // Back to the lobby after the end of a game (online).
        if (!msg.lobby.inGame && this.phase === "over" && this.link.online) {
          // Let go now, as for gameStart: the lobby only starts on the next frame, and what
          // comes meanwhile (a quick new game) is for it.
          this.link.setHandler(null);
          this.scene.start("lobby", { link: this.link, lobby: msg.lobby });
        } else if (this.phase === "over" && this.overMsg && hostBefore !== msg.lobby.hostId && this.link.online) {
          // The host left: the new host needs the "Rejouer" button, or nobody could restart.
          this.showGameOver(this.overMsg);
          if (msg.lobby.hostId === this.link.myId) overlay.showNotice("L'hôte est parti : tu es le nouvel hôte", 4000);
        }
        this.dropGhostsNotIn(msg.lobby.players.map((p) => p.id));
        // Names and "done" marks in the tray come from the lobby.
        if (this.phase === "placement") this.renderTray();
        break;
      }
      case "renamed":
        this.renamePlayer(msg.from, msg.to);
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
        else this.ownReport("dead");
        if (msg.id === this.spectating) this.pickSpectateTarget(1);
        this.announceKill(msg);
        break;
      case "playerFinished":
        if (msg.id !== this.link.myId) overlay.showNotice(`${this.nameOf(msg.id)} est arrivé en ${msg.time.toFixed(2)} s`);
        else this.ownReport("finished");
        if (msg.id === this.spectating) this.pickSpectateTarget(1);
        break;
      case "block":
        this.blocks.push({ block: msg.block, appearsAt: msg.appearsAt, active: false });
        if (msg.block.ownerId === this.link.myId) {
          this.blockRequested = true;
          this.blockPlaced = true;
          this.preview.clear();
        }
        this.syncObjectViews();
        break;
      case "blockRefused":
        this.blockRequested = false;
        // Said where the player clicked; the notice is for a refusal with no cell to point at.
        if (this.blockCell && this.phase === "race") this.showRefusal(this.blockCell.x, this.blockCell.y, msg.reason);
        else overlay.showNotice(msg.reason);
        break;
      case "stomped":
        this.onStomped(msg.by, msg.victim);
        break;
      case "vine":
        if (msg.holder === null) this.vineHolders.delete(msg.id);
        else this.vineHolders.set(msg.id, msg.holder);
        // Someone else got there first: let go, and say so (otherwise the fall looks like a bug).
        if (msg.holder !== null && msg.holder !== this.link.myId && this.player.controller.swing?.vineId === msg.id) {
          this.player.letGo();
          this.vineNoticeAt.set(msg.id, performance.now());
          overlay.showNotice(`${this.nameOf(msg.holder)} a attrapé la liane avant toi`, 1800);
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

  /**
   * A player came back into the game under a new connection id: everything this scene keeps
   * by player id follows. Their ghost is dropped (a new one comes with the new id) instead of
   * staying frozen where they were.
   */
  private renamePlayer(from: string, to: string): void {
    const r = (id: string) => (id === from ? to : id);
    if (this.lobby) {
      this.lobby = { ...this.lobby, hostId: r(this.lobby.hostId), players: this.lobby.players.map((p) => ({ ...p, id: r(p.id) })) };
    }
    this.totals = Object.fromEntries(Object.entries(this.totals).map(([id, v]) => [r(id), v]));
    if (this.overMsg) {
      const totals = Object.fromEntries(Object.entries(this.overMsg.totals).map(([id, v]) => [r(id), v]));
      this.overMsg = { ...this.overMsg, winner: r(this.overMsg.winner), totals };
    }
    this.dropGhost(from);
    this.touching.delete(from);
    this.lastStompAt.delete(from);
    for (const [vine, holder] of this.vineHolders) this.vineHolders.set(vine, r(holder));
    if (this.spectating === from) this.spectating = null;
    this.doneIds = this.doneIds.map(r);
    this.roundKills.rename(from, to);
    for (const o of this.objects) if (o.ownerId === from) o.ownerId = to;
    for (const b of this.blocks) if (b.block.ownerId === from) b.block.ownerId = to;
    this.updateCrowns();
    this.syncObjectViews();
    if (this.phase === "placement") this.renderTray();
  }

  private dropGhost(id: string): void {
    this.ghosts.get(id)?.destroy();
    this.ghosts.delete(id);
  }

  /** Ghosts of players no longer in the room (taken back under another id, left in the lobby). */
  private dropGhostsNotIn(ids: readonly string[]): void {
    for (const id of [...this.ghosts.keys()]) if (!ids.includes(id)) this.dropGhost(id);
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
    this.discarded = new Set();
    this.noRoom = new Set();
    this.announcedNoRoom = new Set();
    this.refusal = null;
    // Rebuild our own choice when rejoining in the middle of placement.
    this.pending = [];
    this.erasing = [];
    for (const c of msg.mine) {
      const card = this.offer.findIndex((o) => !o.used && o.kind === c.kind);
      if (card < 0) continue;
      if (c.kind === "eraser") {
        const target = this.objects.find((o) => o.x === c.x && o.y === c.y);
        if (!target) continue;
        this.offer[card]!.used = true;
        this.erasing.push({ card, target });
        continue;
      }
      this.offer[card]!.used = true;
      const obj: PlacedObject & { card: number } = { id: this.nextLocalId--, kind: c.kind, x: c.x, y: c.y, ownerId: this.link.myId, card };
      if (c.dir !== undefined) obj.dir = c.dir;
      this.pending.push(obj);
    }
    this.selected = this.chosenCount() < this.needed && !this.validated ? this.nextFreeCard() : null;
    for (const g of this.ghosts.values()) g.clear();
    this.player.reset();
    this.rebuildGraph();
    this.scanForRoom();
    overlay.setHelp("Clic : poser ou reprendre · 1 à 3 : choisir l'objet · R ou clic droit : tourner le canon · Échap ×2 : quitter");
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

  /** Cards used so far this round: objects placed plus objects marked for erasing. */
  private chosenCount(): number {
    return this.pending.length + this.erasing.length;
  }

  /**
   * The session's objects minus those this player erases (`erasing` by default), measured
   * again since erasing a solid object can lengthen a cannon line. The session applies
   * erasers before new objects, so this is what our pending objects are checked against.
   */
  private baseObjects(erasing: readonly Erasure[] = this.erasing): PlacedObject[] {
    if (erasing.length === 0) return this.objects;
    const erased = new Set(erasing.map((e) => e.target.id));
    return prepareObjects(this.level, this.objects.filter((o) => !erased.has(o.id)));
  }

  /**
   * Graph for the hover check. It uses DEFAULT_MOVEMENT, like the server, so the answer on
   * screen matches the server's (tuning panel values only change how this client moves).
   */
  private rebuildGraph(): void {
    this.graph = buildReachGraph(this.level, [...this.baseObjects(), ...this.pending.map((p) => this.plain(p))], DEFAULT_MOVEMENT);
    this.verdicts.clear();
    this.syncObjectViews();
    this.drawEraseMarks();
  }

  /** A thick ink cross over each object this player erases. */
  private drawEraseMarks(): void {
    this.eraseMarks.clear();
    this.eraseMarks.lineStyle(6, 0x161616, 1);
    const m = CELL_PX * 0.18;
    for (const { target } of this.erasing) {
      const x = target.x * CELL_PX;
      const y = target.y * CELL_PX;
      this.eraseMarks.lineBetween(x + m, y + m, x + CELL_PX - m, y + CELL_PX - m);
      this.eraseMarks.lineBetween(x + CELL_PX - m, y + m, x + m, y + CELL_PX - m);
    }
  }

  private syncObjectViews(): void {
    const dimmed = new Set<number>([
      ...this.pending.map((p) => p.id),
      ...this.erasing.map((e) => e.target.id),
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
  private dirFor(kind: CardKind): Dir | undefined {
    return kind !== "eraser" && OBJECT_DEFS[kind].rotatable ? this.placeDir : undefined;
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
      let turned = false;
      for (let i = 0; i < 3 && !turned; i++) {
        d = next(d);
        const hand = this.pending.map((p) => (p === target ? { ...this.plain(p), dir: d } : this.plain(p)));
        if (this.wholeHandAccepted(hand)) {
          target.dir = d;
          this.placeDir = d;
          this.sendPlacement(false);
          this.rebuildGraph();
          this.scanForRoom();
          turned = true;
        }
      }
      if (!turned) this.showRefusal(target.x, target.y, "Tourné autrement, il bloquerait le chemin");
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
  private wholeHandAccepted(pending: readonly PlacedObject[], erasing: readonly Erasure[] = this.erasing): boolean {
    const base = this.baseObjects(erasing);
    // The cached graph is for the current erasures only.
    const graph = erasing === this.erasing ? (this.baseGraph ??= buildReachGraph(this.level, base, DEFAULT_MOVEMENT)) : undefined;
    const guard = new PathGuard(this.level, base, DEFAULT_MOVEMENT, graph ? { graph } : undefined);
    // An erased object's cell counts as taken, as on screen: the hand never goes there.
    const taken = (x: number, y: number) => erasing.some((e) => e.target.x === x && e.target.y === y);
    return pending.every((p) => !taken(p.x, p.y) && canPlaceAt(this.level, guard.objects, p.x, p.y) && guard.tryAdd(p));
  }

  /** Verdict for the eraser card on the cell (x, y). */
  private eraserVerdict(x: number, y: number): Verdict {
    const { target, reason } = erasableAt(this.objects, x, y, this.link.myId);
    if (!target) return { ok: false, takeBack: false, text: reason };
    // Like the session: the erasure is checked on the level without our new objects...
    if (!erasureKeepsPath(this.level, this.baseObjects(), target, DEFAULT_MOVEMENT)) {
      return { ok: false, takeBack: false, text: "Gommer ça bloquerait le chemin vers l'arrivée" };
    }
    // ...then our new objects are added one by one to what is left.
    const hand = this.pending.map((p) => this.plain(p));
    if (!this.wholeHandAccepted(hand, [...this.erasing, { card: -1, target }])) {
      return { ok: false, takeBack: false, text: "Sans cet objet, un de tes objets couperait le chemin : reprends-le d'abord" };
    }
    const owner = target.ownerId ? ` de ${this.nameOf(target.ownerId)}` : "";
    return { ok: true, takeBack: false, text: `Gommer : ${OBJECT_DEFS[target.kind].name}${owner}` };
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
    const erasure = this.erasing.find((e) => e.target.x === x && e.target.y === y);
    if (erasure) {
      const key = `unerase,${x},${y}`;
      const cached = this.verdicts.get(key);
      if (cached) return cached;
      const hand = this.pending.map((p) => this.plain(p));
      const v = this.wholeHandAccepted(hand, this.erasing.filter((e) => e !== erasure))
        ? { ok: true, takeBack: true, text: "Clic : ne plus gommer cet objet" }
        : { ok: false, takeBack: true, text: "Si cet objet revient, un de tes objets couperait le chemin : reprends-le d'abord" };
      this.verdicts.set(key, v);
      return v;
    }
    const kind = this.selected !== null ? this.offer[this.selected]?.kind : undefined;
    if (!kind) return { ok: false, takeBack: false, text: this.nothingLeft() ? this.idleText() : "Choisis un objet" };
    const dir = this.dirFor(kind);
    const key = `${x},${y},${kind},${dir ?? ""}`;
    const cached = this.verdicts.get(key);
    if (cached) return cached;
    if (kind === "eraser") {
      const v = this.eraserVerdict(x, y);
      this.verdicts.set(key, v);
      return v;
    }

    const all = [...this.objects, ...this.pending.map((p) => this.plain(p))];
    const l = this.level;
    let v: Verdict;
    if (x < 0 || x >= l.width || y < 0 || y >= l.height || l.solid[y * l.width + x]) {
      v = { ok: false, takeBack: false, text: "Pas dans le décor" };
    } else if (isSpawnPadCell(l, x, y) || (l.finish && x === l.finish.x && y === l.finish.y)) {
      v = { ok: false, takeBack: false, text: "Pas sur la zone de départ ni sur l'arrivée" };
    } else if (!canPlaceAt(l, all, x, y)) {
      v = { ok: false, takeBack: false, text: "Case déjà prise" };
    } else if (
      !placementKeepsPath(
        l,
        [...this.baseObjects(), ...this.pending.map((p) => this.plain(p))],
        { id: 0, kind, x, y, ...(dir !== undefined ? { dir } : {}) },
        DEFAULT_MOVEMENT,
        this.graph ?? undefined,
      )
    ) {
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
    if (!v.ok) {
      this.showRefusal(x, y, v.text);
      return;
    }
    if (v.takeBack) {
      const i = this.pending.findIndex((p) => p.x === x && p.y === y);
      const j = this.erasing.findIndex((e) => e.target.x === x && e.target.y === y);
      const taken = i >= 0 ? this.pending.splice(i, 1)[0] : j >= 0 ? this.erasing.splice(j, 1)[0] : undefined;
      if (j >= 0 && i < 0) this.baseGraph = null;
      if (taken) {
        this.offer[taken.card]!.used = false;
        this.discarded.delete(taken.card);
        this.selected = taken.card;
      }
    } else if (this.selected !== null && this.offer[this.selected]!.kind === "eraser") {
      const card = this.selected;
      const { target } = erasableAt(this.objects, x, y, this.link.myId);
      if (!target) return;
      this.erasing.push({ card, target });
      this.baseGraph = null;
      this.offer[card]!.used = true;
      this.selected = this.chosenCount() < this.needed ? this.nextFreeCard() : null;
    } else if (this.selected !== null) {
      const card = this.selected;
      const kind = this.offer[card]!.kind;
      if (kind === "eraser") return;
      const obj: PlacedObject & { card: number } = { id: this.nextLocalId--, kind, x, y, ownerId: this.link.myId, card };
      const dir = this.dirFor(kind);
      if (dir !== undefined) obj.dir = dir;
      this.pending.push(obj);
      this.offer[card]!.used = true;
      this.selected = this.chosenCount() < this.needed ? this.nextFreeCard() : null;
    }
    this.sendPlacement(false);
    this.rebuildGraph();
    this.scanForRoom();
    this.renderTray();
  }

  /**
   * A refused action at a cell: the reason floats right above it for a moment and the dashed
   * preview there shakes in red, so the player sees at once that the click did not work.
   */
  private showRefusal(x: number, y: number, text: string): void {
    this.refusal = { x, y, at: this.time.now };
    const p = this.cellToClient(x, y);
    overlay.floatLabel(text, p.x, p.y);
  }

  /** Top centre of a cell, in page (CSS) pixels. */
  private cellToClient(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const gx = ((x + 0.5) * CELL_PX - cam.worldView.x) * cam.zoom;
    const gy = (y * CELL_PX - cam.worldView.y) * cam.zoom;
    return { x: rect.left + (gx * rect.width) / this.scale.width, y: rect.top + (gy * rect.height) / this.scale.height };
  }

  /** Why a card can't be played right now, if it can't ("Plus de place", "Défaussé"). */
  private cardOut(i: number): CardOut | undefined {
    const c = this.offer[i];
    if (!c || c.used) return undefined;
    if (this.discarded.has(i)) return "discarded";
    return c.kind !== "eraser" && this.noRoom.has(c.kind) ? "noRoom" : undefined;
  }

  /** Nothing left to place: everything is placed, discarded or has no room. */
  private nothingLeft(): boolean {
    return this.chosenCount() >= this.needed || this.offer.every((c, i) => c.used || this.cardOut(i) !== undefined);
  }

  private idleText(): string {
    if (this.validated) return "Pose validée : en attente des autres";
    if (this.chosenCount() >= this.needed) return "Tout est posé : valide";
    return this.chosenCount() > 0 ? "Plus rien à poser : valide la pose" : "Plus rien à poser : valide (tu ne poses rien ce round)";
  }

  /**
   * Ask the worker whether each kind still in hand has a cell left where the session would
   * accept it, with the map as it is now (our own pending objects included). Called whenever
   * those change; a newer request makes the worker drop the older one.
   */
  private scanForRoom(): void {
    const gen = ++this.roomGen;
    if (this.phase !== "placement" || this.validated) return;
    // The eraser is not searched for: it is only dealt when there is something to erase.
    const kinds = [
      ...new Set(this.offer.flatMap((c, i) => (!c.used && !this.discarded.has(i) && c.kind !== "eraser" ? [c.kind] : []))),
    ];
    if (kinds.length === 0) return;
    if (!this.roomWorker) {
      try {
        this.roomWorker = new Worker(new URL("../sim/placementRoom.worker.ts", import.meta.url), { type: "module" });
        this.roomWorker.onmessage = (e: MessageEvent<RoomReply>) => this.onRoomReply(e.data);
      } catch {
        // No workers: no automatic discard. "Défausser" still lets the player go on.
        return;
      }
    }
    const req: RoomRequest = {
      gen,
      levelIndex: this.levelIndex,
      objects: [...this.baseObjects(), ...this.pending.map((p) => this.plain(p))],
      kinds,
    };
    this.roomWorker.postMessage(req);
  }

  private onRoomReply(r: RoomReply): void {
    if (r.gen !== this.roomGen || this.phase !== "placement" || this.validated) return;
    const had = this.noRoom.has(r.kind);
    if (r.room) this.noRoom.delete(r.kind);
    else this.noRoom.add(r.kind);
    if (had === !r.room) return;
    if (!r.room && !this.announcedNoRoom.has(r.kind)) {
      this.announcedNoRoom.add(r.kind);
      overlay.showNotice(noRoomText(r.kind), 4000);
    }
    // The selected card can't be played any more: move on to the next one.
    if (this.selected !== null && this.cardOut(this.selected) !== undefined) {
      this.selected = this.chosenCount() < this.needed ? this.nextFreeCard() : null;
    } else if (this.selected === null && this.chosenCount() < this.needed) {
      this.selected = this.nextFreeCard();
    }
    this.verdicts.clear();
    this.renderTray();
  }

  /** "Défausser": give up the selected object for this round. */
  private discardSelected(): void {
    if (this.phase !== "placement" || this.validated || this.selected === null) return;
    this.discarded.add(this.selected);
    this.selected = this.chosenCount() < this.needed ? this.nextFreeCard() : null;
    this.verdicts.clear();
    this.renderTray();
  }

  private sendPlacement(done: boolean): void {
    this.link.send({
      type: "placement",
      objects: [
        ...this.pending.map(({ kind, x, y, dir }) => (dir !== undefined ? { kind, x, y, dir } : { kind, x, y })),
        ...this.erasing.map(({ target }) => ({ kind: "eraser" as const, x: target.x, y: target.y })),
      ],
      done,
    });
  }

  private nextFreeCard(): number | null {
    const i = this.offer.findIndex((c, j) => !c.used && this.cardOut(j) === undefined);
    return i >= 0 ? i : null;
  }

  private selectCard(i: number): void {
    const card = this.offer[i];
    if (this.phase !== "placement" || this.validated || !card) return;
    // Keyboard shortcuts reach cards the tray shows as unavailable: say why nothing happens.
    if (card.used) {
      overlay.showNotice(
        card.kind === "eraser"
          ? "Gomme déjà utilisée : clique sur l'objet barré pour la reprendre"
          : `${OBJECT_DEFS[card.kind].name} déjà posé : clique dessus dans le niveau pour le reprendre`,
        2500,
      );
      return;
    }
    if (this.chosenCount() >= this.needed) {
      overlay.showNotice("Tout est posé : reprends un objet dans le niveau pour en changer", 2500);
      return;
    }
    if (this.discarded.has(i)) {
      // Taking a discarded card back into the hand.
      this.discarded.delete(i);
      this.scanForRoom();
    } else if (card.kind !== "eraser" && this.noRoom.has(card.kind)) {
      overlay.showNotice(noRoomText(card.kind), 2500);
      return;
    }
    this.selected = i;
    this.verdicts.clear();
    this.renderTray();
  }

  private currentHint(): { text: string; bad: boolean } {
    const v = this.hover ? this.verdictAt(this.hover.x, this.hover.y) : null;
    const idle = this.validated || this.nothingLeft() ? this.idleText() : "Survole le niveau pour poser";
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
          const dir = this.dirFor(c.kind) !== undefined ? (placed?.dir ?? this.placeDir) : undefined;
          return { ...c, arrow: dir !== undefined ? DIR_ARROWS[dir] : undefined, out: this.cardOut(i) };
        }),
        selected: this.validated ? null : this.selected,
        placed: this.chosenCount(),
        needed: this.needed,
        canValidate: !this.validated && this.nothingLeft(),
        canDiscard: !this.validated && this.selected !== null,
        hint: hint.text,
        hintBad: hint.bad,
        others,
        waiting: this.validated,
      },
      {
        onSelect: (i) => this.selectCard(i),
        onDiscard: () => this.discardSelected(),
        onValidate: () => {
          if (this.validated || !this.nothingLeft()) return;
          this.validated = true;
          this.roomGen++;
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

  /** The red shake after a refused click; returns whether it is still going on. */
  private drawRefusal(): boolean {
    const r = this.refusal;
    if (!r) return false;
    const age = this.time.now - r.at;
    if (age > REFUSAL_SHAKE_MS) {
      this.refusal = null;
      return false;
    }
    const fade = 1 - age / REFUSAL_SHAKE_MS;
    const dx = Math.sin(age * 0.07) * 5 * fade;
    const x = r.x * CELL_PX + dx;
    const y = r.y * CELL_PX;
    this.preview.fillStyle(0xb3361a, 0.3 * fade);
    this.preview.fillRect(x + 3, y + 3, CELL_PX - 6, CELL_PX - 6);
    this.preview.lineStyle(5, 0xb3361a, 1);
    drawDashedRect(this.preview, x + 3, y + 3, CELL_PX - 6, CELL_PX - 6);
    return true;
  }

  private drawPlacementPreview(): void {
    this.preview.clear();
    const shaking = this.drawRefusal();
    if (!this.hover || this.validated) return;
    // The refused cell shakes on its own; don't draw the still preview over it.
    if (shaking && this.refusal && this.refusal.x === this.hover.x && this.refusal.y === this.hover.y) return;
    const v = this.verdictAt(this.hover.x, this.hover.y);
    const color = v.takeBack && v.ok ? 0x161616 : v.ok ? 0xf07a2e : 0xb3361a;
    this.preview.lineStyle(4, color, 1);
    drawDashedRect(this.preview, this.hover.x * CELL_PX + 3, this.hover.y * CELL_PX + 3, CELL_PX - 6, CELL_PX - 6);
    // A cannon about to be placed: show where it would fire.
    const kind = this.selected !== null ? this.offer[this.selected]?.kind : undefined;
    if (!v.takeBack && kind && kind !== "eraser" && OBJECT_DEFS[kind].rotatable) {
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
    // Objects still in hand when placement ended (named in the "time ran out" message).
    const inHand =
      this.phase === "placement" ? this.offer.flatMap((c) => (!c.used && c.kind !== "eraser" ? [c.kind] : [])) : [];
    this.roomGen++;
    this.phase = "countdown";
    this.round = msg.round;
    // Already measured by the session; measured again here so an older session can't break the drawing.
    this.objects = prepareObjects(this.level, msg.objects);
    this.pending = [];
    this.erasing = [];
    this.eraseMarks.clear();
    this.blocks = [];
    this.blockRequested = false;
    this.blockPlaced = false;
    this.blockCell = null;
    this.refusal = null;
    this.vineNoticeAt.clear();
    this.roundKills.reset(msg.deaths);
    this.spectating = null;
    // Rejoining mid-race: a run the session already counts as over stays over (we watch).
    this.myStatus = statusFromCountdown(msg.status);
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
    overlay.setHelp("Q/A ← · D → · Espace/Z/↑ saut · S/↓ lâcher la liane · Échap ×2 : quitter");
    // What became of our objects, named: refused ones and why, and those never placed in time.
    const lines = msg.refusedObjects
      ? refusedText(msg.refusedObjects)
      : msg.refused > 0
        ? [`${msg.refused} de tes objets refusé${msg.refused > 1 ? "s" : ""} : avec ceux des autres, ils auraient bloqué le chemin.`]
        : [];
    if (msg.unplaced) lines.push(unplacedText(msg.unplaced, inHand));
    if (lines.length > 0) overlay.showNotice(lines.join("\n"), PLACEMENT_RESULT_MS);
  }

  private startRace(): void {
    this.phase = "race";
    this.player.reset();
    this.poseTimer = 0;
    // Drop keys pressed during the countdown.
    this.controls.takeStepInput();
    if (this.myStatus !== "running") {
      // Rejoined a race our run is already over in: we watch.
      overlay.hideBanner();
      return;
    }
    overlay.showBanner("Partez !");
    this.time.delayedCall(600, () => {
      if (this.phase === "race" && this.myStatus === "running") overlay.hideBanner();
    });
  }

  /**
   * The session reports our own death or finish. Normally we sent it and already stopped. If
   * we are still running, it is a report sent while offline that reached the session after we
   * rejoined: the session counts that run, so this one is over (it would count for nothing).
   */
  private ownReport(report: "dead" | "finished"): void {
    if (this.phase !== "race" && this.phase !== "countdown") return;
    const next = statusAfterOwnReport(this.myStatus, report);
    if (next === this.myStatus) return;
    this.myStatus = next;
    overlay.showNotice(report === "dead" ? "Tu es mort pendant la coupure" : "Tu es arrivé pendant la coupure", 2500);
    this.pickSpectateTarget(0);
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
        const pushedBy = outcome.killer ? this.player.creditedPusher(outcome.killer.ownerId) : null;
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
   * Tell everyone who died in whose trap, and who pushed them in, with what the kill earns
   * the trap's owner ("+1", "+2" for a push by the owner, "+0,5" past killCap) and a burst
   * of that gain where the victim died. The gain assumes a scored round: if nobody finishes,
   * the table later shows 0,5 and its verdict line says why. Pits and map objects score
   * nothing and the victim already has its own banner, so they stay quiet.
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
      overlay.showNotice(text, 2500);
      return;
    }
    const plus = `+${formatPoints(this.roundKills.add({ id: victim, killerOwner: owner, pushedBy: pusher }) ?? 0)}`;
    if (pusher === owner) {
      if (owner === me) text = `Tu as poussé ${name(victim)} dans ton piège ! ${plus}`;
      else if (victim === me) text = `${name(owner)} t'a poussé dans son piège ! ${plus}`;
      else text = `${name(owner)} a poussé ${name(victim)} dans son piège ! ${plus}`;
    } else {
      // The owner gets the kill; someone else pushing the victim in gets nothing.
      const trap = owner === me ? "ton piège" : `le piège de ${name(owner)}`;
      if (pusher === me) text = `Tu as poussé ${name(victim)} dans ${trap} ${plus}`;
      else if (pusher && victim === me) text = `${name(pusher)} t'a poussé dans ${trap} ${plus}`;
      else if (pusher) text = `${name(pusher)} a poussé ${name(victim)} dans ${trap} ${plus}`;
      else if (victim === me) text = `Tu es mort dans ${trap} ${plus}`;
      else text = `${name(victim)} est mort dans ${trap} ${plus}`;
    }
    this.effects.pof(msg.x, msg.y - 0.6, plus);
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
    // Rejoined as a spectator before any ghost arrived: watch someone once they do.
    else if (!this.spectating) this.pickSpectateTarget(0);
    const parts: string[] = [];
    if (this.spectating) parts.push(`Tu regardes ${this.nameOf(this.spectating)} · ←/→ pour changer`);
    if (this.myStatus === "dead" && !this.blockPlaced) parts.push("Clic : poser ton bloc (1 par round)");
    overlay.setHelp(parts.join(" · ") || "Échap ×2 : quitter");
  }

  /** Why a dead player's block can't go on this cell, as far as this client can tell (null: try it). */
  private blockVerdict(x: number, y: number): string | null {
    const l = this.level;
    if (x < 0 || x >= l.width || y < 0 || y >= l.height || l.solid[y * l.width + x]) return "Pas dans le décor";
    if (isSpawnPadCell(l, x, y) || (l.finish && x === l.finish.x && y === l.finish.y)) return "Pas sur la zone de départ ni sur l'arrivée";
    if (!canPlaceAt(l, this.allObjects(), x, y)) return "Case occupée";
    return null;
  }

  /** A dead player clicks the level to drop their block. */
  private clickBlockCell(x: number, y: number): void {
    if (this.blockPlaced) {
      this.showRefusal(x, y, "Un seul bloc par round");
      return;
    }
    if (this.blockRequested) return; // waiting for the session's answer
    const why = this.blockVerdict(x, y);
    if (why) {
      this.showRefusal(x, y, why);
      return;
    }
    this.blockRequested = true;
    this.blockCell = { x, y };
    this.link.send({ type: "block", x, y });
  }

  private drawBlockPreview(): void {
    this.preview.clear();
    if (this.phase !== "race" || this.myStatus !== "dead") return;
    const shaking = this.drawRefusal();
    if (this.blockRequested || !this.hover) return;
    const { x, y } = this.hover;
    if (shaking && this.refusal && this.refusal.x === x && this.refusal.y === y) return;
    const ok = this.blockVerdict(x, y) === null;
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
    // Rejoining on the score screen comes right after a gameStart: no carousel then.
    carouselScreen.hide();
    this.cameras.main.setAlpha(1);
    this.phase = "score";
    this.totals = msg.totals;
    this.updateCrowns();
    overlay.hideBanner();
    overlay.setHelp("");
    let verdict: string;
    if (msg.verdict === "nobody-finished") {
      verdict = `Personne n'est arrivé : seuls les kills comptent, ${formatPoints(POINTS.minKill)} chacun.`;
    } else if (msg.verdict === "everyone-finished") verdict = "Tout le monde est arrivé : niveau trop facile, aucun point.";
    else verdict = msg.lines.length === 1 ? "En solo, la règle « tout le monde arrive = 0 point » est ignorée." : "";
    overlay.showScores({
      title: `Fin du round ${msg.round} · ${this.level.name}`,
      verdict,
      headers: ["Arrivée", "1er", "Seul", "Pièges", "Round", "Total"],
      rows: msg.lines.map((l) => ({
        name: this.nameOf(l.playerId),
        cells: [
          formatPoints(l.finish),
          formatPoints(l.first),
          formatPoints(l.onlyOne),
          trapCell(l),
          formatPoints(l.total),
          formatPoints(msg.totals[l.playerId] ?? 0),
        ],
      })),
    });
  }

  private showGameOver(msg: ServerMessageOf<"over">): void {
    carouselScreen.hide();
    this.cameras.main.setAlpha(1);
    this.phase = "over";
    this.overMsg = msg;
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
        .map(([id, s]) => ({ name: this.nameOf(id), cells: [formatPoints(s)] })),
      actions,
    });
  }

  // --- Frame update --------------------------------------------------------------------

  override update(_time: number, deltaMs: number): void {
    // One exception here would stop this player's game for good (see errors.ts): report it
    // and carry on with the next frame instead.
    guarded("l'image de jeu", () => this.frame(deltaMs));
  }

  private frame(deltaMs: number): void {
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
      const now = performance.now();
      if (now - this.escapeAt <= ESCAPE_CONFIRM_MS) {
        this.quit();
        return;
      }
      this.escapeAt = now;
      const reminder = this.link.online ? "Appuie encore sur Échap pour quitter la partie" : "Appuie encore sur Échap pour revenir au menu";
      // While the connection is down, the "connection lost" notice must stay on screen.
      if (this.link.isLost) overlay.showNotice(`Connexion perdue, reconnexion…\n${reminder}`, 0);
      else overlay.showNotice(reminder, ESCAPE_CONFIRM_MS);
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
      else if (this.phase === "placement") this.showRefusal(cell.x, cell.y, "Pose déjà validée : en attente des autres");
      else if (this.phase === "race" && this.myStatus === "dead") this.clickBlockCell(cell.x, cell.y);
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

  /**
   * Spawn seat of a player: their colour index, which the session hands out uniquely (0..4)
   * in order of arrival, so it doubles as a free spawn cell on the pad. 0 when unknown.
   */
  private seatOf(id: string): number {
    return this.lobby?.players.find((p) => p.id === id)?.color ?? 0;
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
