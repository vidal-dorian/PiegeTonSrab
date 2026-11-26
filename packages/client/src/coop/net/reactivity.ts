/**
 * Which online co-op display a player's screen uses: the snapshots drawn just behind the server
 * (step A, "stable": smooth, the own keys show about a round trip late) or the world predicted
 * ahead (step B, "instantanée": the own keys at once, corrected by each snapshot).
 *
 * - `?predict=1` / `?predict=0` in the address always forces it (tests, playtests);
 * - otherwise the lobby setting "Réactivité" (auto / stable / instantanée), kept in localStorage
 *   on this computer (default auto);
 * - in auto, prediction is on when this screen's recent round trip (ServerClock.recentRtt) is
 *   short, with a hysteresis: on under AUTO_ON_BELOW_MS, off over AUTO_OFF_ABOVE_MS, the previous
 *   choice kept in between. No round trip measured yet: step A.
 *
 * The choice is made once per level start, when the online screen builds its driver. A coopLevel
 * that continues the same level (a resume after a pause, the clock moved after a server stall)
 * keeps the level's choice: the display never switches in the middle of a level. Only the game
 * screen playing a level can be continued (levelContinues): a level started from the lobby or
 * the end card is decided again, however late its screen is built (Phaser starts a scene on its
 * next frame, and a hidden tab draws no frame), and the lobby and a new setting forget the choice.
 *
 * The thresholds come from the bench (coopPredictBench.test.ts checks it): the worst player's
 * own-body corrections stay under 0.1 cell (p95) at the one-way latency whose measured recent
 * round trip is AUTO_ON_BELOW_MS, and fail at 50 ms one way (where it is over AUTO_OFF_ABOVE_MS);
 * AUTO_ON_BELOW_MS sits 15 ms or more under the round trip where the bench starts failing, and
 * AUTO_OFF_ABOVE_MS at it.
 */

export type Reactivity = "auto" | "stable" | "instant";

export const REACTIVITY_VALUES: readonly Reactivity[] = ["auto", "stable", "instant"];

/** localStorage key of the setting. */
export const REACTIVITY_KEY = "coop.reactivity";

/**
 * In auto, prediction turns on when the recent round trip is under this, ms (bench: about 23 ms
 * one way with 10 ms of jitter, where the worst player's p95 is 0.015-0.06 over sets of 16 runs,
 * under the 0.1 cell limit; 18 ms of round trip under where the bench starts failing)...
 */
export const AUTO_ON_BELOW_MS = 60;
/**
 * ...and off when it is over this, ms (bench: where the worst player's p95 starts crossing 0.1
 * cell, about 32 ms one way with 10 ms of jitter, 25 with 20; it always fails at 50); in between,
 * the previous auto choice stays, so a round trip wobbling around one threshold does not flip the
 * display at every level.
 */
export const AUTO_OFF_ABOVE_MS = 80;

/** The stored setting from its text (anything else: auto). */
export function parseReactivity(raw: string | null | undefined): Reactivity {
  return raw === "stable" || raw === "instant" ? raw : "auto";
}

/** Storage as the setting reads it: localStorage, which may be missing or throw on any access. */
export interface SettingStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): SettingStorage {
  return localStorage;
}

/** The setting chosen on this page, which outlives a storage that cannot keep it. */
let chosen: Reactivity | null = null;

/** The player's setting: chosen on this page, else stored, else auto (storage unavailable or holding anything else). */
export function loadReactivity(storage: () => SettingStorage = defaultStorage): Reactivity {
  if (chosen) return chosen;
  try {
    return parseReactivity(storage().getItem(REACTIVITY_KEY));
  } catch {
    return "auto";
  }
}

/** Choose the setting: kept for this page, and remembered on this computer when storage allows. */
export function saveReactivity(value: Reactivity, storage: () => SettingStorage = defaultStorage): void {
  chosen = value;
  // The next level start reads the new setting, whatever the clock says.
  forgetLevelChoice();
  try {
    storage().setItem(REACTIVITY_KEY, value);
  } catch {
    // Storage unavailable: the setting lasts until the page is reloaded.
  }
}

