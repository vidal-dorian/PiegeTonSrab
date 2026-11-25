/**
 * One player in the co-op mode: the game's pebble blob (PlayerView, driven by the body's
 * controller state), Ruben's sweatband on top, and the player's name above.
 */
import Phaser from "phaser";
import type { CoopController } from "@game/shared/coop";
import { CELL_PX } from "../../config";
import { FONT_TEXT, INK_CSS, PAPER_CSS } from "../../render/levelView";
import { PlayerView } from "../../render/playerView";
import { drawRubenBand } from "../intro/rubenLook";

export class CoopBodyView {
  private view: PlayerView;
  private band: Phaser.GameObjects.Graphics;
  private label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    readonly color: number,
    readonly name: string,
    readonly isRuben: boolean,
    local: boolean,
  ) {
    const depth = local ? 4 : 3;
    this.view = new PlayerView(scene, color);
    this.view.setDepth(depth);
    this.band = scene.add.graphics().setDepth(depth + 0.01);
    this.label = scene.add
      .text(0, 0, name, {
        fontFamily: FONT_TEXT,
        fontSize: "14px",
        fontStyle: local ? "700" : "500",
        color: INK_CSS,
        stroke: PAPER_CSS,
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(depth + 0.02);
  }

  /** Flattened for a moment: Ruben landed on this player. */
  squash(ms: number): void {
    this.view.squash(ms);
  }

  /** Draw at (x, y) (cells, top-left of the body) with the body's state; `labelled`: show the name. */
  update(x: number, y: number, body: CoopController, visible: boolean, labelled: boolean): void {
    this.view.update(x, y, body, visible);
    this.band.clear();
    const pose = this.view.lastPose;
    if (visible && pose && this.isRuben) drawRubenBand(this.band, pose);
    const showLabel = visible && labelled;
    this.label.setVisible(showLabel);
    if (showLabel) {
      const top = pose ? y + (1 - pose.scaleY) * body.height : y;
      this.label.setPosition((x + body.width / 2) * CELL_PX, top * CELL_PX - (this.isRuben ? 10 : 6));
    }
  }

  destroy(): void {
    this.view.destroy();
    this.band.destroy();
    this.label.destroy();
  }
}
