/**
 * The co-op game screen ("Sauve Ton Srab"): draws a CoopWorld (level, things, players, rope) with
 * the group camera, its HUD and Claude's bubbles, feeds it inputs, and shows the end-of-level card
 * (with the host's level list) when everyone is through the door.
 *
 * Where the world comes from is a driver:
 * - OnlineDriver (a room): the server runs the world. A player's screen can predict it (step B of
 *   the plan, net/predictedPlay.ts; chosen at each level start by net/reactivity.ts: ?predict=1 or
 *   ?predict=0, else the lobby's "Réactivité" setting, auto by the round trip): the drawn
 *   world runs ahead of the server with this player's keys at once and is corrected by every
 *   snapshot, smoothly; deaths, restarts, the win, the HUD's key and door come from the snapshots
 *   only. Otherwise, and for a spectator, this screen draws the snapshots just behind the newest
 *   one received (net/playout.ts), blended (step A);
 * - LocalDriver (dev tool ?coopLocal=2): the world runs here, from two keyboard halves.
 */
import Phaser from "phaser";
import {
  BIT_RESTART,
  COOP,
  COOP_DT,
  COOP_HZ,
  COOP_LEVELS,
  coopTitles,
  CoopWorld,
  deathQuip,
  decodeWorld,
  encodeInput,
  parseCoopLevel,
  RESTART_HOLD_STEPS,
  ROPE_MAX_LENGTH,
  terminalQuip,
  type CoopEvent,
  type CoopLevel,
  type CoopLevelDef,
  type CoopLobbyInfo,
  type CoopServerMessage,
  type CoopTitle,
  type CoopWorldState,
} from "@game/shared/coop";
import { CELL_PX } from "../config";
import { COOP_KEYS, InputSource, type KeyMap } from "../input";
import { Effects } from "../render/effects";
import { drawLevel } from "../render/levelView";
import { ObjectViews } from "../render/objectViews";
import { PLAYER_COLORS } from "../render/playerColors";
import { Stains } from "../render/stains";
import { overlay } from "../ui/overlay";
import { GroupCamera } from "./groupCamera";
import type { CoopLink } from "./net/coopLink";
import { CoopInputSender } from "./net/inputSender";
import { bracket, PlayoutClock } from "./net/playout";
import { PredictedPlay } from "./net/predictedPlay";
import { levelContinues, predictionWanted } from "./net/reactivity";
import { loadCleared, markCleared } from "./progress";
import { CoopBodyView } from "./render/coopBodyView";
import { stackLabels } from "./render/labelLayout";
import { captureFrame, lerpFrame, newFrame, type PropFrame } from "./render/propFrame";
import { RopeView } from "./render/ropeView";
import { drawnRopeSegments } from "./render/ropeSegments";
import { drawableTerrain, ThingViews } from "./render/thingViews";
import { ClaudeBubbles } from "./ui/claudeBubble";
import { CoopClearedScreen, type ClearedInfo, type HostChoice } from "./ui/coopCleared";
import { CoopHud, type HudState } from "./ui/coopHud";
import { coopBanner } from "./ui/coopScreens";
import { levelLabel } from "./ui/coopText";

export const COOP_SCENE_KEY = "coop";

/** Longest frame the simulation catches up on, seconds (a frozen tab does not fast-forward). */
const MAX_FRAME = 0.25;
/** Two presses of Échap within this long leave the game, ms. */
const QUIT_CONFIRM_MS = 2000;
/** The level card stays this long when a level starts, ms. */
const LEVEL_CARD_MS = 2500;

export interface CoopPlayerInfo {
  name: string;
  /** 0xRRGGBB, the player's seat colour. */
  color: number;
  isRuben: boolean;
}

type LevelMessage = Extract<CoopServerMessage, { type: "coopLevel" }>;
type SnapMessage = Extract<CoopServerMessage, { type: "coopSnap" }>;
type ClearedMessage = Extract<CoopServerMessage, { type: "coopCleared" }>;

