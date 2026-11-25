/** Messages between the placement screen and placementRoom.worker.ts. */
import type { ObjectKind, PlacedObject } from "@game/shared";

export interface RoomRequest {
  /** Increases with every request; replies to an older one are stale. */
  gen: number;
  /** Index of the map in RACE_LEVELS. */
  levelIndex: number;
  /** Everything on the map as this player sees it: the session's objects and their own pending ones. */
  objects: PlacedObject[];
  /** Kinds to check (the objects still in hand). */
  kinds: ObjectKind[];
}

export interface RoomReply {
  gen: number;
  kind: ObjectKind;
  /** Whether some cell would still accept this kind. */
  room: boolean;
}
