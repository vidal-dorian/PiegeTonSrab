/**
 * The co-op game screen ("Sauve Ton Srab"): draws a CoopWorld (level, players, rope) with the
 * group camera, and feeds it inputs.
 *
 * Where the world comes from is a driver:
 * - LocalDriver (dev tool ?coopLocal=2): the world runs here, from two keyboard halves;
 * - online (M2): the world comes from the server's snapshots.
 */
import Phaser from "phaser";
import {
  COOP,
  COOP_DT,
  CoopWorld,
  encodeInput,
  parseCoopLevel,
  type CoopEvent,
  type CoopLevel,
  type CoopLevelDef,
} from "@game/shared/coop";
import { InputSource, type KeyMap } from "../input";
import { Effects } from "../render/effects";
import { drawLevel } from "../render/levelView";
import { ObjectViews } from "../render/objectViews";
import { Stains } from "../render/stains";
import { overlay } from "../ui/overlay";
import { GroupCamera } from "./groupCamera";
import { CoopBodyView } from "./render/coopBodyView";
import { RopeView } from "./render/ropeView";

export const COOP_SCENE_KEY = "coop";

/** Holding restart this long restarts the level, seconds. */
const RESTART_HOLD = 1.5;
/** Longest frame the simulation catches up on, seconds (a frozen tab does not fast-forward). */
const MAX_FRAME = 0.25;

export interface CoopPlayerInfo {
  name: string;
  /** 0xRRGGBB, the player's seat colour. */
  color: number;
  isRuben: boolean;
}

export interface CoopSceneData {
  level: CoopLevelDef;
  /** In rope order (friends in seat order, Ruben last). */
  players: CoopPlayerInfo[];
  /** Dev tool: one key map per body (null: nobody controls it). */
  localKeys: Array<KeyMap | null>;
  /** Called when the player leaves (Échap). */
  onExit: () => void;
}

/** Runs the world on this machine from local inputs. */
class LocalDriver {
  private acc = 0;
  private restartHeld = 0;
  /** Positions before the last step, for drawing between steps. */
  prevX: number[] = [];
  prevY: number[] = [];
  /** Events of the steps run during the last advance. */
  events: CoopEvent[] = [];

  constructor(
    readonly world: CoopWorld,
    private inputs: Array<InputSource | null>,
  ) {
    this.snapshotPrev();
  }

  get alpha(): number {
    return this.acc / COOP_DT;
  }

  advance(dt: number): void {
    this.events = [];
    for (const i of this.inputs) i?.poll();
    this.acc += dt;
    while (this.acc >= COOP_DT) {
      this.acc -= COOP_DT;
      this.snapshotPrev();
      let restart = false;
      const bits = this.inputs.map((src) => {
        if (!src) return 0;
        const inp = src.takeCoopInput();
        if (inp.restart) restart = true;
        return encodeInput(inp);
      });
      this.restartHeld = restart ? this.restartHeld + COOP_DT : 0;
      if (this.restartHeld >= RESTART_HOLD) {
        this.restartHeld = 0;
        this.world.restart();
        this.events.push(...this.world.events);
        this.snapshotPrev();
        continue;
      }
      this.world.step(bits);
      this.events.push(...this.world.events);
    }
  }

  private snapshotPrev(): void {
    this.prevX = this.world.bodies.map((b) => b.x);
    this.prevY = this.world.bodies.map((b) => b.y);
  }

  destroy(): void {
    for (const i of this.inputs) i?.destroy();
  }
}

