/**
 * Gamepad Down: the race mode reads it only while it is held, as on the base commit (4aec1cb). Only
 * the co-op mode latches its press edge (its "act" press), so a tap between two steps still counts there.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOP_KEYS, InputSource } from "./input";

/** Standard mapping: d-pad down. */
const PAD_DOWN = 13;

function fakePad() {
  return { connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) };
}

let pad = fakePad();

beforeEach(() => {
  pad = fakePad();
  // InputSource listens to the window's keys and reads navigator.getGamepads(): node has neither.
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("navigator", { getGamepads: () => [pad as unknown as Gamepad] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A frame that runs no step (a 144 Hz display at 120 steps/s) sees Down; it is released before the next frame. */
function dpadTapBetweenSteps(src: InputSource): void {
  pad.buttons[PAD_DOWN]!.pressed = true;
  src.poll();
  pad.buttons[PAD_DOWN]!.pressed = false;
  src.poll();
}

describe("gamepad Down in the race mode", () => {
  it("a d-pad tap released before the step is not down", () => {
    const src = new InputSource();
    dpadTapBetweenSteps(src);
    expect(src.takeStepInput().down).toBe(false);
    expect(src.takeStepInput().down).toBe(false);
  });

  it("the stick swept through straight down to a diagonal is not down", () => {
    const src = new InputSource();
    pad.axes = [0.1, 0.9];
    src.poll();
    pad.axes = [0.8, 0.7];
    src.poll();
    expect(src.takeStepInput().down).toBe(false);
    expect(src.takeStepInput().down).toBe(false);
  });

  it("Down held is down on every step", () => {
    const src = new InputSource();
    pad.buttons[PAD_DOWN]!.pressed = true;
    src.poll();
    expect(src.takeStepInput().down).toBe(true);
    expect(src.takeStepInput().down).toBe(true);
  });
});

describe("gamepad Down in the co-op mode", () => {
  it("the same tap is one act press, on the next step only", () => {
    const src = new InputSource({ keys: COOP_KEYS });
    dpadTapBetweenSteps(src);
    expect(src.takeCoopInput()).toMatchObject({ down: false, downPressed: true });
    expect(src.takeCoopInput()).toMatchObject({ down: false, downPressed: false });
  });

  it("Down held is one press, then only held; pressing again is a new press", () => {
    const src = new InputSource({ keys: COOP_KEYS });
    pad.buttons[PAD_DOWN]!.pressed = true;
    src.poll();
    expect(src.takeCoopInput()).toMatchObject({ down: true, downPressed: true });
    expect(src.takeCoopInput()).toMatchObject({ down: true, downPressed: false });
    src.poll();
    expect(src.takeCoopInput()).toMatchObject({ down: true, downPressed: false });
    pad.buttons[PAD_DOWN]!.pressed = false;
    src.poll();
    expect(src.takeCoopInput()).toMatchObject({ down: false, downPressed: false });
    pad.buttons[PAD_DOWN]!.pressed = true;
    src.poll();
    expect(src.takeCoopInput()).toMatchObject({ down: true, downPressed: true });
  });
});
