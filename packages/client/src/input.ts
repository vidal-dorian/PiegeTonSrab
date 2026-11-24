/**
 * Keyboard and gamepad input, read directly from the browser APIs.
 *
 * Keys are matched by physical position (KeyboardEvent.code), so the same keys work
 * on AZERTY and QWERTY: the key labelled Q on AZERTY is "KeyA".
 * Left: arrow left, Q/A. Right: arrow right, D. Jump: space, arrow up, Z/W.
 * Gamepad: left stick or d-pad to move, bottom face button (A / Cross) to jump.
 */
import type { StepInput } from "./character/controller";

const LEFT_CODES = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_CODES = new Set(["ArrowRight", "KeyD"]);
const JUMP_CODES = new Set(["Space", "ArrowUp", "KeyW"]);

const STICK_DEADZONE = 0.35;
/** Standard gamepad mapping: https://w3c.github.io/gamepad/#remapping */
const PAD_JUMP_BUTTONS = [0, 1];
const PAD_LEFT = 14;
const PAD_RIGHT = 15;

export class InputSource {
  private keysDown = new Set<string>();
  /** Latched until a simulation step consumes it, so a quick tap is never lost. */
  private jumpPressedLatch = false;
  private padJumpWasDown = false;
  private listeners: Array<[string, (e: KeyboardEvent) => void]> = [];

  /** Extra key presses the scene wants to hear about (e.g. "KeyR" to respawn). */
  onKey: ((code: string) => void) | null = null;

  constructor() {
    const down = (e: KeyboardEvent) => {
      // Typing in the tuning panel must not move the character.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Stop arrows and space from scrolling the page.
      if (isGameKey(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keysDown.add(e.code);
      if (JUMP_CODES.has(e.code)) this.jumpPressedLatch = true;
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
    const pad = firstGamepad();
    const padJumpDown = pad ? PAD_JUMP_BUTTONS.some((i) => pad.buttons[i]?.pressed) : false;
    if (padJumpDown && !this.padJumpWasDown) this.jumpPressedLatch = true;
    this.padJumpWasDown = padJumpDown;
  }

  /** Input for the next simulation step. Consumes the jump press. */
  takeStepInput(): StepInput {
    const pad = firstGamepad();
    const stickX = pad?.axes[0] ?? 0;
    const padLeft = stickX < -STICK_DEADZONE || pad?.buttons[PAD_LEFT]?.pressed === true;
    const padRight = stickX > STICK_DEADZONE || pad?.buttons[PAD_RIGHT]?.pressed === true;

    const left = anyDown(this.keysDown, LEFT_CODES) || padLeft;
    const right = anyDown(this.keysDown, RIGHT_CODES) || padRight;
    const jumpHeld = anyDown(this.keysDown, JUMP_CODES) || this.padJumpWasDown;

    const jumpPressed = this.jumpPressedLatch;
    this.jumpPressedLatch = false;
    // Pressing both directions cancels out, like most platformers.
    return { left: left && !right, right: right && !left, jumpHeld, jumpPressed };
  }
}

function isGameKey(code: string): boolean {
  return LEFT_CODES.has(code) || RIGHT_CODES.has(code) || JUMP_CODES.has(code);
}

function anyDown(down: Set<string>, codes: Set<string>): boolean {
  for (const c of codes) if (down.has(c)) return true;
  return false;
}

function firstGamepad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}
