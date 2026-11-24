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
 * Limits: moving objects will need their swept area treated as hazardous (build step 5).
 * Moves are a fixed sample; a path needing a very precise trick may be missed, which makes
 * the check strict rather than lenient.
 */
import { boxOverlapsSolid, cellSpan, isSolidCell, type Level } from "./level";
import { CharacterController, type StepInput } from "./movement/controller";
import { HAZARD_INSET, SIM_HZ, type MovementTuning } from "./movement/tuning";
import { boxHitsHazard, hazardsOf, withSolidObjects, type Hazard, type PlacedObject } from "./objects";

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
      for (const hz of hazardsOf(obj, 0)) {
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

  hits(x: number, y: number, w: number, h: number, vy: number): boolean {
    if (this.byCell.size === 0) return false;
    const [x0, x1] = cellSpan(x, w);
    const [y0, y1] = cellSpan(y, h);
    const box = { x, y, w, h };
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const list = this.byCell.get(cy * this.width + cx);
        if (list && list.some((hz) => boxHitsHazard(box, hz, vy))) return true;
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
  ) {
    this.collision = withSolidObjects(level, objects);
    this.hazards = new HazardIndex(level.width, objects);
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
    const x = cx + (1 - this.w) / 2;
    const y = cy + 1 - this.h;
    return !boxOverlapsSolid(this.collision, x, y, this.w, this.h) && !this.hitsHazard(x, y, 0);
  }

  private hitsHazard(x: number, y: number, vy: number): boolean {
    // Traps count as PATH_SAFETY_MARGIN bigger than they are, so the remaining path is comfortable.
    const inset = HAZARD_INSET - PATH_SAFETY_MARGIN;
    return this.hazards.hits(x + inset, y + inset, this.w - 2 * inset, this.h - 2 * inset, vy);
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
        if (this.hitsHazard(x, y, 0)) safe = false;
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
      const [x0, x1] = cellSpan(c.x, this.w);
      const [y0, y1] = cellSpan(c.y, this.h);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.add(y * width + x);

      if (c.fellOut || this.hitsHazard(c.x, c.y, c.vy)) return { result: null, cells, touchedWall };
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

/** Explore every node reachable from the start and record all edges. */
export function buildReachGraph(level: Level, objects: readonly PlacedObject[], tuning: MovementTuning): ReachGraph {
  const ex = new Explorer(level, objects, tuning);
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

/** Search the existing graph, ignoring every edge that passes through `blockedCell`. */
export function reachableWithout(graph: ReachGraph, blockedCell: number): boolean {
  const seen = new Set<number>([graph.start]);
  const queue = [graph.start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    for (const e of graph.edges.get(node) ?? []) {
      if (e.cells.has(blockedCell)) continue;
      if (e.to === FINISH) return true;
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return false;
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
  if (reachableWithout(graph, candidate.y * level.width + candidate.x)) return true;
  return buildReachGraph(level, [...objects, candidate], tuning).reachable;
}