export class CoopScene extends Phaser.Scene {
  private data_!: CoopSceneData;
  private level!: CoopLevel;
  private driver!: LocalDriver;
  private bodyViews: CoopBodyView[] = [];
  private rope!: RopeView;
  private objects!: ObjectViews;
  private stains!: Stains;
  private effects!: Effects;
  private camera!: GroupCamera;
  private lastNow = 0;
  private escListener: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super(COOP_SCENE_KEY);
  }

  create(data: CoopSceneData): void {
    // Phaser reuses the scene object: everything is set up again here.
    this.data_ = data;
    this.bodyViews = [];
    overlay.hideAll();
    this.level = parseCoopLevel(data.level);
    const world = new CoopWorld(
      this.level,
      data.players.map((p) => ({ name: p.name, isRuben: p.isRuben })),
    );
    const inputs = data.localKeys.map((keys) => (keys ? new InputSource({ keys, pad: null }) : null));
    this.driver = new LocalDriver(world, inputs);

    drawLevel(this, this.level.terrain, { startPad: false });
    this.objects = new ObjectViews(this);
    this.objects.sync(this.level.objects);
    this.stains = new Stains(this);
    this.effects = new Effects(this);
    this.rope = new RopeView(this, COOP.ropeLength);
    data.players.forEach((p, i) => {
      this.bodyViews.push(new CoopBodyView(this, p.color, p.name, p.isRuben, data.localKeys[i] !== null));
    });
    this.camera = new GroupCamera(this.level.width, this.level.height);
    this.camera.snap(this.boxes());
    this.camera.apply(this.cameras.main);
    this.lastNow = performance.now();

    overlay.setHelp("J1 : Q/D, Z saute, S agit · J2 : ←/→, ↑, ↓ · R ou Suppr maintenu : relancer · Échap : menu");
    this.escListener = (e: KeyboardEvent) => {
      if (e.code === "Escape") this.data_.onExit();
    };
    window.addEventListener("keydown", this.escListener);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.escListener) window.removeEventListener("keydown", this.escListener);
      this.escListener = null;
      this.driver.destroy();
      for (const v of this.bodyViews) v.destroy();
      this.rope.destroy();
      this.objects.destroy();
      overlay.hideAll();
    });
  }

  override update(): void {
    const now = performance.now();
    const dt = Math.min(MAX_FRAME, (now - this.lastNow) / 1000);
    this.lastNow = now;
    this.driver.advance(dt);
    for (const e of this.driver.events) this.onEvent(e);
    this.draw(dt);
  }

  private onEvent(e: CoopEvent): void {
    const players = this.data_.players;
    switch (e.kind) {
      case "death": {
        const p = players[e.victim]!;
        this.stains.add(e.x, e.y, p.color);
        this.effects.pof(e.x, e.y - 0.5, e.cause === "fall" ? "AÏE !" : "OUCH !");
        overlay.showNotice(e.cause === "fall" ? `${p.name} est tombé ! On recommence.` : `${p.name} s'est fait piquer ! On recommence.`, 2000);
        break;
      }
      case "restart":
        overlay.showNotice(`Essai n° ${e.attempt}`, 1200);
        this.camera.snap(this.boxes());
        break;
      case "squash": {
        this.bodyViews[e.body]?.squash(COOP.squashTime * 1000);
        const b = this.driver.world.bodies[e.body]!;
        this.effects.pof(b.cx, b.y - 0.15, "SPLATCH");
        break;
      }
      case "land":
        break;
    }
  }

  /** Body boxes for the camera, at their drawn positions. */
  private boxes(): Array<{ x: number; y: number; w: number; h: number }> {
    const d = this.driver;
    const a = d.alpha;
    return d.world.bodies.map((b, i) => ({
      x: d.prevX[i]! + (b.x - d.prevX[i]!) * a,
      y: d.prevY[i]! + (b.y - d.prevY[i]!) * a,
      w: b.width,
      h: b.height,
    }));
  }

  private draw(dt: number): void {
    const d = this.driver;
    const world = d.world;
    const boxes = this.boxes();
    const frozen = world.dying > 0;
    world.bodies.forEach((b, i) => {
      const box = boxes[i]!;
      const hidden = frozen && world.victim === i;
      // A body carrying someone hides its name under the rider's.
      this.bodyViews[i]!.update(box.x, box.y, b, !hidden, !b.hasRider);
    });
    this.rope.draw(
      world.rope.map((l) => {
        const a = boxes[l.a]!;
        const b = boxes[l.b]!;
        return { ax: a.x + a.w / 2, ay: a.y + a.h / 2, bx: b.x + b.w / 2, by: b.y + b.h / 2 };
      }),
    );
    this.objects.update(this.level.objects, world.tick * COOP_DT);
    this.camera.update(dt, boxes);
    this.camera.apply(this.cameras.main);
  }
}
