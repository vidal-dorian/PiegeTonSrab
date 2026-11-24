/**
 * Objects players place in the level.
 *
 * Network rule (see HANDOFF.md): objects are never synchronised. Everything about an
 * object at a given moment must be a pure function of its placement and of the round
 * clock (seconds since the round started), so every client computes the same thing.
 * Never accumulate object state frame by frame.
 *
 * First objects (build step 2): saw, spikes, platform.
 */
import type { Level } from "./level";

export type ObjectKind = "saw" | "spikes" | "platform";

/** Colour family; the colour tells the player what an object does. */
export type ObjectFamily = "kill" | "help" | "neutral";

export interface ObjectDef {
  kind: ObjectKind;
  family: ObjectFamily;
  /** In-game name, French. */
  name: string;
  /** Blocks movement like level terrain. */
  solid: boolean;
}

export const OBJECT_DEFS: Record<ObjectKind, ObjectDef> = {
  saw: { kind: "saw", family: "kill", name: "Scie", solid: false },
  spikes: { kind: "spikes", family: "kill", name: "Pics", solid: false },
  platform: { kind: "platform", family: "neutral", name: "Plateforme", solid: true },
};

export const OBJECT_KINDS = Object.keys(OBJECT_DEFS) as ObjectKind[];

/** An object in the level, occupying the cell (x, y). */
export interface PlacedObject {
  id: number;
  kind: ObjectKind;
  x: number;
  y: number;
  /** Player who placed it; absent for objects that are part of a hand-made level. */
  ownerId?: string;
}

/** Saw: a disc centred in its cell. Visual radius, in cells. */
export const SAW_RADIUS = 0.45;
/** Saw spin, turns per second (visual only). */
export const SAW_SPIN = 1.5;
/** Spikes fill the bottom part of their cell: this is their height, in cells. */
export const SPIKES_HEIGHT = 0.45;

/** Shapes that kill, in cells. */
export type Hazard =
  | { shape: "circle"; cx: number; cy: number; r: number }
  /** onlyWhenFalling: kills only a body that is not moving up (spikes kill when you land on them). */
  | { shape: "rect"; x: number; y: number; w: number; h: number; onlyWhenFalling: boolean };

/** What an object kills with at round time `t` (seconds). Empty for harmless objects. */
export function hazardsOf(obj: PlacedObject, _t: number): Hazard[] {
  switch (obj.kind) {
    case "saw":
      return [{ shape: "circle", cx: obj.x + 0.5, cy: obj.y + 0.5, r: SAW_RADIUS }];
    case "spikes":
      return [
        { shape: "rect", x: obj.x, y: obj.y + 1 - SPIKES_HEIGHT, w: 1, h: SPIKES_HEIGHT, onlyWhenFalling: true },
      ];
    case "platform":
      return [];
  }
}

/** Saw rotation at round time `t`, radians. Deterministic so every client draws the same angle. */
export function sawAngle(t: number): number {
  return t * SAW_SPIN * Math.PI * 2;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whether a body box touches a hazard. `vy` is the body's vertical speed (negative = up). */
export function boxHitsHazard(box: Box, hz: Hazard, vy: number): boolean {
  if (hz.shape === "circle") {
    const nx = Math.max(box.x, Math.min(hz.cx, box.x + box.w));
    const ny = Math.max(box.y, Math.min(hz.cy, box.y + box.h));
    const dx = hz.cx - nx;
    const dy = hz.cy - ny;
    return dx * dx + dy * dy < hz.r * hz.r;
  }
  if (hz.onlyWhenFalling && vy < 0) return false;
  return box.x < hz.x + hz.w && box.x + box.w > hz.x && box.y < hz.y + hz.h && box.y + box.h > hz.y;
}

/** The first object whose hazards touch the box at round time `t`, or null. */
export function findKiller(objects: readonly PlacedObject[], box: Box, vy: number, t: number): PlacedObject | null {
  for (const obj of objects) {
    for (const hz of hazardsOf(obj, t)) {
      if (boxHitsHazard(box, hz, vy)) return obj;
    }
  }
  return null;
}

/** A copy of the level where solid objects (platforms) are part of the terrain. */
export function withSolidObjects(level: Level, objects: readonly PlacedObject[]): Level {
  const solid = level.solid.slice();
  for (const obj of objects) {
    if (!OBJECT_DEFS[obj.kind].solid) continue;
    if (obj.x < 0 || obj.x >= level.width || obj.y < 0 || obj.y >= level.height) continue;
    solid[obj.y * level.width + obj.x] = true;
  }
  return { ...level, solid };
}

/**
 * Basic placement rule: inside the level, on an empty cell, not on the start or the finish,
 * not on another object. The "finish must stay reachable" check comes with build step 3.
 */
export function canPlaceAt(level: Level, objects: readonly PlacedObject[], x: number, y: number): boolean {
  if (x < 0 || x >= level.width || y < 0 || y >= level.height) return false;
  if (level.solid[y * level.width + x]) return false;
  if (x === level.start.x && y === level.start.y) return false;
  if (level.finish && x === level.finish.x && y === level.finish.y) return false;
  return !objects.some((o) => o.x === x && o.y === y);
}
