/**
 * The intro's script: shots, timings and every word shown on screen. Pure data and pure functions
 * (no Phaser, no DOM), so the story can be started anywhere (startAt), skipped, and unit-tested.
 *
 * Vocabulary:
 * - a SHOT is one continuous picture (the campus, the lecture hall...). Shots follow each other
 *   with no gap; each one has a local clock `u` that starts at 0.
 * - a COVER hides the change of shot (a blank page sweeping by, ink pouring down...). It straddles
 *   the boundary: it closes over the old shot and opens on the new one.
 * - a LINE is a piece of text with a time window: a narrator's caption (HTML, bottom of the
 *   screen), a speech bubble (HTML, above a character) or a card (text drawn by the shot itself:
 *   a sign, a chat message, an error box).
 * - a CUE is a moment of a shot that the drawing code needs (when the door slams, when a rep ends).
 *
 * Rule for every line: it stays on screen at least 1 second per 15 characters (READ_CPS).
 */
import type { IntroCast } from "./introContract";

export type ShotId = "campus" | "amphi" | "gym" | "night" | "deadline" | "rescue" | "title";
export type CoverKind = "none" | "cut" | "page" | "ink" | "scribble";
export type Speaker = "teacher" | "ruben" | "friend0" | "friend1" | "friend2" | "friend3";
export type LineKind = "caption" | "bubble" | "card";

/** Reading speed the timings must respect: characters per second. */
export const READ_CPS = 15;

interface ShotDef {
  id: ShotId;
  /** Length of the shot, seconds. */
  dur: number;
  /** How the shot arrives. The cover lasts `coverDur` seconds, half of it before the shot starts. */
  cover: CoverKind;
  coverDur: number;
}

const SHOT_DEFS: readonly ShotDef[] = [
  { id: "campus", dur: 17.4, cover: "none", coverDur: 0 },
  { id: "amphi", dur: 13.2, cover: "page", coverDur: 0.9 },
  { id: "gym", dur: 9.2, cover: "cut", coverDur: 0 },
  { id: "night", dur: 20.8, cover: "ink", coverDur: 1.3 },
  { id: "deadline", dur: 7.6, cover: "page", coverDur: 0.9 },
  { id: "rescue", dur: 11.8, cover: "cut", coverDur: 0 },
  { id: "title", dur: 7.0, cover: "scribble", coverDur: 1.1 },
];

/**
 * Moments inside each shot, in seconds of the shot's own clock. A pair is a window [from, to].
 * The lines' own times are in buildScript below; these are for the drawings.
 */
export const CUE = {
  campus: {
    /** The pen sketches the school. */
    sketch: [0.15, 3.3],
    bell: 3.5,
    /** Extras walk into the building. */
    extras: [2.4, 6.6],
    /** The camera pushes in on the pavement. */
    push: [5.3, 7.5],
    /** Ruben hops in from the left. */
    enter: [6.5, 9.1],
    sip: [9.3, 10.1],
    flex: [10.2, 11.2],
    /** His character sheet slams in, then its bars fill up. */
    sheet: 10.9,
    bars: [11.4, 12.7],
    overflow: 12.75,
    stamp: 13.3,
  },
  amphi: {
    write: [0.9, 3.1],
    turn: 3.3,
    startle: 3.9,
    push: [3.6, 5.2],
    think: [5.2, 7.5],
    answer: 7.6,
    /** The teacher's chalk snaps. */
    crack: 8.5,
    note: 9.3,
  },
  gym: {
    /** Each rep: when the bar starts going up. The number shown is the rep count. */
    reps: [0.75, 1.95, 3.15, 4.45],
    repDur: 1.1,
    /** The last rep is a fight. */
    lastRepDur: 1.5,
    lockout: 5.95,
    drop: 6.5,
    note: 5.6,
  },
  night: {
    /** The camera dives into the monitor. */
    dive: [2.7, 4.2],
    type1: 4.5,
    send1: 6.3,
    reply1: [7.3, 9.0],
    attach: 9.9,
    send2: 10.5,
    reply2: [11.4, 12.8],
    keys: [13.3, 13.75, 14.2],
    errors: [14.8, 15.3, 15.75, 16.15, 16.5, 16.8],
    summary: 17.3,
  },
  deadline: {
    note: 1.25,
    key: 2.7,
    folder: 3.2,
    drop: 5.3,
  },
  rescue: {
    slam: 0.55,
    /** The friends' tower slides in, then topples into a line. */
    tower: [0.6, 1.35],
    topple: [1.4, 2.5],
    /** The camera comes closer once everybody has landed. */
    push: [2.55, 3.5],
    rope: [5.4, 7.3],
    tug: 7.3,
    cheer: 10.1,
  },
  title: {
    words: [0.55, 0.95, 1.4],
    gang: [0.5, 2.6],
    tagline: 2.5,
    route: 3.3,
  },
} as const;

