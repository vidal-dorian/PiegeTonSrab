/**
 * Which online display a player's screen uses (net/reactivity.ts): the address forces it, else
 * the lobby's "Réactivité" setting (kept in localStorage, which may fail), else the auto rule on
 * the recent round trip, with its hysteresis, decided once per level start. Also the recent
 * round trip it reads (ServerClock.recentRtt) and the lobby's texts for the setting.
 */
import { afterEach, describe, expect, it } from "vitest";
import { ServerClock } from "./net/serverClock";
import {
  addressForces,
  AUTO_OFF_ABOVE_MS,
  AUTO_ON_BELOW_MS,
  autoPredicts,
  lastPredictionChoice,
  loadReactivity,
  parseReactivity,
  predictionWanted,
  previewPrediction,
  REACTIVITY_KEY,
  resetPredictionMemory,
  saveReactivity,
  type SettingStorage,
} from "./net/reactivity";
import { pingText, REACTIVITY_LABELS, reactivityHint, reactivityStatus } from "./ui/coopText";

/** An in-memory localStorage. */
function memoryStorage(initial: Record<string, string> = {}): SettingStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

/** A storage whose every access throws (private mode, blocked cookies). */
const broken: SettingStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

afterEach(() => resetPredictionMemory());

describe("co-op reactivity: which display a screen uses", () => {
  it("the address always forces it, whatever the setting and the ping", () => {
    expect(addressForces("")).toBeNull();
    expect(addressForces("?salon=ABCD")).toBeNull();
    expect(addressForces("?predict=")).toBeNull();
    expect(addressForces("?predict=0")).toBe(false);
    expect(addressForces("?predict=1&salon=ABCD")).toBe(true);
    expect(predictionWanted("?predict=1", { setting: "stable", rttMs: 400 })).toBe(true);
    expect(lastPredictionChoice()?.by).toBe("address");
    expect(predictionWanted("?predict=0", { setting: "instant", rttMs: 10 })).toBe(false);
    expect(predictionWanted("?salon=AB&predict=0", { setting: "auto", rttMs: 10 })).toBe(false);
  });

  it("the setting forces it without the address; auto follows the ping", () => {
    expect(predictionWanted("", { setting: "stable", rttMs: 10 })).toBe(false);
    expect(predictionWanted("", { setting: "instant", rttMs: 400 })).toBe(true);
    expect(lastPredictionChoice()?.by).toBe("setting");
    expect(predictionWanted("", { setting: "auto", rttMs: 30 })).toBe(true);
    expect(lastPredictionChoice()).toEqual({ predict: true, by: "auto", rttMs: 30 });
    expect(predictionWanted("", { setting: "auto", rttMs: 150 })).toBe(false);
  });

  it("auto: on under the low threshold, off over the high one, the previous choice in between", () => {
    expect(AUTO_ON_BELOW_MS).toBeLessThan(AUTO_OFF_ABOVE_MS);
    const mid = (AUTO_ON_BELOW_MS + AUTO_OFF_ABOVE_MS) / 2;
    expect(autoPredicts(AUTO_ON_BELOW_MS - 1, null)).toBe(true);
    expect(autoPredicts(AUTO_ON_BELOW_MS - 1, false)).toBe(true);
    expect(autoPredicts(AUTO_OFF_ABOVE_MS + 1, true)).toBe(false);
    expect(autoPredicts(mid, true)).toBe(true);
    expect(autoPredicts(mid, false)).toBe(false);
    // No previous choice in the band: the stable display.
    expect(autoPredicts(mid, null)).toBe(false);
    // Both edges belong to the band.
    expect(autoPredicts(AUTO_ON_BELOW_MS, false)).toBe(false);
    expect(autoPredicts(AUTO_OFF_ABOVE_MS, true)).toBe(true);
  });

  it("auto without a measured round trip: the stable display", () => {
    expect(autoPredicts(Infinity, null)).toBe(false);
    expect(autoPredicts(Infinity, true)).toBe(false);
    expect(autoPredicts(Number.NaN, true)).toBe(false);
    expect(predictionWanted("", { setting: "auto" })).toBe(false);
    expect(lastPredictionChoice()).toEqual({ predict: false, by: "auto", rttMs: Infinity });
  });

  it("remembers the auto choice between level starts (hysteresis across levels)", () => {
    const mid = (AUTO_ON_BELOW_MS + AUTO_OFF_ABOVE_MS) / 2;
    // A ping in the band first: stable (nothing to keep).
    expect(predictionWanted("", { setting: "auto", rttMs: mid, levelId: "coop01" })).toBe(false);
    // Low: on. Then back in the band: stays on.
    expect(predictionWanted("", { setting: "auto", rttMs: AUTO_ON_BELOW_MS - 10, levelId: "coop02" })).toBe(true);
    expect(predictionWanted("", { setting: "auto", rttMs: mid, levelId: "coop03" })).toBe(true);
    expect(predictionWanted("", { setting: "auto", rttMs: AUTO_OFF_ABOVE_MS, levelId: "coop04" })).toBe(true);
    // High: off. Then in the band again: stays off.
    expect(predictionWanted("", { setting: "auto", rttMs: AUTO_OFF_ABOVE_MS + 10, levelId: "coop05" })).toBe(false);
    expect(predictionWanted("", { setting: "auto", rttMs: mid, levelId: "coop01" })).toBe(false);
    // A forced level in between does not touch the auto memory.
    expect(predictionWanted("", { setting: "instant", rttMs: mid, levelId: "coop02" })).toBe(true);
    expect(predictionWanted("", { setting: "auto", rttMs: mid, levelId: "coop03" })).toBe(false);
  });

  it("decides once per level: a coopLevel continuing the same level keeps its choice", () => {
    expect(predictionWanted("", { setting: "auto", rttMs: 30, levelId: "coop02" })).toBe(true);
    // A resume (or a moved clock) of the same level with a ping now high: unchanged.
    expect(predictionWanted("", { setting: "auto", rttMs: 300, levelId: "coop02", continuing: true })).toBe(true);
    // A real start of the same level again: decided again.
    expect(predictionWanted("", { setting: "auto", rttMs: 300, levelId: "coop02" })).toBe(false);
    // Continuing another level than the one decided (a reconnection into it): decided.
    expect(predictionWanted("", { setting: "auto", rttMs: 30, levelId: "coop03", continuing: true })).toBe(true);
    expect(lastPredictionChoice()?.rttMs).toBe(30);
  });

  it("the lobby's preview decides nothing", () => {
    expect(previewPrediction("", "auto", 30)).toEqual({ predict: true, by: "auto", rttMs: 30 });
    const mid = (AUTO_ON_BELOW_MS + AUTO_OFF_ABOVE_MS) / 2;
    // Nothing remembered: the band previews stable, and the preview did not set the memory.
    expect(previewPrediction("", "auto", mid)).toEqual({ predict: false, by: "auto", rttMs: mid });
    expect(lastPredictionChoice()).toBeNull();
    predictionWanted("", { setting: "auto", rttMs: 30 });
    // Now the band previews what the hysteresis keeps.
    expect(previewPrediction("", "auto", mid).predict).toBe(true);
    expect(previewPrediction("?predict=0", "instant", 30)).toEqual({ predict: false, by: "address", rttMs: 30 });
    expect(previewPrediction("", "stable", 30)).toEqual({ predict: false, by: "setting", rttMs: 30 });
  });
});

