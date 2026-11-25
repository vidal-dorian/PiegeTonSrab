/**
 * The live tuning object shared by the scene and the tuning panel.
 * Changes made in the panel are kept in localStorage so they survive a page reload.
 * Production builds have no panel and always play with the defaults: values a player saved
 * with an older build that still had the panel are ignored and cleared.
 * localStorage can be unavailable (private window, blocked storage): every access is guarded.
 */
import { cloneTuning, DEFAULT_TUNING, type Tuning } from "./config";

const STORAGE_KEY = "tuning-v1";

function load(): Tuning {
  const t = cloneTuning(DEFAULT_TUNING);
  if (!import.meta.env.DEV) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Nothing to clear.
    }
    return t;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return t;
    const saved = JSON.parse(raw) as Partial<Tuning>;
    // Only copy known keys with numeric values, so a renamed or removed field cannot break the game.
    for (const group of ["movement", "camera"] as const) {
      const target = t[group] as unknown as Record<string, number>;
      const source = (saved[group] ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(target)) {
        const v = source[key];
        if (typeof v === "number" && Number.isFinite(v)) target[key] = v;
      }
    }
  } catch {
    // Ignore unreadable storage and start from the defaults.
  }
  return t;
}

export const tuning: Tuning = load();

export function saveTuning(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
  } catch {
    // Storage unavailable: changes simply won't survive a reload.
  }
}

export function resetTuning(): void {
  const d = cloneTuning(DEFAULT_TUNING);
  Object.assign(tuning.movement, d.movement);
  Object.assign(tuning.camera, d.camera);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to clear.
  }
}
