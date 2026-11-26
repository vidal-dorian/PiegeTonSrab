/**
 * The co-op game screen ("Sauve Ton Srab"): draws a CoopWorld (level, players, rope) with the
 * group camera, and feeds it inputs.
 *
 * Where the world comes from is a driver:
 * - OnlineDriver (a room): the server runs the world; this screen draws its snapshots about
 *   50 ms in the past, interpolated, and sends this player's inputs (step A of the plan; client
 *   prediction comes later);
 * - LocalDriver (dev tool ?coopLocal=2): the world runs here, from two keyboard halves.
 */
import Phaser from "phaser";
import {
  COOP,
  COOP_DT,
  COOP_HZ,
  COOP_LEVELS,
  CoopWorld,
  decodeWorld,
  encodeInput,
  HELD_BITS,
  parseCoopLevel,
  PRESS_BITS,
  type CoopLevel,
  type CoopLevelDef,
  type CoopLobbyInfo,
  type CoopEvent,
  type CoopServerMessage,
  type CoopWorldState,
} from "@game/shared/coop";
import { COOP_KEYS, InputSource, type KeyMap } from "../input";
import { Effects } from "../render/effects";
import { drawLevel } from "../render/levelView";
import { ObjectViews } from "../render/objectViews";
import { PLAYER_COLORS } from "../render/playerColors";
import { Stains } from "../render/stains";
import { overlay } from "../ui/overlay";
import { GroupCamera } from "./groupCamera";
import type { CoopLink } from "./net/coopLink";
import { CoopBodyView } from "./render/coopBodyView";
import { RopeView } from "./render/ropeView";
import { coopBanner } from "./ui/coopScreens";

export const COOP_SCENE_KEY = "coop";

/** Longest frame the simulation catches up on, seconds (a frozen tab does not fast-forward). */
const MAX_FRAME = 0.25;
/** Online: the world is drawn this many ticks behind the server (1.5 snapshot intervals). */
const INTERP_TICKS = 6;
/** Online: an input is sent at least this often, so the server knows the player is there, ms. */
const HEARTBEAT_MS = 100;
/** Two presses of Échap within this long leave the game, ms. */
const QUIT_CONFIRM_MS = 2000;

export interface CoopPlayerInfo {
  name: string;
  /** 0xRRGGBB, the player's seat colour. */
  color: number;
  isRuben: boolean;
}

type LevelMessage = Extract<CoopServerMessage, { type: "coopLevel" }>;

export type CoopSceneData =
  | {
      mode: "local";
      level: CoopLevelDef;
      /** In rope order (friends in seat order, Ruben last). */
      players: CoopPlayerInfo[];
      /** One key map per body (null: nobody controls it). */
      localKeys: Array<KeyMap | null>;
      onExit: () => void;
    }
  | {
      mode: "online";
      link: CoopLink;
      lobby: CoopLobbyInfo | null;
      level: LevelMessage;
      onExit: (message?: string) => void;
    };

/** Something to show that the world reported (effects, notices): the world's events, a restart says who held R. */
type ShownEvent = Exclude<CoopEvent, { kind: "restart" }> | { kind: "restart"; attempt: number; by: string | null };

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Driver {
  /** The world to draw (its bodies' flags drive the poses). */
  readonly world: CoopWorld;
  advance(dt: number): void;
  /** Body boxes at drawing time, cells. */
  boxes(): Box[];
  /** Events since the last call. */
  drainEvents(): ShownEvent[];
  destroy(): void;
}

/** Dev tool: runs the world on this machine from local inputs. */
class LocalDriver implements Driver {
  private acc = 0;
  private prevX: number[] = [];
  private prevY: number[] = [];
  private events: ShownEvent[] = [];

  constructor(
    readonly world: CoopWorld,
    private inputs: Array<InputSource | null>,
  ) {
    this.snapshotPrev();
  }

  advance(dt: number): void {
    for (const i of this.inputs) i?.poll();
    this.acc += dt;
    while (this.acc >= COOP_DT) {
      this.acc -= COOP_DT;
      this.snapshotPrev();
      // R held is in the bits: the world restarts the level itself.
      const bits = this.inputs.map((src) => (src ? encodeInput(src.takeCoopInput()) : 0));
      this.world.step(bits);
      for (const e of this.world.events) {
        if (e.kind === "restart") this.events.push({ kind: "restart", attempt: e.attempt, by: null });
        else this.events.push(e);
      }
      if (this.world.events.some((e) => e.kind === "restart")) this.snapshotPrev();
    }
  }

  boxes(): Box[] {
    const a = this.acc / COOP_DT;
    return this.world.bodies.map((b, i) => ({
      x: this.prevX[i]! + (b.x - this.prevX[i]!) * a,
      y: this.prevY[i]! + (b.y - this.prevY[i]!) * a,
      w: b.width,
      h: b.height,
    }));
  }

  drainEvents(): ShownEvent[] {
    return this.events.splice(0);
  }

  private snapshotPrev(): void {
    this.prevX = this.world.bodies.map((b) => b.x);
    this.prevY = this.world.bodies.map((b) => b.y);
  }

