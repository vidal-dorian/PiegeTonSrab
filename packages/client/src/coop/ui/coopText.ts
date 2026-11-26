/**
 * Short texts of the co-op screens (French, in-game): level names, the clock, attempts, and how
 * long Claude's bubbles stay up, and the lobby's "Réactivité" setting. Pure functions, tested.
 */
import type { CoopLevelDef } from "@game/shared/coop";
import type { PredictionChoice, Reactivity } from "../net/reactivity";

/** "Niveau 3 · L'Amphi" for a campaign level; a level outside the campaign keeps its name. */
export function levelLabel(levels: readonly CoopLevelDef[], def: CoopLevelDef): string {
  const i = levels.findIndex((l) => l.id === def.id);
  return i >= 0 ? `Niveau ${i + 1} · ${def.name}` : def.name;
}

/** The HUD clock: "0:07", "1:42", "1:02:03". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** The end-of-level card's time: "42 s", "1 min 05", "1 h 02 min". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, "0")}`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
}

/** "du premier coup", "en 3 essais". */
export function attemptsText(attempts: number): string {
  return attempts <= 1 ? "du premier coup" : `en ${attempts} essais`;
}

/**
 * How long one of Claude's lines stays up, ms: at least a second per 15 characters (the intro's
 * reading rule), never less than 2.8 s nor more than 7 s.
 */
export function bubbleMs(text: string): number {
  return Math.min(7000, Math.max(2800, Math.round((text.length / 15) * 1000)));
}

/** The lobby's "Réactivité" choices, in their order on screen. */
export const REACTIVITY_LABELS: ReadonlyArray<{ value: Reactivity; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "stable", label: "Stable" },
  { value: "instant", label: "Instantanée" },
];

/** The one-line hint under the "Réactivité" choices. */
export function reactivityHint(setting: Reactivity): string {
  switch (setting) {
    case "auto":
      return "Instantanée si ton ping est bas, stable sinon.";
    case "stable":
      return "Tout reste fluide, tes touches répondent avec un petit retard.";
    case "instant":
      return "Tu bouges tout de suite, les autres peuvent être recalés.";
  }
}

/** "32 ms", or "en mesure…" before the first round trip. */
export function pingText(rttMs: number): string {
  return Number.isFinite(rttMs) ? `${Math.round(rttMs)} ms` : "en mesure…";
}

/**
 * What the "Réactivité" setting does now: in auto, the decision and the ping ("Auto :
 * instantanée (ping 32 ms)"); when the address forces it, that; else nothing to add ("").
 */
export function reactivityStatus(choice: PredictionChoice): string {
  const mode = choice.predict ? "instantanée" : "stable";
  if (choice.by === "address") return `Forcé par l'adresse (?predict) : ${mode}`;
  if (choice.by === "auto") return `Auto : ${mode} (ping ${pingText(choice.rttMs)})`;
  return "";
}