export type CoopSceneData =
  | {
      mode: "local";
      level: CoopLevelDef;
      /** In rope order (friends in seat order, Ruben last). */
      players: CoopPlayerInfo[];
      /** One key map per body (null: nobody controls it). */
      localKeys: Array<KeyMap | null>;
      /** Levels the end-of-level card offers next (default: this one). */
      levels?: readonly CoopLevelDef[];
      onExit: () => void;
    }
  | {
      mode: "online";
      link: CoopLink;
      lobby: CoopLobbyInfo | null;
      level: LevelMessage;
      /**
       * The level the previous game screen was playing when this coopLevel came (absent: it came
       * to the lobby; null: to an end card). Only then can the coopLevel continue that level.
       */
      playing?: string | null;
      onExit: (message?: string) => void;
    };

/**
 * Something the world reported, to show: its events (a restart names who held R), with the tick
 * it happened at and the attempt it belongs to (a death's attempt is the one that ended).
 */
type ShownEvent = (Exclude<CoopEvent, { kind: "restart" }> | { kind: "restart"; attempt: number; by: string | null }) & { tick: number; at: number };

interface Driver {
  /** The world to draw (its bodies' flags drive the poses). */
  readonly world: CoopWorld;
  /**
   * What the HUD shows and what cannot be undone (the death freeze, the key, the door): the
   * server's latest world when predicting, else the drawn world itself.
   */
  readonly authority: CoopWorld;
  advance(dt: number): void;
  /** What moves, blended for this frame. */
  frame(): PropFrame;
  /** Events since the last call. */
  drainEvents(): ShownEvent[];
  /** Bodies holding R right now. */
  restartHolders(): number[];
  destroy(): void;
}

/** Dev tool: runs the world on this machine from local inputs. */
class LocalDriver implements Driver {
  private acc = 0;
  private prev = newFrame();
  private cur = newFrame();
  private out = newFrame();
  private held: number[] = [];
  private events: ShownEvent[] = [];

  constructor(
    readonly world: CoopWorld,
    private inputs: Array<InputSource | null>,
    private names: readonly string[],
  ) {
    captureFrame(world, this.cur);
    captureFrame(world, this.prev);
  }

  get authority(): CoopWorld {
    return this.world;
  }

  advance(dt: number): void {
    for (const i of this.inputs) i?.poll();
    this.acc += dt;
    let stepped = false;
    while (this.acc >= COOP_DT) {
      this.acc -= COOP_DT;
      captureFrame(this.world, this.prev);
      // R held is in the bits: the world restarts the level itself.
      const bits = this.inputs.map((src) => (src ? encodeInput(src.takeCoopInput()) : 0));
      this.held = bits;
      this.world.step(bits);
      stepped = true;
      const w = this.world;
      for (const e of w.events) {
        if (e.kind === "restart") this.events.push({ kind: "restart", attempt: e.attempt, by: e.by >= 0 ? (this.names[e.by] ?? null) : null, tick: w.tick, at: e.attempt });
        else this.events.push({ ...e, tick: w.tick, at: w.attempt });
      }
      // A restart teleports everyone: nothing blends across it.
      if (w.events.some((e) => e.kind === "restart")) captureFrame(w, this.prev);
    }
    if (stepped) captureFrame(this.world, this.cur);
  }

  frame(): PropFrame {
    return lerpFrame(this.prev, this.cur, this.acc / COOP_DT, this.out);
  }

  drainEvents(): ShownEvent[] {
    return this.events.splice(0);
  }

  restartHolders(): number[] {
    return this.held.flatMap((b, i) => ((b & BIT_RESTART) !== 0 ? [i] : []));
  }

  destroy(): void {
    for (const i of this.inputs) i?.destroy();
  }
}

interface Snap {
  tick: number;
  state: CoopWorldState;
  frame: PropFrame;
  held: number[];
}

/**
 * A room: sends this player's inputs and draws the world, predicted (step B) or from the server's
 * snapshots (step A).
 */
