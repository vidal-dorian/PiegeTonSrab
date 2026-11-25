/**
 * The intro's script (timeline.ts): shots that follow each other with no gap, a total length that
 * matches the contract, words that stay on screen long enough to be read, and a cast of any shape
 * (0 to 4 friends, long nicknames, Ruben drawn by lot or played by someone else).
 */
import { describe, expect, it } from "vitest";
import { INTRO_DURATION_S, type IntroCast } from "./introContract";
import {
  buildScript,
  CUE,
  hudLinesAt,
  isRubenName,
  LEVEL_NAMES,
  minReadingTime,
  READ_CPS,
  sanitizeCast,
  readingLength,
  stateAt,
  TOTAL_DURATION,
  typo,
  type Line,
  type Script,
} from "./timeline";

const COLORS = [0x161616, 0xffffff, 0x2b59c3, 0x3fa35c, 0x8a4fc7];
const LONG = "WWWWWWWWWWWWWWWW";

function cast(ruben: string, friends: string[] = [], drawnByLot = false): IntroCast {
  return {
    ruben: { pseudo: ruben, color: COLORS[2]!, drawnByLot },
    friends: friends.map((pseudo, i) => ({ pseudo, color: COLORS[[0, 1, 3, 4][i % 4]!]! })),
  };
}

/** A spread of casts: every friend count, both ways of getting the role, awkward nicknames. */
const CASTS: Array<[string, IntroCast]> = [
  ["Ruben alone", cast("Ruben")],
  ["Ruben and one friend", cast("Ruben", ["Max"])],
  ["someone else plays Ruben", cast("Léo", ["Alice", "Bob"])],
  ["three friends, drawn by lot", cast("Léo", ["Alice", "Bob", "Chloé"], true)],
  ["four friends", cast("Léo", ["Alice", "Bob", "Chloé", "Dédé"])],
  ["the real Ruben drawn by lot", cast("ruben", ["Alice"], true)],
  ["16-character nicknames, drawn by lot", cast(LONG, [LONG, LONG, LONG, LONG], true)],
  ["emoji, spaces and duplicates", cast("🔥 Le Boss 🔥", ["Joueur 2", "Joueur 2", "ééééééééééééééé", "👨‍👩‍👧‍👦 fam"])],
  ["alone and drawn by lot", cast("Jean-Christophe2", [], true)],
];

const scripts = CASTS.map(([name, c]) => [name, buildScript(c)] as const);
/** A line's words with ordinary spaces (the script uses no-break spaces before ? ! : ;). */
const plain = (text: string): string => text.replace(/\u00a0/g, " ");

describe("shots", () => {
  const script = buildScript(cast("Ruben", ["Alice"]));

  it("follow each other in order with no gap and no overlap", () => {
    expect(script.shots[0]!.from).toBe(0);
    for (let i = 0; i < script.shots.length; i++) {
      const s = script.shots[i]!;
      expect(s.index).toBe(i);
      expect(s.to).toBeGreaterThan(s.from);
      expect(s.to - s.from).toBeCloseTo(s.dur, 6);
      if (i > 0) expect(s.from).toBeCloseTo(script.shots[i - 1]!.to, 6);
    }
    expect(script.shots[script.shots.length - 1]!.to).toBeCloseTo(script.duration, 6);
  });

  it("tell the story in the agreed order", () => {
    expect(script.shots.map((s) => s.id)).toEqual(["campus", "amphi", "gym", "night", "deadline", "rescue", "title"]);
  });

  it("add up to the length announced in the contract, between 70 and 90 seconds", () => {
    expect(script.duration).toBe(TOTAL_DURATION);
    expect(TOTAL_DURATION).toBe(INTRO_DURATION_S);
    expect(INTRO_DURATION_S).toBeGreaterThanOrEqual(70);
    expect(INTRO_DURATION_S).toBeLessThanOrEqual(90);
  });

  it("have covers shorter than the shots around them", () => {
    for (let i = 1; i < script.shots.length; i++) {
      const s = script.shots[i]!;
      expect(s.coverDur / 2).toBeLessThan(s.dur);
      expect(s.coverDur / 2).toBeLessThan(script.shots[i - 1]!.dur);
      if (s.cover === "cut" || s.cover === "none") expect(s.coverDur).toBe(0);
      else expect(s.coverDur).toBeGreaterThan(0);
    }
    expect(script.shots[0]!.coverDur).toBe(0);
  });

  it("keep their cues inside their own length, in order", () => {
    for (const shot of script.shots) {
      const cues = CUE[shot.id] as Record<string, number | readonly number[]>;
      for (const [name, value] of Object.entries(cues)) {
        const times = typeof value === "number" ? [value] : [...value];
        // Durations (repDur...) are lengths, not moments: they only have to be positive.
        for (const t of times) {
          expect(t, `${shot.id}.${name}`).toBeGreaterThanOrEqual(0);
          expect(t, `${shot.id}.${name}`).toBeLessThan(shot.dur);
        }
        for (let i = 1; i < times.length; i++) expect(times[i]!, `${shot.id}.${name}`).toBeGreaterThan(times[i - 1]!);
      }
    }
  });
});