/**
 * The auto rule alone: predict at round trip `rttMs` given the previous auto choice (null: none
 * yet). No measure (Infinity, NaN): step A.
 */
export function autoPredicts(rttMs: number, previous: boolean | null): boolean {
  if (!Number.isFinite(rttMs)) return false;
  if (rttMs < AUTO_ON_BELOW_MS) return true;
  if (rttMs > AUTO_OFF_ABOVE_MS) return false;
  return previous ?? false;
}

/** What `?predict=` says: true / false when it forces, null when absent or empty. */
export function addressForces(search: string): boolean | null {
  const v = new URLSearchParams(search).get("predict");
  return v === null || v === "" ? null : v !== "0";
}

export interface PredictionChoice {
  predict: boolean;
  /** Who decided: the address, the player's setting, or the auto rule. */
  by: "address" | "setting" | "auto";
  /** The round trip the auto rule read, ms (Infinity: none measured yet). */
  rttMs: number;
}

/**
 * What this screen remembers between levels (module-level: one screen per page): the last auto
 * choice (the hysteresis) and the choice made for the level being played.
 */
const memory: { auto: boolean | null; levelId: string | null; levelChoice: PredictionChoice | null } = {
  auto: null,
  levelId: null,
  levelChoice: null,
};

/**
 * What the screen would choose now, without deciding anything (the lobby shows it). `previous`
 * is the last auto choice (by default the one remembered by `predictionWanted`).
 */
export function previewPrediction(search: string, setting: Reactivity, rttMs: number, previous: boolean | null = memory.auto): PredictionChoice {
  const forced = addressForces(search);
  if (forced !== null) return { predict: forced, by: "address", rttMs };
  if (setting !== "auto") return { predict: setting === "instant", by: "setting", rttMs };
  return { predict: autoPredicts(rttMs, previous), by: "auto", rttMs };
}

/**
 * Decide whether this screen predicts, once per level start (OnlineDriver's construction), and
 * remember it. `continuing` says the coopLevel continues the level already being played (its
 * clock already running: a resume, a moved clock): the choice made at that level's start stays.
 */
export function predictionWanted(
  search: string,
  opts: { setting?: Reactivity; rttMs?: number; levelId?: string; continuing?: boolean } = {},
): boolean {
  const { setting = loadReactivity(), rttMs = Infinity, levelId = null, continuing = false } = opts;
  if (continuing && levelId !== null && memory.levelId === levelId && memory.levelChoice) return memory.levelChoice.predict;
  const choice = previewPrediction(search, setting, rttMs, memory.auto);
  if (choice.by === "auto") memory.auto = choice.predict;
  memory.levelId = levelId;
  memory.levelChoice = choice;
  return choice.predict;
}

/**
 * Whether a coopLevel continues the level being played: `playing` is the level the game screen
 * that received it was playing (null or undefined: none, the coopLevel came to the lobby or to an
 * end card), and the level's clock already runs. Anything else is a level start, even a restart
 * of the same level whose screen is built after its clock started.
 */
export function levelContinues(playing: string | null | undefined, level: { levelId: string; startsAt: number }, serverNow: number): boolean {
  return playing != null && playing === level.levelId && serverNow >= level.startsAt;
}

/**
 * Forget the choice made for the level being played (the lobby: no level goes on across it; a new
 * setting). The auto rule's memory (the hysteresis) stays.
 */
export function forgetLevelChoice(): void {
  memory.levelId = null;
  memory.levelChoice = null;
}

/** The choice made at the latest level start, if any. */
export function lastPredictionChoice(): PredictionChoice | null {
  return memory.levelChoice;
}

/** Forget the page's setting and remembered choices (tests). */
export function resetPredictionMemory(): void {
  chosen = null;
  memory.auto = null;
  memory.levelId = null;
  memory.levelChoice = null;
}
