/**
 * Worker for the placement screen: says, for each object kind still in the player's hand,
 * whether it has any cell left where the session would accept it (see placementRoom.ts).
 * Off the main thread because a full reach check can take a few hundred milliseconds.
 *
 * A newer request replaces the one in progress: the scan gives the event loop a turn every
 * few milliseconds and stops as soon as it sees a newer request.
 */
import { buildReachGraph, DEFAULT_MOVEMENT, parseLevel, RACE_LEVELS, type Level } from "@game/shared";
import { findRoom } from "./placementRoom";
import type { RoomReply, RoomRequest } from "./placementRoomProtocol";

/** Longest stretch of work between two looks at the message queue, milliseconds. */
const SLICE_MS = 8;

// Typed by hand: the client's tsconfig uses the DOM library, not the WebWorker one.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<RoomRequest>) => void) | null;
  postMessage(msg: RoomReply): void;
};

let latest = 0;
let cached: { index: number; level: Level } | null = null;

scope.onmessage = (e) => {
  latest = e.data.gen;
  void run(e.data);
};

function levelFor(index: number): Level {
  if (cached?.index !== index) cached = { index, level: parseLevel(RACE_LEVELS[index] ?? RACE_LEVELS[0]!) };
  return cached.level;
}

const breathe = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function run(req: RoomRequest): Promise<void> {
  // Let a burst of requests settle (several clicks in a row): only the last one is worked on.
  await breathe();
  if (req.gen !== latest) return;
  const level = levelFor(req.levelIndex);
  const graph = buildReachGraph(level, req.objects, DEFAULT_MOVEMENT);
  for (const kind of req.kinds) {
    const it = findRoom(level, req.objects, kind, { graph });
    let slice = performance.now();
    for (;;) {
      const r = it.next();
      if (r.done) {
        scope.postMessage({ gen: req.gen, kind, room: r.value !== null });
        break;
      }
      if (performance.now() - slice > SLICE_MS) {
        await breathe();
        if (req.gen !== latest) return;
        slice = performance.now();
      }
    }
  }
}
