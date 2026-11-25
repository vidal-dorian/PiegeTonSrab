/**
 * A character of the intro: the game's own pebble blob (drawBlob), on its own Graphics object so
 * it can be placed, scaled and layered freely. Ruben wears his sweatband (rubenLook.ts).
 *
 * Positions are the FEET of the blob in the shot's world pixels; the blob is drawn around the
 * Graphics object's origin, so scaling it keeps the feet on the ground.
 */
import type Phaser from "phaser";
import { CELL_PX } from "../../config";
import { blobFrame, drawBlob, type BlobPose } from "../../render/playerView";
import { tuning } from "../../tuningStore";
import { drawRubenBand } from "./rubenLook";

export interface ActorPose {
  /** Feet, world pixels. */
  x: number;
  y: number;
  /** 1 is the in-game size. */
  scale?: number;
  facing?: -1 | 1;
  sx?: number;
  sy?: number;
  /** Forward lean of the top of the body, pixels. */
  lean?: number;
  rot?: number;
  lookX?: number;
  lookY?: number;
  /** Forces the eyes shut or open; by default the blob blinks now and then. */
  blink?: boolean;
  dizzy?: boolean;
}

let seedCounter = 0;

export class Actor {
  readonly g: Phaser.GameObjects.Graphics;
  /** The pose last drawn, in the Graphics object's own space. */
  private pose: BlobPose = {
    x: 0,
    y: 0,
    color: 0,
    facing: 1,
    scaleX: 1,
    scaleY: 1,
    lean: 0,
    rotation: 0,
    lookX: 0.5,
    lookY: 0,
    blink: false,
    dizzy: false,
  };
  private scale = 1;
  private readonly blinkSeed: number;
  private frame = blobFrame(this.pose);

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    public color: number,
    private readonly band = false,
  ) {
    this.g = scene.add.graphics();
    parent.add(this.g);
    this.blinkSeed = (seedCounter++ * 977) % 3400;
  }

  /** Draws the blob. `life` is a free-running clock in seconds, for blinks and fluttering ribbons. */
  draw(p: ActorPose, life: number): void {
    const m = tuning.movement;
    const pose = this.pose;
    pose.x = -m.bodyWidth / 2;
    pose.y = -m.bodyHeight;
    pose.color = this.color;
    pose.facing = p.facing ?? 1;
    pose.scaleX = p.sx ?? 1;
    pose.scaleY = p.sy ?? 1;
    pose.lean = p.lean ?? 0;
    pose.rotation = p.rot ?? 0;
    pose.lookX = p.lookX ?? 0.5;
    pose.lookY = p.lookY ?? 0;
    pose.blink = p.blink ?? (life * 1000 + this.blinkSeed) % 3400 < 120;
    pose.dizzy = p.dizzy ?? false;
    this.scale = p.scale ?? 1;
    this.g.setVisible(true).setPosition(p.x, p.y).setScale(this.scale);
    drawBlob(this.g, pose);
    this.frame = blobFrame(pose);
    if (this.band) drawRubenBand(this.g, pose, life * 1000);
  }

  hide(): void {
    this.g.setVisible(false);
    this.g.clear();
  }

  /** Body size in the blob's own pixels (before the actor's scale). */
  get bodyW(): number {
    return tuning.movement.bodyWidth * CELL_PX;
  }
  get bodyH(): number {
    return tuning.movement.bodyHeight * CELL_PX;
  }

  /**
   * A point of the body in the Graphics object's own space, for accessories drawn into `g` after
   * the blob: (lx, ly) is in the blob's frame (feet at 0,0, facing right, y down, unscaled).
   */
  local(lx: number, ly: number): [number, number] {
    return this.frame.tx(lx, ly);
  }

  /** The same point in the parent's space (the shot's world). */
  worldX(lx: number, ly: number): number {
    return this.g.x + this.frame.tx(lx, ly)[0] * this.scale;
  }
  worldY(lx: number, ly: number): number {
    return this.g.y + this.frame.tx(lx, ly)[1] * this.scale;
  }
}
