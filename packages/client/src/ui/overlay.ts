/**
 * HTML interface over the game canvas: menu, top bar, placement tray, banner, score table.
 * The game world is drawn by Phaser; everything textual or clickable is plain DOM,
 * which is simpler to lay out and style. Text is always set with textContent.
 */
import { cardInfo, type CardKind } from "@game/shared";
import { formatPoints } from "./points";
import "./ui.css";

/** Word on each object card for its colour family; also used by the rules screen. */
export const FAMILY_TAG = { kill: "TUE", help: "AIDE", neutral: "NEUTRE" } as const;

export interface TopBarState {
  round: number;
  phase: string;
  /** Seconds left, or null to hide the timer. */
  timeLeft: number | null;
  score: number;
  target: number;
}

/** Why a card in the hand can't be played: no accepted cell left anywhere, or the player discarded it. */
export type CardOut = "noRoom" | "discarded";

const CARD_OUT_LABEL: Record<CardOut, string> = { noRoom: "Plus de place", discarded: "Défaussé" };

/** How long a floating label stays above a cell, milliseconds (the CSS animation lasts as long). */
const FLOAT_MS = 1600;

export interface TrayState {
  /** Other players and whether they validated; empty offline. */
  others?: Array<{ name: string; done: boolean }>;
  /** This player validated and is waiting for the others. */
  waiting?: boolean;
  /** The objects drawn for this player this round. `arrow`: direction of a cannon. */
  cards: Array<{ kind: CardKind; used: boolean; arrow?: string; out?: CardOut }>;
  selected: number | null;
  placed: number;
  needed: number;
  /** "Valider la pose" can be pressed (everything is placed, discarded or has no room). */
  canValidate: boolean;
  /** "Défausser" can be pressed (an object is selected). */
  canDiscard: boolean;
  hint: string;
  hintBad: boolean;
}

export interface ScoreRow {
  name: string;
  cells: string[];
}

export interface ScoresState {
  title: string;
  verdict: string;
  headers: string[];
  rows: ScoreRow[];
  actions?: Array<{ label: string; primary?: boolean; onClick: () => void }>;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

export interface TrayHandlers {
  onSelect: (i: number) => void;
  onValidate: () => void;
  onDiscard: () => void;
}

export class Overlay {
  /** Container for every interface part; other UI modules append their panels here. */
  readonly root: HTMLDivElement;
  private topbar = el("div", "ui-topbar ui-panel");
  private tray = el("div", "ui-tray ui-panel");
  private banner = el("div", "ui-banner ui-panel");
  private scores = el("div", "ui-scores ui-panel");
  private help = el("div", "ui-help");
  private notice = el("div", "ui-notice ui-panel");
  private noticeTimer = 0;
  private trayHandlers: TrayHandlers | null = null;
  private trayHint: HTMLDivElement | null = null;

  constructor() {
    this.root = el("div");
    this.root.id = "ui";
    for (const part of [this.topbar, this.tray, this.banner, this.scores, this.help, this.notice]) {
      part.hidden = true;
      this.root.append(part);
    }
    document.body.append(this.root);
  }

  hideAll(): void {
    for (const part of [this.topbar, this.tray, this.banner, this.scores, this.help, this.notice]) part.hidden = true;
    for (const extra of this.root.querySelectorAll<HTMLElement>("[data-screen]")) extra.hidden = true;
    for (const label of this.root.querySelectorAll(".ui-float")) label.remove();
  }

  /** Short message at the top of the screen; stays until hidden if `ms` is 0. */
  showNotice(text: string, ms = 3000): void {
    this.notice.textContent = text;
    this.notice.hidden = false;
    window.clearTimeout(this.noticeTimer);
    if (ms > 0) this.noticeTimer = window.setTimeout(() => (this.notice.hidden = true), ms);
  }

  hideNotice(): void {
    this.notice.hidden = true;
  }

  /**
   * A short handwritten note that pops up at a point of the page (CSS pixels), usually right
   * above a cell of the level, then floats up and fades. One at a time: a new one replaces it.
   */
  floatLabel(text: string, x: number, y: number): void {
    for (const old of this.root.querySelectorAll(".ui-float")) old.remove();
    const label = el("div", "ui-float", text);
    // Keep it on screen near the edges; the label is centred on x.
    const margin = 128;
    label.style.left = `${Math.min(Math.max(x, margin), window.innerWidth - margin)}px`;
    label.style.top = `${Math.max(y, 40)}px`;
    this.root.append(label);
    window.setTimeout(() => label.remove(), FLOAT_MS);
  }

  setTopBar(s: TopBarState | null): void {
    if (!s) {
      this.topbar.hidden = true;
      return;
    }
    const timer = el("span", "timer", s.timeLeft === null ? "" : String(Math.ceil(s.timeLeft)));
    if (s.timeLeft !== null && s.timeLeft <= 5) timer.classList.add("urgent");
    this.topbar.replaceChildren(
      el("span", "", `Round ${s.round}`),
      el("strong", "", s.phase),
      timer,
      el("span", "", `${formatPoints(s.score)} / ${s.target} pts`),
    );
    this.topbar.hidden = false;
  }

