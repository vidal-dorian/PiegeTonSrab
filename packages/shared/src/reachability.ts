/**
 * "Can the finish still be reached?" (see HANDOFF.md: a path from start to finish must
 * always exist, so one player cannot wall off the level for the rest of the game).
 *
 * How it works:
 * 1. A node is a cell the character can stand in: empty, with solid ground below.
 * 2. From each node, a fixed list of moves is played with the real character controller
 *    and the real tuning: walk off the edge, jump now or at the last moment, with
 *    different jump heights and air steering, plus wall-jump chains when a wall is touched.
 *    A move ends when the character lands (an edge to the landing node), touches the
 *    finish, dies, or takes too long.
 * 3. A breadth-first search from the start says whether the finish is reachable.
 *
 * Every edge remembers which cells the body passed through. To test a placement quickly,
 * the edges crossing the candidate cell are removed and the search is run again on the
 * existing graph, with no simulation. That is conservative (an edge only grazing the cell
 * is dropped too), so when it says "blocked" the full simulation is re-run with the
 * object really placed, and that answer is final.
 *
 * Safety margin: traps are treated as PATH_SAFETY_MARGIN bigger than they are, so the path
 * that remains never depends on threading a pixel-wide gap between two traps.
 *
 * Objects (build step 5):
 * - A cannon's whole line of fire counts as deadly, so the answer never depends on timing.
 * - Springs are played for real by the controller: landing on one (or running into a
 *   sideways one, or bumping a ceiling one) throws the character and the move goes on until
 *   it lands somewhere else. The top of an upward spring is never a place to stand.
 * - Spikes are solid blocks that kill through their pointed face only (objects.ts).
 * - Vines: only their anchor block counts (it is solid). The check never uses a vine to get
 *   somewhere, so a vine can only add ways through, never be required.
 *
 * Limits: moves are a fixed sample; a path needing a very precise trick may be missed, which
 * makes the check strict rather than lenient.
 */
import { boxOverlapsSolid, cellSpan, isBouncyCell, isSolidCell, type Level } from "./level";
import { CharacterController, type StepInput } from "./movement/controller";
import { HAZARD_INSET, SIM_HZ, type MovementTuning } from "./movement/tuning";
import {
  boxHitsHazard,
  footprintCells,
  OBJECT_DEFS,
  prepareObjects,
  staticHazards,
  withSolidObjects,
  type Hazard,
  type PlacedObject,
} from "./objects";

const DT = 1 / SIM_HZ;

/**
 * For this check, traps are treated as this much bigger on every side than they really are
 * (cells). The path that must remain is then one a player can take without pixel-perfect
 * moves: a gap between two saws that only a frame-perfect jump gets through does not count.
 */
export const PATH_SAFETY_MARGIN = 0.15;
/** Longest move simulated, seconds. */
const MAX_MOVE_TIME = 4;
/** A walk that has not left the ground after this long is dropped, seconds. */
const MAX_WALK_TIME = 2;
const MAX_WALL_JUMPS = 10;
/** Pseudo node id for "touched the finish". */
const FINISH = -1;

type Steer = "keep" | "stop" | "late";
type WallMode = "none" | "climb" | "bounce";

interface Move {
  dir: -1 | 0 | 1;
  /** none: walk off the edge without jumping; now: jump at once; edge: run and jump at the last moment. */
  trigger: "none" | "now" | "edge";
  /** How long jump is held, seconds (1 = full jump). */
  hold: number;
  /** Air steering: keep pressing, stop pressing once airborne, or wait a moment before pressing again. */
  steer: Steer;
}

const LATE_STEER_DELAY = 0.15;

function buildMoves(): Move[] {
  const moves: Move[] = [];
  for (const dir of [-1, 1] as const) {
    moves.push({ dir, trigger: "none", hold: 0, steer: "keep" });
    for (const trigger of ["now", "edge"] as const) {
      for (const hold of [0.08, 0.18, 1]) {
        for (const steer of ["keep", "stop", "late"] as const) moves.push({ dir, trigger, hold, steer });
      }
    }
  }
  for (const hold of [0.08, 0.18, 1]) moves.push({ dir: 0, trigger: "now", hold, steer: "keep" });
  return moves;
}

const MOVES = buildMoves();

interface Edge {
  to: number;
  /** Cells (y * width + x) the body overlapped during the move. */
  cells: Set<number>;
}

