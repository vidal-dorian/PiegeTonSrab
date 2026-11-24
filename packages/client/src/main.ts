import Phaser from "phaser";
import { CELL_PX, VIEW_CELLS_X, VIEW_CELLS_Y } from "./config";
import { createTuningPanel } from "./debug/tuningPanel";
import { SoloScene } from "./scenes/SoloScene";

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: "game",
  width: VIEW_CELLS_X * CELL_PX,
  height: VIEW_CELLS_Y * CELL_PX,
  backgroundColor: "#f5f2ea",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // Input is read directly from the browser (see input.ts), not through Phaser.
  input: { keyboard: false, gamepad: false, mouse: false, touch: false },
  scene: [SoloScene],
});

createTuningPanel(() => {
  const scene = game.scene.getScene("solo") as SoloScene | null;
  scene?.applyTuning();
});
