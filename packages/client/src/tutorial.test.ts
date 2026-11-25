/**
 * The tutorial (scenes/TutorialScene.ts): its level, its script (tutorial/flow.ts) and its
 * scripted rival (tutorial/rival.ts). The designer's hard requirement is 20 to 30 s for a
 * player who follows the prompts, and a tutorial that never stalls.
 */
import { describe, expect, it } from "vitest";
import {
  canPlaceAt,
  CharacterController,
  contactWith,
  DEFAULT_GAME_CONFIG,
  DEFAULT_MOVEMENT,
  isSolidCell,
  NO_INPUT,
  parseLevel,
  prepareObjects,
  RACE_LEVELS,
  scoreRound,
  SIM_HZ,
  withSolidObjects,
  type PlacedObject,
} from "@game/shared";
import { outroTime, tokenizePrompt, TutorialFlow, TUTORIAL_BURSTS, TUTORIAL_STEPS, type FlowEvent, type GoalId } from "./tutorial/flow";
import { formatPoints } from "./ui/points";
import { CHECKPOINTS, isLaneCell, TUTO, TUTORIAL_LEVEL } from "./tutorial/level";
import { ScriptedRival } from "./tutorial/rival";

const DT = 1 / SIM_HZ;
const level = parseLevel(TUTORIAL_LEVEL);

function saw(x: number, y: number): PlacedObject {
  return { id: 1, kind: "saw", x, y, ownerId: "me" };
}

describe("tutorial level", () => {
  it("is a single 1280x720 screen, not a race map", () => {
    expect(level.width).toBe(32);
    expect(level.height).toBe(18);
    expect(RACE_LEVELS).not.toContain(TUTORIAL_LEVEL);
    expect(level.finish).toEqual(TUTO.flag);
    expect(level.initialObjects).toEqual([]);
  });

  it("keeps the top rows empty for the prompt", () => {
    for (let y = 0; y < 5; y++) for (let x = 0; x < level.width; x++) expect(isSolidCell(level, x, y)).toBe(false);
  });

  it("has a lane of placeable cells along the ledge, with the rival standing at its right end", () => {
    const { y, x0, x1 } = TUTO.lane;
    for (let x = x0; x <= x1; x++) {
      expect(isLaneCell(x, y)).toBe(true);
      expect(canPlaceAt(level, [], x, y)).toBe(true);
      expect(isSolidCell(level, x, y + 1)).toBe(true);
    }
    expect(isLaneCell(TUTO.autoSaw.x, TUTO.autoSaw.y)).toBe(true);
    expect(isLaneCell(x0 - 1, y)).toBe(false);
    expect(isLaneCell(x0, y + 1)).toBe(false);
    expect(isSolidCell(level, TUTO.rivalLedge.x, TUTO.rivalLedge.y + 1)).toBe(true);
    expect(TUTO.rivalLedge.x).toBe(x1 + 1);
  });

  it("puts every checkpoint and spawn on solid ground", () => {
    for (const c of [...Object.values(CHECKPOINTS), TUTO.marker, TUTO.rivalGround, TUTO.flag]) {
      expect(isSolidCell(level, c.x, c.y)).toBe(false);
      expect(isSolidCell(level, c.x, c.y + 1)).toBe(true);
    }
  });

  it("has nothing above the stomp area, so the stomp bounce never hits a ceiling", () => {
    const { x, y } = TUTO.rivalGround;
    for (let cx = x - 1; cx <= x + 1; cx++) for (let cy = 0; cy <= y; cy++) expect(isSolidCell(level, cx, cy)).toBe(false);
  });
});