class OnlineDriver implements Driver {
  private snaps: Snap[] = [];
  private events: ShownEvent[] = [];
  private seen = new Set<string>();
  private sampleAcc = 0;
  private sender: CoopInputSender;
  /** Step B: the world predicted ahead of the server (null: the snapshots are drawn, step A). */
  private play: PredictedPlay | null = null;
  /** Tick of the newest snapshot received. */
  private newest = -Infinity;
  /** Tick of the snapshot loaded into the world (-1: none). */
  private loaded = -1;
  private drawnHeld: number[] = [];
  /** How far behind the server's clock the world is drawn, from the snapshots' arrivals. */
  private playout = new PlayoutClock();
  private out: PropFrame;
  private onVisibility = () => {
    if (!document.hidden) return;
    if (this.play) this.play.idle();
    else this.sender.idle();
  };

  constructor(
    readonly world: CoopWorld,
    private link: CoopLink,
    private startsAt: number,
    /** The coopLevel's epoch, echoed in every input. */
    epoch: number,
    private input: InputSource | null,
    private mySeat: number,
    /** Predict (a player only: a spectator has no keys to see at once). */
    predict: boolean,
  ) {
    this.out = captureFrame(world);
    if (predict && input && mySeat >= 0) {
      const authority = new CoopWorld(world.level, world.players);
      this.play = new PredictedPlay(world, authority, mySeat, epoch, { send: (msg) => link.send(msg), serverTick: () => this.serverTick(), rtt: () => link.rtt });
      this.sender = this.play.sender;
    } else this.sender = new CoopInputSender((msg) => link.send(msg), epoch, () => this.serverTick());
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get authority(): CoopWorld {
    return this.play?.authority ?? this.world;
  }

  /** Whether the drawn world is predicted. */
  get predicting(): boolean {
    return this.play !== null;
  }

  /** Server tick now (fractional). */
  serverTick(): number {
    return ((this.link.serverNow() - this.startsAt) * COOP_HZ) / 1000;
  }

  onSnapshot(msg: SnapMessage): void {
    if (msg.tick <= this.newest) return;
    this.newest = msg.tick;
    const state = decodeWorld(msg.world);
    const held = Array.isArray(msg.held) ? msg.held : [];
    if (this.play) this.play.onSnapshot(msg.tick, state, held, Array.isArray(msg.pending) ? msg.pending : [], Array.isArray(msg.ack) ? msg.ack : undefined);
    else {
      this.playout.arrive(this.serverTick(), msg.tick);
      // What moves in this state, read once: frames blend between snapshots.
      this.world.load(state);
      this.loaded = msg.tick;
      this.snaps.push({ tick: msg.tick, state, frame: captureFrame(this.world), held });
      if (this.snaps.length > 40) this.snaps.shift();
    }
    const restarts = msg.events.filter((e) => e.kind === "restart");
    for (const e of msg.events) {
      const key = JSON.stringify(e);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      // The attempt an event belongs to: the snapshot's, minus the restarts that came after it.
      const at = state.attempt - restarts.filter((r) => r.tick > e.tick).length;
      this.events.push({ ...e, at } as ShownEvent);
    }
  }

  advance(dt: number): void {
    if (this.play) {
      const input = this.input!;
      input.poll();
      this.play.advance(dt, () => encodeInput(input.takeCoopInput()), performance.now());
      return;
    }
    if (this.input) {
      this.input.poll();
      this.sampleAcc = Math.min(this.sampleAcc + dt, 8 * COOP_DT);
      while (this.sampleAcc >= COOP_DT) {
        this.sampleAcc -= COOP_DT;
        this.sender.sample(encodeInput(this.input.takeCoopInput()));
      }
      this.sender.flush(performance.now());
    }
    this.place();
  }

  /** The world waits for a dropped player (true) or goes on (false): keys are not sent meanwhile. */
  setPaused(paused: boolean): void {
    if (this.play) this.play.setPaused(paused);
    else this.sender.setPaused(paused);
  }

  /** The link is lost and reconnecting (true) or back (false): a predicted world holds meanwhile. */
  setLinkLost(lost: boolean): void {
    this.play?.setLinkLost(lost);
  }

  /** The snapshots around the drawing time: the later one in the world, the frame blended. */
  private place(): void {
    if (this.snaps.length === 0) return;
    const at = this.playout.drawTick(this.serverTick());
    const [a, b] = bracket(this.snaps, at);
    if (this.loaded !== b.tick) {
      this.world.load(b.state);
      this.loaded = b.tick;
    }
    const span = b.tick - a.tick;
    const k = span > 0 ? (at - a.tick) / span : 1;
    // lerpFrame does not blend across a restart (the attempt changed).
    lerpFrame(a.frame, b.frame, k, this.out);
    this.drawnHeld = b.held;
  }

  frame(): PropFrame {
    return this.play ? this.play.frame() : this.out;
  }

  drainEvents(): ShownEvent[] {
    return this.events.splice(0);
  }

  restartHolders(): number[] {
    if (this.play) return this.play.restartHolders(this.mySeat);
    const out = this.drawnHeld.flatMap((bits, i) => ((bits & BIT_RESTART) !== 0 ? [i] : []));
    // This player's own R shows at once.
    if (this.mySeat >= 0 && (this.sender.held & BIT_RESTART) !== 0 && !out.includes(this.mySeat)) out.push(this.mySeat);
    return out.sort((x, y) => x - y);
  }

  destroy(): void {
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.input?.destroy();
  }
}

export class CoopScene extends Phaser.Scene {
  private data_!: CoopSceneData;
  private level!: CoopLevel;
  private levelName = "";
  private names: string[] = [];
  private colors: number[] = [];
  private driver!: Driver;
  private online: OnlineDriver | null = null;
  private bodyViews: CoopBodyView[] = [];
  private rope!: RopeView;
  private objects!: ObjectViews;
  private things!: ThingViews;
  private stains!: Stains;
  private effects!: Effects;
  private camera!: GroupCamera;
  private hud = new CoopHud();
  private bubbles = new ClaudeBubbles();
  private cleared = new CoopClearedScreen();
  private clearedInfo: ClearedInfo | null = null;
  private clearedIndex = 0;
  /** The level the host picked on the card (null: the next one). */
  private picked: number | null = null;
  private lastNow = 0;
  private lastEscape = -Infinity;
  private pausedFor: string | null = null;
  private mySeat = -1;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super(COOP_SCENE_KEY);
  }

