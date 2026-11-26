/**
 * The predicted screen's parts (step B): the ?predict flag, stamps for the predicted tick, the
 * bounded lead, a copy that never steps into a death the server has not decided, own inputs
 * replayed until the server's ack covers them. The end-to-end bench is coopPredictBench.test.ts.
 */
import { describe, expect, it } from "vitest";
import { BIT_RIGHT, COOP_HZ, COOP_STAMP_AHEAD, CoopWorld, parseCoopLevel, type CoopClientMessage, type CoopLevelDef } from "@game/shared/coop";
import { CoopInputSender } from "./net/inputSender";
import { PREDICT_BY_DEFAULT, PredictedPlay, predictionWanted } from "./net/predictedPlay";
import { CoopPredictor, MAX_LEAD, predictionLead } from "./net/predictor";

const pit: CoopLevelDef = {
  id: "test-pit",
  name: "Fosse",
  quote: "",
  rows: [
    "##############################",
    ...Array.from({ length: 6 }, () => "#............................#"),
    "#.S..........................#",
    "##########..##################",
    "##########..##################",
  ],
};
const players = [{ name: "a", isRuben: false }];

describe("co-op prediction parts", () => {
  it("reads ?predict=0 and ?predict=1, else the default", () => {
    expect(predictionWanted("")).toBe(PREDICT_BY_DEFAULT);
    expect(predictionWanted("?salon=ABCD")).toBe(PREDICT_BY_DEFAULT);
    expect(predictionWanted("?predict=0")).toBe(false);
    expect(predictionWanted("?predict=1&salon=ABCD")).toBe(true);
  });

  it("keeps the lead well under the server's clamp", () => {
    expect(predictionLead(100)).toBe(10);
    expect(predictionLead(5000)).toBe(MAX_LEAD);
    expect(MAX_LEAD).toBeLessThan(COOP_STAMP_AHEAD);
  });

  it("stamps a change with the predicted step, strictly increasing", () => {
    const sent: CoopClientMessage[] = [];
    const sender = new CoopInputSender((m) => sent.push(m), 3, () => 0);
    expect(sender.sample(BIT_RIGHT, 20)).toBe(20);
    expect(sender.sample(BIT_RIGHT, 21)).toBeNull();
    expect(sender.sample(0, 21)).toBe(21);
    // A change on the same predicted step lands on the next one.
    expect(sender.sample(BIT_RIGHT, 21)).toBe(22);
    sender.flush(0);
    expect(sent).toEqual([{ type: "coopIn", e: 3, k: [[20, BIT_RIGHT], [21, 0], [22, BIT_RIGHT]] }]);
  });

  it("stops before a death the server has not decided, and shows the server's", () => {
    const level = parseCoopLevel(pit, 1);
    const server = new CoopWorld(level, players);
    const predictor = new CoopPredictor(new CoopWorld(level, players), 0);
    predictor.onSnapshot(0, server.save(), [0], []);
    // Walk right into the pit: the copy runs ahead and stops before the fall kills.
    for (let t = 1; t <= 600; t++) predictor.addInput(t, BIT_RIGHT);
    predictor.advanceTo(600);
    expect(predictor.waiting).toBe(true);
    expect(predictor.world.dying).toBe(0);
    expect(predictor.world.attempt).toBe(1);
    const stoppedAt = predictor.tick;
    expect(stoppedAt).toBeLessThan(600);
    // The server runs the same keys and decides the death: the copy shows that world, frozen.
    while (server.dying === 0) server.step([BIT_RIGHT]);
    expect(server.tick).toBe(stoppedAt + 1);
    predictor.onSnapshot(server.tick, server.save(), [BIT_RIGHT], []);
    predictor.advanceTo(620);
    expect(predictor.world.dying).toBeGreaterThan(0);
    expect(predictor.tick).toBe(server.tick);
    // And the restart, once the server's freeze ends, snaps everyone home.
    while (server.attempt === 1) server.step([0]);
    predictor.onSnapshot(server.tick, server.save(), [0], []);
    predictor.advanceTo(server.tick + 10);
    expect(predictor.world.attempt).toBe(2);
    expect(predictor.offset(0)).toEqual({ x: 0, y: 0 });
  });

  it("replays an own input the server has not received yet, whatever its stamp", () => {
    const level = parseCoopLevel(pit, 1);
    const server = new CoopWorld(level, players);
    const predictor = new CoopPredictor(new CoopWorld(level, players), 0);
    predictor.onSnapshot(0, server.save(), [0], [], [0]);
    // Right, stamped for tick 5 and expected there at tick 3; the upstream stalls instead.
    predictor.addInput(5, BIT_RIGHT, 3);
    predictor.advanceTo(20);
    const x0 = server.bodies[0]!.x;
    expect(predictor.world.bodies[0]!.x).toBeGreaterThan(x0);
    // Tick 10: the server has nothing from this client (ack 0) and stood still.
    for (let t = 0; t < 10; t++) server.step([0]);
    predictor.onSnapshot(10, server.save(), [0], [[]], [0]);
    predictor.advanceTo(20);
    // Still walking: the input applies from tick 11, when it can get there, not dropped as applied.
    const walked = predictor.world.bodies[0]!.x;
    expect(walked).toBeGreaterThan(x0);
    // Once received and applied (ack 5, the server holds Right), it is part of the snapshot.
    for (let t = 0; t < 4; t++) server.step([BIT_RIGHT]);
    predictor.onSnapshot(14, server.save(), [BIT_RIGHT], [[]], [5]);
    predictor.advanceTo(20);
    expect(predictor.world.bodies[0]!.x).toBeGreaterThan(server.bodies[0]!.x);
    // The screen does not keep the corrections (only the bench turns `record` on).
    expect(predictor.record).toBe(false);
    expect(predictor.corrections).toEqual([]);
  });

  it("nothing advances while paused", () => {
    const level = parseCoopLevel(pit, 1);
    let tick = 10;
    const sent: CoopClientMessage[] = [];
    const play = new PredictedPlay(new CoopWorld(level, players), new CoopWorld(level, players), 0, 1, { send: (m) => sent.push(m), serverTick: () => tick, rtt: () => 100 });
    play.onSnapshot(0, new CoopWorld(level, players).save(), [0], []);
    play.advance(1 / 60, () => BIT_RIGHT, 0);
    const at = play.predictor.tick;
    expect(at).toBeGreaterThan(0);
    play.setPaused(true);
    for (let f = 1; f <= 60; f++) {
      tick += COOP_HZ / 60;
      play.advance(1 / 60, () => 0, f * 16);
    }
    expect(play.predictor.tick).toBe(at);
    // Only heartbeats went out meanwhile.
    expect(sent.slice(1).every((m) => m.type === "coopIn" && m.k.length === 0)).toBe(true);
  });
});
