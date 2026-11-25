/**
 * "Is there still a cell where this object would be accepted?" On a crowded map late in a
 * game, an object can have no accepted cell left anywhere: the placement screen then
 * discards it so the player can validate the rest instead of waiting for the timer.
 *
 * The answer must match the session's own check (canPlaceAt, then PathGuard: a quick search
 * on the existing reach graph, and a full rebuild when the quick check says "blocked"), and
 * must not freeze the screen. So it is a generator that does one check per step:
 * 1. the quick check on every candidate cell (a fraction of a millisecond each), stopping at
 *    the first one accepted, which is the usual outcome;
 * 2. only if the quick check refuses every cell, the full check (a whole graph rebuild,
 *    up to a few hundred milliseconds each), most promising cells first, with a time cap:
 *    past it the object counts as having no room.
 * The placement screen runs it in a worker (placementRoom.worker.ts).
 */
import {
  buildReachGraph,
  canPlaceAt,
  DEFAULT_MOVEMENT,
  footprintCells,
  OBJECT_DEFS,
  prepareObjects,
  reachableWithout,
  type Dir,
  type Level,
  type ObjectKind,
  type PlacedObject,
  type ReachGraph,
} from "@game/shared";

/** Default time cap of the full checks, milliseconds (placement lasts 35 s). */
export const FULL_CHECK_BUDGET_MS = 12_000;

export interface FindRoomOptions {
  /** Reach graph for `objects`, when the caller already has it. */
  graph?: ReachGraph;
  /** Time cap of the full checks, milliseconds. */
  fullBudgetMs?: number;
  /** Clock, milliseconds (tests pass their own). */
  now?: () => number;
}

/** Every placement of `kind` that canPlaceAt allows, in each direction for a cannon. */
export function candidates(level: Level, objects: readonly PlacedObject[], kind: ObjectKind): PlacedObject[] {
  const dirs: Array<Dir | undefined> = OBJECT_DEFS[kind].rotatable ? [0, 1, 2, 3] : [undefined];
  const out: PlacedObject[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) {
      if (!canPlaceAt(level, objects, x, y)) continue;
      for (const dir of dirs) out.push(dir === undefined ? { id: 0, kind, x, y } : { id: 0, kind, x, y, dir });
    }
  }
  return out;
}

/**
 * Look for a placement of `kind` the session would accept with `objects` on the map.
 * Yields after every check; returns the first accepted placement, or null if there is none
 * (or the full checks ran out of time).
 */
export function* findRoom(
  level: Level,
  objects: readonly PlacedObject[],
  kind: ObjectKind,
  options: FindRoomOptions = {},
): Generator<void, PlacedObject | null, void> {
  const now = options.now ?? (() => performance.now());
  const cands = candidates(level, objects, kind);
  if (cands.length === 0) return null;
  const graph = options.graph ?? buildReachGraph(level, objects, DEFAULT_MOVEMENT);
  // A level that is already blocked (should not happen): the session accepts anything.
  if (!graph.reachable) return cands[0]!;
  yield;

  // 1. Quick check, as PathGuard does it: drop the edges through the object's footprint.
  const footprints: Array<Set<number>> = [];
  for (const c of cands) {
    const prepared = prepareObjects(level, [...objects, c]);
    const fp = new Set(footprintCells(prepared[prepared.length - 1]!, level.width));
    if (reachableWithout(graph, fp)) return c;
    footprints.push(fp);
    yield;
  }

  // 2. Full check. The quick check drops every edge that only grazes the cell; the cells
  // crossed by the fewest edges are the likeliest to pass once really simulated.
  const crossing = footprints.map((fp) => {
    let n = 0;
    for (const edges of graph.edges.values()) for (const e of edges) for (const cell of fp) if (e.cells.has(cell)) n++;
    return n;
  });
  const order = cands.map((_, i) => i).sort((a, b) => crossing[a]! - crossing[b]!);
  yield;
  const deadline = now() + (options.fullBudgetMs ?? FULL_CHECK_BUDGET_MS);
  for (const i of order) {
    if (now() > deadline) return null;
    if (buildReachGraph(level, [...objects, cands[i]!], DEFAULT_MOVEMENT).reachable) return cands[i]!;
    yield;
  }
  return null;
}

/** Run findRoom to the end in one go (tests and tools). */
export function findRoomNow(level: Level, objects: readonly PlacedObject[], kind: ObjectKind, options: FindRoomOptions = {}): PlacedObject | null {
  const it = findRoom(level, objects, kind, options);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}