export interface ReachGraph {
  width: number;
  start: number;
  /** Outgoing edges of every explored node. */
  edges: Map<number, Edge[]>;
  /** Whether the finish is reachable in this graph. */
  reachable: boolean;
}

/** Hazards indexed by the cells their bounding box overlaps, for fast lookups. */
class HazardIndex {
  private byCell = new Map<number, Hazard[]>();

  constructor(
    private width: number,
    objects: readonly PlacedObject[],
  ) {
    for (const obj of objects) {
      for (const hz of staticHazards(obj)) {
        const b = hz.shape === "circle" ? { x: hz.cx - hz.r, y: hz.cy - hz.r, w: hz.r * 2, h: hz.r * 2 } : hz;
        const [x0, x1] = cellSpan(b.x, b.w);
        const [y0, y1] = cellSpan(b.y, b.h);
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const key = y * width + x;
            const list = this.byCell.get(key);
            if (list) list.push(hz);
            else this.byCell.set(key, [hz]);
          }
        }
      }
    }
  }

  hits(x: number, y: number, w: number, h: number, vy: number, vx: number): boolean {
    if (this.byCell.size === 0) return false;
    const [x0, x1] = cellSpan(x, w);
    const [y0, y1] = cellSpan(y, h);
    const box = { x, y, w, h };
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.byCell.get(cy * this.width + cx);
        if (list && list.some((hz) => boxHitsHazard(box, hz, vy, vx))) return true;
      }
    }
    return false;
  }
}

class Explorer {
  private collision: Level;
  private hazards: HazardIndex;
  private c: CharacterController;
  private w: number;
  private h: number;

  constructor(
    private level: Level,
    objects: readonly PlacedObject[],
    tuning: MovementTuning,
    alreadyPrepared: boolean,
  ) {
    const prepared = alreadyPrepared ? objects : prepareObjects(level, objects);
    this.collision = withSolidObjects(level, prepared);
    this.hazards = new HazardIndex(level.width, prepared);
    this.c = new CharacterController(this.collision, tuning);
    this.w = tuning.bodyWidth;
    this.h = tuning.bodyHeight;
  }

  key(cx: number, cy: number): number {
    return cy * this.level.width + cx;
  }

  isStandCell(cx: number, cy: number): boolean {
    if (cx < 0 || cx >= this.level.width || cy < 0 || cy >= this.level.height) return false;
    if (isSolidCell(this.collision, cx, cy) || !isSolidCell(this.collision, cx, cy + 1)) return false;
    // Nobody stands on a spring: landing on it throws you up.
    if (isBouncyCell(this.collision, cx, cy + 1)) return false;
    const x = cx + (1 - this.w) / 2;
    const y = cy + 1 - this.h;
    return !boxOverlapsSolid(this.collision, x, y, this.w, this.h) && !this.hitsHazard(x, y, 0, 0);
  }

  private hitsHazard(x: number, y: number, vy: number, vx: number): boolean {
    // Traps count as PATH_SAFETY_MARGIN bigger than they are, so the remaining path is comfortable.
    const inset = HAZARD_INSET - PATH_SAFETY_MARGIN;
    return this.hazards.hits(x + inset, y + inset, this.w - 2 * inset, this.h - 2 * inset, vy, vx);
  }

  private touchesFinish(): boolean {
    const f = this.level.finish;
    if (!f) return false;
    const c = this.c;
    return c.x < f.x + 1 && c.x + this.w > f.x && c.y < f.y + 1 && c.y + this.h > f.y;
  }

  private isFinishCell(cx: number, cy: number): boolean {
    const f = this.level.finish;
    return f !== null && f.x === cx && f.y === cy;
  }

  edgesFrom(cx: number, cy: number): Edge[] {
    const edges: Edge[] = [];
    if (this.isFinishCell(cx, cy)) return [{ to: FINISH, cells: new Set([this.key(cx, cy)]) }];

    // Walking to a neighbouring stand cell on the same row.
    for (const d of [-1, 1]) {
      const nx = cx + d;
      if (!this.isStandCell(nx, cy)) continue;
      const y = cy + 1 - this.h;
      let safe = true;
      for (let s = 0; s <= 10 && safe; s++) {
        const x = cx + (1 - this.w) / 2 + (d * s) / 10;
        if (this.hitsHazard(x, y, 0, d)) safe = false;
      }
      if (safe) edges.push({ to: this.key(nx, cy), cells: new Set([this.key(cx, cy), this.key(nx, cy)]) });
    }

    for (const move of MOVES) {
      const first = this.simulate(cx, cy, move, "none");
      if (first.result !== null) edges.push({ to: first.result, cells: first.cells });
      if (first.touchedWall) {
        for (const mode of ["climb", "bounce"] as const) {
          const r = this.simulate(cx, cy, move, mode);
          if (r.result !== null) edges.push({ to: r.result, cells: r.cells });
        }
      }
    }
    return edges;
  }