describe.each(scripts)("lines for %s", (_name, script) => {
  it("sit inside their shot", () => {
    for (const line of script.lines) {
      const shot = script.shots.find((s) => s.id === line.shot)!;
      expect(line.u0, line.id).toBeGreaterThanOrEqual(0);
      expect(line.u1, line.id).toBeLessThanOrEqual(shot.dur + 1e-9);
      expect(line.from, line.id).toBeCloseTo(shot.from + line.u0, 6);
      expect(line.to, line.id).toBeCloseTo(shot.from + line.u1, 6);
      expect(line.to, line.id).toBeGreaterThan(line.from);
      expect(line.text.trim().length, line.id).toBeGreaterThan(0);
    }
  });

  it("stay on screen at least 1 second per 15 characters", () => {
    for (const line of script.lines) {
      expect(line.to - line.from + 1e-9, `${line.id}: "${line.text}"`).toBeGreaterThanOrEqual(minReadingTime(line.text));
    }
  });

  it("show one caption at a time, and one bubble per speaker", () => {
    const overlap = (a: Line, b: Line) => a.from < b.to - 1e-9 && b.from < a.to - 1e-9;
    const captions = script.lines.filter((l) => l.kind === "caption");
    const bubbles = script.lines.filter((l) => l.kind === "bubble");
    for (let i = 0; i < captions.length; i++) {
      for (let j = i + 1; j < captions.length; j++) expect(overlap(captions[i]!, captions[j]!), `${captions[i]!.id}/${captions[j]!.id}`).toBe(false);
    }
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        if (bubbles[i]!.speaker === bubbles[j]!.speaker) expect(overlap(bubbles[i]!, bubbles[j]!)).toBe(false);
      }
    }
    // The HUD has two bubble slots.
    for (const b of bubbles) {
      expect(bubbles.filter((o) => overlap(o, b)).length).toBeLessThanOrEqual(2);
    }
  });

  it("never show a caption or a bubble while a cover hides the picture", () => {
    for (const shot of script.shots) {
      if (shot.coverDur <= 0) continue;
      const a = shot.from - shot.coverDur / 2;
      const b = shot.from + shot.coverDur / 2;
      for (const line of script.lines) {
        if (line.kind === "card") continue;
        expect(line.from >= b - 1e-9 || line.to <= a + 1e-9, `${line.id} during the cover of ${shot.id}`).toBe(true);
      }
    }
  });

  it("only give bubbles to characters who are there", () => {
    for (const line of script.lines) {
      if (line.kind !== "bubble") continue;
      expect(line.speaker).toBeDefined();
      const who = line.speaker!;
      if (who.startsWith("friend")) expect(Number(who.slice(6))).toBeLessThan(script.friendCount);
      if (who === "teacher") expect(line.shot).toBe("amphi");
    }
  });

  it("index every card by its id", () => {
    for (const line of script.lines) {
      if (line.kind === "card") expect(script.cards[line.id]).toBe(line);
    }
    for (const id of ["place", "tag", "sign", "sheetName", "code", "answer", "gymPlace", "gymCode", "gymNote", "poster", "chatTitle", "msg1", "reply1", "msg2", "reply2", "summary", "sae", "drive", "empty", "slam", "title", "tagline"]) {
      expect(script.cards[id], id).toBeDefined();
    }
    for (let i = 0; i < CUE.night.errors.length; i++) expect(script.cards[`err${i}`]).toBeDefined();
  });
});