  showTray(s: TrayState, handlers: TrayHandlers): void {
    this.trayHandlers = handlers;
    const cards = el("div", "cards");
    s.cards.forEach((c, i) => {
      const def = cardInfo(c.kind);
      const card = el("button", "card");
      if (c.kind === "eraser") card.classList.add("rare");
      if (c.used) card.classList.add("used");
      if (s.selected === i) card.classList.add("selected");
      if (c.out) card.classList.add("out", c.out);
      const name = el("span", "name", c.arrow ? `${def.name} ${c.arrow}` : def.name);
      card.append(el("span", "key", String(i + 1)), name, el("span", "desc", def.hint), el("span", `tag ${def.family}`, FAMILY_TAG[def.family]));
      // A stamp across the card; a discarded card stays clickable to take it back.
      if (c.out) card.append(el("span", "stamp", CARD_OUT_LABEL[c.out]));
      if (c.out === "discarded") card.title = "Clic : reprendre cet objet";
      card.disabled = c.used || c.out === "noRoom";
      card.addEventListener("click", () => {
        card.blur();
        this.trayHandlers?.onSelect(i);
      });
      cards.append(card);
    });
    const validate = this.button(s.waiting ? "En attente des autres…" : "Valider la pose", () => this.trayHandlers?.onValidate(), true);
    validate.disabled = s.waiting === true || !s.canValidate;
    const out = s.cards.filter((c) => c.out).length;
    const count = `${s.placed} / ${s.needed} posés${out ? ` · ${out} défaussé${out > 1 ? "s" : ""}` : ""}`;
    const row = el("div", "row");
    row.append(el("span", "", count));
    if (!s.waiting) {
      // Give up the selected object for this round (a map so full nothing fits where you want).
      const discard = this.button("Défausser", () => this.trayHandlers?.onDiscard());
      discard.classList.add("small");
      discard.title = "Renoncer à l'objet choisi pour ce round";
      discard.disabled = !s.canDiscard;
      row.append(discard);
    }
    row.append(validate);
    this.trayHint = el("div", "hint");
    const title = el("div", "tray-title", "Tes objets, tirés au sort");
    const parts: HTMLElement[] = [title, cards, this.trayHint, row];
    if (s.others?.length) {
      const status = el("div", "status");
      for (const o of s.others) status.append(el("span", o.done ? "done" : "", `${o.name} ${o.done ? "✓" : "…"}`));
      parts.push(status);
    }
    this.tray.replaceChildren(...parts);
    this.setTrayHint(s.hint, s.hintBad);
    this.tray.hidden = false;
  }

  /** Update only the hint line, so hovering never rebuilds the buttons under the mouse. */
  setTrayHint(text: string, bad: boolean): void {
    if (!this.trayHint) return;
    this.trayHint.textContent = text;
    this.trayHint.classList.toggle("bad", bad);
  }

  /** Screen area (CSS pixels) left free between the top bar and the tray, for fitting the level view. */
  freeArea(): { top: number; bottom: number } {
    const top = this.topbar.hidden ? 0 : this.topbar.getBoundingClientRect().bottom;
    const bottom = this.tray.hidden ? window.innerHeight : this.tray.getBoundingClientRect().top;
    return { top, bottom };
  }

  hideTray(): void {
    this.tray.hidden = true;
    this.trayHandlers = null;
  }

  showBanner(text: string, bad = false): void {
    this.banner.textContent = text;
    this.banner.classList.toggle("bad", bad);
    this.banner.hidden = false;
  }

  hideBanner(): void {
    this.banner.hidden = true;
  }

  showScores(s: ScoresState): void {
    const table = el("table");
    const head = el("tr");
    for (const h of ["", ...s.headers]) head.append(el("th", "", h));
    table.append(head);
    for (const r of s.rows) {
      const tr = el("tr");
      tr.append(el("td", "", r.name), ...r.cells.map((c) => el("td", "", c)));
      table.append(tr);
    }
    const parts: HTMLElement[] = [el("h2", "", s.title), el("p", "verdict", s.verdict), table];
    if (s.actions?.length) {
      const actions = el("div", "actions");
      for (const a of s.actions) actions.append(this.button(a.label, a.onClick, a.primary));
      parts.push(actions);
    }
    this.scores.replaceChildren(...parts);
    this.scores.hidden = false;
  }

  hideScores(): void {
    this.scores.hidden = true;
  }

  setHelp(text: string): void {
    this.help.textContent = text;
    this.help.hidden = text === "";
  }

  private button(label: string, onClick: () => void, primary = false): HTMLButtonElement {
    const b = el("button", primary ? "ui-button primary" : "ui-button", label);
    b.addEventListener("click", () => {
      // Drop focus so Space (jump) can never press the button again.
      b.blur();
      onClick();
    });
    return b;
  }
}

/** One overlay for the whole page. */
export const overlay = new Overlay();
