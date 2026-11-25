/**
 * This browser's player key: a random string kept in localStorage and sent when joining a
 * room. A player who reloads the page, closes the tab or loses the connection for longer
 * than the reconnection window joins the room again with it, and the session gives them
 * their place back (seat, score, objects). See GameSession.addPlayer.
 */
const KEY_STORAGE = "pts.playerKey";
let inMemory: string | null = null;

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function playerKey(): string {
  try {
    const saved = localStorage.getItem(KEY_STORAGE);
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
    const key = randomKey();
    localStorage.setItem(KEY_STORAGE, key);
    return key;
  } catch {
    // No storage (private window, blocked site data): the key lasts as long as the page.
    // Coming back still works with the same pseudo.
    inMemory ??= randomKey();
    return inMemory;
  }
}

/**
 * Put the room code in the address (?salon=ABCD), so that reloading the page lands on the
 * menu with the code filled in, one click from coming back.
 */
export function rememberRoomInUrl(code: string): void {
  try {
    const url = new URL(location.href);
    url.searchParams.set("salon", code);
    history.replaceState(history.state, "", url);
  } catch {
    // Not worth failing for.
  }
}
