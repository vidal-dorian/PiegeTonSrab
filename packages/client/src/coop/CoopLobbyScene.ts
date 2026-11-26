/**
 * The co-op room before and between levels: the lobby (who plays Ruben, the host launches, each
 * player's "Réactivité" setting with the ping this link measures), and the story intro, which
 * every player watches on their own computer. When the server starts a level, the game screen
 * (CoopScene) takes over the link.
 */
import Phaser from "phaser";
import { COOP_LEVELS, type CoopIntroCast, type CoopLobbyInfo, type CoopServerMessage } from "@game/shared/coop";
import { PLAYER_COLORS } from "../render/playerColors";
import { overlay } from "../ui/overlay";
import { COOP_SCENE_KEY, type CoopSceneData } from "./CoopScene";
import { INTRO_SCENE_KEY, type IntroCast, type IntroSceneData } from "./intro/introContract";
import type { CoopLink } from "./net/coopLink";
import { loadReactivity, previewPrediction, saveReactivity } from "./net/reactivity";
import { coopBanner, coopLobbyScreen, type ReactivityControls } from "./ui/coopScreens";
import { loadCleared } from "./progress";
import { levelLabel } from "./ui/coopText";

export const COOP_LOBBY_KEY = "coopLobby";

export interface CoopLobbySceneData {
  link: CoopLink;
  lobby?: CoopLobbyInfo;
}

function colorOf(seat: number): number {
  return PLAYER_COLORS[seat] ?? PLAYER_COLORS[0];
}

/** The intro's cast from the server's (seat indices become colours). */
export function introCastOf(cast: CoopIntroCast): IntroCast {
  return {
    ruben: { pseudo: cast.ruben.pseudo, color: colorOf(cast.ruben.color), drawnByLot: cast.ruben.drawnByLot },
    friends: cast.friends.map((f) => ({ pseudo: f.pseudo, color: colorOf(f.color) })),
  };
}

/** A cast for replaying the intro from the lobby: the current Ruben (or the first player). */
function castFromLobby(lobby: CoopLobbyInfo): IntroCast {
  const players = lobby.players.filter((p) => p.connected);
  const ruben = players.find((p) => p.id === lobby.rubenId) ?? players[0];
  return {
    ruben: { pseudo: ruben?.name ?? "Ruben", color: colorOf(ruben?.color ?? 2), drawnByLot: false },
    friends: players.filter((p) => p !== ruben).map((p) => ({ pseudo: p.name, color: colorOf(p.color) })),
  };
}

export class CoopLobbyScene extends Phaser.Scene {
  private link!: CoopLink;
  private lobby: CoopLobbyInfo | null = null;
  private introRunning = false;
  private introDone = false;
  /** This player's "Réactivité" setting; the preview reads the link's recent round trip. */
  private reactivity: ReactivityControls = {
    setting: () => loadReactivity(),
    choose: (value) => saveReactivity(value),
    preview: () => previewPrediction(location.search, loadReactivity(), this.link.recentRtt),
  };

  constructor() {
    super(COOP_LOBBY_KEY);
  }

  create(data: CoopLobbySceneData): void {
    this.link = data.link;
    this.lobby = data.lobby ?? null;
    this.introRunning = false;
    this.introDone = false;
    overlay.hideAll();
    if (this.lobby) this.render();
    this.link.onStatus = (status) => {
      if (status === "closed") this.toMenu("Connexion au salon perdue.");
      else if (status === "lost") overlay.showNotice("Connexion perdue, reconnexion…", 0);
      else overlay.showNotice("Reconnecté !", 1500);
    };
    this.link.setHandler((msg) => this.onMessage(msg));
    // The ping moves: the auto decision shown follows it (the scene's clock stops with it).
    this.time.addEvent({ delay: 1000, loop: true, callback: () => coopLobbyScreen.refreshReactivity() });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      coopLobbyScreen.hide();
      coopBanner.hide();
      this.stopIntro();
    });
  }

  private onMessage(msg: CoopServerMessage): void {
    switch (msg.type) {
      case "coopLobby":
        this.lobby = msg.lobby;
        if (!this.introRunning && !this.introDone) this.render();
        return;
      case "coopIntro":
        this.playIntro(introCastOf(msg.cast), Math.max(0, (this.link.serverNow() - msg.startedAt) / 1000), true);
        return;
      case "coopIntroStatus": {
        if (!this.introDone || !this.lobby) return;
        const team = this.lobby.players.filter((p) => p.connected && !p.waiting);
        coopBanner.show("En attente des autres…", `${msg.done.length} / ${team.length} ont fini l'intro`);
        return;
      }
      case "coopLevel": {
        // The game screen takes over the link; messages in between are queued.
        this.link.setHandler(null);
        this.stopIntro();
        const data: CoopSceneData = {
          mode: "online",
          link: this.link,
          lobby: this.lobby,
          level: msg,
          onExit: (message) => this.toMenu(message),
        };
        this.scene.start(COOP_SCENE_KEY, data);
        return;
      }
      case "coopNotice":
        overlay.showNotice(msg.text, 3500);
        return;
      case "error":
        this.toMenu(msg.message);
        return;
      default:
        return;
    }
  }

  private render(): void {
    if (!this.lobby) return;
    coopBanner.hide();
    coopLobbyScreen.show(
      this.lobby,
      this.link.myId,
      {
        setRuben: (id) => this.link.send({ type: "coopRuben", playerId: id }),
        start: () => this.link.send({ type: "coopStart" }),
        play: (index) => this.link.send({ type: "coopPlay", index }),
        replayIntro: () => {
          if (this.lobby) this.playIntro(castFromLobby(this.lobby), 0, false);
        },
        leave: () => this.toMenu(),
      },
      import.meta.env.DEV,
      COOP_LEVELS.map((l) => ({ label: levelLabel(COOP_LEVELS, l), cleared: loadCleared().has(l.id) })),
      this.reactivity,
    );
  }

  /** Play the story: `online` tells the server when it ends (else it is a replay from the lobby). */
  private playIntro(cast: IntroCast, startAt: number, online: boolean): void {
    this.stopIntro();
    coopLobbyScreen.hide();
    coopBanner.hide();
    overlay.hideAll();
    this.introRunning = true;
    this.introDone = false;
    const data: IntroSceneData = {
      cast,
      startAt,
      onDone: () => {
        this.stopIntro();
        if (online) {
          this.introDone = true;
          this.link.send({ type: "coopIntroDone" });
          coopBanner.show("En attente des autres…");
        } else {
          this.render();
        }
      },
    };
    this.scene.launch(INTRO_SCENE_KEY, data);
  }

  private stopIntro(): void {
    if (this.introRunning) {
      this.introRunning = false;
      this.scene.stop(INTRO_SCENE_KEY);
    }
  }

  private toMenu(message?: string): void {
    this.link.setHandler(null);
    this.link.onStatus = null;
    this.link.leave();
    this.stopIntro();
    // Also called by the game screen when leaving a level: this scene is stopped by then, and its
    // start("menu") would only stop itself, leaving the game screen running over the menu.
    this.scene.stop(COOP_SCENE_KEY);
    this.scene.start("menu", message ? { message } : {});
  }
}
