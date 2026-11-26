/**
 * Start screen: pseudo, create or join an online room, offline solo, free practice, the
 * tutorial and the rules (the rules are a DOM panel opened by ui/screens.ts on its own).
 * The menu itself is HTML (ui/screens.ts); this scene wires its buttons.
 */
import Phaser from "phaser";
import { ROOM_NAME, type ServerMessage } from "@game/shared";
import { COOP_PROTOCOL_VERSION, COOP_ROOM_NAME } from "@game/shared/coop";
import { CoopOnlineLink } from "../coop/net/coopLink";
import { joinRoom, LocalLink, OnlineLink, type GameLink } from "../net/link";
import { overlay } from "../ui/overlay";
import { menuScreen } from "../ui/screens";

export class MenuScene extends Phaser.Scene {
  /** Counts the menu's visits: a room joined during an earlier visit is left, not opened. */
  private visit = 0;

  constructor() {
    super("menu");
  }

  create(data: { message?: string }): void {
    this.visit++;
    overlay.hideAll();
    // A shared link (?salon=ABCD) fills in the code.
    const code = new URLSearchParams(location.search).get("salon") ?? "";
    menuScreen.show(
      {
        create: (name) => void this.goOnline(name, null, ROOM_NAME),
        createCoop: (name) => void this.goOnline(name, null, COOP_ROOM_NAME),
        join: (name, c) => void this.goOnline(name, c, ROOM_NAME),
        solo: (name, targetScore) => this.goSolo(name, targetScore),
        practice: () => {
          menuScreen.hide();
          this.scene.start("solo");
        },
        tutorial: () => {
          menuScreen.hide();
          this.scene.start("tutorial");
        },
      },
      code.toUpperCase().slice(0, 4),
    );
    if (data?.message) menuScreen.setError(data.message);
  }

  /**
   * Create a room of type `roomName`, or join one by its code: the room's first message tells
   * its mode (a code works for a race room and for a co-op room alike).
   */
  private async goOnline(name: string, code: string | null, roomName: string): Promise<void> {
    const visit = this.visit;
    // The player may have picked another entry (practice, solo, tutorial) while this was joining.
    const gone = () => visit !== this.visit || !this.sys.isActive();
    try {
      const joined = await joinRoom(name, code, roomName, COOP_PROTOCOL_VERSION);
      if (gone()) {
        void joined.room.leave(true);
        return;
      }
      menuScreen.hide();
      if (joined.mode === "coop") this.scene.start("coopLobby", { link: new CoopOnlineLink(joined) });
      else this.scene.start("lobby", { link: OnlineLink.fromRoom(joined) });
    } catch (e) {
      if (gone()) return;
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
