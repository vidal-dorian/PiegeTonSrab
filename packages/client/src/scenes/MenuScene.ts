/**
 * Start screen: pseudo, create or join an online room, offline solo, free practice.
 * The menu itself is HTML (ui/screens.ts); this scene wires its buttons.
 */
import Phaser from "phaser";
import type { ServerMessage } from "@game/shared";
import { LocalLink, OnlineLink, type GameLink } from "../net/link";
import { overlay } from "../ui/overlay";
import { menuScreen } from "../ui/screens";

export class MenuScene extends Phaser.Scene {
  constructor() {
    super("menu");
  }

  create(data: { message?: string }): void {
    overlay.hideAll();
    // A shared link (?salon=ABCD) fills in the code.
    const code = new URLSearchParams(location.search).get("salon") ?? "";
    menuScreen.show(
      {
        create: (name) => void this.goOnline(name, null),
        join: (name, c) => void this.goOnline(name, c),
        solo: (name, targetScore) => this.goSolo(name, targetScore),
        practice: () => {
          menuScreen.hide();
          this.scene.start("solo");
        },
      },
      code.toUpperCase().slice(0, 4),
    );
    if (data?.message) menuScreen.setError(data.message);
  }

  private async goOnline(name: string, code: string | null): Promise<void> {
    try {
      const link = await OnlineLink.connect(name, code);
      menuScreen.hide();
      this.scene.start("lobby", { link });
    } catch (e) {
      menuScreen.setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Offline: the game session runs in the browser; there is no lobby. */
  private goSolo(name: string, targetScore: number): void {
    const link: GameLink = new LocalLink(name);
    link.send({ type: "setTarget", targetScore });
    link.send({ type: "start" });
    menuScreen.hide();
    // Wait for the session's first messages, then open the game screen.
    let lobby: Extract<ServerMessage, { type: "lobby" }>["lobby"] | null = null;
    link.setHandler((msg) => {
      if (msg.type === "lobby") lobby = msg.lobby;
      if (msg.type === "gameStart") {
        link.setHandler(null);
        this.scene.start("game", { link, start: msg, lobby });
      }
    });
  }
}
