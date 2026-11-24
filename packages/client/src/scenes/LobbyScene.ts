/**
 * Online lobby: shows the room code and the players; the host picks the target score and
 * starts the game. When the game starts, the game scene takes over the connection.
 */
import Phaser from "phaser";
import type { LobbyInfo } from "@game/shared";
import type { GameLink } from "../net/link";
import { overlay } from "../ui/overlay";
import { lobbyScreen } from "../ui/screens";

export class LobbyScene extends Phaser.Scene {
  private link!: GameLink;
  private lobby: LobbyInfo | null = null;

  constructor() {
    super("lobby");
  }

  create(data: { link: GameLink; lobby?: LobbyInfo }): void {
    this.link = data.link;
    this.lobby = data.lobby ?? null;
    overlay.hideAll();
    if (this.lobby) this.render();

    this.link.onStatus = (status) => {
      if (status === "lost") overlay.showNotice("Connexion perdue, reconnexion…", 0);
      else if (status === "back") overlay.showNotice("Reconnecté");
      else this.leave("Déconnecté du serveur.");
    };
    this.link.setHandler((msg) => {
      if (msg.type === "lobby") {
        this.lobby = msg.lobby;
        this.render();
      } else if (msg.type === "gameStart") {
        this.link.setHandler(null);
        lobbyScreen.hide();
        this.scene.start("game", { link: this.link, start: msg, lobby: this.lobby });
      } else if (msg.type === "error") {
        this.leave(msg.message);
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => lobbyScreen.hide());
  }

  private render(): void {
    if (!this.lobby) return;
    lobbyScreen.show(this.lobby, this.link.myId, {
      setTarget: (targetScore) => this.link.send({ type: "setTarget", targetScore }),
      start: () => this.link.send({ type: "start" }),
      leave: () => this.leave(),
    });
  }

  private leave(message = ""): void {
    this.link.setHandler(null);
    this.link.onStatus = null;
    this.link.leave();
    this.scene.start("menu", { message });
  }
}