describe("co-op reactivity: the stored setting", () => {
  it("reads what was stored, auto for anything else", () => {
    expect(parseReactivity(null)).toBe("auto");
    expect(parseReactivity("")).toBe("auto");
    expect(parseReactivity("instant")).toBe("instant");
    expect(parseReactivity("stable")).toBe("stable");
    expect(parseReactivity("auto")).toBe("auto");
    expect(parseReactivity("INSTANT")).toBe("auto");
    expect(parseReactivity('"instant"')).toBe("auto");
    expect(loadReactivity(() => memoryStorage())).toBe("auto");
    expect(loadReactivity(() => memoryStorage({ [REACTIVITY_KEY]: "stable" }))).toBe("stable");
    expect(loadReactivity(() => memoryStorage({ [REACTIVITY_KEY]: "n'importe quoi" }))).toBe("auto");
  });

  it("saves under its key, and the page reads it back", () => {
    const storage = memoryStorage();
    saveReactivity("instant", () => storage);
    expect(storage.data[REACTIVITY_KEY]).toBe("instant");
    expect(loadReactivity(() => storage)).toBe("instant");
    resetPredictionMemory();
    // A new page reads the stored value.
    expect(loadReactivity(() => storage)).toBe("instant");
  });

  it("storage that throws: auto when reading, the choice kept for the page when saving", () => {
    expect(loadReactivity(() => broken)).toBe("auto");
    expect(() => saveReactivity("stable", () => broken)).not.toThrow();
    expect(loadReactivity(() => broken)).toBe("stable");
    // No localStorage at all (the accessor itself throws).
    const missing = () => {
      throw new Error("localStorage is not defined");
    };
    resetPredictionMemory();
    expect(loadReactivity(missing)).toBe("auto");
    expect(() => saveReactivity("instant", missing)).not.toThrow();
    expect(loadReactivity(missing)).toBe("instant");
  });

  it("predictionWanted with no setting given reads the stored one, safely (no localStorage in this test runner)", () => {
    expect(predictionWanted("", { rttMs: 10 })).toBe(true);
    saveReactivity("stable");
    expect(predictionWanted("", { rttMs: 10 })).toBe(false);
  });
});

