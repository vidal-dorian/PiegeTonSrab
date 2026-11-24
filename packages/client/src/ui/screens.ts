/**
 * Full-screen interface panels: start menu, lobby, and the map carousel.
 * Plain DOM, appended to the overlay root; text is always set with textContent.
 */
import { parseLevel, type LevelDefinition, type LobbyInfo } from "@game/shared";
import { PLAYER_COLORS } from "../render/playerView";
import { el, overlay } from "./overlay";

function screen(className: string): HTMLDivElement {
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

const NAME_KEY = "player-name";

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Storage unavailable: the name is simply not remembered.
  }
}

export function cssColor(index: number): string {
  return "#" + (PLAYER_COLORS[index] ?? PLAYER_COLORS[0]).toString(16).padStart(6, "0");
}

// --- Start menu -------------------------------------------------------------------------

export interface MenuActions {
  create(name: string): void;
  join(name: string, code: string): void;
  solo(name: string, targetScore: number): void;
  practice(): void;
}

export class MenuScreen {
  private div = screen("ui-menu");
  private error = el("div", "ui-error");
  private busy = false;

  show(actions: MenuActions, initialCode = ""): void {
    const name = el("input", "ui-input");
    name.placeholder = "Ton pseudo";
    name.maxLength = 16;
    name.value = savedName();
    const code = el("input", "ui-input code");
    code.placeholder = "CODE";
    code.maxLength = 4;
    code.value = initialCode;
    const getName = () => {
      const n = name.value.trim();
      saveName(n);
      return n;
    };
    const nameField = el("label", "ui-field", "Pseudo");
    nameField.append(name);
    const joinRow = el("div", "ui-row");
    joinRow.append(code, button("Rejoindre", () => {
      if (code.value.trim().length !== 4) return this.setError("Le code du salon fait 4 lettres.");
      this.run(() => actions.join(getName(), code.value.trim()));
    }));
    const soloRow = el("div", "ui-row");
    soloRow.append(
      button("Solo · 10 pts", () => actions.solo(getName(), 10)),
      button("Solo · 25 pts", () => actions.solo(getName(), 25)),
    );
    this.div.replaceChildren(
      el("h1", "", "Prototype"),
      nameField,
      button("Créer un salon", () => this.run(() => actions.create(getName())), true),
      joinRow,
      this.error,
      el("div", "ui-sep", "Hors ligne"),
      soloRow,
      button("Entraînement libre", () => actions.practice()),
    );
    this.setError("");
    this.busy = false;
    this.div.hidden = false;
  }

  setError(text: string): void {
    this.error.textContent = text;
    this.busy = false;
  }

  hide(): void {
    this.div.hidden = true;
  }

  private run(fn: () => void): void {
    if (this.busy) return;
    this.busy = true;
    this.error.textContent = "Connexion…";
    fn();
  }
}

// --- Lobby ------------------------------------------------------------------------------

export interface LobbyActions {
  setTarget(score: number): void;
  start(): void;
  leave(): void;
}

export class LobbyScreen {
  private div = screen("ui-lobby");

  show(info: LobbyInfo, myId: string, actions: LobbyActions): void {
    const isHost = info.hostId === myId;
    const list = el("ul");
    for (const p of info.players) {
      const li = el("li", p.connected ? "" : "away");
      const swatch = el("span", "swatch");
      swatch.style.background = cssColor(p.color);
      const tags = [p.id === info.hostId ? "hôte" : "", p.id === myId ? "toi" : "", p.connected ? "" : "déconnecté"].filter(Boolean);
      li.append(swatch, el("span", "", p.name), el("span", "tag", tags.join(" · ")));
      list.append(li);
    }

    const link = `${location.origin}${location.pathname}?salon=${info.code}`;
    const copy = button("Copier le lien", () => {
      navigator.clipboard?.writeText(link).then(
        () => overlay.showNotice("Lien copié"),
        () => overlay.showNotice(link, 8000),
      );
    });

    const parts: HTMLElement[] = [el("h2", "", "Salon"), el("div", "code", info.code), copy, list];
    if (isHost) {
      const toggle = el("div", "ui-row ui-toggle");
      for (const score of [10, 25]) {
        const b = button(`${score} points`, () => actions.setTarget(score));
        if (info.targetScore === score) b.classList.add("on");
        toggle.append(b);
      }
      const alone = info.players.filter((p) => p.connected).length < 2;
      parts.push(toggle, button(alone ? "Lancer seul (mode test)" : "Lancer la partie", () => actions.start(), true));
    } else {
      parts.push(el("div", "wait", `Partie en ${info.targetScore} points · en attente de l'hôte…`));
    }
    parts.push(button("Quitter", () => actions.leave()));
    this.div.replaceChildren(...parts);
    this.div.hidden = false;
  }