  /** Play one move from a stand cell. result: landing node, FINISH, or null (died / gave up). */
  private simulate(
    cx: number,
    cy: number,
    move: Move,
    wallMode: WallMode,
  ): { result: number | null; cells: Set<number>; touchedWall: boolean } {
    const c = this.c;
    const width = this.level.width;
    c.standInCell(cx, cy);
    const cells = new Set<number>();
    let touchedWall = false;
    let airborne = false;
    let airTime = 0;
    let jumpStart = move.trigger === "now" ? 0 : -1;
    let wallJumps = 0;
    let steerOverride: -1 | 1 | null = null;
    let stuckTime = 0;

    for (let t = 0; t < MAX_MOVE_TIME; t += DT) {
      // --- Choose this step's input -----------------------------------------
      let jumpPressed = false;
      if (move.trigger === "now" && t === 0) jumpPressed = true;
      if (move.trigger === "edge" && jumpStart < 0 && !c.grounded) {
        jumpPressed = true; // first step off the ground: coyote time makes this jump legal
        jumpStart = t;
      }
      if (wallMode !== "none" && !c.grounded && c.wallSide !== 0 && wallJumps < MAX_WALL_JUMPS && c.vy > -2) {
        jumpPressed = true;
        wallJumps++;
        jumpStart = t;
        steerOverride = wallMode === "climb" ? c.wallSide : c.wallSide === 1 ? -1 : 1;
      }
      const jumpHeld = jumpStart >= 0 && (t - jumpStart < move.hold || wallJumps > 0);

      let dir: number = move.dir;
      if (steerOverride !== null) dir = steerOverride;
      else if (airborne && move.steer === "stop") dir = 0;
      else if (airborne && move.steer === "late" && airTime < LATE_STEER_DELAY) dir = 0;

      const input: StepInput = { left: dir < 0, right: dir > 0, jumpHeld, jumpPressed };
      c.step(DT, input);

      // --- Record and check ---------------------------------------------------
      // Record the cells touched by the body grown to the size used for trap checks, so that
      // a trap in any cell not recorded here cannot affect this move (pruning stays sound).
      const grow = Math.max(0, PATH_SAFETY_MARGIN - HAZARD_INSET);
      const [x0, x1] = cellSpan(c.x - grow, this.w + 2 * grow);
      const [y0, y1] = cellSpan(c.y - grow, this.h + 2 * grow);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.add(y * width + x);

      if (c.fellOut || this.hitsHazard(c.x, c.y, c.vy, c.vx)) return { result: null, cells, touchedWall };
      if (this.touchesFinish()) return { result: FINISH, cells, touchedWall };
      if (!c.grounded && c.wallSide !== 0) touchedWall = true;

      if (!c.grounded) {
        airborne = true;
        airTime += DT;
      } else if (airborne) {
        const landed = this.landingCell();
        return { result: landed, cells, touchedWall };
      } else {
        // Still walking: give up if blocked or walking for too long.
        stuckTime = c.vx === 0 ? stuckTime + DT : 0;
        if (stuckTime > 0.15 || t > MAX_WALK_TIME) return { result: null, cells, touchedWall };
      }
    }
    return { result: null, cells, touchedWall };
  }

  /** The stand cell the character just landed in. */
  private landingCell(): number | null {
    const c = this.c;
    const cy = Math.floor(c.y + this.h - 1e-3);
    const centre = Math.floor(c.x + this.w / 2);
    const [x0, x1] = cellSpan(c.x, this.w);
    for (const cx of [centre, x0, x1]) {
      if (this.isStandCell(cx, cy)) return this.key(cx, cy);
    }
    return null;
  }
}

/**
 * Explore every node reachable from the start and record all edges.
 * `alreadyPrepared`: use the objects' cannon and vine ranges as given instead of measuring
 * them again (the race keeps the ranges measured when it started).
 */