/** What Ruben types to Claude, and the chat's other fixed strings. */
export const CHAT = {
  typing1: "fé mon proje stp",
  attachmentName: "biceps_final_v2.jpg",
  caption2: "tien",
} as const;

/** The semester ahead: one stop per level of the mode, in order (the title card's dotted road). */
export const LEVEL_NAMES: readonly string[] = [
  "rentrée",
  "labo réseau",
  "amphi",
  "salle de TP",
  "muscu",
  "RU",
  "BU",
  "le prompt",
  "partiels",
  "soutenance",
];

export interface ShotSpan {
  id: ShotId;
  index: number;
  /** Absolute start and end, seconds. */
  from: number;
  to: number;
  dur: number;
  cover: CoverKind;
  coverDur: number;
}

export interface Line {
  id: string;
  kind: LineKind;
  shot: ShotId;
  text: string;
  /** Absolute times, seconds. */
  from: number;
  to: number;
  /** The same window on the shot's own clock. */
  u0: number;
  u1: number;
  /** Who says it (bubbles only). */
  speaker?: Speaker;
}

export interface Script {
  /** Total length, seconds: equals INTRO_DURATION_S. */
  duration: number;
  shots: ShotSpan[];
  lines: Line[];
  /** Cards by id, for the shots that draw them. */
  cards: Record<string, Line>;
  /** The hero's name is always Ruben; this is who plays him, when it is someone else. */
  playedBy: string | null;
  drawnByLot: boolean;
  friendCount: number;
}

export interface IntroState {
  /** Time clamped to the script, seconds. */
  t: number;
  ended: boolean;
  shot: ShotSpan;
  /** The shot's own clock, seconds. */
  u: number;
  /** The cover in progress, if any: p goes 0 → 1, the picture changes at 0.5. */
  cover: { kind: CoverKind; p: number } | null;
}

/** Is this nickname "Ruben" (whatever the case and the accents)? */
export function isRubenName(pseudo: string): boolean {
  return (
    pseudo
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toLowerCase() === "ruben"
  );
}

/**
 * French typography: the space before ? ! : ; and inside « » never breaks, so a caption that wraps
 * cannot leave a question mark alone at the start of a line.
 */
export function typo(text: string): string {
  return text.replace(/ ([?!:;»])/g, "\u00a0$1").replace(/« /g, "«\u00a0");
}

/** Characters as a reader counts them (an emoji is one, an accented letter is one). */
export function readingLength(text: string): number {
  return Array.from(text.normalize("NFC")).length;
}

/** The shortest time a text may stay on screen, seconds. */
export function minReadingTime(text: string): number {
  return readingLength(text) / READ_CPS;
}

export const TOTAL_DURATION = Math.round(SHOT_DEFS.reduce((sum, s) => sum + s.dur, 0) * 1000) / 1000;

function shotSpans(): ShotSpan[] {
  const spans: ShotSpan[] = [];
  let at = 0;
  SHOT_DEFS.forEach((d, index) => {
    const from = Math.round(at * 1000) / 1000;
    at += d.dur;
    spans.push({ id: d.id, index, from, to: Math.round(at * 1000) / 1000, dur: d.dur, cover: d.cover, coverDur: d.coverDur });
  });
  return spans;
}

/** Colour used when a cast comes without one: the game's blue. */
const FALLBACK_COLOR = 0x2b59c3;

/**
 * A cast the intro can always play: at most four friends, a name and a colour for everyone. The
 * game sends a proper cast; this only keeps a malformed one (a missing friend list, an empty
 * nickname) from breaking the story.
 */
export function sanitizeCast(cast: Partial<IntroCast> | null | undefined): IntroCast {
  const color = (c: unknown): number => (typeof c === "number" && Number.isFinite(c) ? c : FALLBACK_COLOR);
  const name = (p: unknown, fallback: string): string => (typeof p === "string" && p.trim() ? p.trim() : fallback);
  const friends = Array.isArray(cast?.friends) ? cast.friends : [];
  return {
    ruben: {
      pseudo: name(cast?.ruben?.pseudo, "Ruben"),
      color: color(cast?.ruben?.color),
      drawnByLot: cast?.ruben?.drawnByLot === true,
    },
    friends: friends
      .filter((f) => f !== null && typeof f === "object")
      .slice(0, 4)
      .map((f, i) => ({ pseudo: name(f.pseudo, `Joueur ${i + 2}`), color: color(f.color) })),
  };
}

