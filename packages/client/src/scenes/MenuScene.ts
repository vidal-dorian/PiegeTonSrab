/**
 * Start screen. The menu itself is HTML (see ui/overlay.ts); this scene only shows it
 * and starts the chosen mode.
 */
import Phaser from "phaser";
import { LONG_GAME, RACE_LEVELS, SHORT_GAME } from "@game/shared";
import { overlay } from "../ui/overlay";

/** -1 means a random level each game. Kept while the page is open. */
let levelChoice = -1;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create(): void {
    overlay.hideAll();
    this.render();
  }

  private render(): void {
    const levelLabel = levelChoice < 0 ? "Aléatoire" : RACE_LEVELS[levelChoice]!.name;
    overlay.showMenu([
      { label: `Partie courte · ${SHORT_GAME} points`, primary: true, onClick: () => this.startGame(SHORT_GAME) },
      { label: `Partie longue · ${LONG_GAME} points`, onClick: () => this.startGame(LONG_GAME) },
      {
        label: `Niveau : ${levelLabel}`,
        onClick: () => {
          levelChoice = levelChoice + 1 >= RACE_LEVELS.length ? -1 : levelChoice + 1;
          this.render();
        },
      },
      { label: "Entraînement libre", onClick: () => this.startPractice() },
    ]);
  }

  private chosenLevel(): number {
    return levelChoice >= 0 ? levelChoice : Math.floor(Math.random() * RACE_LEVELS.length);
  }

  private startGame(targetScore: number): void {
    overlay.hideAll();
    this.scene.start("game", { targetScore, levelIndex: this.chosenLevel() });
  }

  private startPractice(): void {
    overlay.hideAll();
    this.scene.start("solo", { levelIndex: levelChoice >= 0 ? levelChoice : 0 });
  }
}
