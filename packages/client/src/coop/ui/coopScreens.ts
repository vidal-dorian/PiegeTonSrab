/**
 * HTML panels of the co-op mode: the room's lobby (with the role of Ruben) and the small panels
 * shown over the game (waiting for the others after the intro, a dropped player, "Prêt ?").
 * Built like the race mode's screens (ui/screens.ts): plain DOM in the overlay, textContent only.
 * The lobby reuses the race lobby's look (.ui-lobby) and its squared-paper background.
 */
import type { CoopLobbyInfo } from "@game/shared/coop";
import { el, overlay } from "../../ui/overlay";
import { cssColor } from "../../ui/screens";
import { levelPicker, type LevelChoice } from "./coopCleared";
import "./coop.css";

function panel(className: string): HTMLDivElement {
  const div = el("div", `${className} ui-panel`);
  div.dataset.screen = "1";
  div.hidden = true;
  overlay.root.append(div);
  return div;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = el("button", primary ? "ui-button primary" : "ui-button", label);
  b.addEventListener("click", () => {
    b.blur();
    onClick();
  });
  return b;
}

export interface CoopLobbyActions {
  /** Claim the role (my id), give it (host), or free it (null). */
  setRuben(playerId: string | null): void;
  start(): void;
  /** Host, between levels: play this level. */
  play(index: number): void;
  replayIntro(): void;
  leave(): void;
}

export class CoopLobbyScreen {
  private div = panel("ui-lobby ui-coop-lobby");
  /** The level the host clicked in the list, for the server's next level it was picked against. */
  private picked: { index: number; next: number } | null = null;

  show(info: CoopLobbyInfo, myId: string, actions: CoopLobbyActions, allowSolo: boolean, levels: readonly LevelChoice[] = []): void {
    const isHost = info.hostId === myId;
    const list = el("ul");
    for (const p of info.players) {
      const li = el("li", p.connected ? "" : "away");
      const swatch = el("span", "swatch");
      swatch.style.background = cssColor(p.color);
      const tags = [
        p.id === info.hostId ? "hôte" : "",
        p.id === myId ? "toi" : "",
        p.waiting ? "joue au prochain niveau" : "",
        p.connected ? "" : "déconnecté",
      ].filter(Boolean);
      const name = el("span", "", p.name);
      li.append(swatch, name);
      if (p.id === info.rubenId) li.append(el("span", "coop-ruben-tag", "joue Ruben"));
      li.append(el("span", "tag", tags.join(" · ")));
      if (isHost && p.id !== info.rubenId && info.phase === "lobby") {
        const give = button("Ruben", () => actions.setRuben(p.id));
        give.classList.add("small");
        give.title = `${p.name} joue Ruben`;
        li.append(give);
      }
      list.append(li);
    }

    const link = `${location.origin}${location.pathname}?salon=${info.code}`;
    const copy = button("Copier le lien", () => {
      navigator.clipboard?.writeText(link).then(
        () => overlay.showNotice("Lien copié"),
        () => overlay.showNotice(link, 8000),
      );
    });

    const amRuben = info.rubenId === myId;
    const rubenButton = amRuben
      ? button("Je ne joue plus Ruben", () => actions.setRuben(null))
      : button("Je suis Ruben", () => actions.setRuben(myId));
    const rubenNote = el(
      "div",
      "wait",
      info.rubenId
        ? "Ruben porte le bandeau, pèse 2 et ne se porte pas."
        : "Personne ne joue Ruben : un joueur qui s'appelle Ruben, sinon le sort décidera.",
    );

    const parts: HTMLElement[] = [
      el("h2", "", "Sauve Ton Srab · salon coop"),
      el("div", "code", info.code),
      copy,
      list,
      rubenButton,
      rubenNote,
    ];
    const connected = info.players.filter((p) => p.connected).length;
    if (info.phase === "select" && levels.length > 0) {
      // Between levels: the host picks the next one (the server's next is preselected).
      if (this.picked && this.picked.next !== info.levelIndex) this.picked = null;
      if (isHost) {
        const selected = Math.min(this.picked?.index ?? info.levelIndex, levels.length - 1);
        const list = levelPicker(levels, selected, (i) => {
          this.picked = { index: i, next: info.levelIndex };
          this.show(info, myId, actions, allowSolo, levels);
        });
        parts.push(el("div", "coop-next", "Niveau suivant"), list, button("Jouer", () => actions.play(selected), true), button("Rejouer l'histoire", () => actions.start()));
      } else {
        const host = info.players.find((p) => p.id === info.hostId)?.name ?? "l'hôte";
        parts.push(el("div", "wait", `${host} choisit le prochain niveau…`));
      }
    } else if (isHost) {
      if (connected >= 2 || allowSolo) {
        parts.push(button(connected >= 2 ? "Lancer l'histoire" : "Lancer seul (test)", () => actions.start(), true));
      } else {
        const start = button("Lancer l'histoire", () => undefined, true);
        start.disabled = true;
        parts.push(start, el("div", "wait", "Il faut au moins 2 joueurs : envoie le lien à un pote."));
      }
    } else {
      parts.push(el("div", "wait", "En attente de l'hôte…"));
    }
    const bottom = el("div", "ui-row");
    bottom.append(button("Revoir l'intro", () => actions.replayIntro()), button("Quitter", () => actions.leave()));
    parts.push(bottom);
    this.div.replaceChildren(...parts);
    this.div.hidden = false;
  }

  hide(): void {
    this.div.hidden = true;
  }
}

/** A small card in the middle of the screen over the game: waiting, pause, "Prêt ?". */
export class CoopBanner {
  private div = panel("coop-banner");

  show(title: string, sub = ""): void {
    this.div.replaceChildren(el("div", "coop-banner-title", title), ...(sub ? [el("div", "coop-banner-sub", sub)] : []));
    this.div.hidden = false;
  }

  hide(): void {
    this.div.hidden = true;
  }
}

export const coopLobbyScreen = new CoopLobbyScreen();
export const coopBanner = new CoopBanner();