  create(data: CoopSceneData): void {
    // Phaser reuses the scene object: everything is set up again here.
    this.data_ = data;
    this.bodyViews = [];
    this.online = null;
    this.pausedFor = null;
    this.lastEscape = -Infinity;
    this.clearedInfo = null;
    this.picked = null;
    this.mySeat = -1;
    overlay.hideAll();
    coopBanner.hide();
    this.hud.hide();
    this.bubbles.hide();
    this.cleared.hide();

    let players: CoopPlayerInfo[];
    let localKeys: Array<KeyMap | null>;
    let def: CoopLevelDef;
    if (data.mode === "local") {
      def = data.level;
      players = data.players;
      localKeys = data.localKeys;
    } else {
      def = COOP_LEVELS.find((l) => l.id === data.level.levelId) ?? COOP_LEVELS[data.level.index] ?? COOP_LEVELS[0]!;
      players = data.level.seats.map((s) => ({ name: s.name, color: PLAYER_COLORS[s.color] ?? PLAYER_COLORS[0], isRuben: s.isRuben }));
      this.mySeat = data.level.seats.findIndex((s) => s.id === data.link.myId);
      localKeys = players.map((_, i) => (i === this.mySeat ? COOP_KEYS : null));
    }
    this.names = players.map((p) => p.name);
    this.colors = players.map((p) => p.color);
    // Same team size as the server's world: "W" weights and team-size variants depend on it.
    this.level = parseCoopLevel(def, players.length);
    this.levelName = levelLabel(COOP_LEVELS, def);
    const world = new CoopWorld(
      this.level,
      players.map((p) => ({ name: p.name, isRuben: p.isRuben })),
    );
    if (data.mode === "local") {
      const inputs = data.localKeys.map((keys) => (keys ? new InputSource({ keys, pad: null, keepHeldKeys: true }) : null));
      this.driver = new LocalDriver(world, inputs, this.names);
    } else {
      const input = this.mySeat >= 0 ? new InputSource({ keys: COOP_KEYS, pad: "first", keepHeldKeys: true }) : null;
      // Decided here, once per level start (reactivity.ts): a coopLevel that came to the screen
      // playing that level, with its clock already running, continues it (a resume, a moved clock)
      // and keeps its choice. A spectator draws step A.
      const predict =
        this.mySeat >= 0 &&
        predictionWanted(location.search, {
          rttMs: data.link.recentRtt,
          levelId: data.level.levelId,
          continuing: levelContinues(data.playing, data.level, data.link.serverNow()),
        });
      this.online = new OnlineDriver(world, data.link, data.level.startsAt, data.level.epoch, input, this.mySeat, predict);
      this.driver = this.online;
    }

    drawLevel(this, drawableTerrain(this.level), { startPad: false, singleTextureSigns: true });
    this.objects = new ObjectViews(this);
    this.objects.sync(this.level.objects);
    this.things = new ThingViews(this, this.level);
    this.stains = new Stains(this);
    this.effects = new Effects(this);
    this.rope = new RopeView(this, COOP.ropeLength, ROPE_MAX_LENGTH);
    players.forEach((p, i) => {
      this.bodyViews.push(new CoopBodyView(this, p.color, p.name, p.isRuben, localKeys[i] !== null));
    });
    this.camera = new GroupCamera(this.level.width, this.level.height);
    this.camera.snap(this.driver.frame().bodies);
    this.camera.apply(this.cameras.main);
    this.lastNow = performance.now();

    // The level card, when the level really starts (not when the clock moved after a pause).
    const startNow = !this.online || this.online.serverTick() < COOP_HZ * 1.5;
    if (startNow) this.hud.showCard(this.levelName, def.quote, this.lastNow, LEVEL_CARD_MS);

    overlay.setHelp(
      data.mode === "local"
        ? "J1 : Q/D, Z saute, S agit · J2 : ←/→, ↑, ↓ · R ou Suppr maintenu : relancer · Échap : menu"
        : "Q/D bouger · Z ou Espace sauter · S agir · R maintenu : relancer · Échap deux fois : quitter",
    );
    if (data.mode === "online" && this.mySeat < 0) overlay.showNotice("Tu rejoins l'équipe au prochain niveau : regarde-les faire !", 5000);

    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      if (this.data_.mode === "local") {
        this.data_.onExit();
        return;
      }
      const now = performance.now();
      if (now - this.lastEscape <= QUIT_CONFIRM_MS) this.leave();
      else {
        this.lastEscape = now;
        overlay.showNotice("Appuie encore sur Échap pour quitter la partie.", QUIT_CONFIRM_MS);
      }
    };
    window.addEventListener("keydown", this.onKeyDown);

