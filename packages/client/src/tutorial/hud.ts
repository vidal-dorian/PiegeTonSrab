/**
 * The tutorial's HTML layer over the canvas: the big handwritten prompt at the top with its
 * step counter, the "Étape suivante" / "Passer le tuto" buttons, and the end card.
 *
 * It is laid over the canvas rectangle (not the window) and scaled with it, so the prompt
 * always sits over the empty sky rows of the level whatever the window shape.
 */
import { POINTS } from "@game/shared";
import { formatPoints } from "../ui/points";
import { tokenizePrompt } from "./flow";
import "./tutorial.css";

export interface HudActions {
  next(): void;
  skip(): void;
  play(): void;
  replay(): void;
}

/** Points recap on the end card (the full rules are on the menu's rules screen). */
const RECAP: Array<[string, string]> = [
  [`+${formatPoints(POINTS.finish)}`, "arrivée"],
  [`+${formatPoints(POINTS.first)}`, "premier arrivé"],
  [`+${formatPoints(POINTS.kill)}`, "rival tué par ton piège"],
  [`+${formatPoints(POINTS.pushKill)}`, "rival poussé dans ton piège"],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

/** Fill `target` with `text`, turning "[Q]" into key caps and "+2" into points badges. */
function renderPrompt(target: HTMLElement, text: string): void {
  target.replaceChildren(
    ...tokenizePrompt(text).map((t) => {
      if (t.kind === "key") return el("kbd", "", t.text);
      if (t.kind === "points") return el("b", "tuto-pts", t.text);
      return document.createTextNode(t.text);
    }),
  );
}

export class TutorialHud {
  private root = el("div", "tuto");
  private count = el("div", "tuto-count");
  private card = el("div", "tuto-card");
  private prompt = el("div", "tuto-prompt");
  private sub = el("div", "tuto-sub");
  private actions = el("div", "tuto-actions");
  private end = el("div", "tuto-end");
  private lastRect = "";
  private subTimer = 0;

  constructor(actions: HudActions) {
    const top = el("div", "tuto-top");
    this.card.append(this.prompt, this.sub);
    top.append(this.count, this.card);

    const next = el("button", "ui-button tuto-next", "Étape suivante ⏎");
    next.addEventListener("click", () => actions.next());
    const skip = el("button", "ui-button tuto-skip", "Passer le tuto (Échap)");
    skip.addEventListener("click", () => actions.skip());
    this.actions.append(next, skip);

    const panel = el("div", "tuto-end-panel");
    const title = el("h2", "", "C'est tout !");
    const line = el("p", "tuto-end-line", "Pose des pièges, arrive en premier.");
    const recap = el("ul", "tuto-recap");
    for (const [pts, what] of RECAP) {
      const li = el("li");
      li.append(el("b", "tuto-pts", pts), document.createTextNode(` ${what}`));
      recap.append(li);
    }
    const note = el("p", "tuto-end-note", "Tout le monde arrive, ou personne : 0 point pour tous.");
    const buttons = el("div", "tuto-end-buttons");
    const replay = el("button", "ui-button", "Revoir");
    replay.addEventListener("click", () => actions.replay());
    const play = el("button", "ui-button primary", "Jouer");
    play.addEventListener("click", () => actions.play());
    buttons.append(replay, play);
    panel.append(title, line, recap, note, buttons);
    this.end.append(panel);
    this.end.hidden = true;

    // Buttons must not keep the focus: Espace would "click" them again instead of jumping, and
    // Entrée would press them on top of the scene's own Entrée shortcut. Blur after the click
    // (mouse or keyboard alike), not on mouseup, which a button reached with Tab never gets.
    for (const b of [next, skip, replay, play]) b.addEventListener("click", () => b.blur());

    this.root.append(top, this.actions, this.end);
    document.body.append(this.root);
  }

  /** Keep the layer exactly over the canvas. Cheap when nothing changed. */
  fitTo(canvas: HTMLCanvasElement, gameWidth: number): void {
    const r = canvas.getBoundingClientRect();
    const key = `${r.left},${r.top},${r.width},${r.height}`;
    if (key === this.lastRect) return;
    this.lastRect = key;
    const s = this.root.style;
    s.left = `${r.left}px`;
    s.top = `${r.top}px`;
    s.width = `${r.width}px`;
    s.height = `${r.height}px`;
    s.setProperty("--tuto-scale", String(r.width / gameWidth));
  }

  setStep(n: number, total: number): void {
    this.count.textContent = `${n}/${total}`;
  }

  /** Show a prompt. `outro`: an explanation line (points), drawn a little differently. */
  setPrompt(text: string, sub: string | undefined, outro: boolean): void {
    renderPrompt(this.prompt, text);
    delete this.sub.dataset.saved;
    this.sub.classList.remove("warn");
    this.sub.textContent = sub ?? "";
    this.sub.hidden = !sub;
    this.subTimer = 0;
    this.card.classList.toggle("outro", outro);
    // Restart the pop animation.
    this.card.classList.remove("pop");
    void this.card.offsetWidth;
    this.card.classList.add("pop");
  }

  /** Replace the second line for `seconds` (e.g. "Pas là : sur une case orange"), then restore it. */
  flashSub(text: string, seconds: number): void {
    if (!this.sub.dataset.saved) this.sub.dataset.saved = this.sub.textContent ?? "";
    this.sub.textContent = text;
    this.sub.hidden = false;
    this.sub.classList.add("warn");
    this.subTimer = seconds;
  }

  update(dt: number): void {
    if (this.subTimer <= 0) return;
    this.subTimer -= dt;
    if (this.subTimer > 0) return;
    const saved = this.sub.dataset.saved ?? "";
    delete this.sub.dataset.saved;
    this.sub.textContent = saved;
    this.sub.hidden = saved === "";
    this.sub.classList.remove("warn");
  }

  showEnd(): void {
    this.end.hidden = false;
    this.actions.hidden = true;
    this.card.parentElement!.hidden = true;
    // No autofocus on "Jouer": the Entrée that skipped the last line would also press it.
  }

  /**
   * True while one of the HUD's buttons has the keyboard focus (reached with Tab). Entrée
   * then clicks that button (the browser's default action), so the scene must not also act
   * on it: "Étape suivante" would skip two phases, "Revoir" would also leave for the menu.
   */
  get buttonFocused(): boolean {
    const a = document.activeElement;
    return a instanceof HTMLButtonElement && this.root.contains(a);
  }

  get endShown(): boolean {
    return !this.end.hidden;
  }

  destroy(): void {
    this.root.remove();
  }
}
