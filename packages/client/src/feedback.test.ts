import { describe, expect, it } from "vitest";
import { canPlaceAt, DEFAULT_MOVEMENT, OBJECT_KINDS, parseLevel, PathGuard, prepareObjects, type LevelDefinition } from "@game/shared";
import { findRoom, findRoomNow } from "./sim/placementRoom";
import { noRoomText, refusedText, unplacedText } from "./ui/feedback";

describe("placement feedback texts", () => {
  it("names a refused object with the right agreement", () => {
    expect(refusedText([{ kind: "saw", reason: "path" }])).toEqual([
      "Ta Scie a été refusée : avec les objets des autres, elle aurait bloqué le chemin.",
    ]);
    expect(refusedText([{ kind: "cannon", reason: "path" }])).toEqual([
      "Ton Canon a été refusé : avec les objets des autres, il aurait bloqué le chemin.",
    ]);
    expect(refusedText([{ kind: "spikes", reason: "path" }])).toEqual([
      "Tes Pics ont été refusés : avec les objets des autres, ils auraient bloqué le chemin.",
    ]);
  });

  it("groups several refused objects and one sentence per reason", () => {
    expect(
      refusedText([
        { kind: "saw", reason: "path" },
        { kind: "vine", reason: "path" },
        { kind: "platform", reason: "taken" },
      ]),
    ).toEqual([
      "Ta Scie et ta Liane ont été refusées : avec les objets des autres, elles auraient bloqué le chemin.",
      "Ta Plateforme a été refusée : un autre joueur avait déjà pris la case.",
    ]);
    expect(refusedText([{ kind: "saw", reason: "path" }, { kind: "saw", reason: "path" }, { kind: "spring", reason: "path" }])).toEqual([
      "Tes 2 Scies et ton Ressort ont été refusés : avec les objets des autres, ils auraient bloqué le chemin.",
    ]);
    expect(refusedText([])).toEqual([]);
  });

  it("says how many objects were not placed in time, and which when known", () => {
    expect(unplacedText(0)).toBe("");
    expect(unplacedText(1)).toBe("Temps écoulé : 1 objet non posé.");
    expect(unplacedText(1, ["saw"])).toBe("Temps écoulé : 1 objet non posé (Scie).");
    expect(unplacedText(2, ["cannon", "vine"])).toBe("Temps écoulé : 2 objets non posés (Canon, Liane).");
    // Kinds that don't match the count (more objects offered than needed) are left out.
    expect(unplacedText(1, ["cannon", "vine"])).toBe("Temps écoulé : 1 objet non posé.");
  });

  it("announces an object with no room left", () => {
    expect(noRoomText("saw")).toBe("Plus aucune place pour ta Scie : elle est défaussée.");
    expect(noRoomText("cannon")).toBe("Plus aucune place pour ton Canon : il est défaussé.");
    expect(noRoomText("spikes")).toBe("Plus aucune place pour tes Pics : ils sont défaussés.");
  });
});

/** A one-cell-high corridor from the spawn pad to the finish: anything in it cuts the only path. */
const corridor: LevelDefinition = {
  name: "corridor",
  rows: ["##############", "#.....########", "#.....########", "#..S........F#", "##############"],
};
const open: LevelDefinition = {
  name: "open",
  rows: ["....................", "....................", "S..................F", "####################"],
};

describe("findRoom (is there a cell left for this object?)", () => {
  it("finds no room for any kind when every free cell is on the only path", () => {
    const level = parseLevel(corridor);
    for (const kind of OBJECT_KINDS) expect(findRoomNow(level, [], kind), kind).toBeNull();
  });

  it("finds a cell the session would accept on an open map, quickly", () => {
    const level = parseLevel(open);
    const objects = prepareObjects(level, level.initialObjects);
    for (const kind of OBJECT_KINDS) {
      const it = findRoom(level, objects, kind);
      let steps = 0;
      let r = it.next();
      while (!r.done) {
        steps++;
        r = it.next();
      }
      const found = r.value;
      expect(found, kind).not.toBeNull();
      // Stops at the first accepted cell (the quick check), well before scanning the map.
      expect(steps).toBeLessThan(5);
      const guard = new PathGuard(level, objects, DEFAULT_MOVEMENT);
      expect(canPlaceAt(level, guard.objects, found!.x, found!.y) && guard.tryAdd({ ...found!, id: 1 })).toBe(true);
    }
  });

  it("gives up on the full checks after its time budget", () => {
    const level = parseLevel(corridor);
    const steps = (now?: () => number) => {
      const it = findRoom(level, [], "saw", { fullBudgetMs: 2000, ...(now ? { now } : {}) });
      let n = 0;
      let r = it.next();
      for (; !r.done; r = it.next()) n++;
      return { n, value: r.value };
    };
    const full = steps();
    let t = 0;
    // Each look at the clock costs 1 s: the 2 s budget runs out after a couple of full checks.
    const capped = steps(() => (t += 1000));
    expect(full.value).toBeNull();
    expect(capped.value).toBeNull();
    expect(capped.n).toBeLessThan(full.n);
  });
});
