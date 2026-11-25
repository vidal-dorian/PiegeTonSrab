import Phaser from "phaser";
import { CELL_PX, VIEW_CELLS_X, VIEW_CELLS_Y } from "./config";
import { GameScene } from "./scenes/GameScene";
import { LobbyScene } from "./scenes/LobbyScene";
import { MenuScene } from "./scenes/MenuScene";
import { SoloScene } from "./scenes/SoloScene";
import { TutorialScene } from "./scenes/TutorialScene";

/** Longest wait for the web fonts before starting anyway (offline, Google Fonts blocked...). */
const FONT_TIMEOUT_MS = 2000;

/**
 * Phaser draws text into canvases once, with whatever font is available at that moment, so
 * wait for the sketchbook fonts before starting. Gives up after FONT_TIMEOUT_MS: the font
 * stacks have fallbacks, and the game must start even without the network.
 */
async function waitForFonts(): Promise<void> {
  const load = async () => {
    const link = document.getElementById("game-fonts") as HTMLLinkElement | null;
    if (link && !link.sheet) {
      await new Promise<void>((resolve) => {
        link.addEventListener("load", () => resolve(), { once: true });
        link.addEventListener("error", () => resolve(), { once: true });
      });
    }
    if (!document.fonts) return;
    await Promise.all(
      ['400 16px "Rubik"', '500 16px "Rubik"', '600 16px "Fredoka"', '700 16px "Fredoka"', '400 16px "Permanent Marker"'].map((f) =>
        document.fonts.load(f).catch(() => []),
      ),
    );
  };
  await Promise.race([load(), new Promise<void>((resolve) => window.setTimeout(resolve, FONT_TIMEOUT_MS))]);
}

function startGame(): void {
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
    scene: [MenuScene, LobbyScene, GameScene, SoloScene, TutorialScene],
  });
  // Dev builds only: lets browser tests start a scene and read its state (window.game.scene...).
  if (import.meta.env.DEV) (window as unknown as { game?: Phaser.Game }).game = game;

  // The live tuning panel (Tab) is a development tool: in a real game it would let anyone change
  // their own gravity, speed or jump height. Dev builds only, loaded on demand so neither the
  // panel nor Tweakpane is in the production bundle.
  if (import.meta.env.DEV) {
    void import("./debug/tuningPanel").then(({ createTuningPanel }) =>
      createTuningPanel(() => {
        for (const scene of game.scene.getScenes(true)) {
          if ("applyTuning" in scene && typeof scene.applyTuning === "function") scene.applyTuning();
        }
      }),
    );
  }
}

void waitForFonts().then(startGame);
