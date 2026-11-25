/**
 * Where the cast stands, and how their names fit. Pure functions (no Phaser, no DOM): the same
 * numbers serve the drawings and the tests, for 0 to 4 friends and nicknames of any shape.
 */

/** Distance between two neighbours of the roped line, world pixels (the rope is slack: it sags). */
export const GANG_SPACING = 78;
/** Name labels: font size and the gap kept between two labels of the same row, world pixels. */
export const TAG_FONT_PX = 12;
export const TAG_GAP = 8;
/** Height of one row of labels, and where the lowest row sits relative to the top of a head. */
export const TAG_ROW_STEP = 15;
export const TAG_BASE = 3;
/** Where the rope is tied, above the feet, and how far a slack link hangs, world pixels. */
export const ROPE_WAIST = 17;
export const ROPE_SAG = 9;

export interface GangLayout {
  /** Feet x of Ruben and of each friend, world pixels, relative to the centre of the line. */
  ruben: number;
  friends: number[];
  /** Row of each friend's name label: 0 is just above the head, 1 is one row higher. */
  tagRow: number[];
  /** Ruben's own label has a row to itself, above the USB key he holds over his head. */
  rubenTagRow: number;
  /** Widest a name label may be, world pixels; longer names end with an ellipsis. */
  tagMaxWidth: number;
  /** Half the width of the whole line, labels included, world pixels. */
  halfWidth: number;
}

/**
 * The line-up: Ruben at the left end, then his friends, the last seat next to him and the first
 * seat at the far end. It is the game's rope order (a chain in seat order with Ruben last), seen
 * from the side with the leader on the right. The friends' labels alternate between two rows, so a
 * long name may be nearly two spacings wide without touching its neighbours.
 */
export function gangLayout(friendCount: number): GangLayout {
  const n = Math.max(0, Math.min(4, Math.floor(friendCount)));
  const total = n + 1;
  const left = (-(total - 1) * GANG_SPACING) / 2;
  const friends: number[] = [];
  const tagRow: number[] = [];
  for (let i = 0; i < n; i++) {
    // Friend i stands at position (n - i) from the left: friend 0 leads on the right.
    const slot = n - i;
    friends.push(left + slot * GANG_SPACING);
    tagRow.push(slot % 2);
  }
  // Two labels of the same row are two spacings apart; alone, Ruben has the whole width.
  const tagMaxWidth = total === 1 ? 4 * GANG_SPACING : 2 * GANG_SPACING - TAG_GAP;
  const halfWidth = ((total - 1) * GANG_SPACING) / 2 + tagMaxWidth / 2;
  return { ruben: left, friends, tagRow, rubenTagRow: 2, tagMaxWidth, halfWidth };
}

/** Splits a text into what a reader sees as characters (an emoji with its modifiers is one). */
export function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } })
    .Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: "grapheme" }).segment(text), (s) => s.segment);
  return Array.from(text);
}

/**
 * The text itself if it fits in `maxWidth`, otherwise its longest beginning that fits once an
 * ellipsis is added. `measure` gives the width of a string in the same unit as `maxWidth`.
 */
export function fitToWidth(text: string, maxWidth: number, measure: (s: string) => number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (measure(clean) <= maxWidth) return clean;
  const parts = graphemes(clean);
  for (let keep = parts.length - 1; keep > 0; keep--) {
    const candidate = `${parts.slice(0, keep).join("").trimEnd()}…`;
    if (measure(candidate) <= maxWidth) return candidate;
  }
  return "…";
}
