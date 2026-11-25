/**
 * Room codes: 4 letters, without I and O which look like digits. The code is the Colyseus room id,
 * shared by every room type (race and co-op), so "Rejoindre" finds a room whatever its mode: one
 * set of codes in use for the whole server.
 */
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const usedCodes = new Set<string>();

/** A code no room uses, reserved until releaseCode. */
export function newCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
}

export function releaseCode(code: string): void {
  usedCodes.delete(code);
}