export function buildReachGraph(
  level: Level,
  objects: readonly PlacedObject[],
  tuning: MovementTuning,
  alreadyPrepared = false,
): ReachGraph {
  const ex = new Explorer(level, objects, tuning, alreadyPrepared);
  const start = ex.key(level.start.x, level.start.y);
  const edges = new Map<number, Edge[]>();
  let reachable = false;
  const queue = [start];
  edges.set(start, []);
  while (queue.length > 0) {
    const node = queue.shift()!;
    const out = ex.edgesFrom(node % level.width, Math.floor(node / level.width));
    edges.set(node, out);
    for (const e of out) {
      if (e.to === FINISH) reachable = true;
      else if (!edges.has(e.to)) {
        edges.set(e.to, []);
        queue.push(e.to);
      }
    }
  }
  return { width: level.width, start, edges, reachable };
}

/** Search the existing graph, ignoring every edge that passes through one of `blockedCells`. */
export function reachableWithout(graph: ReachGraph, blockedCells: ReadonlySet<number>): boolean {
  return reachableFrom(graph, graph.start, blockedCells);
}

/** Same search from another node of the graph (a node it never explored has no way out). */
export function reachableFrom(graph: ReachGraph, from: number, blockedCells: ReadonlySet<number>): boolean {
  const seen = new Set<number>([from]);
  const queue = [from];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const e of graph.edges.get(node) ?? []) {
      if (crosses(e.cells, blockedCells)) continue;
      if (e.to === FINISH) return true;
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return false;
}

/** Every explored node from which the finish can be reached without crossing `blockedCells`. */
function cellsReachingFinish(graph: ReachGraph, blockedCells: ReadonlySet<number>): Set<number> {
  const into = new Map<number, number[]>();
  for (const [from, edges] of graph.edges) {
    for (const e of edges) {
      if (crosses(e.cells, blockedCells)) continue;
      const list = into.get(e.to);
      if (list) list.push(from);
      else into.set(e.to, [from]);
    }
  }
  const seen = new Set<number>();
  const queue = [FINISH];
  while (queue.length > 0) {
    const node = queue.pop()!;
    for (const prev of into.get(node) ?? []) {
      if (seen.has(prev)) continue;
      seen.add(prev);
      queue.push(prev);
    }
  }
  return seen;
}

function crosses(cells: ReadonlySet<number>, blocked: ReadonlySet<number>): boolean {
  for (const b of blocked) if (cells.has(b)) return true;
  return false;
}

/**
 * Validates placements one after the other against a level, keeping the finish reachable.
 * Used by the server at the end of the placement step (placements are applied in order and
 * any that would cut the last path is refused) and for blocks placed by dead players.
 *
 * It builds the graph once, then for each accepted object only adds its cell to a blocked
 * set; the full simulation is re-run only when the quick check is not enough.
 */
export interface PathGuardOptions {
  /**
   * Keep the cannon and vine ranges the objects already have, and never measure them again
   * (the race: lines were fixed when it started, dead players' blocks don't stop balls).
   * Objects must then come already prepared.
   */
  frozenRanges?: boolean;
  /** The graph for `objects`, when the caller already has it. */
  graph?: ReachGraph;
}

export class PathGuard {
  private graph: ReachGraph;
  private blocked = new Set<number>();
  private current: PlacedObject[];
  private frozen: boolean;

  constructor(
    private level: Level,
    objects: readonly PlacedObject[],
    private tuning: MovementTuning,
    options: PathGuardOptions = {},
  ) {
    this.current = [...objects];
    this.frozen = options.frozenRanges === true;
    this.graph = options.graph ?? buildReachGraph(level, this.current, tuning, this.frozen);
  }

  /**
   * Whether the finish stays reachable from each of `fromCells` (stand cells, y * width + x)
   * once `candidate` is added. Quick check only, on the current graph: conservative, never
   * rebuilds (it runs on the server during the race). Cells the graph never reached, or
   * from which the finish was already out of reach, are ignored.
   */
  keepsPathFrom(fromCells: readonly number[], candidate: PlacedObject): boolean {
    if (!this.graph.reachable) return true;
    const blocked = new Set(this.blocked);
    for (const c of this.footprint(candidate)) blocked.add(c);
    // Two backward sweeps from the finish, however many cells are asked about.
    const before = cellsReachingFinish(this.graph, this.blocked);
    const after = cellsReachingFinish(this.graph, blocked);
    for (const from of fromCells) {
      if (before.has(from) && !after.has(from)) return false;
    }
    return true;
  }