describe("tutorial script", () => {
  it("starts on step 1 with its prompt", () => {
    const flow = new TutorialFlow();
    const ev = flow.start();
    expect(ev.map((e) => e.type)).toEqual(["step", "goal"]);
    expect(flow.stepNumber).toBe(1);
    expect(flow.stepCount).toBe(4);
    expect(flow.goal).toBe("marker");
  });

  it("runs the steps in order: move, trap, stomp, flag, then the end card", () => {
    const flow = new TutorialFlow();
    const seen: string[] = [];
    const record = (ev: FlowEvent[]) => {
      for (const e of ev) if (e.type === "step") seen.push(e.step);
      return ev;
    };
    record(flow.start());
    const order: GoalId[] = ["marker", "place", "rivalDies", "stomp", "flag"];
    for (const g of order) {
      expect(flow.goal).toBe(g);
      record(flow.reach(g));
      // Play out the outros.
      for (let i = 0; i < 1000 && !flow.goal && !flow.done; i++) record(flow.update(0.05));
    }
    expect(seen).toEqual(["move", "trap", "stomp", "flag"]);
    expect(flow.done).toBe(true);
    expect(flow.update(1)).toEqual([]);
  });

  it("ignores goals reached out of turn (the flag touched before its step)", () => {
    const flow = new TutorialFlow();
    flow.start();
    expect(flow.reach("flag")).toEqual([]);
    expect(flow.reach("stomp")).toEqual([]);
    expect(flow.goal).toBe("marker");
  });

  it("places the saw for a player who does nothing for 6 s, then lets the rival run", () => {
    const flow = new TutorialFlow();
    flow.start();
    flow.reach("marker");
    while (flow.goal !== "place") flow.update(0.01);
    let ev: FlowEvent[] = [];
    let t = 0;
    while (ev.length === 0) {
      ev = flow.update(0.01);
      t += 0.01;
    }
    expect(t).toBeGreaterThan(5.9);
    expect(t).toBeLessThan(6.1);
    expect(ev[0]).toEqual({ type: "help", step: "trap", goal: "place" });
    expect(ev[1]).toMatchObject({ type: "goal", goal: { id: "rivalDies" } });
  });

  it("never stalls: every goal is helped after a few seconds", () => {
    for (const s of TUTORIAL_STEPS) for (const g of s.goals) expect(g.helpAfter).toBeLessThanOrEqual(6);
  });

  it("'next' does the current goal or cuts the current line short", () => {
    const flow = new TutorialFlow();
    flow.start();
    const ev = flow.next();
    expect(ev[0]).toEqual({ type: "help", step: "move", goal: "marker" });
    expect(flow.phase.kind).toBe("outro");
    flow.next();
    expect(flow.goal).toBe("place");
    for (let i = 0; i < 20 && !flow.done; i++) flow.next();
    expect(flow.done).toBe(true);
  });

  it("says what the designer asked for", () => {
    const texts = TUTORIAL_STEPS.flatMap((s) => [...s.goals.map((g) => g.prompt), ...s.outros.map((o) => o.text)]);
    expect(texts).toContain("+1 : il est mort dans TON piège");
    expect(texts).toContain("Pousse un rival dans TON piège : +2");
    expect(texts).toContain("+2 en arrivant, +1 si tu es premier");
    expect(texts).toContain("Saute-lui sur la tête !");
  });

  it("splits prompts into text, key caps and points badges", () => {
    expect(tokenizePrompt("Cours avec [Q] [D] : +2")).toEqual([
      { kind: "text", text: "Cours avec " },
      { kind: "key", text: "Q" },
      { kind: "text", text: " " },
      { kind: "key", text: "D" },
      { kind: "text", text: " : " },
      { kind: "points", text: "+2" },
    ]);
    expect(tokenizePrompt("Bien !")).toEqual([{ kind: "text", text: "Bien !" }]);
  });
});

describe("tutorial rival", () => {
  it("dies on the player's saw wherever it is in the lane, by the real hazard check", () => {
    for (let x = TUTO.lane.x0; x <= TUTO.lane.x1; x++) {
      const objects = prepareObjects(level, [saw(x, TUTO.lane.y)]);
      const rival = new ScriptedRival(withSolidObjects(level, objects), DEFAULT_MOVEMENT);
      rival.spawn(TUTO.rivalLedge.x, TUTO.rivalLedge.y, -1, "runLeft");
      let t = 0;
      let death = null;
      while (!death && t < 3) {
        death = rival.step(DT, objects, t);
        t += DT;
      }
      expect(death?.killer?.ownerId, `saw at x=${x}`).toBe("me");
      expect(death?.fell).toBe(false);
      expect(t).toBeLessThan(1.5);
      expect(rival.alive).toBe(false);
    }
  });

  it("does not die by itself: without the saw it just runs off the ledge", () => {
    const rival = new ScriptedRival(withSolidObjects(level, []), DEFAULT_MOVEMENT);
    rival.spawn(TUTO.rivalLedge.x, TUTO.rivalLedge.y, -1, "runLeft");
    for (let t = 0; t < 1.5; t += DT) expect(rival.step(DT, [], t)).toBeNull();
    expect(rival.controller.x).toBeLessThan(TUTO.lane.x0);
  });

  it("idles in place, looking where it was told", () => {
    const rival = new ScriptedRival(level, DEFAULT_MOVEMENT);
    rival.spawn(TUTO.rivalGround.x, TUTO.rivalGround.y, -1);
    const x = rival.controller.x;
    for (let t = 0; t < 1; t += DT) rival.step(DT, [], t);
    expect(rival.controller.x).toBe(x);
    expect(rival.controller.grounded).toBe(true);
    expect(rival.controller.facing).toBe(-1);
  });

  it("can be stomped: a player falling on its head gets the real stomp contact", () => {
    const m = DEFAULT_MOVEMENT;
    const rival = new ScriptedRival(level, m);
    rival.spawn(TUTO.rivalGround.x, TUTO.rivalGround.y, -1);
    const player = new CharacterController(level, m);
    player.standInCell(TUTO.rivalGround.x, TUTO.rivalGround.y - 3);
    player.y = rival.controller.y - 3;
    let contact = null;
    for (let t = 0; t < 1 && !contact; t += DT) {
      const prevY = player.y;
      player.step(DT, NO_INPUT);
      rival.step(DT, [], t);
      contact = contactWith(player, prevY, player.vy, rival.controller, m.bodyWidth, m.bodyHeight, false);
    }
    expect(contact).toBe("stomp");
  });
});

