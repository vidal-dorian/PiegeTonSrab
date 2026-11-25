/**
 * Errors during a game must never freeze it.
 *
 * Phaser asks the browser for the next animation frame only after the current frame
 * returns (Phaser 4: dom/RequestAnimationFrame.js), so a single exception in a frame
 * (a scene's update, a message handled inside a frame, a game object's rendering) stopped
 * that player's game for good: frozen canvas, no simulation, no poses sent, while the HTML
 * overlays kept working. To the others the player looked dead for the rest of the game.
 *
 * Two layers:
 * - Scenes catch errors around their frame and message code and report them here, so the
 *   frame goes on.
 * - A watchdog restarts Phaser's loop if it stopped anyway (an error inside Phaser itself).
 * Either way the error is logged with its stack, so it can be found and fixed.
 */
import type Phaser from "phaser";
import { overlay } from "./ui/overlay";

/** The on-screen notice is shown at most this often, milliseconds (the console gets every error). */
const NOTICE_EVERY_MS = 15_000;
/** Same error logged again at most this often, milliseconds: one that repeats every frame must not flood the console. */
const LOG_EVERY_MS = 5_000;
/** Watchdog period, and how many periods without a frame mean the loop is dead. */
const WATCHDOG_MS = 1_000;
const WATCHDOG_STRIKES = 2;

let lastNoticeAt = -Infinity;
const lastLogAt = new Map<string, number>();
let count = 0;

/** Number of errors reported since the page loaded (for tests and the console). */
export function errorCount(): number {
  return count;
}

/**
 * Log an error caught in game code (`where` says which part) and tell the player once in a
 * while. Never throws.
 */
export function reportError(where: string, error: unknown): void {
  count++;
  try {
    const now = performance.now();
    const message = error instanceof Error ? error.message : String(error);
    const key = `${where}: ${message}`;
    if (now - (lastLogAt.get(key) ?? -Infinity) >= LOG_EVERY_MS) {
      lastLogAt.set(key, now);
      console.error(`[Piège Ton Srab] erreur dans ${where} (n° ${count}) :`, error);
    }
    if (now - lastNoticeAt >= NOTICE_EVERY_MS) {
      lastNoticeAt = now;
      overlay.showNotice("Petit souci technique, la partie continue (détails : console F12)", 3500);
    }
  } catch {
    // Reporting must never be the next error.
  }
}

/** Run `fn`, reporting instead of throwing. */
export function guarded(where: string, fn: () => void): void {
  try {
    fn();
  } catch (e) {
    reportError(where, e);
  }
}

/**
 * Restart Phaser's loop if it stopped while it should run (page visible, loop not put to
 * sleep by Phaser itself). Returns a function that stops the watchdog.
 */
export function watchGameLoop(game: Phaser.Game): () => void {
  let lastFrame = game.loop.frame;
  let strikes = 0;
  const timer = window.setInterval(() => {
    const loop = game.loop;
    if (document.visibilityState !== "visible" || !loop.running || loop.frame !== lastFrame) {
      lastFrame = loop.frame;
      strikes = 0;
      return;
    }
    if (++strikes < WATCHDOG_STRIKES) return;
    strikes = 0;
    reportError("la boucle de jeu (relancée)", new Error(`no frame for ${WATCHDOG_MS * WATCHDOG_STRIKES} ms`));
    try {
      loop.sleep();
      loop.wake(true);
    } catch (e) {
      reportError("la relance de la boucle", e);
    }
  }, WATCHDOG_MS);
  return () => window.clearInterval(timer);
}
