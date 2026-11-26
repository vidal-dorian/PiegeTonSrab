/**
 * Keyboard and gamepad input, read directly from the browser APIs.
 *
 * Keys are matched by physical position (KeyboardEvent.code), so the same keys work
 * on AZERTY and QWERTY: the key labelled Q on AZERTY is "KeyA".
 * Left: arrow left, Q/A. Right: arrow right, D. Jump: space, arrow up, Z/W.
 * Down (let go of a vine): arrow down, S.
 * Gamepad: left stick or d-pad to move, bottom face button (A / Cross) to jump,
 * d-pad down or stick pushed down to let go of a vine.
 */
import type { StepInput } from "@game/shared";

const LEFT_CODES = ["ArrowLeft", "KeyA"];
const RIGHT_CODES = ["ArrowRight", "KeyD"];
const JUMP_CODES = ["Space", "ArrowUp", "KeyW"];
/** "KeyS" is labelled S on both AZERTY and QWERTY. */
const DOWN_CODES = ["ArrowDown", "KeyS"];

/** Physical key codes (KeyboardEvent.code) for each action. */
export interface KeyMap {
  left: readonly string[];
  right: readonly string[];
  jump: readonly string[];
  down: readonly string[];
  restart: readonly string[];
}

/** The race mode's keys (no restart key: R turns a cannon there, and Ctrl+R must still reload). */
export const DEFAULT_KEYS: KeyMap = {
  left: LEFT_CODES,
  right: RIGHT_CODES,
  jump: JUMP_CODES,
  down: DOWN_CODES,
  restart: [],
};

/** The co-op mode's keys: the same, plus R held to restart the level. */
export const COOP_KEYS: KeyMap = { ...DEFAULT_KEYS, restart: ["KeyR"] };

/** Dev tool only: two players on one keyboard (left half, right half). */
export const SPLIT_KEYS: readonly KeyMap[] = [
  { left: ["KeyA"], right: ["KeyD"], jump: ["KeyW", "Space"], down: ["KeyS"], restart: ["KeyR"] },
  { left: ["ArrowLeft"], right: ["ArrowRight"], jump: ["ArrowUp"], down: ["ArrowDown"], restart: ["Delete", "End"] },
];

export interface InputOptions {
  /** Keys to listen to (default: all the game keys above). */
  keys?: KeyMap;
  /** Which gamepad: "first" (default) the first connected one, a number for that index, null for none. */
  pad?: number | "first" | null;
  /**
   * Start with the keys already held (default false). The co-op scene restarts (new level, new team,
   * resume) with a new InputSource, which never hears the keydown of a key held through it, and the
   * OS auto-repeats only the last key pressed: a direction held while tapping jump would be lost.
   */
  keepHeldKeys?: boolean;
}

/**
 * Keys physically held right now, whatever InputSource exists (or none, e.g. in the lobby). Its
 * listeners are added once per window: at load, or again when a test swaps the window.
 */
const heldKeys = new Set<string>();
let heldKeysWindow: unknown = null;

function trackHeldKeys(): void {
  if (typeof window === "undefined" || heldKeysWindow === window) return;
  heldKeysWindow = window;
  heldKeys.clear();
  window.addEventListener("keydown", (e: KeyboardEvent) => {
    if (!notAGameKey(e)) heldKeys.add(e.code);
  });
  window.addEventListener("keyup", (e: KeyboardEvent) => {
    heldKeys.delete(e.code);
  });
  window.addEventListener("blur", () => heldKeys.clear());
}
trackHeldKeys();

/** Typing in the tuning panel, or a browser shortcut (Ctrl, Cmd or Alt with a key: Ctrl+R reloads). */
function notAGameKey(e: KeyboardEvent): boolean {
  return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey;
}

/** Standard gamepad mapping: Back/Select, held to restart a co-op level. */
const PAD_RESTART = 8;

const STICK_DEADZONE = 0.35;
/** Stick down counts only past this and when mostly vertical, so pumping a swing diagonally doesn't drop. */
const STICK_DOWN_THRESHOLD = 0.6;
/** Standard gamepad mapping: https://w3c.github.io/gamepad/#remapping */
const PAD_JUMP_BUTTONS = [0, 1];
const PAD_LEFT = 14;
const PAD_DOWN = 13;
const PAD_RIGHT = 15;

/** One player's co-op input for a step, with the edges the co-op world needs. */
export interface CoopStepInput extends StepInput {
  /** Down went down since the previous step (act: door, key, terminal). */
  downPressed: boolean;
  restart: boolean;
}

export class InputSource {
  private keysDown = new Set<string>();
  private readonly left: Set<string>;
  private readonly right: Set<string>;
  private readonly jump: Set<string>;
  private readonly downKeys: Set<string>;
  private readonly restartKeys: Set<string>;
  private readonly pad: number | "first" | null;
  /** Latched until a simulation step consumes it, so a quick tap is never lost. */
  private jumpPressedLatch = false;
  /** Same latch for Down, so a tap shorter than a step still lets go of the vine. */
  private downPressedLatch = false;
  private padJumpWasDown = false;
  private listeners: Array<[string, (e: KeyboardEvent) => void]> = [];