describe("timings", () => {
  it("never depend on the cast", () => {
    const reference = scripts[0]![1];
    for (const [, script] of scripts) {
      expect(script.duration).toBe(reference.duration);
      expect(script.shots).toEqual(reference.shots);
    }
  });

  it("the reading rule is 15 characters per second, counted as a reader counts", () => {
    expect(READ_CPS).toBe(15);
    expect(readingLength("Léo")).toBe(3);
    expect(readingLength("🔥🔥")).toBe(2);
    expect(minReadingTime("x".repeat(30))).toBeCloseTo(2, 6);
  });
});

describe("the cast", () => {
  const text = (script: Script, id: string): string => plain(script.lines.find((l) => l.id === id)?.text ?? "");

  it("recognises Ruben whatever the case, the accents and the spaces", () => {
    for (const name of ["Ruben", "ruben", "RUBEN", " Ruben ", "Rubén", "RÜBEN"]) expect(isRubenName(name), name).toBe(true);
    for (const name of ["Ruben2", "Rubens", "Léo", "", "Le Ruben"]) expect(isRubenName(name), name).toBe(false);
  });

  it("says who plays Ruben when it is not Ruben", () => {
    const script = buildScript(cast("Léo", ["Alice"]));
    expect(script.playedBy).toBe("Léo");
    expect(plain(script.cards.playedBy!.text)).toBe("joué par Léo");
    expect(script.cards.sheetName!.text).toBe("RUBEN");
    // He is introduced when his sheet appears.
    expect(script.cards.playedBy!.u0).toBeGreaterThanOrEqual(CUE.campus.sheet);
  });

  it("says nothing of the kind when Ruben plays himself", () => {
    for (const name of ["Ruben", "rubén "]) {
      const script = buildScript(cast(name, ["Alice"]));
      expect(script.playedBy).toBeNull();
      expect(script.cards.playedBy).toBeUndefined();
      expect(script.lines.some((l) => l.text.includes("joué par"))).toBe(false);
    }
  });

  it("announces a Ruben drawn by lot, with the player's name", () => {
    const script = buildScript(cast("Léo", ["Alice"], true));
    expect(script.drawnByLot).toBe(true);
    expect(text(script, "c4")).toBe("Ce soir, le sort a désigné Léo pour jouer Ruben !");
    expect(script.cards.lotStamp!.text).toBe("TIRÉ AU SORT");
    const himself = buildScript(cast("Ruben", [], true));
    expect(text(himself, "c4")).toContain("Le sort a désigné Ruben pour jouer Ruben");
    expect(himself.cards.lotStamp).toBeDefined();
  });

  it("does not mention the draw when the role was chosen", () => {
    const script = buildScript(cast("Léo", ["Alice"]));
    expect(script.drawnByLot).toBe(false);
    expect(script.cards.lotStamp).toBeUndefined();
    expect(script.lines.some((l) => l.text.includes("sort"))).toBe(false);
  });

  it("keeps a long nickname whole in the words (the drawings fit it themselves)", () => {
    const script = buildScript(cast(LONG, [LONG], true));
    expect(text(script, "c4")).toContain(LONG);
    expect(plain(script.cards.playedBy!.text)).toBe(`joué par ${LONG}`);
  });

  it("gives the friends their two lines, from one friend or two", () => {
    for (let n = 1; n <= 4; n++) {
      const script = buildScript(cast("Ruben", ["A", "B", "C", "D"].slice(0, n)));
      expect(script.friendCount).toBe(n);
      const r1 = script.lines.find((l) => l.id === "r1")!;
      const r2 = script.lines.find((l) => l.id === "r2")!;
      expect(plain(r1.text)).toBe("On te laisse pas redoubler, srab.");
      expect(plain(r2.text)).toBe("Personne ne lâche personne.");
      expect(r1.speaker).toBe("friend0");
      // The second line comes from the friend standing next to Ruben.
      expect(r2.speaker).toBe(n === 1 ? "friend0" : `friend${n - 1}`);
      expect(script.lines.find((l) => l.id === "r3")!.speaker).toBe("ruben");
    }
  });

  it("lets Ruben save himself when he has no friend", () => {
    const script = buildScript(cast("Ruben"));
    expect(script.friendCount).toBe(0);
    const bubbles = script.lines.filter((l) => l.kind === "bubble" && l.shot === "rescue");
    expect(bubbles.length).toBeGreaterThanOrEqual(2);
    for (const b of bubbles) expect(b.speaker).toBe("ruben");
    expect(bubbles.some((b) => b.text.includes("Personne ne lâche personne"))).toBe(true);
  });

  it("never takes more than four friends", () => {
    const script = buildScript(cast("Ruben", ["A", "B", "C", "D", "E", "F"]));
    expect(script.friendCount).toBe(4);
  });

  it("ends on the title", () => {
    const script = buildScript(cast("Ruben"));
    expect(script.cards.title!.text).toBe("SAUVE TON SRAB");
    expect(script.cards.title!.to).toBeCloseTo(script.duration, 6);
    expect(plain(script.cards.sae!.text).replace("\n", " ")).toBe("SAÉ à rendre DEMAIN 8 h");
    expect(LEVEL_NAMES).toHaveLength(10);
  });

  it("never names red, and names nobody but Ruben and the players", () => {
    const script = buildScript(cast("Léo", ["Alice", "Bob"]));
    const all = script.lines.map((l) => l.text).join(" ");
    expect(all).not.toMatch(/rouge/i);
    expect(all).toContain("Ruben");
  });
});

