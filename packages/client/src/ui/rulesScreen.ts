/**
 * "Règles" panel: the whole game on one scrollable card, opened from the menu and the lobby.
 * It is a party game, so the text is short and scannable (read in under a minute while friends
 * join). Numbers come from DEFAULT_GAME_CONFIG, the point values from POINTS and the objects
 * from OBJECT_DEFS, so the panel cannot drift from the real rules when those change.
 *
 * Plain DOM over the canvas like the other screens; text is always set with textContent.
 */
import { DEFAULT_GAME_CONFIG, LONG_GAME, OBJECT_DEFS, OBJECT_KINDS, POINTS, SHORT_GAME } from "@game/shared";
import { el, FAMILY_TAG, overlay } from "./overlay";
import { formatPoints } from "./points";

/** A line of the scoring table: what happened, and the points it gives. */
interface PointLine {
  what: string;
  points: string;
  /** Highlighted: the rule players are most likely to miss. */
  star?: boolean;
}

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const s = el("section", "rules-section");
  s.append(el("h3", "", title), ...children);
  return s;
}

function list(items: readonly string[], className = ""): HTMLUListElement {
  const ul = el("ul", className);
  for (const item of items) ul.append(el("li", "", item));
  return ul;
}

/** Two-column list (key, meaning), for points and controls. */
function pairs(rows: ReadonlyArray<{ left: string; right: string; star?: boolean; leftClass?: string }>, className: string): HTMLDListElement {
  const dl = el("dl", className);
  for (const r of rows) {
    const dt = el("dt", r.leftClass ?? "", r.left);
    const dd = el("dd", "", r.right);
    if (r.star) {
      dt.classList.add("star");
      dd.classList.add("star");
    }
    dl.append(dt, dd);
  }
  return dl;
}

function buildContent(): HTMLElement[] {
  const cfg = DEFAULT_GAME_CONFIG;
  const lateFrom = cfg.switchAfterRound + 1;

  const goal = section(
    "Le but",
    el(
      "p",
      "",
      `Pose des pièges pour les autres, puis fonce jusqu'au drapeau. Le premier à ${SHORT_GAME} ou ${LONG_GAME} points (au choix de l'hôte), seul en tête, gagne. Égalité ? Un round de plus.`,
    ),
  );

  const round = section(
    "Un round",
    list(
      [
        `Pose · ${cfg.placementTime} s : tu reçois ${cfg.objectsEarly} objets tirés au sort (${cfg.objectsLate} à partir du round ${lateFrom}, et dès le début à ${cfg.lateOnlyFromPlayers} joueurs). Place-les où tu veux, dans l'ordre que tu veux.`,
        "Impossible de murer le niveau : un objet qui coupe tout chemin vers le drapeau est refusé.",
        `Course · ${cfg.raceTime} s : tout le monde part en même temps vers le drapeau.`,
        `Scores · ${cfg.scoreTime} s, puis on recommence sur le même niveau, piégé un peu plus.`,
        "Mort pendant la course ? Tu peux encore poser 1 bloc (clic) pour aider… ou gêner.",
      ],
      "rules-steps",
    ),
  );

  const plus = (n: number) => `+${formatPoints(n)}`;
  const minKill = formatPoints(POINTS.minKill);
  const points: PointLine[] = [
    { what: "Arriver au drapeau", points: plus(POINTS.finish) },
    { what: "Arriver le premier", points: plus(POINTS.first) },
    { what: "Être le seul à arriver", points: plus(POINTS.onlyOne) },
    { what: "Quelqu'un meurt dans ton piège", points: plus(POINTS.kill) },
    { what: "Tu pousses quelqu'un dans TON piège", points: plus(POINTS.pushKill), star: true },
    { what: `Chaque victime au-delà de ${cfg.killCap}, ou si personne n'arrive`, points: plus(POINTS.minKill) },
  ];
  const scoring = section(
    "Les points",
    pairs(
      points.map((p) => ({ left: p.points, right: p.what, star: p.star, leftClass: "pts" })),
      "rules-points",
    ),
    list(
      [
        "Tu pousses quelqu'un dans le piège d'un autre : le point va au poseur du piège, pas à toi.",
        `Un rival mort dans ton piège te rapporte toujours au moins ${minKill} : tes ${cfg.killCap} victimes les plus rentables du round comptent plein tarif, les suivantes ${minKill}.`,
        "Mort dans son propre piège, dans un piège du niveau ou dans le vide : 0 pour tout le monde.",
      ],
      "rules-notes",
    ),
    el(
      "p",
      "rules-callout",
      `Tout le monde arrive ? Personne ne marque ce round. Personne n'arrive ? Seuls les kills comptent, ${minKill} chacun. Piège dur… mais faisable !`,
    ),
  );

  const contacts = section(
    "Les contacts",
    list([
      "Saute sur une tête : tu rebondis plus haut, l'autre est écrasé et sonné.",
      "Touche quelqu'un de côté : vous êtes repoussés tous les deux.",
      "Bien placé, un coup d'épaule envoie un rival dans un piège.",
    ]),
  );

  const objects = el("ul", "rules-objects");
  for (const kind of OBJECT_KINDS) {
    const def = OBJECT_DEFS[kind];
    const li = el("li");
    const hint = def.rotatable ? `${def.hint} · R ou clic droit pour l'orienter` : def.hint;
    li.append(el("span", `tag ${def.family}`, FAMILY_TAG[def.family]), el("strong", "", def.name), el("span", "desc", hint));
    objects.append(li);
  }
  const objectsSection = section("Les objets", objects);

  const controls = section(
    "Les commandes",
    pairs(
      [
        { left: "Q / A ou ←", right: "Gauche" },
        { left: "D ou →", right: "Droite" },
        { left: "Espace, Z / W ou ↑", right: "Sauter (maintiens pour aller plus haut)" },
        { left: "S ou ↓", right: "Lâcher la liane" },
        { left: "Saut contre un mur", right: "Saut mural" },
        { left: "Clic", right: "Poser ou reprendre un objet" },
        { left: "1, 2, 3", right: "Choisir l'objet à poser" },
        { left: "R ou clic droit", right: "Tourner le canon" },
        { left: "Échap", right: "Quitter la partie" },
      ],
      "rules-keys",
    ),
    el("p", "rules-small", "Manette : stick ou croix pour bouger, A pour sauter, bas pour lâcher la liane."),
  );

  // Points right after the goal: it is what players argue about at the end of a round.
  return [goal, scoring, round, contacts, objectsSection, controls];
}

