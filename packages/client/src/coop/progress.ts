/**
 * The co-op levels this computer has cleared, ticked in the host's level list. Kept in
 * localStorage (key "coop.cleared", a JSON list of level ids); storage may be unavailable
 * (private mode, blocked cookies), then nothing is remembered.
 */
export const CLEARED_KEY = "coop.cleared";

/** Level ids from the stored text (anything unreadable counts as nothing cleared). */
export function parseCleared(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))] : [];
  } catch {
    return [];
  }
}

export function loadCleared(): Set<string> {
  try {
    return new Set(parseCleared(localStorage.getItem(CLEARED_KEY)));
  } catch {
    return new Set();
  }
}

export function markCleared(levelId: string): void {
  try {
    const ids = parseCleared(localStorage.getItem(CLEARED_KEY));
    if (!ids.includes(levelId)) ids.push(levelId);
    localStorage.setItem(CLEARED_KEY, JSON.stringify(ids));
  } catch {
    // Storage unavailable: the tick is simply not remembered.
  }
}
