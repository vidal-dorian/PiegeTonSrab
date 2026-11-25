/**
 * The intro's HTML layer over the canvas: the narrator's caption at the bottom, speech bubbles
 * above the characters, and the "Passer" button. Like the tutorial's HUD, it is laid exactly over
 * the canvas rectangle and scaled with it (--sts-scale), so a game pixel is a game pixel whatever
 * the window size. Everything it adds to the page is removed by destroy().
 *
 * Positions given to it are in game pixels (1280 x 720).
 */
import "./intro.css";

export type BubbleTone = "say" | "small";

const BUBBLE_SLOTS = 2;
/** Bubbles keep at least this far from the screen edges, game pixels. */
const EDGE = 18;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text) e.textContent = text;
  return e;
}

interface BubbleSlot {
  root: HTMLDivElement;
  body: HTMLDivElement;
  text: HTMLSpanElement;
  id: string | null;
  /** Size of the bubble in game pixels, measured when its text changes. */
  w: number;
  h: number;
  key: string;
}

export class IntroHud {
  private root = el("div", "sts-intro");
  private caption = el("div", "sts-caption");
  private captionText = el("span");
  private captionId: string | null = null;
  private bubbles: BubbleSlot[] = [];
  private skip = el("button", "ui-button sts-skip", "Passer ⏎");
  private dots: HTMLElement[] = [];
  private dotsKey = "";
  private lastRect = "";
  private scale = 1;

  constructor(
    private readonly gameWidth: number,
    private readonly gameHeight: number,
    shotCount: number,
    onSkip: () => void,
  ) {
    this.caption.append(this.captionText);
    this.caption.hidden = true;
    // The narrator's lines are the story: screen readers get them too.
    this.caption.setAttribute("role", "status");
    this.caption.setAttribute("aria-live", "polite");
    this.root.append(this.caption);

    for (let i = 0; i < BUBBLE_SLOTS; i++) {
      const root = el("div", "sts-bubble");
      const body = el("div", "sts-bubble-body");
      const text = el("span");
      body.append(text, el("i", "sts-bubble-tail"));
      root.append(body);
      root.hidden = true;
      this.root.append(root);
      this.bubbles.push({ root, body, text, id: null, w: 0, h: 0, key: "" });
    }

    const corner = el("div", "sts-corner");
    const progress = el("div", "sts-progress");
    for (let i = 0; i < shotCount; i++) {
      const d = el("i");
      this.dots.push(d);
      progress.append(d);
    }
    this.skip.type = "button";
    this.skip.setAttribute("aria-label", "Passer l'intro");
    this.skip.addEventListener("click", () => {
      // Never keep the focus: Espace or Entrée would press the button again in the next screen.
      this.skip.blur();
      onSkip();
    });
    corner.append(progress, this.skip);
    this.root.append(corner);
    document.body.append(this.root);
  }

  /** Keeps the layer exactly over the canvas. Cheap when nothing changed. */
  fitTo(canvas: HTMLCanvasElement): void {
    const r = canvas.getBoundingClientRect();
    const key = `${r.left},${r.top},${r.width},${r.height}`;
    if (key === this.lastRect) return;
    this.lastRect = key;
    this.scale = r.width / this.gameWidth || 1;
    const s = this.root.style;
    s.left = `${r.left}px`;
    s.top = `${r.top}px`;
    s.width = `${r.width}px`;
    s.height = `${r.height}px`;
    s.setProperty("--sts-scale", String(this.scale));
    // Sizes were measured at the old scale.
    for (const b of this.bubbles) b.key = "";
  }

  /** Shows the narrator's caption `id` (null hides it). It pops when the line changes. */
  setCaption(id: string | null, text: string): void {
    if (id === this.captionId) return;
    this.captionId = id;
    this.caption.hidden = id === null;
    if (id === null) return;
    this.captionText.textContent = text;
    this.caption.classList.remove("pop");
    void this.caption.offsetWidth;
    this.caption.classList.add("pop");
  }

  /**
   * Shows bubble `id` in a slot, its tail pointing at (x, y) in game pixels (null hides the slot).
   * The bubble stays on screen: it slides sideways and only its tail follows the speaker.
   */
  setBubble(slot: number, id: string | null, text: string, x: number, y: number, tone: BubbleTone = "say"): void {
    const b = this.bubbles[slot];
    if (!b) return;
    if (id === null) {
      if (b.id !== null) {
        b.id = null;
        b.root.hidden = true;
      }
      return;
    }
    if (id !== b.id) {
      b.id = id;
      b.text.textContent = text;
      b.root.hidden = false;
      b.root.classList.toggle("small", tone === "small");
      b.body.classList.remove("pop");
      void b.body.offsetWidth;
      b.body.classList.add("pop");
      b.key = "";
    }
    if (b.key === "") {
      // offsetWidth ignores the pop animation's transform: it is the bubble's settled size.
      b.w = b.body.offsetWidth / this.scale;
      b.h = b.body.offsetHeight / this.scale;
    }
    const half = b.w / 2;
    const cx = Math.min(Math.max(x, EDGE + half), this.gameWidth - EDGE - half);
    // Room for the tail under the bubble, and never above the top of the screen.
    const tail = 16;
    const top = Math.max(EDGE, y - tail - b.h);
    const tailX = Math.min(Math.max(x - cx, -half + 22), half - 22);
    const key = `${Math.round(cx * 2)},${Math.round(top * 2)},${Math.round(tailX * 2)}`;
    if (key === b.key) return;
    b.key = key;
    const s = b.root.style;
    s.left = `${(cx / this.gameWidth) * 100}%`;
    s.top = `${(top / this.gameHeight) * 100}%`;
    s.setProperty("--tail-x", `${tailX * this.scale}px`);
  }

  /** Which shot is playing (for the row of dots) and whether the skip button is offered. */
  setProgress(shotIndex: number, done: boolean): void {
    const key = `${shotIndex},${done}`;
    if (key === this.dotsKey) return;
    this.dotsKey = key;
    this.dots.forEach((d, i) => {
      d.className = i < shotIndex ? "past" : i === shotIndex ? "now" : "";
    });
    this.skip.hidden = done;
  }

  /** True while the skip button has the keyboard focus (reached with Tab). */
  get buttonFocused(): boolean {
    return document.activeElement === this.skip;
  }

  destroy(): void {
    this.root.remove();
  }
}
