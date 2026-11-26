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

/** A window that keeps its listeners, so a test can send it key events. */
function keyWindow() {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  vi.stubGlobal("window", {
    addEventListener: (type: string, fn: (e: unknown) => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: () => {},
  });
  vi.stubGlobal("HTMLInputElement", class {});
  vi.stubGlobal("HTMLTextAreaElement", class {});
  type Mods = { repeat?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean };
  return (type: "keydown" | "keyup", code: string, mods: Mods = {}) => {
    const e = {
      code,
      target: null,
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      ...mods,
      defaultPrevented: false,
      preventDefault() {
        e.defaultPrevented = true;
      },
    };
    for (const fn of listeners.get(type) ?? []) fn(e);
    return e;
  };
}

describe("a key held while the scene restarts", () => {
  it("counts as held again from its auto-repeat, without a new press", () => {
    const send = keyWindow();
    const before = new InputSource({ keys: COOP_KEYS });
    send("keydown", "KeyD");
    send("keydown", "KeyW");
    // The co-op scene restarts (new level, new team, resume) with the keys still down: the new
    // InputSource only gets their auto-repeats.
    before.destroy();
    const src = new InputSource({ keys: COOP_KEYS });
    const heard: string[] = [];
    src.onKey = (code) => heard.push(code);
    expect(src.takeCoopInput()).toMatchObject({ right: false, jumpHeld: false });
    send("keydown", "KeyD", { repeat: true });
    send("keydown", "KeyW", { repeat: true });
    send("keydown", "KeyS", { repeat: true });
    send("keydown", "KeyR", { repeat: true });
    // Held again, but a repeat is no new press (no jump, no act).
    expect(src.takeCoopInput()).toMatchObject({ right: true, jumpHeld: true, jumpPressed: false, down: true, downPressed: false, restart: true });
    expect(heard).toEqual([]);
    send("keyup", "KeyD");
    expect(src.takeCoopInput()).toMatchObject({ right: false, jumpHeld: true });
  });

  it("in the race mode too, and a repeat is still no jump press", () => {
    const send = keyWindow();
    const src = new InputSource();
    send("keydown", "ArrowLeft", { repeat: true });
    send("keydown", "Space", { repeat: true });
    expect(src.takeStepInput()).toEqual({ left: true, right: false, jumpHeld: true, jumpPressed: false, down: false });
  });
});

describe("Ctrl, Cmd or Alt with a game key", () => {
  it("Ctrl+R and Cmd+R still reload the page and do not hold the co-op restart", () => {
    const send = keyWindow();
    const src = new InputSource({ keys: COOP_KEYS });
    for (const mod of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      expect(send("keydown", "KeyR", mod).defaultPrevented).toBe(false);
      expect(src.takeCoopInput().restart).toBe(false);
    }
    // R alone is the restart key.
    expect(send("keydown", "KeyR").defaultPrevented).toBe(true);
    expect(src.takeCoopInput().restart).toBe(true);
  });

  it("a modified key is no move and no press; unmodified keys work as before", () => {
    const send = keyWindow();
    const src = new InputSource();
    const heard: string[] = [];
    src.onKey = (code) => heard.push(code);
    send("keydown", "Space", { ctrlKey: true });
    send("keydown", "ArrowRight", { altKey: true });
    expect(src.takeStepInput()).toEqual({ left: false, right: false, jumpHeld: false, jumpPressed: false, down: false });
    expect(heard).toEqual([]);
    expect(send("keydown", "Space").defaultPrevented).toBe(true);
    // R is no game key in the race mode (it turns a cannon through onKey): its default stays.
    expect(send("keydown", "KeyR").defaultPrevented).toBe(false);
    expect(src.takeStepInput()).toEqual({ left: false, right: false, jumpHeld: true, jumpPressed: true, down: false });
    expect(heard).toEqual(["Space", "KeyR"]);
  });
});