/**
 * Plays the whole script at the simulation rate. `goalTimes`: how long the player takes to
 * reach each goal once its prompt shows (absent: never, the tutorial helps). The rival goal
 * is never given: the real rival must die on the saw by itself.
 */
function playThrough(goalTimes: Partial<Record<GoalId, number>>): number {
  const flow = new TutorialFlow();
  let objects: PlacedObject[] = [];
  const rival = new ScriptedRival(withSolidObjects(level, objects), DEFAULT_MOVEMENT);
  const handle = (ev: FlowEvent[]) => {
    for (const e of ev) {
      if (e.type === "step" && e.step === "trap") rival.spawn(TUTO.rivalLedge.x, TUTO.rivalLedge.y, -1);
      if (e.type === "help" && e.goal === "place") placeSaw(TUTO.autoSaw.x);
      if (e.type === "goal" && e.goal.id === "rivalDies") rival.mode = "runLeft";
    }
  };
  const placeSaw = (x: number) => {
    objects = prepareObjects(level, [saw(x, TUTO.lane.y)]);
    rival.setCollision(withSolidObjects(level, objects));
  };
  handle(flow.start());
  let t = 0;
  while (!flow.done && t < 120) {
    t += DT;
    handle(flow.update(DT));
    if (rival.step(DT, objects, t)) handle(flow.reach("rivalDies"));
    const g = flow.goal;
    const need = g ? goalTimes[g] : undefined;
    if (g && need !== undefined && flow.phaseTime >= need) {
      if (g === "place") placeSaw(TUTO.lane.x0 + 4);
      handle(flow.reach(g));
    }
  }
  return flow.elapsed;
}

describe("tutorial duration (designer: 20 to 30 s)", () => {
  it("leaves most of the time to the player: the fixed lines take under 10 s", () => {
    expect(outroTime()).toBeLessThan(10);
  });

  it("takes 20 to 30 s for a player who follows the prompts at a normal pace", () => {
    const t = playThrough({ marker: 3, place: 3, stomp: 3.5, flag: 2.5 });
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThanOrEqual(30);
  });

  it("still ends within 30 s for a player who does nothing at all", () => {
    const t = playThrough({});
    expect(t).toBeLessThanOrEqual(30);
  });

  it("is never much shorter than 15 s, even for a speedrunner (time to read the lines)", () => {
    expect(playThrough({ marker: 1.2, place: 1, stomp: 1.5, flag: 0.8 })).toBeGreaterThan(14);
  });
});

describe("tutorial point bursts", () => {
  it("show what the score gives: the flag what a finish earns, the saw kill what a kill earns", () => {
    // Review finding: the flag burst was read from POINTS.pushKill (equal to POINTS.finish only by chance).
    const rs = scoreRound(
      [
        { playerId: "me", finishTime: 10, killedBy: null },
        { playerId: "other", finishTime: 12, killedBy: null },
        { playerId: "rival", finishTime: null, killedBy: "me" },
      ],
      DEFAULT_GAME_CONFIG,
    );
    const me = rs.lines.find((l) => l.playerId === "me")!;
    expect(TUTORIAL_BURSTS.flag).toBe(`+${formatPoints(me.finish)}`);
    expect(TUTORIAL_BURSTS.kill).toBe(`+${formatPoints(me.kills)}`);
  });
});