describe("co-op reactivity: the recent round trip", () => {
  it("is the 75th percentile of the window, so it follows jitter where the best sample does not", () => {
    let now = 0;
    const clock = new ServerClock(() => now);
    expect(clock.recentRtt).toBe(Infinity);
    const ping = (rtt: number) => {
      const sent = now;
      now += rtt;
      clock.sample(sent, 0);
    };
    ping(40);
    expect(clock.recentRtt).toBe(40);
    for (const rtt of [40, 42, 45, 80, 41, 90, 44, 43, 95, 40, 85]) ping(rtt);
    expect(clock.rtt).toBe(40);
    // 12 samples: 40 40 40 41 42 43 44 45 80 85 90 95 -> index 9.
    expect(clock.recentRtt).toBe(85);
    // The window slides: once the spikes are old, they no longer count.
    for (let i = 0; i < 12; i++) ping(30);
    expect(clock.recentRtt).toBe(30);
  });
});

describe("co-op reactivity: the lobby's texts", () => {
  it("names the three choices in order, with one hint each", () => {
    expect(REACTIVITY_LABELS.map((c) => c.label)).toEqual(["Auto", "Stable", "Instantanée"]);
    expect(REACTIVITY_LABELS.map((c) => c.value)).toEqual(["auto", "stable", "instant"]);
    const hints = REACTIVITY_LABELS.map((c) => reactivityHint(c.value));
    expect(new Set(hints).size).toBe(3);
    for (const h of hints) expect(h.length).toBeLessThan(70);
  });

  it("shows the auto decision and the ping, the address when it forces, nothing for a forced setting", () => {
    expect(reactivityStatus({ predict: true, by: "auto", rttMs: 31.6 })).toBe("Auto : instantanée (ping 32 ms)");
    expect(reactivityStatus({ predict: false, by: "auto", rttMs: 120 })).toBe("Auto : stable (ping 120 ms)");
    expect(reactivityStatus({ predict: false, by: "auto", rttMs: Infinity })).toBe("Auto : stable (ping en mesure…)");
    expect(reactivityStatus({ predict: true, by: "address", rttMs: 120 })).toBe("Forcé par l'adresse (?predict) : instantanée");
    expect(reactivityStatus({ predict: true, by: "setting", rttMs: 120 })).toBe("");
    expect(pingText(Number.NaN)).toBe("en mesure…");
  });
});