/** The whole script for a cast. The timings never depend on the cast, only the words do. */
export function buildScript(cast: IntroCast): Script {
  const shots = shotSpans();
  const lines: Line[] = [];
  const cards: Record<string, Line> = {};
  const pseudo = cast.ruben.pseudo.trim() || "Ruben";
  const playsHimself = isRubenName(pseudo);
  const n = Math.min(4, cast.friends.length);

  const add = (kind: LineKind, shot: ShotId, id: string, u0: number, u1: number, text: string, speaker?: Speaker): void => {
    const span = shots.find((s) => s.id === shot)!;
    // Code and what Ruben types are kept as they are; everything else gets French spacing.
    const literal = id === "code" || id === "gymCode" || id === "msg1" || id === "msg2";
    const line: Line = { id, kind, shot, text: literal ? text : typo(text), from: span.from + u0, to: span.from + u1, u0, u1 };
    if (speaker) line.speaker = speaker;
    lines.push(line);
    if (kind === "card") cards[id] = line;
  };
  const caption = (shot: ShotId, id: string, u0: number, u1: number, text: string) => add("caption", shot, id, u0, u1, text);
  const bubble = (shot: ShotId, id: string, who: Speaker, u0: number, u1: number, text: string) =>
    add("bubble", shot, id, u0, u1, text, who);
  const card = (shot: ShotId, id: string, u0: number, u1: number, text: string) => add("card", shot, id, u0, u1, text);

  // --- 1. Rodez, Monday, 8 a.m. ------------------------------------------------------------
  card("campus", "place", 0.5, 5.6, "Rodez, lundi, 8 h");
  card("campus", "tag", 2.0, 5.6, "BUT Informatique · 1re année");
  card("campus", "sign", 1.4, 17.4, "IUT DE RODEZ");
  caption("campus", "c1", 2.5, 6.2, "C'est la rentrée à l'IUT. Tout le monde est à l'heure…");
  caption("campus", "c2", 6.4, 9.9, "… sauf Ruben, qui arrive direct de la salle.");
  caption("campus", "c3", 10.05, 12.6, "Voici Ruben. Motivé. Hydraté. Gainé.");
  if (cast.ruben.drawnByLot) {
    caption(
      "campus",
      "c4",
      12.75,
      16.95,
      playsHimself
        ? "Le sort a désigné Ruben pour jouer Ruben. Le rôle de sa vie."
        : `Ce soir, le sort a désigné ${pseudo} pour jouer Ruben !`,
    );
  } else {
    caption("campus", "c4", 13.4, 16.95, "Son plan pour le semestre : « ça va le faire ».");
  }
  card("campus", "sheetName", CUE.campus.sheet, 17.4, "RUBEN");
  if (!playsHimself) card("campus", "playedBy", CUE.campus.sheet + 0.35, 17.4, `joué par ${pseudo}`);
  if (cast.ruben.drawnByLot) card("campus", "lotStamp", CUE.campus.stamp, 17.4, "TIRÉ AU SORT");

  // --- 2. The lecture hall -----------------------------------------------------------------
  caption("amphi", "a1", 0.55, 3.1, "Premier cours : algorithmique.");
  card("amphi", "code", CUE.amphi.write[0], 13.2, "for (int i = 0; i < n; i++)");
  bubble("amphi", "a2", "teacher", 3.5, 6.6, "Ruben, que vaut i à la fin ?");
  bubble("amphi", "a3", "ruben", CUE.amphi.answer, 10.0, "… 12 répétitions ?");
  card("amphi", "answer", CUE.amphi.note, 13.2, "(c'était n)");
  caption("amphi", "a4", 10.1, 13.2, "Ruben a un rapport compliqué avec les boucles.");

  // --- 3. The gym --------------------------------------------------------------------------
  caption("gym", "g1", 0.15, 2.0, "Sauf une.");
  card("gym", "gymPlace", 0.25, 9.2, "17 h · la salle");
  card("gym", "gymCode", 0.5, 9.2, "for (rep = 1; rep <= 12; rep++)");
  card("gym", "poster", 0, 9.2, "PAS DE BRAS,\nPAS DE CHOCOLAT");
  card("gym", "gymNote", CUE.gym.note, 9.2, "condition d'arrêt : respectée");
  caption("gym", "g2", 5.9, 8.5, "La seule boucle qu'il maîtrise.");

  // --- 4. Night: the chat with Claude ------------------------------------------------------
  caption("night", "n1", 0.65, 4.75, "Le soir, Ruben passe aux choses sérieuses : il ouvre Claude.");
  card("night", "chatTitle", CUE.night.dive[0], 20.8, "Claude");
  card("night", "msg1", CUE.night.send1, 20.8, CHAT.typing1);
  card("night", "reply1", CUE.night.reply1[0], 20.8, "Avec plaisir ! Peux-tu m'envoyer le sujet de ta SAÉ ?");
  card("night", "msg2", CUE.night.send2, 20.8, CHAT.caption2);
  card("night", "reply2", CUE.night.reply2[0], 20.8, "Joli biceps ! Mais… ce n'est pas le sujet.");
  caption("night", "n2", 12.95, 16.6, "Alors Ruben colle toute la conversation dans main.c.");
  const errors = [
    "main.c:1 · erreur : « Avec plaisir » n'est pas du C",
    "main.c:2 · erreur : ‘sujet’ non déclaré",
    "main.c:3 · erreur : ‘biceps’ n'est pas un type",
    "main.c:3 · erreur : ‘;’ attendu avant ‘Mais’",
    "main.c:4 · erreur : ‘stp’ : symbole inconnu",
    "… et 142 autres erreurs",
  ];
  errors.forEach((text, i) => card("night", `err${i}`, CUE.night.errors[i]!, 20.8, text));
  card("night", "summary", CUE.night.summary, 20.8, "147 erreurs, 12 répétitions.");
  caption("night", "n3", 16.75, 20.3, "Il a un outil génial. Il lui manque le mode d'emploi.");

  // --- 5. The deadline ---------------------------------------------------------------------
  caption("deadline", "d0", 0.5, 2.3, "Ah, et un détail…");
  card("deadline", "sae", CUE.deadline.note, 7.6, "SAÉ à rendre\nDEMAIN 8 h");
  card("deadline", "drive", CUE.deadline.folder, 7.6, "CLÉ_RUBEN (E:)");
  card("deadline", "empty", CUE.deadline.folder, 7.6, "0 élément · ce dossier est vide");
  caption("deadline", "d1", 4.2, 7.6, "Sa clé USB est vide. Son shaker aussi.");

  // --- 6. The friends ----------------------------------------------------------------------
  if (n === 0) {
    caption("rescue", "r0", 1.0, 2.6, "Personne. Tant pis.");
    bubble("rescue", "r1", "ruben", 2.7, 5.5, "Je me laisse pas redoubler, moi.");
    bubble("rescue", "r2", "ruben", 7.1, 10.0, "Personne ne lâche personne. Hein, la clé ?");
  } else {
    caption("rescue", "r0", 0.9, 2.6, n === 1 ? "Mais Ruben a un srab." : "Mais Ruben a des srabs.");
    bubble("rescue", "r1", "friend0", 2.7, 5.5, "On te laisse pas redoubler, srab.");
    bubble("rescue", "r2", `friend${n >= 2 ? n - 1 : 0}` as Speaker, 7.2, 10.0, "Personne ne lâche personne.");
    bubble("rescue", "r3", "ruben", 10.15, 11.25, n === 1 ? "Mon srab…" : "Les srabs…");
  }
  card("rescue", "slam", CUE.rescue.slam, 2.0, "BLAM !");

  // --- 7. The title ------------------------------------------------------------------------
  card("title", "title", 0.55, 7.0, "SAUVE TON SRAB");
  card("title", "tagline", CUE.title.tagline, 7.0, "Un semestre. Une corde. Zéro redoublement.");

  lines.sort((a, b) => a.from - b.from);
  return {
    duration: TOTAL_DURATION,
    shots,
    lines,
    cards,
    playedBy: playsHimself ? null : pseudo,
    drawnByLot: cast.ruben.drawnByLot,
    friendCount: n,
  };
}

/** Where the story is at second `t` (clamped to the script). */
export function stateAt(script: Script, t: number): IntroState {
  const time = Number.isFinite(t) ? Math.min(Math.max(t, 0), script.duration) : 0;
  let shot = script.shots[script.shots.length - 1]!;
  for (const s of script.shots) {
    if (time < s.to) {
      shot = s;
      break;
    }
  }
  let cover: IntroState["cover"] = null;
  for (const s of script.shots) {
    if (s.coverDur <= 0) continue;
    const a = s.from - s.coverDur / 2;
    const b = s.from + s.coverDur / 2;
    if (time >= a && time < b) cover = { kind: s.cover, p: (time - a) / s.coverDur };
  }
  return { t: time, ended: time >= script.duration, shot, u: time - shot.from, cover };
}

/** The HUD lines (captions and bubbles) to show at `t`, appended to `out` (cleared first). */
export function hudLinesAt(script: Script, t: number, out: Line[]): Line[] {
  out.length = 0;
  for (const line of script.lines) {
    if (line.kind !== "card" && t >= line.from && t < line.to) out.push(line);
  }
  return out;
}