export class RulesScreen {
  /** Full-screen backdrop holding the card; a click outside the card closes it. */
  private div = el("div", "ui-rules");
  private card = el("div", "rules-card ui-panel");
  private closeButton = el("button", "ui-button rules-close", "✕");
  private returnFocus: HTMLElement | null = null;

  constructor() {
    // data-screen: overlay.hideAll() (every scene change) also closes the rules.
    this.div.dataset.screen = "1";
    this.div.hidden = true;
    this.card.setAttribute("role", "dialog");
    this.card.setAttribute("aria-modal", "true");
    this.card.setAttribute("aria-labelledby", "rules-title");
    this.closeButton.setAttribute("aria-label", "Fermer les règles");
    this.closeButton.addEventListener("click", () => this.hide());

    const title = el("h2", "", "Règles");
    title.id = "rules-title";
    const head = el("div", "rules-head");
    head.append(title, el("span", "rules-sub", "Piège Ton Srab en une minute"), this.closeButton);
    const body = el("div", "rules-body");
    body.append(...buildContent());
    const done = el("button", "ui-button primary rules-done", "Compris !");
    done.addEventListener("click", () => this.hide());
    this.card.append(head, body, done);
    this.div.append(this.card);
    this.div.addEventListener("click", (e) => {
      if (e.target === this.div) this.hide();
    });
    // Capture phase, and only while open: Échap closes the rules and nothing behind them
    // (a scene that also uses Échap to quit) hears that key press.
    window.addEventListener(
      "keydown",
      (e) => {
        if (this.div.hidden || e.code !== "Escape") return;
        e.preventDefault();
        e.stopImmediatePropagation();
        this.hide();
      },
      true,
    );
    overlay.root.append(this.div);
  }

  get isOpen(): boolean {
    return !this.div.hidden;
  }

  show(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.div.hidden = false;
    this.card.scrollTop = 0;
    this.closeButton.focus({ preventScroll: true });
  }

  hide(): void {
    if (this.div.hidden) return;
    this.div.hidden = true;
    this.closeButton.blur();
    // Back to where the player was (e.g. the pseudo field), but never to a button, which
    // Space or Enter could press again by accident.
    if (this.returnFocus instanceof HTMLInputElement && this.returnFocus.isConnected) this.returnFocus.focus();
    this.returnFocus = null;
  }
}

export const rulesScreen = new RulesScreen();
