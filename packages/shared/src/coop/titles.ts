/**
 * End-of-level titles and Claude's lines: what the referee saw, told as a story.
 *
 * Titles describe what happened, never a score: at most four are shown, each with the number
 * that earned it; nobody gets a title for zero, and ties share it. Claude's lines name whoever
 * caused a death ("Il semble que Léo ait lâché le bouton..."), which is what makes restarting the
 * whole level funny instead of frustrating. Texts are French (in-game text); the choice among
 * variants is deterministic so every player reads the same line.
 */
import type { CoopEvent, CoopStats } from "./world";

export type CoopTitleId = "hero" | "traitor" | "boulet" | "kamikaze" | "anchor" | "porter" | "hanged" | "squatter" | "first";

export interface CoopTitle {
  id: CoopTitleId;
  /** "Le Traître". */
  name: string;
  /** Body indices (rope order) who share it. */
  holders: number[];
  /** What earned it, French: "3 morts causées". */
  value: string;
}

/** In this order when more than four could be shown: the betrayals first, the quiet ones last. */
const ORDER: CoopTitleId[] = ["hero", "traitor", "boulet", "kamikaze", "anchor", "porter", "hanged", "squatter", "first"];

const NAMES: Record<CoopTitleId, string> = {
  hero: "Le Héros",
  traitor: "Le Traître",
  boulet: "Le Boulet",
  kamikaze: "Le Kamikaze",
  anchor: "L'Ancre",
  porter: "Le Porteur",
  hanged: "Le Pendu",
  squatter: "Le Squatteur",
  first: "Le Premier de la classe",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

/** Holders of the largest value (ties share), or none if the largest is zero. */
function best(values: readonly number[]): { holders: number[]; value: number } {
  let max = 0;
  for (const v of values) max = Math.max(max, v);
  if (max <= 0) return { holders: [], value: 0 };
  const holders: number[] = [];
  values.forEach((v, i) => {
    if (v === max) holders.push(i);
  });
  return { holders, value: max };
}

/** The titles of a cleared level, at most `max`. */
export function coopTitles(stats: CoopStats, max = 4): CoopTitle[] {
  const secs = (v: readonly number[]) => v.map((s) => Math.floor(s));
  const out: CoopTitle[] = [];
  const push = (id: CoopTitleId, holders: number[], value: string) => {
    if (holders.length > 0) out.push({ id, name: NAMES[id], holders, value });
  };
  for (const id of ORDER) {
    switch (id) {
      case "hero":
        if (stats.opener >= 0) push(id, [stats.opener], "a ouvert la porte");
        break;
      case "first":
        if (stats.firstIn >= 0) push(id, [stats.firstIn], "entré le premier");
        break;
      case "traitor": {
        const b = best(stats.caused);
        push(id, b.holders, plural(b.value, "mort causée", "morts causées"));
        break;
      }
      case "boulet": {
        const b = best(stats.own);
        push(id, b.holders, plural(b.value, "mort de sa faute", "morts de sa faute"));
        break;
      }
      case "kamikaze": {
        const b = best(stats.kamikaze);
        push(id, b.holders, b.value > 1 ? `mort ${b.value} fois avec la clé` : "mort avec la clé");
        break;
      }
      case "anchor": {
        const b = best(stats.catches);
        push(id, b.holders, plural(b.value, "chute rattrapée", "chutes rattrapées"));
        break;
      }
      case "porter": {
        const b = best(secs(stats.carried));
        push(id, b.holders, `${b.value} s avec quelqu'un sur la tête`);
        break;
      }
      case "hanged": {
        const b = best(secs(stats.hung));
        push(id, b.holders, `${b.value} s pendu`);
        break;
      }
      case "squatter": {
        const b = best(secs(stats.plates));
        push(id, b.holders, `${b.value} s sur les boutons`);
        break;
      }
    }
    if (out.length >= max) break;
  }
  return out;
}

type DeathEvent = Extract<CoopEvent, { kind: "death" }>;

function pick(lines: readonly string[], seed: number): string {
  return lines[Math.abs(seed) % lines.length]!;
}

/** Claude's line after a death (`names`: body index to pseudo; `attempt`: the attempt that ended). */
export function deathQuip(e: DeathEvent, names: readonly string[], attempt: number): string {
  const v = names[e.victim] ?? "Quelqu'un";
  const b = names[e.blame] ?? v;
  const seed = attempt * 7 + e.victim;
  if (e.withKey && e.why === "self") {
    return pick([`${v} est parti avec la clé USB. Le projet aussi.`, `${v} avait la clé. Voulez-vous que je résume la situation ?`], seed);
  }
  switch (e.why) {
    case "ground":
      return pick(
        [`Il semble que ${b} ait bougé au mauvais moment. Voulez-vous que je reformule ?`, `${b} a retiré le sol sous les pieds de ${v}. Techniquement, c'est du travail d'équipe.`],
        seed,
      );
    case "plate":
      return pick([`Il semble que ${b} ait lâché le bouton. Voulez-vous que je reformule ?`, `${b} est descendu du bouton. ${v} n'était pas prévenu.`], seed);
    case "rope":
      return pick([`${b} a tiré un peu fort sur la corde. C'est une remarque, pas un reproche.`, `D'après mes calculs, la corde de ${b} a emmené ${v} au mauvais endroit.`], seed);
    case "switch":
      return pick([`${b} a appuyé sur l'interrupteur. Personne ne lui avait rien demandé.`, `Les étagères ont changé grâce à ${b}. ${v} était dessus.`], seed);
    case "catapult":
      return pick([`${b} a sauté un peu fort sur la bascule. Bel envol de ${v}.`, `Décollage réussi pour ${v}. L'atterrissage, moins. Merci ${b}.`], seed);
    case "self":
      break;
  }
  if (e.cause === "deadline") return pick([`La deadline a rattrapé ${v}. Comme d'habitude.`, `${v} n'a pas rendu à temps. Je peux proposer un planning ?`], seed);
  if (e.cause === "fall") {
    return pick([`${v} est tombé tout seul. Je peux proposer un plan en trois étapes ?`, `${v} a quitté le niveau par le bas. C'est une approche.`], seed);
  }
  return pick([`${v} a rencontré quelque chose de pointu. Je le note pour la prochaine fois.`, `${v} a testé les pics. Résultat : ils piquent.`], seed);
}

/** Claude's answer at a terminal: `inverted` when Ruben typed the prompt (Claude did the opposite). */
export function terminalQuip(prompt: string, inverted: boolean, waiting: boolean, seed: number): string {
  if (waiting) return "Il faut valider les deux terminaux en même temps. 3, 2, 1, Entrée !";
  if (!inverted) return pick(["C'est fait.", "Voilà. Autre chose ?", "Terminé, en 0,3 seconde."], seed);
  return pick(
    [
      `J'ai fait l'inverse de « ${prompt} », comme demandé. Autre chose ?`,
      `« fé ${prompt.toLowerCase()} stp » : j'ai interprété librement.`,
      "Bien sûr ! J'ai fait exactement le contraire. Voulez-vous que je reformule ?",
    ],
    seed,
  );
}