  destroy(): void {
    for (const i of this.inputs) i?.destroy();
  }
}

/** A room: draws the server's snapshots and sends this player's inputs. */
class OnlineDriver implements Driver {
  private snaps: Array<{ tick: number; state: CoopWorldState }> = [];
  private events: ShownEvent[] = [];
  private seen = new Set<string>();
  private sampleAcc = 0;
  private lastHeld = 0;
  private pending: Array<[number, number]> = [];
  private lastStamp = 0;
  private lastSentAt = -Infinity;
  private drawn: Box[] = [];
  private onVisibility = () => {
    if (document.hidden) {
      this.link.send({ type: "coopIdle" });
      this.lastHeld = 0;
    }
  };

  constructor(
    readonly world: CoopWorld,
    private link: CoopLink,
    private startsAt: number,
    private input: InputSource | null,
  ) {
    this.drawn = world.bodies.map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height }));
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  /** Server tick now (fractional). */
  serverTick(): number {
    return ((this.link.serverNow() - this.startsAt) * COOP_HZ) / 1000;
  }

  onSnapshot(tick: number, bytes: Uint8Array, events: Extract<CoopServerMessage, { type: "coopSnap" }>["events"]): void {
    const state = decodeWorld(bytes);
    if (this.snaps.length > 0 && tick <= this.snaps[this.snaps.length - 1]!.tick) return;
    this.snaps.push({ tick, state });
    if (this.snaps.length > 40) this.snaps.shift();
    for (const e of events) {
      const key = JSON.stringify(e);
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      const { tick: _tick, ...shown } = e;
      this.events.push(shown as ShownEvent);
    }
  }

  advance(dt: number): void {
    if (this.input) {
      this.input.poll();
      this.sampleAcc = Math.min(this.sampleAcc + dt, 8 * COOP_DT);
      while (this.sampleAcc >= COOP_DT) {
        this.sampleAcc -= COOP_DT;
        this.sample();
      }
      this.flush();
    }
    this.place();
  }

  /**
   * Read this step's keys; queue a change (or a press) for the server. Stamps strictly increase:
   * the server applies one change per step, so two changes on one tick would land a step apart.
   */
  private sample(): void {
    const bits = encodeInput(this.input!.takeCoopInput());
    const held = bits & HELD_BITS;
    if ((bits & PRESS_BITS) !== 0 || held !== this.lastHeld) {
      const stamp = Math.max(this.applyTick(), this.lastStamp + 1);
      this.lastStamp = stamp;
      this.pending.push([stamp, bits]);
      this.lastHeld = held;
    }
  }

  /** Step A: inputs are applied as soon as the server gets them. */
  private applyTick(): number {
    return Math.max(1, Math.ceil(this.serverTick()) + 1);
  }

  private flush(): void {
    const now = performance.now();
    if (this.pending.length === 0 && now - this.lastSentAt < HEARTBEAT_MS) return;
    // With no change, an empty message only says "still here" (it must not take a change's step).
    this.link.send({ type: "coopIn", k: this.pending });
    this.pending = [];
    this.lastSentAt = now;
  }

  /** Load the snapshots around the drawing time into the world and interpolate the bodies. */
  private place(): void {
    if (this.snaps.length === 0) return;
    const at = this.serverTick() - INTERP_TICKS;
    let a = this.snaps[0]!;
    let b = a;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i]!.tick <= at) {
        a = this.snaps[i]!;
        b = this.snaps[i + 1] ?? a;
        break;
      }
    }
    this.world.load(b.state);
    const span = b.tick - a.tick;
    const k = span > 0 ? Math.min(1, Math.max(0, (at - a.tick) / span)) : 1;
    // A restart between the two snapshots teleports everyone: no blending across it.
    const blend = a.state.attempt === b.state.attempt ? k : 1;
    this.drawn = b.state.bodies.map((bs, i) => {
      const as = a.state.bodies[i] ?? bs;
      return { x: as.x + (bs.x - as.x) * blend, y: as.y + (bs.y - as.y) * blend, w: this.world.bodies[i]!.width, h: this.world.bodies[i]!.height };
    });
  }

  boxes(): Box[] {
    return this.drawn;
  }

  drainEvents(): ShownEvent[] {
    return this.events.splice(0);
  }

  destroy(): void {
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.input?.destroy();
  }
}

export class CoopScene extends Phaser.Scene {
  private data_!: CoopSceneData;
  private level!: CoopLevel;
  private names: string[] = [];
  private colors: number[] = [];
  private driver!: Driver;
  private online: OnlineDriver | null = null;
  private bodyViews: CoopBodyView[] = [];
  private rope!: RopeView;
  private objects!: ObjectViews;
  private stains!: Stains;
  private effects!: Effects;
  private camera!: GroupCamera;
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
    overlay.hideAll();
    coopBanner.hide();

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
    this.level = parseCoopLevel(def);
    const world = new CoopWorld(
      this.level,
      players.map((p) => ({ name: p.name, isRuben: p.isRuben })),
    );
    if (data.mode === "local") {
      const inputs = data.localKeys.map((keys) => (keys ? new InputSource({ keys, pad: null }) : null));
      this.driver = new LocalDriver(world, inputs);
    } else {
      const input = this.mySeat >= 0 ? new InputSource({ keys: COOP_KEYS, pad: "first" }) : null;
      this.online = new OnlineDriver(world, data.link, data.level.startsAt, input);
      this.driver = this.online;
    }

