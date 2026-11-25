/**
 * One player's input for one step of the co-op world, packed in a small integer: only these bits
 * travel over the network. Held bits describe what is pressed during the step; press bits are the
 * edges ("went down since the previous step") and must only be set on the step they happened, so a
 * quick tap is never lost and never repeated.
 */
import type { StepInput } from "../movement/controller";

export const BIT_LEFT = 1;
export const BIT_RIGHT = 2;
export const BIT_JUMP = 4;
export const BIT_JUMP_PRESS = 8;
export const BIT_DOWN = 16;
export const BIT_DOWN_PRESS = 32;
/** R (or the gamepad's Select) held: restart the level once held long enough. */
export const BIT_RESTART = 64;

/** Bits that describe a held state (repeated while the key stays down). */
export const HELD_BITS = BIT_LEFT | BIT_RIGHT | BIT_JUMP | BIT_DOWN | BIT_RESTART;
/** Bits that describe an edge (sent once). */
export const PRESS_BITS = BIT_JUMP_PRESS | BIT_DOWN_PRESS;
export const ALL_BITS = HELD_BITS | PRESS_BITS;

export interface CoopInput extends StepInput {
  /** Down went down this step: act (enter or leave the door, take the key, use a terminal). */
  downPressed: boolean;
  restart: boolean;
}

export function encodeInput(i: StepInput & { downPressed?: boolean; restart?: boolean }): number {
  let b = 0;
  if (i.left) b |= BIT_LEFT;
  if (i.right) b |= BIT_RIGHT;
  if (i.jumpHeld) b |= BIT_JUMP;
  if (i.jumpPressed) b |= BIT_JUMP_PRESS;
  if (i.down) b |= BIT_DOWN;
  if (i.downPressed) b |= BIT_DOWN_PRESS;
  if (i.restart) b |= BIT_RESTART;
  return b;
}

export function decodeInput(b: number): CoopInput {
  const left = (b & BIT_LEFT) !== 0;
  const right = (b & BIT_RIGHT) !== 0;
  return {
    // Both directions cancel out, like the race mode.
    left: left && !right,
    right: right && !left,
    jumpHeld: (b & BIT_JUMP) !== 0,
    jumpPressed: (b & BIT_JUMP_PRESS) !== 0,
    down: (b & BIT_DOWN) !== 0,
    downPressed: (b & BIT_DOWN_PRESS) !== 0,
    restart: (b & BIT_RESTART) !== 0,
  };
}

/** The held part of an input, used to predict or fill in a player's next steps (never repeats a press). */
export function heldOnly(b: number): number {
  return b & HELD_BITS;
}