    if (data.mode === "online") {
      data.link.onStatus = (status) => {
        if (status === "closed") this.leave("Connexion au salon perdue.");
        else if (status === "lost") overlay.showNotice("Connexion perdue, reconnexion…", 0);
        else overlay.showNotice("Reconnecté !", 1500);
        this.online?.setLinkLost(status === "lost");
      };
      data.link.setHandler((msg) => this.onMessage(msg));
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.onKeyDown) window.removeEventListener("keydown", this.onKeyDown);
      this.onKeyDown = null;
      this.driver.destroy();
      for (const v of this.bodyViews) v.destroy();
      this.rope.destroy();
      this.objects.destroy();
      this.things.destroy();
      this.hud.hide();
      this.bubbles.hide();
      this.cleared.hide();
      coopBanner.hide();
      overlay.hideAll();
    });
  }

  private onMessage(msg: CoopServerMessage): void {
    if (this.data_.mode !== "online") return;
    const data = this.data_;
    switch (msg.type) {
      case "coopSnap":
        this.online?.onSnapshot(msg);
        return;
      case "coopLevel":
        // A new level, a new team, or the clock moved (after a pause or a server stall): start
        // over from it (new epoch, and nothing counts as sent).
        data.link.setHandler(null);
        // From the end card the level was over: what comes is a level start.
        this.scene.restart({ ...data, level: msg, playing: this.clearedInfo ? null : data.level.levelId });
        return;
      case "coopPause":
        this.pausedFor = msg.waitingFor;
        // No key change is sent while the world waits: it would be stamped on the old clock.
        this.online?.setPaused(msg.waitingFor !== null);
        if (msg.waitingFor) {
          const who = data.lobby?.players.find((p) => p.id === msg.waitingFor)?.name ?? "un joueur";
          const seconds = Math.max(1, Math.round((msg.until - data.link.serverNow()) / 1000));
          coopBanner.show(`En attente de ${who}…`, `Sa connexion a sauté : on l'attend ${seconds} seconde${seconds > 1 ? "s" : ""}.`);
        } else coopBanner.hide();
        return;
      case "coopCleared":
        this.onCleared(msg);
        return;
      case "coopLobby":
        data.lobby = msg.lobby;
        if (msg.lobby.phase === "lobby" || msg.lobby.phase === "intro") {
          data.link.setHandler(null);
          this.scene.start("coopLobby", { link: data.link, lobby: msg.lobby });
          return;
        }
        // Between levels the host (who may have changed) picks the next one.
        if (this.clearedInfo) this.renderCleared();
        return;
      case "coopNotice":
        overlay.showNotice(msg.text, 3500);
        return;
      case "error":
        this.leave(msg.message);
        return;
      default:
        return;
    }
  }

  private leave(message?: string): void {
    if (this.data_.mode !== "online") return;
    const data = this.data_;
    data.link.setHandler(null);
    data.link.onStatus = null;
    data.link.leave();
    // The lobby's exit stops this scene too (it would otherwise keep drawing over the menu).
    data.onExit(message);
  }

  override update(): void {
    const now = performance.now();
    const dt = Math.min(MAX_FRAME, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.driver.advance(dt);
    for (const e of this.driver.drainEvents()) this.onEvent(e, now);
    this.draw(dt, now);
  }

  // --- Events -------------------------------------------------------------------------------------

  private onEvent(e: ShownEvent, now: number): void {
    const boxes = this.driver.frame().bodies;
    const centre = (i: number) => {
      const b = boxes[i];
      return b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;
    };
    const thing = (index: number) => this.level.things[index];
    this.things.onEvent(e as CoopEvent, now);
    switch (e.kind) {
      case "death": {
        this.stains.add(e.x, e.y, this.colors[e.victim] ?? PLAYER_COLORS[0]);
        this.effects.pof(e.x, e.y - 0.5, e.cause === "fall" ? "AÏE !" : "OUCH !");
        // Claude names the culprit: that is what makes restarting the whole level funny.
        this.bubbles.say(deathQuip(e, this.names, e.at), now);
        break;
      }
      case "restart":
        if (e.by) overlay.showNotice(`${e.by} a relancé le niveau · essai n° ${e.attempt}`, 2200);
        this.camera.snap(this.driver.frame().bodies);
        break;
      case "squash": {
        this.bodyViews[e.body]?.squash(COOP.squashTime * 1000);
        const b = boxes[e.body];
        if (b) this.effects.pof(b.x + b.w / 2, b.y - 0.15, "SPLATCH");
        break;
      }
      case "key": {
        const c = centre(e.body);
        if (c) this.effects.pof(c.x, c.y - 0.8, e.from >= 0 ? "À MOI !" : "LA CLÉ !");
        break;
      }
      case "doorOpen": {
        const d = this.level.door;
        if (d) this.effects.pof(d.x + d.w / 2, d.y + 0.3, "CLIC !");
        overlay.showNotice(`${this.names[e.body] ?? "Quelqu'un"} a ouvert la porte : tout le monde dedans !`, 2600);
        break;
      }
      case "enter": {
        const d = this.level.door;
        if (d) this.effects.puff(d.x + d.w / 2, d.y + d.h - 0.4);
        break;
      }
      case "crack": {
        const t = thing(e.thing);
        if (t) this.effects.pof(t.x + t.w / 2, t.y - 0.2, "CRAC !");
        break;
      }
      case "catapult": {
        const t = thing(e.thing);
        if (t) this.effects.pof(t.x + t.w / 2, t.y - 0.4, "BOING !");
        break;
      }
      case "terminal": {
        const t = thing(e.thing);
        if (!t || t.def.kind !== "terminal") break;
        const text = terminalQuip(t.def.prompt, e.inverted, e.waiting, e.tick);
        const top = { x: (t.x + t.w / 2) * CELL_PX, y: (t.y + t.h) * CELL_PX - 92 };
        this.bubbles.sayAt(text, now, () => this.toPage(top.x, top.y));
        break;
      }
      case "win":
        if (this.data_.mode === "local") this.onLocalWin();
        break;
    }
  }

  /** A point of the level (pixels) on the page (CSS pixels), or null off screen. */
  private toPage(wx: number, wy: number): { x: number; y: number } | null {
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const gx = (wx - cam.worldView.x) * cam.zoom;
    const gy = (wy - cam.worldView.y) * cam.zoom;
    if (gx < 0 || gy < 0 || gx > this.scale.width || gy > this.scale.height) return null;
    return { x: rect.left + (gx * rect.width) / this.scale.width, y: rect.top + (gy * rect.height) / this.scale.height };
  }

  // --- End of level -------------------------------------------------------------------------------

  private titlesInfo(titles: readonly CoopTitle[], seats: ReadonlyArray<{ name: string; color: number }>): ClearedInfo["titles"] {
    return titles.map((t) => ({ name: t.name, value: t.value, holders: t.holders.flatMap((i) => (seats[i] ? [seats[i]!] : [])) }));
  }

  private onCleared(msg: ClearedMessage): void {
    markCleared(msg.levelId);
    const def = COOP_LEVELS.find((l) => l.id === msg.levelId) ?? COOP_LEVELS[msg.index];
    const seats = msg.seats.map((s) => ({ name: s.name, color: PLAYER_COLORS[s.color] ?? PLAYER_COLORS[0] }));
    this.clearedInfo = {
      level: def ? levelLabel(COOP_LEVELS, def) : this.levelName,
      attempts: msg.attempts,
      seconds: msg.seconds,
      titles: this.titlesInfo(msg.titles, seats),
    };
    this.clearedIndex = Math.min(msg.index + 1, COOP_LEVELS.length - 1);
    this.renderCleared();
  }

  private onLocalWin(): void {
    if (this.data_.mode !== "local") return;
    const world = this.driver.world;
    markCleared(this.level.def.id);
    const seats = this.names.map((name, i) => ({ name, color: this.colors[i] ?? PLAYER_COLORS[0] }));
    this.clearedInfo = { level: this.levelName, attempts: world.attempt, seconds: Math.round(world.tick / COOP_HZ), titles: this.titlesInfo(coopTitles(world.stats), seats) };
    const levels = this.data_.levels ?? [this.level.def];
    const here = levels.findIndex((l) => l.id === this.level.def.id);
    this.clearedIndex = Math.min(here + 1, levels.length - 1);
    this.renderCleared();
  }

  /** The card, with the host's choice (or who everybody waits for). */
  private renderCleared(): void {
    const info = this.clearedInfo;
    if (!info) return;
    const data = this.data_;
    const cleared = loadCleared();
    if (data.mode === "local") {
      const levels = data.levels ?? [data.level];
      const host: HostChoice = {
        levels: levels.map((l) => ({ label: levelLabel(COOP_LEVELS, l), cleared: cleared.has(l.id) })),
        selected: this.picked ?? this.clearedIndex,
        onSelect: (i) => {
          this.picked = i;
          this.renderCleared();
        },
        onPlay: (i) => {
          const next = levels[i];
          if (next) this.scene.restart({ ...data, level: next });
        },
        onBack: () => data.onExit(),
      };
      this.cleared.show(info, { host });
      return;
    }
    const lobby = data.lobby;
    const isHost = lobby?.hostId === data.link.myId;
    if (!isHost) {
      const host = lobby?.players.find((p) => p.id === lobby.hostId)?.name ?? "l'hôte";
      this.cleared.show(info, { waitingFor: host });
      return;
    }
    // The next level comes from the server once it is in the "select" phase.
    const next = lobby && lobby.phase === "select" ? lobby.levelIndex : this.clearedIndex;
    const host: HostChoice = {
      levels: COOP_LEVELS.map((l) => ({ label: levelLabel(COOP_LEVELS, l), cleared: cleared.has(l.id) })),
      selected: Math.min(this.picked ?? next, COOP_LEVELS.length - 1),
      onSelect: (i) => {
        this.picked = i;
        this.renderCleared();
      },
      onPlay: (i) => data.link.send({ type: "coopPlay", index: i }),
      onBack: () => data.link.send({ type: "coopBack" }),
    };
    this.cleared.show(info, { host });
  }

  // --- Drawing ------------------------------------------------------------------------------------

  private draw(dt: number, now: number): void {
    const world = this.driver.world;
    const authority = this.driver.authority;
    const frame = this.driver.frame();
    const boxes = frame.bodies;
    // Only the server's world dies (a predicted death is never shown).
    const frozen = authority.dying > 0;
    world.bodies.forEach((b, i) => {
      const box = boxes[i];
      if (!box) return;
      // The victim vanishes during the death freeze; whoever is inside the door is hidden in it.
      const shown = !(frozen && authority.victim === i) && !world.inside[i];
      // A body carrying someone hides its name under the rider's.
      this.bodyViews[i]!.update(box.x, box.y, b, shown, !b.hasRider);
    });
    // Friends side by side: stack their names instead of printing them over each other.
    const labels = this.bodyViews.map((v) => v.labelBox());
    const placed = labels.flatMap((l, i) => (l ? [{ i, box: l }] : []));
    const lifts = stackLabels(placed.map((p) => p.box));
    placed.forEach((p, k) => this.bodyViews[p.i]!.liftLabel(lifts[k]!));
    // Through the corners the world's link wraps, swept to the drawn bodies.
    this.rope.draw(drawnRopeSegments(world, boxes));
    this.objects.update(this.level.objects, frame.levelTick * COOP_DT);
    this.things.update(frame, world, now, this.colors, authority);
    this.camera.update(dt, boxes);
    this.camera.apply(this.cameras.main);
    this.updateHud(frame, now);
    this.bubbles.update(now);
  }

  private updateHud(frame: PropFrame, now: number): void {
    // The server's word: the key, the door, the attempt and the restart count.
    const world = this.driver.authority;
    const p = world.props;
    const person = (i: number) => ({ name: this.names[i] ?? "?", color: this.colors[i] ?? PLAYER_COLORS[0] });
    let key: HudState["key"] = { kind: "none" };
    if (this.level.key) {
      if (p.keyCarrier >= 0) key = { kind: "carried", ...person(p.keyCarrier) };
      else key = p.keyCarrier === -1 ? { kind: "free" } : { kind: "lock" };
    }
    const n = world.bodies.length;
    const count = world.inside.filter(Boolean).length;
    const holders = this.driver.restartHolders();
    const needed = n >= 3 ? Math.ceil(n / 2) : 1;
    const progress = world.restartHeld / RESTART_HOLD_STEPS;
    this.hud.update(
      {
        level: this.levelName,
        attempt: world.attempt,
        seconds: frame.tick * COOP_DT,
        key,
        inside: this.level.door && (p.doorOpen || count > 0) ? { count, total: n } : null,
        restart: holders.length > 0 || progress > 0 ? { progress, holders: holders.map(person), needed } : null,
      },
      now,
    );
    // Online, "Prêt ?" until tick 0, and the card stays a moment after it.
    if (this.online && !this.pausedFor) {
      const t = this.online.serverTick();
      this.hud.setCardSub(t < 0 ? "Prêt ?" : "");
      if (t < 0) this.hud.holdCard(now, 900);
    } else this.hud.setCardSub("");
  }
}
