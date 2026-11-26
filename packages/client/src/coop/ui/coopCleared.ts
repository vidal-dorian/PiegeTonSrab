/**
 * The end-of-level card of the co-op mode, and the host's level list (also shown in the lobby
 * between levels). The card tells the story of the level: its name, the attempts, the time, the
 * titles with their holders in their seat colours and the number that earned each. The host picks
 * the next level (every level is open, the next one preselected, the ones this computer cleared
 * ticked) and plays it, or goes back to the lobby; the others wait for the host.
 */
import { el, overlay } from "../../ui/overlay";
import { hexColor } from "./coopHud";
import { attemptsText, formatDuration } from "./coopText";
import "./coop.css";

export interface ClearedTitle {
  name: string;
  value: string;
  holders: Array<{ name: string; color: number }>;
}

export interface ClearedInfo {
  level: string;
  attempts: number;
  seconds: number;
  titles: ClearedTitle[];
}

export interface LevelChoice {
  label: string;
  cleared: boolean;
}

export interface HostChoice {
  levels: LevelChoice[];
  selected: number;
  onSelect(index: number): void;
  onPlay(index: number): void;
  onBack(): void;
}

function button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
  const b = el("button", primary ? "ui-button primary" : "ui-button", label);
  b.addEventListener("click", () => {
    // Drop focus so Space (jump) can never press it again.
    b.blur();
    onClick();
  });
  return b;
}

/** A player's name on a pill in their colour (white and black seats stay readable). */
export function namePill(name: string, color: number): HTMLSpanElement {
  const pill = el("span", "coop-name", name);
  pill.style.background = hexColor(color);
  // Light seats (white) get ink text, dark ones white text.
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  pill.style.color = 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#161616" : "#ffffff";
  return pill;
}

/** The list of levels: click to choose, the chosen one outlined, cleared ones ticked. */
export function levelPicker(levels: readonly LevelChoice[], selected: number, onSelect: (index: number) => void): HTMLElement {
  const list = el("ol", "coop-levels");
  levels.forEach((l, i) => {
    const li = el("li");
    const b = el("button", `coop-level${i === selected ? " chosen" : ""}${l.cleared ? " cleared" : ""}`);
    b.append(el("span", "coop-level-tick", l.cleared ? "✓" : ""), el("span", "coop-level-name", l.label));
    b.title = l.cleared ? "Déjà réussi sur cet ordinateur" : "";
    b.addEventListener("click", () => {
      b.blur();
      onSelect(i);
    });
    li.append(b);
    list.append(li);
  });
  // Keep the chosen level in view in a long list.
  queueMicrotask(() => list.querySelector<HTMLElement>(".chosen")?.scrollIntoView?.({ block: "nearest" }));
  return list;
}

/** The host's part: the list, "Jouer", "Retour au salon". */
function hostChoice(c: HostChoice): HTMLElement[] {
  const play = button("Jouer", () => c.onPlay(c.selected), true);
  const row = el("div", "ui-row");
  row.append(button("Retour au salon", () => c.onBack()), play);
  return [el("div", "coop-next", "Niveau suivant"), levelPicker(c.levels, c.selected, (i) => c.onSelect(i)), row];
}

export class CoopClearedScreen {
  private div = (() => {
    const d = el("div", "coop-cleared ui-panel");
    d.dataset.screen = "1";
    d.hidden = true;
    overlay.root.append(d);
    return d;
  })();

  /** The card; `host` for the host, else the name of the host everybody waits for. */
  show(info: ClearedInfo, who: { host: HostChoice } | { waitingFor: string }): void {
    const head = el("div", "coop-cleared-head");
    head.append(el("div", "coop-cleared-stamp", "Réussi !"), el("h2", "", info.level));
    const sub = el("div", "coop-cleared-sub", `${attemptsText(info.attempts)} · ${formatDuration(info.seconds)}`);
    const titles = el("ul", "coop-titles");
    for (const t of info.titles) {
      const li = el("li");
      const holders = el("span", "coop-title-holders");
      for (const h of t.holders) holders.append(namePill(h.name, h.color));
      li.append(el("span", "coop-title-name", t.name), holders, el("span", "coop-title-value", t.value));
      titles.append(li);
    }
    if (info.titles.length === 0) titles.append(el("li", "coop-title-none", "Pas de titre cette fois : tout s'est passé sans histoire."));
    const parts: HTMLElement[] = [head, sub, titles];
    if ("host" in who) parts.push(...hostChoice(who.host));
    else parts.push(el("div", "coop-wait", `En attente de ${who.waitingFor}…`));
    this.div.replaceChildren(...parts);
    this.div.hidden = false;
  }

  hide(): void {
    this.div.hidden = true;
  }
}