describe("a malformed cast", () => {
  it("is repaired instead of breaking the story", () => {
    expect(sanitizeCast(undefined)).toEqual({ ruben: { pseudo: "Ruben", color: 0x2b59c3, drawnByLot: false }, friends: [] });
    const fixed = sanitizeCast({
      ruben: { pseudo: "   ", color: Number.NaN, drawnByLot: true },
      friends: [{ pseudo: "", color: 0xffffff }, { pseudo: " Max ", color: 0x161616 }, null, { pseudo: "C", color: 1 }, { pseudo: "D", color: 2 }, { pseudo: "E", color: 3 }] as never,
    });
    expect(fixed.ruben).toEqual({ pseudo: "Ruben", color: 0x2b59c3, drawnByLot: true });
    expect(fixed.friends.map((f) => f.pseudo)).toEqual(["Joueur 2", "Max", "C", "D"]);
    expect(buildScript(fixed).friendCount).toBe(4);
  });

  it("leaves a proper cast as it is", () => {
    const c = cast("Léo", ["Alice", "Bob"], true);
    expect(sanitizeCast(c)).toEqual(c);
  });
});

describe("French spacing", () => {
  it("never lets a line break before ? ! : ; or inside « »", () => {
    expect(typo("Ruben, que vaut i à la fin ?")).toBe("Ruben, que vaut i à la fin\u00a0?");
    expect(typo("Son plan : « ça va le faire ».")).toBe("Son plan\u00a0: «\u00a0ça va le faire\u00a0».");
    const script = buildScript(cast("Léo", ["Alice"], true));
    for (const line of script.lines) {
      if (line.kind === "card") continue;
      expect(line.text, line.id).not.toMatch(/ [?!:;»]/);
      expect(line.text, line.id).not.toMatch(/« /);
    }
  });

  it("leaves code and what Ruben types alone", () => {
    const script = buildScript(cast("Ruben"));
    expect(script.cards.code!.text).toBe("for (int i = 0; i < n; i++)");
    expect(script.cards.gymCode!.text).toBe("for (rep = 1; rep <= 12; rep++)");
    expect(script.cards.msg1!.text).toBe("fé mon proje stp");
  });
});