  /**
   * Stand cells reachable from `fromCells` in at most `hops` moves of the graph (walking one
   * cell, a jump, a fall...), keeping only those `keep` accepts and walking only through
   * them. Includes the known cells of `fromCells` themselves.
   */
  cellsWithin(fromCells: readonly number[], hops: number, keep: (cell: number) => boolean): number[] {
    const seen = new Set<number>();
    let frontier: number[] = [];
    for (const c of fromCells) {
      if (this.graph.edges.has(c) && !seen.has(c)) {
        seen.add(c);
        frontier.push(c);
      }
    }
    for (let h = 0; h < hops && frontier.length > 0; h++) {
      const next: number[] = [];
      for (const node of frontier) {
        for (const e of this.graph.edges.get(node) ?? []) {
          if (e.to === FINISH || seen.has(e.to) || !keep(e.to)) continue;
          if (crosses(e.cells, this.blocked)) continue;
          seen.add(e.to);
          next.push(e.to);
        }
      }
      frontier = next;
    }
    return [...seen];
  }

  /** Whether the path graph has explored this stand cell (y * width + x), i.e. it is reachable from the start. */
  knowsCell(cell: number): boolean {
    return this.graph.edges.has(cell);
  }

  /** Objects accepted so far, including the initial ones. */
  get objects(): readonly PlacedObject[] {
    return this.current;
  }

  /** Whether `candidate` could be added now without cutting the path. Does not add it. */
  keepsPath(candidate: PlacedObject): boolean {
    return this.check(candidate) !== null;
  }

  /** Add `candidate` if it keeps a path to the finish; returns whether it was added. */
  tryAdd(candidate: PlacedObject): boolean {
    const result = this.check(candidate);
    if (result === null) return false;
    this.current.push(candidate);
    if (result === "quick") for (const c of this.footprint(candidate)) this.blocked.add(c);
    else {
      this.graph = result;
      this.blocked.clear();
    }
    return true;
  }

  /** null: refused. "quick": accepted by the quick check. A graph: accepted after a full rebuild. */
  private check(candidate: PlacedObject): "quick" | ReachGraph | null {
    // A level that is already blocked (should not happen) cannot be "cut" further: don't punish the player.
    if (!this.graph.reachable) return "quick";
    const blocked = new Set(this.blocked);
    for (const c of this.footprint(candidate)) blocked.add(c);
    if (reachableWithout(this.graph, blocked)) return "quick";
    const full = buildReachGraph(this.level, [...this.current, candidate], this.tuning, this.frozen);
    return full.reachable ? full : null;
  }

  /** Cells the candidate occupies or makes deadly, measured with everything already placed. */
  private footprint(candidate: PlacedObject): number[] {
    if (this.frozen) return footprintCells(candidate, this.level.width);
    return objectFootprint(this.level, this.current, candidate);
  }
}

/**
 * Whether adding `candidate` keeps the finish reachable.
 * `graph` must be the graph for `objects` (without the candidate); pass it to avoid rebuilding it.
 */
export function placementKeepsPath(
  level: Level,
  objects: readonly PlacedObject[],
  candidate: PlacedObject,
  tuning: MovementTuning,
  graph: ReachGraph = buildReachGraph(level, objects, tuning),
): boolean {
  // A level that is already blocked (should not happen) cannot be "cut" further: don't punish the player.
  if (!graph.reachable) return true;
  if (reachableWithout(graph, new Set(objectFootprint(level, objects, candidate)))) return true;
  return buildReachGraph(level, [...objects, candidate], tuning).reachable;
}

/** Footprint of `candidate` once added to `objects` (a cannon's line depends on what is around it). */
function objectFootprint(level: Level, objects: readonly PlacedObject[], candidate: PlacedObject): number[] {
  const prepared = prepareObjects(level, [...objects, candidate]);
  return footprintCells(prepared[prepared.length - 1]!, level.width);
}

/**
 * Whether removing `target` keeps the finish reachable. Removing a saw or spikes only frees
 * cells, but removing a solid object can take away the only step (platform, spring, vine)
 * or open a cannon's line of fire across the path; the graph rebuild re-measures both.
 */
export function erasureKeepsPath(
  level: Level,
  objects: readonly PlacedObject[],
  target: PlacedObject,
  tuning: MovementTuning,
  /** The graph for `objects`, if already built. */
  graph?: ReachGraph,
): boolean {
  if (!OBJECT_DEFS[target.kind].solid) return true;
  // Already blocked (should not happen): don't punish the player, like placementKeepsPath.
  if (!(graph ?? buildReachGraph(level, objects, tuning)).reachable) return true;
  return buildReachGraph(level, objects.filter((o) => o.id !== target.id), tuning).reachable;
}
