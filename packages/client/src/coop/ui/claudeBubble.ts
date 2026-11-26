/**
 * Claude's speech bubbles in the co-op mode. After a death, Claude names the culprit in a bubble
 * at the bottom of the screen (it stays through the restart, long enough to read); at a terminal
 * it answers in a bubble above the terminal. A round "C" badge marks who is talking: no logo.
 */
import { el, overlay } from "../../ui/overlay";
import { bubbleMs } from "./coopText";
import "./coop.css";

function bubble(className: string): { root: HTMLDivElement; text: HTMLDivElement } {
  const root = el("div", `coop-claude ${className}`);
  root.dataset.screen = "1";
  root.hidden = true;
  const badge = el("span", "coop-claude-badge", "C");
  const body = el("div", "coop-claude-body");
  const name = el("div", "coop-claude-name", "Claude");
  const text = el("div", "coop-claude-text");
  body.append(name, text);
  root.append(badge, body);
  overlay.root.append(root);
  return { root, text };
}

export class ClaudeBubbles {
  private death = bubble("coop-claude-death");
  private term = bubble("coop-claude-term");
  private deathUntil = 0;
  private termUntil = 0;
  private anchor: (() => { x: number; y: number } | null) | null = null;

  /** A line after a death, at the bottom of the screen. */
  say(text: string, nowMs: number): void {
    this.death.text.textContent = text;
    this.death.root.hidden = false;
    this.restartPop(this.death.root);
    this.deathUntil = nowMs + bubbleMs(text);
  }

  /** A line above a terminal; `anchor` gives its page position each frame (null: off screen). */
  sayAt(text: string, nowMs: number, anchor: () => { x: number; y: number } | null): void {
    this.term.text.textContent = text;
    this.term.root.hidden = false;
    this.restartPop(this.term.root);
    this.termUntil = nowMs + bubbleMs(text);
    this.anchor = anchor;
    this.update(nowMs);
  }

  private restartPop(e: HTMLElement): void {
    e.classList.remove("pop");
    void e.offsetWidth;
    e.classList.add("pop");
  }

  update(nowMs: number): void {
    if (!this.death.root.hidden && nowMs > this.deathUntil) this.death.root.hidden = true;
    if (!this.term.root.hidden) {
      const p = nowMs > this.termUntil ? null : this.anchor?.();
      if (!p) {
        this.term.root.hidden = nowMs > this.termUntil;
        if (this.term.root.hidden) this.anchor = null;
      } else {
        // Centred above the point, kept on screen.
        const w = this.term.root.offsetWidth;
        const x = Math.max(8 + w / 2, Math.min(window.innerWidth - 8 - w / 2, p.x));
        this.term.root.style.left = `${x}px`;
        this.term.root.style.top = `${Math.max(this.term.root.offsetHeight + 8, p.y)}px`;
      }
    }
  }

  hide(): void {
    this.death.root.hidden = true;
    this.term.root.hidden = true;
    this.anchor = null;
  }
}