describe("stateAt", () => {
  const script = buildScript(cast("Léo", ["Alice", "Bob"]));

  it("starts on the campus and ends on the title", () => {
    const start = stateAt(script, 0);
    expect(start.shot.id).toBe("campus");
    expect(start.u).toBe(0);
    expect(start.ended).toBe(false);
    expect(start.cover).toBeNull();
    const end = stateAt(script, script.duration);
    expect(end.shot.id).toBe("title");
    expect(end.ended).toBe(true);
    expect(end.u).toBeCloseTo(end.shot.dur, 6);
  });

  it("clamps any time to the script", () => {
    expect(stateAt(script, -5).t).toBe(0);
    expect(stateAt(script, 1e9).t).toBe(script.duration);
    expect(stateAt(script, 1e9).ended).toBe(true);
    expect(stateAt(script, Number.NaN).t).toBe(0);
  });

  it("can start anywhere: each shot is found with its own clock", () => {
    for (const shot of script.shots) {
      const mid = stateAt(script, shot.from + shot.dur / 2);
      expect(mid.shot.id).toBe(shot.id);
      expect(mid.u).toBeCloseTo(shot.dur / 2, 6);
      expect(stateAt(script, shot.from).shot.id).toBe(shot.id);
      expect(stateAt(script, shot.from).u).toBeCloseTo(0, 6);
    }
  });

  it("moves forward: the shot index and the time never go back", () => {
    let lastIndex = 0;
    for (let t = 0; t <= script.duration; t += 0.05) {
      const s = stateAt(script, t);
      expect(s.shot.index).toBeGreaterThanOrEqual(lastIndex);
      expect(s.u).toBeGreaterThanOrEqual(0);
      expect(s.u).toBeLessThanOrEqual(s.shot.dur + 1e-9);
      lastIndex = s.shot.index;
    }
    expect(lastIndex).toBe(script.shots.length - 1);
  });

  it("changes the picture exactly halfway through a cover", () => {
    for (const shot of script.shots) {
      if (shot.coverDur <= 0) {
        expect(stateAt(script, shot.from).cover).toBeNull();
        continue;
      }
      const before = stateAt(script, shot.from - shot.coverDur / 4);
      const at = stateAt(script, shot.from);
      const after = stateAt(script, shot.from + shot.coverDur / 4);
      expect(before.cover!.kind).toBe(shot.cover);
      expect(before.cover!.p).toBeCloseTo(0.25, 6);
      expect(before.shot.index).toBe(shot.index - 1);
      expect(at.cover!.p).toBeCloseTo(0.5, 6);
      expect(at.shot.index).toBe(shot.index);
      expect(after.cover!.p).toBeCloseTo(0.75, 6);
      expect(stateAt(script, shot.from + shot.coverDur / 2 + 0.01).cover).toBeNull();
    }
  });

  it("lists the captions and bubbles on screen, never the cards", () => {
    const out: Line[] = [];
    let seen = 0;
    for (let t = 0; t <= script.duration; t += 0.1) {
      hudLinesAt(script, t, out);
      for (const line of out) {
        expect(line.kind).not.toBe("card");
        expect(t).toBeGreaterThanOrEqual(line.from);
        expect(t).toBeLessThan(line.to);
      }
      expect(out.filter((l) => l.kind === "caption").length).toBeLessThanOrEqual(1);
      seen += out.length;
    }
    expect(seen).toBeGreaterThan(0);
    // The same array is reused from call to call.
    expect(hudLinesAt(script, 1e9, out)).toBe(out);
    expect(out).toHaveLength(0);
  });
});