    drawLevel(this, this.level.terrain, { startPad: false });
    this.objects = new ObjectViews(this);
    this.objects.sync(this.level.objects);
    this.stains = new Stains(this);
    this.effects = new Effects(this);
    this.rope = new RopeView(this, COOP.ropeLength);
    players.forEach((p, i) => {
      this.bodyViews.push(new CoopBodyView(this, p.color, p.name, p.isRuben, localKeys[i] !== null));
    });
    this.camera = new GroupCamera(this.level.width, this.level.height);
    this.camera.snap(this.driver.boxes());
    this.camera.apply(this.cameras.main);
    this.lastNow = performance.now();

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
      coopBanner.hide();
      overlay.hideAll();
    });
  }

  private onMessage(msg: CoopServerMessage): void {
    if (this.data_.mode !== "online") return;
    const data = this.data_;
    switch (msg.type) {
      case "coopSnap":
        this.online?.onSnapshot(msg.tick, msg.world, msg.events);
        return;
      case "coopLevel":
        // A new level, a new team, or the clock moved (after a pause): start over from it.
        data.link.setHandler(null);
        this.scene.restart({ ...data, level: msg });
        return;
      case "coopPause":
        this.pausedFor = msg.waitingFor;
        if (msg.waitingFor) {
          const who = data.lobby?.players.find((p) => p.id === msg.waitingFor)?.name ?? "un joueur";
          coopBanner.show(`En attente de ${who}…`, "Sa connexion a sauté : on l'attend 30 secondes.");
        } else coopBanner.hide();
        return;
      case "coopLobby":
        data.lobby = msg.lobby;
        if (msg.lobby.phase === "lobby" || msg.lobby.phase === "intro") {
          data.link.setHandler(null);
          this.scene.start("coopLobby", { link: data.link, lobby: msg.lobby });
        }
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
    data.onExit(message);
  }

  override update(): void {
    const now = performance.now();
    const dt = Math.min(MAX_FRAME, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.driver.advance(dt);
    for (const e of this.driver.drainEvents()) this.onEvent(e);
    this.updateBanner();
    this.draw(dt);
  }

  private updateBanner(): void {
    if (!this.online || this.pausedFor) return;
    const t = this.online.serverTick();
    if (t < 0) coopBanner.show("Prêt ?", `${this.level.def.name}${this.level.def.quote ? ` · « ${this.level.def.quote} »` : ""}`);
    else coopBanner.hide();
  }

  private onEvent(e: ShownEvent): void {
    switch (e.kind) {
      case "death": {
        const name = this.names[e.victim] ?? "Quelqu'un";
        this.stains.add(e.x, e.y, this.colors[e.victim] ?? PLAYER_COLORS[0]);
        this.effects.pof(e.x, e.y - 0.5, e.cause === "fall" ? "AÏE !" : "OUCH !");
        overlay.showNotice(e.cause === "fall" ? `${name} est tombé ! On recommence.` : `${name} s'est fait piquer ! On recommence.`, 2200);
        break;
      }
      case "restart":
        overlay.showNotice(e.by ? `${e.by} a relancé le niveau · essai n° ${e.attempt}` : `Essai n° ${e.attempt}`, 1500);
        this.camera.snap(this.driver.boxes());
        break;
      case "squash": {
        this.bodyViews[e.body]?.squash(COOP.squashTime * 1000);
        const b = this.driver.boxes()[e.body];
        if (b) this.effects.pof(b.x + b.w / 2, b.y - 0.15, "SPLATCH");
        break;
      }
    }
  }

  private draw(dt: number): void {
    const world = this.driver.world;
    const boxes = this.driver.boxes();
    const frozen = world.dying > 0;
    world.bodies.forEach((b, i) => {
      const box = boxes[i];
      if (!box) return;
      const hidden = frozen && world.victim === i;
      // A body carrying someone hides its name under the rider's.
      this.bodyViews[i]!.update(box.x, box.y, b, !hidden, !b.hasRider);
    });
    const segments = [];
    for (let k = 0; k + 1 < world.chain.length; k++) {
      const a = boxes[world.chain[k]!];
      const b = boxes[world.chain[k + 1]!];
      if (a && b) segments.push({ ax: a.x + a.w / 2, ay: a.y + a.h / 2, bx: b.x + b.w / 2, by: b.y + b.h / 2 });
    }
    this.rope.draw(segments);
    this.objects.update(this.level.objects, world.tick * COOP_DT);
    this.camera.update(dt, boxes);
    this.camera.apply(this.cameras.main);
  }
}
