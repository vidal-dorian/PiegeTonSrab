/**
 * The co-op game screen's HUD, in HTML over the canvas like the race mode's top bar: the level,
 * the attempt, the time, who has Ruben's key, who is already through the door, a ring filling
 * while R is held (and who holds it), and the level card shown when a level starts.
 * Only what changed is written to the DOM: update() runs every frame.
 */
import { el, overlay } from "../../ui/overlay";
import { formatClock } from "./coopText";
import "./coop.css";

export interface HudPerson {
  name: string;
  /** 0xRRGGBB seat colour. */
  color: number;
}

export interface HudState {
  level: string;
  attempt: number;
  seconds: number;
  key: { kind: "none" } | { kind: "free" } | { kind: "lock" } | ({ kind: "carried" } & HudPerson);
  /** Bodies inside the door, once it is open. */
  inside: { count: number; total: number } | null;
  /** R held: how far (0..1), by whom, and how many must hold it. */
  restart: { progress: number; holders: HudPerson[]; needed: number } | null;
}

export function hexColor(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

/** A small pebble in a player's colour (the lobby's swatch, smaller). */
export function pebble(color: number): HTMLSpanElement {
  const s = el("span", "coop-pebble");
  s.style.background = hexColor(color);
  return s;
}

function screenPart(className: string): HTMLDivElement {
  const div = el("div", className);
  div.dataset.screen = "1";
  div.hidden = true;
  overlay.root.append(div);
  return div;
}

export class CoopHud {
  private bar = screenPart("coop-hud ui-panel");
  private levelEl = el("span", "coop-hud-level");
  private tryEl = el("span", "coop-hud-try");
  private timeEl = el("span", "coop-hud-time");
  private keyEl = el("span", "coop-hud-key");
  private inEl = el("span", "coop-hud-in");
  private ring = screenPart("coop-restart");
  private card = screenPart("coop-levelcard ui-panel");
  private cardSub = el("div", "coop-levelcard-sub");
  private shown = new Map<HTMLElement, string>();
  private cardUntil = 0;

  constructor() {
    this.bar.append(this.levelEl, this.tryEl, this.timeEl, this.keyEl, this.inEl);
  }

  private put(e: HTMLElement, key: string, fill: () => void): void {
    if (this.shown.get(e) === key) return;
    this.shown.set(e, key);
    fill();
  }

  update(s: HudState, nowMs: number): void {
    this.bar.hidden = false;
    this.put(this.levelEl, s.level, () => (this.levelEl.textContent = s.level));
    this.put(this.tryEl, String(s.attempt), () => {
      this.tryEl.textContent = `Essai ${s.attempt}`;
      // A new attempt: the counter jumps.
      this.tryEl.classList.remove("bump");
      void this.tryEl.offsetWidth;
      if (s.attempt > 1) this.tryEl.classList.add("bump");
    });
    const clock = formatClock(s.seconds);
    this.put(this.timeEl, clock, () => (this.timeEl.textContent = clock));
    const k = s.key;
    const keyText = k.kind === "carried" ? `carried:${k.name}:${k.color}` : k.kind;
    this.put(this.keyEl, keyText, () => {
      this.keyEl.hidden = k.kind === "none";
      const icon = el("span", "coop-usb");
      if (k.kind === "carried") this.keyEl.replaceChildren(icon, pebble(k.color), el("span", "", k.name));
      else this.keyEl.replaceChildren(icon, el("span", "", k.kind === "lock" ? "porte ouverte" : "à trouver"));
      this.keyEl.classList.toggle("found", k.kind !== "free");
    });
    const inText = s.inside ? `${s.inside.count}/${s.inside.total}` : "";
    this.put(this.inEl, inText, () => {
      this.inEl.hidden = !s.inside;
      this.inEl.textContent = s.inside ? `Dedans ${inText}` : "";
    });

    const r = s.restart;
    this.ring.hidden = !r;
    if (r) {
      this.ring.style.setProperty("--p", String(Math.max(0, Math.min(1, r.progress))));
      const who = `${r.holders.map((h) => `${h.name}:${h.color}`).join(",")}|${r.needed}`;
      this.put(this.ring, who, () => {
        const names = el("div", "coop-restart-who");
        for (const h of r.holders) names.append(pebble(h.color), el("span", "", h.name));
        const need = r.needed > 1 ? el("div", "coop-restart-need", `il faut ${r.needed} joueurs sur R (${Math.min(r.holders.length, r.needed)}/${r.needed})`) : null;
        this.ring.replaceChildren(el("div", "coop-restart-dial", "R"), el("div", "coop-restart-title", "Relancer…"), names, ...(need ? [need] : []));
      });
    }

    if (this.cardUntil > 0 && nowMs > this.cardUntil) {
      this.card.hidden = true;
      this.cardUntil = 0;
    }
  }

  /** The level card: "Niveau 3 · L'Amphi" and Ruben's line, for `ms`. */
  showCard(title: string, quote: string | undefined, nowMs: number, ms: number): void {
    const parts: HTMLElement[] = [el("div", "coop-levelcard-title", title)];
    if (quote) {
      const q = el("div", "coop-levelcard-quote", `« ${quote} »`);
      q.append(el("span", "coop-levelcard-by", " — Ruben"));
      parts.push(q);
    }
    parts.push(this.cardSub);
    this.card.replaceChildren(...parts);
    this.card.hidden = false;
    this.cardUntil = nowMs + ms;
  }

  /** A line under the card ("Prêt ?"), empty to remove it. */
  setCardSub(textValue: string): void {
    if (this.cardSub.textContent !== textValue) this.cardSub.textContent = textValue;
    this.cardSub.hidden = textValue === "";
  }

  /** Keep the card up at least until `nowMs + ms`. */
  holdCard(nowMs: number, ms: number): void {
    if (this.cardUntil > 0) this.cardUntil = Math.max(this.cardUntil, nowMs + ms);
  }

  hide(): void {
    this.bar.hidden = true;
    this.ring.hidden = true;
    this.card.hidden = true;
    this.cardUntil = 0;
    this.shown.clear();
  }
}
