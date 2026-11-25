/**
 * The co-op mode's story intro (see introContract.ts for how the game uses it).
 *
 * PLACEHOLDER: this version only shows a title card and honours the contract (skip keys, onDone,
 * cleanup on shutdown). The real animation replaces this file and the files next to it.
 */
import Phaser from "phaser";
import { CELL_PX, VIEW_CELLS_X, VIEW_CELLS_Y } from "../../config";
import { FONT_MARKER, FONT_TEXT, INK_CSS, PAPER_CSS } from "../../render/levelView";
import { INTRO_DURATION_S, INTRO_SCENE_KEY, type IntroSceneData } from "./introContract";

const PLACEHOLDER_SECONDS = 4;

export class IntroScene extends Phaser.Scene {
  private data_!: IntroSceneData;
  private done = false;
  private elapsed = 0;
  private lastNow = 0;
  private onKey = (e: KeyboardEvent) => {
    if (e.code === "Enter" || e.code === "Space" || e.code === "NumpadEnter") {
      e.preventDefault();
      this.finish(true);
    }
  };

  constructor() {
    super(INTRO_SCENE_KEY);
  }

  create(data: IntroSceneData): void {
    this.data_ = data;
    this.done = false;
    this.elapsed = Math.max(0, data.startAt ?? 0);
    this.lastNow = performance.now();
    this.cameras.main.setZoom(1).setScroll(0, 0);
    const w = VIEW_CELLS_X * CELL_PX;
    const h = VIEW_CELLS_Y * CELL_PX;
    this.add
      .text(w / 2, h / 2 - 30, "SAUVE TON SRAB", { fontFamily: FONT_MARKER, fontSize: "64px", color: INK_CSS })
      .setOrigin(0.5);
    const names = [data.cast.ruben.pseudo, ...data.cast.friends.map((f) => f.pseudo)].join(", ");
    this.add
      .text(w / 2, h / 2 + 40, `Intro à venir · ${names}`, {
        fontFamily: FONT_TEXT,
        fontSize: "22px",
        color: INK_CSS,
        backgroundColor: PAPER_CSS,
      })
      .setOrigin(0.5);
    window.addEventListener("keydown", this.onKey);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener("keydown", this.onKey);
      // Stopped from outside: no onDone.
      this.done = true;
    });
  }

  override update(): void {
    const now = performance.now();
    this.elapsed += Math.min(0.25, (now - this.lastNow) / 1000);
    this.lastNow = now;
    if (this.elapsed >= Math.min(PLACEHOLDER_SECONDS, INTRO_DURATION_S)) this.finish(false);
  }

  private finish(skipped: boolean): void {
    if (this.done) return;
    this.done = true;
    this.data_.onDone(skipped);
  }
}
