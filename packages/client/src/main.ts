import Phaser from "phaser";
import { CELL_PX, VIEW_CELLS_X, VIEW_CELLS_Y } from "./config";
import { createTuningPanel } from "./debug/tuningPanel";
import { GameScene } from "./scenes/GameScene";
import { MenuScene } from "./scenes/MenuScene";
import { SoloScene } from "./scenes/SoloScene";

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: "game",
  width: VIEW_CELLS_X * CELL_PX,
  height: VIEW_CELLS_Y * CELL_PX,
  backgroundColor: "#f5f2ea",
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  // Input is read directly from the browser (see input.ts and the scenes), not through Phaser.
  input: { keyboard: false, gamepad: false, mouse: false, touch: false },
  // The first scene in the list starts automatically.
  scene: [MenuScene, GameScene, SoloScene],
});

createTuningPanel(() => {
  for (const scene of game.scene.getScenes(true)) {
    if ("applyTuning" in scene && typeof scene.applyTuning === "function") scene.applyTuning();
  }
});
