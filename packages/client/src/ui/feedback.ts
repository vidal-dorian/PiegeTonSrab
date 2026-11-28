/**
 * French texts that tell a player why one of their actions did not work: objects refused
 * at the end of placement, objects not placed in time, objects with no room left.
 * Kept apart from the scenes so the grammar can be tested without a browser.
 */
import { OBJECT_DEFS, type ObjectKind, type RefusedObject } from "@game/shared";

/** Grammar of each object name: gender, and whether the name is already plural (Pics). */
const GRAMMAR: Record<ObjectKind, { feminine: boolean; plural: boolean; pluralName: string }> = {
  saw: { feminine: true, plural: false, pluralName: "Scies" },
  spikes: { feminine: false, plural: true, pluralName: "Pics" },
  cannon: { feminine: false, plural: false, pluralName: "Canons" },
  spring: { feminine: false, plural: false, pluralName: "Ressorts" },
  vine: { feminine: true, plural: false, pluralName: "Lianes" },
  platform: { feminine: true, plural: false, pluralName: "Plateformes" },
};

interface Group {
  /** "ta Scie", "tes 2 Scies", "tes Pics". */
  words: string;
  feminine: boolean;
  plural: boolean;
}

/** Group a list of kinds into "ta Scie", "tes 2 Canons"..., in the order they first appear. */
function groups(kinds: readonly ObjectKind[]): Group[] {
  const counts = new Map<ObjectKind, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  return [...counts].map(([kind, n]) => {
    const g = GRAMMAR[kind];
    const name = OBJECT_DEFS[kind].name;
    if (n > 1) return { words: `tes ${n} ${g.pluralName}`, feminine: g.feminine, plural: true };
    if (g.plural) return { words: `tes ${name}`, feminine: g.feminine, plural: true };
    return { words: `${g.feminine ? "ta" : "ton"} ${name}`, feminine: g.feminine, plural: false };
  });
}

function joinWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} et ${words[words.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "Ta Scie" / "Ta Scie et ton Canon", with how the rest of the sentence must agree. */
function subject(kinds: readonly ObjectKind[]): { text: string; feminine: boolean; plural: boolean } {
  const g = groups(kinds);
  const plural = g.length > 1 || g.some((x) => x.plural);
  // French: a mixed group agrees in the masculine.
  const feminine = g.every((x) => x.feminine);
  return { text: capitalize(joinWords(g.map((x) => x.words))), feminine, plural };
}

const REASONS: Record<RefusedObject["reason"], (pronoun: string, plural: boolean) => string> = {
  path: (pronoun, plural) => `avec les objets des autres, ${pronoun} ${plural ? "auraient" : "aurait"} bloqué le chemin`,
  taken: (_pronoun, plural) => (plural ? "un autre joueur avait déjà pris ces cases" : "un autre joueur avait déjà pris la case"),
  invalid: () => "rien ne peut être posé là",
  support: (pronoun, plural) => `le bloc contre lequel ${pronoun} ${plural ? "étaient posés" : "était posé"} n'était plus là`,
  // Only erasers are refused for this reason; they get their own sentence (see refusedText).
  gone: () => "l'objet avait déjà disparu",
};

/**
 * One sentence per reason, naming the objects:
 * "Ta Scie a été refusée : avec les objets des autres, elle aurait bloqué le chemin."
 */
export function refusedText(refused: readonly RefusedObject[]): string[] {
  const out: string[] = [];
  for (const reason of ["path", "taken", "support", "invalid"] as const) {
    const kinds = refused.filter((r) => r.reason === reason).flatMap((r) => (r.kind === "eraser" ? [] : [r.kind]));
    if (kinds.length === 0) continue;
    const s = subject(kinds);
    const verb = s.plural ? "ont été refusé" : "a été refusé";
    const agree = (s.feminine ? "e" : "") + (s.plural ? "s" : "");
    const pronoun = s.plural ? (s.feminine ? "elles" : "ils") : s.feminine ? "elle" : "il";
    out.push(`${s.text} ${verb}${agree} : ${REASONS[reason](pronoun, s.plural)}.`);
  }
  // At most one eraser per hand.
  const eraser = refused.find((r) => r.kind === "eraser");
  if (eraser) {
    out.push(
      eraser.reason === "gone"
        ? "Ta Gomme a été perdue : un autre joueur avait déjà gommé cet objet."
        : "Ta Gomme a été perdue : enlever cet objet aurait bloqué le chemin.",
    );
  }
  return out;
}

/** "Temps écoulé : 1 objet non posé (Scie)." Kinds are named when known. */
export function unplacedText(count: number, kinds: readonly ObjectKind[] = []): string {
  if (count <= 0) return "";
  const names = kinds.length === count ? ` (${kinds.map((k) => OBJECT_DEFS[k].name).join(", ")})` : "";
  return `Temps écoulé : ${count} objet${count > 1 ? "s" : ""} non posé${count > 1 ? "s" : ""}${names}.`;
}

/** "Plus aucune place pour ta Scie : elle est défaussée." */
export function noRoomText(kind: ObjectKind): string {
  const s = subject([kind]);
  const pronoun = s.plural ? (s.feminine ? "elles sont" : "ils sont") : s.feminine ? "elle est" : "il est";
  const agree = (s.feminine ? "e" : "") + (s.plural ? "s" : "");
  return `Plus aucune place pour ${s.text.charAt(0).toLowerCase()}${s.text.slice(1)} : ${pronoun} défaussé${agree}.`;
}