  /** Extra key presses the scene wants to hear about (e.g. "KeyR" to respawn). */
  onKey: ((code: string) => void) | null = null;

  constructor(options: InputOptions = {}) {
    const keys = options.keys ?? DEFAULT_KEYS;
    this.left = new Set(keys.left);
    this.right = new Set(keys.right);
    this.jump = new Set(keys.jump);
    this.downKeys = new Set(keys.down);
    this.restartKeys = new Set(keys.restart);
    this.pad = options.pad === undefined ? "first" : options.pad;
    trackHeldKeys();
    // Held, not pressed: no jump or act press, no onKey.
    if (options.keepHeldKeys) for (const code of heldKeys) this.keysDown.add(code);
    const down = (e: KeyboardEvent) => {
      // Typing in the tuning panel must not move the character; a browser shortcut is no game key.
      if (notAGameKey(e)) return;
      // Stop arrows and space from scrolling the page.
      if (this.isGameKey(e.code)) e.preventDefault();
      // An auto-repeat still says the key is held: a key held down while the scene restarted
      // (a new InputSource) counts again. Only the first press is a press.
      this.keysDown.add(e.code);
      if (e.repeat) return;
      if (this.jump.has(e.code)) this.jumpPressedLatch = true;
      if (this.downKeys.has(e.code)) this.downPressedLatch = true;
      this.onKey?.(e.code);
    };
    const up = (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
    };
    const blur = () => this.keysDown.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur as () => void);
    this.listeners.push(["keydown", down], ["keyup", up], ["blur", blur as (e: KeyboardEvent) => void]);
  }

  destroy(): void {
    for (const [type, fn] of this.listeners) window.removeEventListener(type, fn as EventListener);
    this.listeners = [];
  }

  /** Call once per rendered frame, before running simulation steps. */
  poll(): void {
    const pad = this.gamepad();
    const padJumpDown = pad ? PAD_JUMP_BUTTONS.some((i) => pad.buttons[i]?.pressed) : false;
    if (padJumpDown && !this.padJumpWasDown) this.jumpPressedLatch = true;
    this.padJumpWasDown = padJumpDown;
    const padDown = pad ? this.padDownHeld(pad) : false;
    // Only the co-op mode reads this edge (its "act" press); the race path stays as it was.
    if (padDown && !this.padDownWasDown) this.padDownPressedLatch = true;
    this.padDownWasDown = padDown;
  }

  /** Input for the next simulation step. Consumes the jump and down presses. */
  takeStepInput(): StepInput {
    const pad = this.gamepad();
    const stickX = pad?.axes[0] ?? 0;
    const padLeft = stickX < -STICK_DEADZONE || pad?.buttons[PAD_LEFT]?.pressed === true;
    const padRight = stickX > STICK_DEADZONE || pad?.buttons[PAD_RIGHT]?.pressed === true;
    const padDown = pad ? this.padDownHeld(pad) : false;

    const left = anyDown(this.keysDown, this.left) || padLeft;
    const right = anyDown(this.keysDown, this.right) || padRight;
    const jumpHeld = anyDown(this.keysDown, this.jump) || this.padJumpWasDown;

    const jumpPressed = this.jumpPressedLatch;
    this.jumpPressedLatch = false;
    const down = anyDown(this.keysDown, this.downKeys) || padDown || this.downPressedLatch;
    this.downPressedLatch = false;
    this.padDownPressedLatch = false;
    // Pressing both directions cancels out, like most platformers.
    return { left: left && !right, right: right && !left, jumpHeld, jumpPressed, down };
  }

  /**
   * Input for the next co-op step: like takeStepInput, plus the edge of Down (act) and whether
   * restart is held. Consumes the jump and down presses.
   */
  takeCoopInput(): CoopStepInput {
    const downPressed = this.downPressedLatch || this.padDownPressedLatch;
    const base = this.takeStepInput();
    const pad = this.gamepad();
    const restart = anyDown(this.keysDown, this.restartKeys) || pad?.buttons[PAD_RESTART]?.pressed === true;
    return { ...base, down: base.down, downPressed, restart };
  }

  private padDownWasDown = false;
  /** A gamepad Down press since the last step, for the co-op "act" edge only. */
  private padDownPressedLatch = false;

  private padDownHeld(pad: Gamepad): boolean {
    const stickX = pad.axes[0] ?? 0;
    const stickY = pad.axes[1] ?? 0;
    return (stickY > STICK_DOWN_THRESHOLD && Math.abs(stickY) > Math.abs(stickX)) || pad.buttons[PAD_DOWN]?.pressed === true;
  }

  private isGameKey(code: string): boolean {
    return (
      this.left.has(code) ||
      this.right.has(code) ||
      this.jump.has(code) ||
      this.downKeys.has(code) ||
      this.restartKeys.has(code)
    );
  }

  private gamepad(): Gamepad | null {
    if (this.pad === null) return null;
    const pads = navigator.getGamepads?.() ?? [];
    if (this.pad === "first") {
      for (const p of pads) if (p && p.connected) return p;
      return null;
    }
    const p = pads[this.pad];
    return p && p.connected ? p : null;
  }
}

function anyDown(down: Set<string>, codes: Set<string>): boolean {
  for (const c of codes) if (down.has(c)) return true;
  return false;
}