  hide(): void {
    this.div.hidden = true;
  }
}

// --- Map carousel -----------------------------------------------------------------------

const CARD_WIDTH = 200;
const CARD_GAP = 16;
/** How many times the list of maps is repeated on the track, so the spin looks long. */
const LOOPS = 6;

export class CarouselScreen {
  private div = screen("ui-carousel");
  private timers: number[] = [];

  /** Spin through the maps and stop on `index`. `spinMs` 0 shows the result at once. */
  show(levels: readonly LevelDefinition[], index: number, spinMs: number): void {
    this.clearTimers();
    const track = el("div", "track");
    const cards: HTMLDivElement[] = [];
    for (let loop = 0; loop < LOOPS; loop++) {
      levels.forEach((def) => {
        const card = el("div", "map");
        card.append(thumbnail(def), el("span", "", def.name));
        track.append(card);
        cards.push(card);
      });
    }
    const win = el("div", "window");
    win.append(track);
    const result = el("div", "result");
    this.div.replaceChildren(el("h2", "", "Tirage de la map"), win, result);
    this.div.hidden = false;

    // Land on the chosen map in the last loop but one, centred under the marker.
    const target = (LOOPS - 2) * levels.length + index;
    const offsetFor = (i: number) => win.clientWidth / 2 - (i * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2);
    track.style.transform = `translateX(${offsetFor(index % levels.length)}px)`;
    const finish = () => {
      cards[target]?.classList.add("chosen");
      result.textContent = levels[index]?.name ?? "";
    };
    if (spinMs <= 0) {
      track.style.transform = `translateX(${offsetFor(target)}px)`;
      finish();
      return;
    }
    // Start next frame so the browser animates from the initial position.
    requestAnimationFrame(() => {
      track.style.transition = `transform ${spinMs}ms cubic-bezier(0.12, 0.7, 0.18, 1)`;
      track.style.transform = `translateX(${offsetFor(target)}px)`;
    });
    this.timers.push(window.setTimeout(finish, spinMs));
  }

  hide(): void {
    this.clearTimers();
    this.div.hidden = true;
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }
}

/**
 * Small picture of a level in the sketchbook style: squared paper, terrain in ink, built-in
 * objects as coloured dots (red kills, orange helps), start pebble and orange finish flag.
 */
function thumbnail(def: LevelDefinition): HTMLCanvasElement {
  const level = parseLevel(def);
  const px = 8;
  const canvas = el("canvas");
  canvas.width = level.width * px;
  canvas.height = level.height * px;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#f5f2ea";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#dcd8cc";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 2; x < level.width; x += 2) {
    ctx.moveTo(x * px + 0.5, 0);
    ctx.lineTo(x * px + 0.5, canvas.height);
  }
  for (let y = 2; y < level.height; y += 2) {
    ctx.moveTo(0, y * px + 0.5);
    ctx.lineTo(canvas.width, y * px + 0.5);
  }
  ctx.stroke();
  ctx.fillStyle = "#161616";
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) if (level.solid[y * level.width + x]) ctx.fillRect(x * px, y * px, px, px);
  }
  const OBJECT_COLOURS = { saw: "#b3361a", spikes: "#b3361a", cannon: "#b3361a", spring: "#f07a2e", vine: "#f07a2e", platform: "#ffffff" };
  for (const o of level.initialObjects) {
    ctx.fillStyle = OBJECT_COLOURS[o.kind];
    ctx.strokeStyle = "#161616";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (o.kind === "platform" || o.kind === "cannon" || o.kind === "spring" || o.kind === "vine") {
      ctx.rect(o.x * px + 0.75, o.y * px + 0.75, px - 1.5, px - 1.5);
    } else {
      ctx.arc((o.x + 0.5) * px, (o.y + 0.5) * px, px * 0.42, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }
  // Start: a blue pebble. Finish: an orange flag on an ink pole.
  ctx.fillStyle = "#2b59c3";
  ctx.strokeStyle = "#161616";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse((level.start.x + 0.5) * px, (level.start.y + 0.55) * px, px * 0.45, px * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (level.finish) {
    const fx = level.finish.x * px + px * 0.3;
    const fy = (level.finish.y + 1) * px;
    ctx.fillStyle = "#161616";
    ctx.fillRect(fx - 1, fy - px * 2, 2, px * 2);
    ctx.fillStyle = "#f07a2e";
    ctx.beginPath();
    ctx.moveTo(fx + 1, fy - px * 2);
    ctx.lineTo(fx + px * 1.3, fy - px * 1.6);
    ctx.lineTo(fx + 1, fy - px * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  return canvas;
}

export const menuScreen = new MenuScreen();
export const lobbyScreen = new LobbyScreen();
export const carouselScreen = new CarouselScreen();
