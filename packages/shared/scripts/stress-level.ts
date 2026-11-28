/**
 * Map stress simulator: plays out the placement side of a whole game with N players, to see
 * whether a map stays playable as objects accumulate (objects stay on the map for the whole
 * game, so a map that is fine at round 1 can be a wall of saws by round 10 with 5 players).
 *
 *   npx tsx packages/shared/scripts/stress-level.ts level1 [level6 ...] | --all
 *       [--players 5] [--rounds 10] [--seeds 5] [--json out.json] [--jobs N] [--dump] [--show]
 *
 * --jobs: parallel worker processes (default: one per core). --dump: also print each seed's
 * map after the last round. --show: only print the race line used by the placement policy.
 *
 * It uses the real rules from src/ (canPlaceAt, canPlaceObject, supportFirst, PathGuard,
 * prepareObjects, drawOffer, objectsForRound), so a rule change there is followed
 * automatically; the protected start and finish zones come in through canPlaceAt.
 * Everything is deterministic from (map, seed) except the measured times.
 *
 * One round, as in session.ts:
 * - every player draws objectsForRound() objects with drawOffer();
 * - players are applied in a random validation order, each hand in supportFirst order and
 *   each object one at a time through canPlaceObject + PathGuard.tryAdd, like endPlacement.
 *   The placement screen shows refusals live, so a player who gets "would block the path"
 *   tries another cell: up to MAX_TRIES cells per object, then the object counts as lost;
 * - directions: springs and cannons get a random one; spikes get a random one among the
 *   directions that have a block behind them at that cell, and a cell where none has is
 *   skipped without counting a try (the preview shows spikes cannot go there);
 * - the objects are re-prepared (cannon lines, vine ropes) and the reach graph is rebuilt:
 *   that build is the server's cost at the next end of placement and at every countdown
 *   (and every client builds it once per placement screen for its preview);
 * - from round 2, dead players drop BLOCKS_PER_ROUND platforms through a frozenRanges
 *   PathGuard, like onBlock. Blocks vanish at the end of the round (HANDOFF.md), so they
 *   are measured but never carried over. The protected zones apply (canPlaceAt); the
 *   server's other block rules (no block within BLOCK_CLEARANCE of a living player, the
 *   path kept from where each living player stands) need player positions during the race,
 *   which this simulator does not have, so they are left out: its blocks are a little
 *   freer than real ones.
 *
 * Placement policy (a plausible player, not an optimal one): each candidate cell is picked
 * on the race line with probability RACE_LINE_SHARE, else anywhere canPlaceAt allows.
 * Race line proxy: edges of the reach graph that lie on a near-shortest route from start to
 * finish (hops from start + 1 + hops to finish <= shortest + slack), take every cell those
 * moves' bodies pass through, and grow that set by one cell. It is where runners actually
 * go, including jump arcs, without the dead-end exploration the full graph contains.
 * The race line is measured once at the start of each placement step (what players see).
 *
 * Critical cells (a saw there would be refused): measured on a random SAMPLE of at most
 * CRIT_SAMPLE placeable cells. The quick check (graph search without the cell) runs on all
 * of them; only up to CRIT_CONFIRM of the quick refusals are confirmed with the full
 * simulation, and the confirmed share is applied to the quick count. So "crit %" is an
 * estimate; "quick %" (an upper bound) is in the JSON.
 */
import { fork } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  buildReachGraph,
  canPlaceAt,
  canPlaceObject,
  createRng,
  DEFAULT_GAME_CONFIG,
  DEFAULT_MOVEMENT,
  drawOffer,
  isProtectedCell,
  objectsForRound,
  OBJECT_DEFS,
  parseLevel,
  PathGuard,
  placementKeepsPath,
  prepareObjects,
  RACE_LEVELS,
  reachableWithout,
  supportFirst,
  type Dir,
  type Level,
  type LevelDefinition,
  type ObjectKind,
  type PlacedObject,
  type ReachGraph,
} from "../src/index";

const DIRS: readonly Dir[] = [0, 1, 2, 3];

const here = dirname(fileURLToPath(import.meta.url));
const levelsDir = join(here, "../src/levels");
const self = fileURLToPath(import.meta.url);

/** Tries per object before the player gives up and the object is lost. */
const MAX_TRIES = 10;
/** Share of candidate cells picked on the race line (the rest: anywhere legal). */
const RACE_LINE_SHARE = 0.7;
/** Dead-player blocks per round, from round 2. */
const BLOCKS_PER_ROUND = 2;
const BLOCK_TRIES = 10;
/** Placeable cells sampled per round for the critical-cell estimate. */
const CRIT_SAMPLE = 200;
/** Quick refusals confirmed with a full rebuild per round (each costs one graph build). */
const CRIT_CONFIRM = 12;
/** Pseudo node id of the finish in the reach graph (see reachability.ts). */
const FINISH = -1;

// --- Types --------------------------------------------------------------------------------

interface RoundStats {
  round: number;
  /** Objects on the map after this round's placement (map objects included). */
  objects: number;
  /** Cells canPlaceAt still allows. */
  freeCells: number;
  tries: number;
  refused: number;
  /** refused / tries, %. */
  refusalPct: number;
  lost: number;
  lostPerPlayer: number;
  /** Graph build for the map as it stands after this round (server cost per end of placement / countdown), ms. */
  buildMs: number;
  /** Server cost of this end of placement: graph build + every accepted tryAdd, ms. */
  serverMs: number;
  /** Longest single check (tryAdd, accepted or not): what a client preview can freeze for, ms. */
  maxCheckMs: number;
  /**
   * Accepted objects whose quick check failed, so tryAdd re-ran the full simulation: each is
   * one more graph build inside the server's end of placement.
   */
  rebuilds: number;
  /** Reachable standing cells (graph.edges.size). */
  standCells: number;
  critPct: number;
  critQuickPct: number;
  critSampled: number;
  /** Shortest route, in graph edges (moves), start to finish. */
  routeHops: number;
  /** Same route weighted by the Manhattan distance of each move, cells. */
  routeCells: number;
  /** Placeable cells on the race line at the start of this placement. */
  raceLineCells: number;
  blocksPlaced: number;
  blockTries: number;
  blockMaxMs: number;
  reachable: boolean;
}

interface Job {
  file: string;
  seed: number;
  players: number;
  rounds: number;
}

interface JobResult {
  file: string;
  name: string;
  seed: number;
  rounds: RoundStats[];
  /** The map after the last round (see --dump). */
  finalMap: string;
  ms: number;
}

// --- Level loading ------------------------------------------------------------------------

async function load(file: string): Promise<LevelDefinition> {
  const path = join(levelsDir, file.endsWith(".ts") ? file : `${file}.ts`);
  const mod = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
  const def = Object.values(mod).find((v): v is LevelDefinition => !!v && typeof v === "object" && "rows" in v);
  if (!def) throw new Error(`${file}: no LevelDefinition exported`);
  return def;
}

/** Files of the race levels, in RACE_LEVELS order (matched by name, so the list stays the source of truth). */
async function raceLevelFiles(): Promise<string[]> {
  const byName = new Map<string, string>();
  for (const f of readdirSync(levelsDir).filter((f) => f.endsWith(".ts"))) {
    byName.set((await load(f)).name, f.replace(/\.ts$/, ""));
  }
  return RACE_LEVELS.map((d) => {
    const f = byName.get(d.name);
    if (!f) throw new Error(`race level "${d.name}" has no file in ${levelsDir}`);
    return f;
  });
}

// --- Graph helpers ------------------------------------------------------------------------

/** Hops from the start to every node (FINISH included when reachable). */
function hopsFromStart(g: ReachGraph): Map<number, number> {
  const d = new Map<number, number>([[g.start, 0]]);
  const queue = [g.start];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i]!;
    for (const e of g.edges.get(n) ?? []) {
      if (d.has(e.to)) continue;
      d.set(e.to, d.get(n)! + 1);
      if (e.to !== FINISH) queue.push(e.to);
    }
  }
  return d;
}

/** Hops from every node to the finish (reverse search). */
function hopsToFinish(g: ReachGraph): Map<number, number> {
  const back = new Map<number, number[]>();
  for (const [from, out] of g.edges) {
    for (const e of out) {
      const l = back.get(e.to);
      if (l) l.push(from);
      else back.set(e.to, [from]);
    }
  }
  const d = new Map<number, number>([[FINISH, 0]]);
  const queue = [FINISH];
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i]!;
    for (const p of back.get(n) ?? []) {
      if (d.has(p)) continue;
      d.set(p, d.get(n)! + 1);
      queue.push(p);
    }
  }
  return d;
}

/** Shortest route weighted by each move's Manhattan length (Dijkstra; graphs are a few hundred nodes). */
function routeCells(g: ReachGraph, level: Level): number {
  const pos = (n: number) => (n === FINISH && level.finish ? level.finish : { x: n % g.width, y: Math.floor(n / g.width) });
  const dist = new Map<number, number>([[g.start, 0]]);
  const done = new Set<number>();
  for (;;) {
    let best = -2;
    let bestD = Infinity;
    for (const [n, dn] of dist) if (!done.has(n) && dn < bestD) [best, bestD] = [n, dn];
    if (best === -2) return NaN;
    if (best === FINISH) return bestD;
    done.add(best);
    const a = pos(best);
    for (const e of g.edges.get(best) ?? []) {
      const b = pos(e.to);
      const nd = bestD + Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (nd < (dist.get(e.to) ?? Infinity)) dist.set(e.to, nd);
    }
  }
}

/**
 * Race line proxy (see the header). On near-shortest routes, take the tightest move between
 * each pair of consecutive landing spots (fewest cells crossed: the low hop a runner uses,
 * not the full-height jump that grazes the ceiling). Each cell gets a traffic weight: how
 * many of those moves cross it, plus one for each landing spot right next to it. Players
 * then aim where traffic is highest (the floor runners walk on, the gaps everyone jumps).
 */
function raceLine(g: ReachGraph, level: Level): Map<number, number> {
  const ds = hopsFromStart(g);
  const df = hopsToFinish(g);
  const best = ds.get(FINISH);
  const weight = new Map<number, number>();
  const add = (c: number, v: number) => weight.set(c, (weight.get(c) ?? 0) + v);
  if (best === undefined) return weight;
  const slack = Math.max(2, Math.round(best * 0.2));
  const w = level.width;
  for (const [from, out] of g.edges) {
    const a = ds.get(from);
    if (a === undefined) continue;
    const tightest = new Map<number, ReadonlySet<number>>();
    for (const e of out) {
      const b = df.get(e.to);
      if (b === undefined || a + 1 + b > best + slack) continue;
      const prev = tightest.get(e.to);
      if (!prev || e.cells.size < prev.size) tightest.set(e.to, e.cells);
    }
    for (const cells of tightest.values()) for (const c of cells) add(c, 1);
    if (tightest.size === 0) continue;
    const x = from % w;
    const y = Math.floor(from / w);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < w && ny >= 0 && ny < level.height) add(ny * w + nx, 1);
      }
    }
  }
  return weight;
}

/** Weighted picker over the placeable race-line cells. */
function weightedPool(line: Map<number, number>, level: Level, objects: readonly PlacedObject[]) {
  const w = level.width;
  const cells: number[] = [];
  const cumulative: number[] = [];
  let total = 0;
  for (const [c, v] of line) {
    if (!canPlaceAt(level, objects, c % w, Math.floor(c / w))) continue;
    total += v;
    cells.push(c);
    cumulative.push(total);
  }
  return {
    size: cells.length,
    pick(rng: () => number): number {
      const r = rng() * total;
      let lo = 0;
      let hi = cumulative.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumulative[mid]! > r) hi = mid;
        else lo = mid + 1;
      }
      return cells[lo]!;
    },
  };
}

function placeableCells(level: Level, objects: readonly PlacedObject[]): number[] {
  const out: number[] = [];
  for (let y = 0; y < level.height; y++) {
    for (let x = 0; x < level.width; x++) if (canPlaceAt(level, objects, x, y)) out.push(y * level.width + x);
  }
  return out;
}

function shuffle<T>(rng: () => number, a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

const pickFrom = <T>(rng: () => number, a: readonly T[]): T => a[Math.floor(rng() * a.length)]!;

// --- Measures -----------------------------------------------------------------------------

function critical(level: Level, objects: readonly PlacedObject[], g: ReachGraph, free: number[], rng: () => number) {
  const sample = free.length <= CRIT_SAMPLE ? free : shuffle(rng, [...free]).slice(0, CRIT_SAMPLE);
  if (!g.reachable || sample.length === 0) return { pct: 0, quickPct: 0, sampled: sample.length };
  const quickFail = sample.filter((c) => !reachableWithout(g, new Set([c])));
  const confirm = shuffle(rng, [...quickFail]).slice(0, CRIT_CONFIRM);
  const w = level.width;
  const confirmed = confirm.filter(
    (c) => !placementKeepsPath(level, objects, { id: 999999, kind: "saw", x: c % w, y: Math.floor(c / w) }, DEFAULT_MOVEMENT, g),
  ).length;
  const quickPct = (100 * quickFail.length) / sample.length;
  return { pct: confirm.length ? (quickPct * confirmed) / confirm.length : 0, quickPct, sampled: sample.length };
}

function timed<T>(f: () => T): [T, number] {
  const t0 = performance.now();
  const r = f();
  return [r, performance.now() - t0];
}

// --- One game -----------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** PathGuard keeps its graph private; the simulator peeks at it only to count full rebuilds. */
const guardGraph = (guard: PathGuard) => (guard as unknown as { graph: ReachGraph }).graph;

/**
 * Map glyph of an object, by direction for spikes, springs and cannons (Dir order: right,
 * down, left, up). Same glyphs as check-level.ts (kept in step by hand: both are scripts).
 */
function objectGlyph(o: PlacedObject): string {
  const dir = o.dir ?? (o.kind === "cannon" ? 2 : 3);
  switch (o.kind) {
    case "cannon":
      return [">", "U", "<", "A"][dir]!;
    case "spikes":
      return ["}", "v", "{", "^"][dir]!;
    case "spring":
      return ["]", "Y", "[", "T"][dir]!;
    default:
      return { saw: "*", platform: "=", vine: "V" }[o.kind];
  }
}

/** The map as check-level draws it, with reachable standing cells (·) and the protected zones (_). */
function render(level: Level, objects: readonly PlacedObject[], g: ReachGraph): string {
  const objAt = new Map(objects.map((o) => [o.y * level.width + o.x, o]));
  const lines: string[] = [];
  for (let y = 0; y < level.height; y++) {
    let line = "";
    for (let x = 0; x < level.width; x++) {
      const k = y * level.width + x;
      const o = objAt.get(k);
      if (level.solid[k]) line += "#";
      else if (x === level.start.x && y === level.start.y) line += "S";
      else if (level.finish && x === level.finish.x && y === level.finish.y) line += "F";
      else if (o) line += objectGlyph(o);
      else if (isProtectedCell(level, x, y)) line += "_";
      else if (g.edges.has(k)) line += "·";
      else line += " ";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function simulate(def: LevelDefinition, seed: number, players: number, rounds: number): { rounds: RoundStats[]; finalMap: string } {
  const level = parseLevel(def);
  const rng = createRng(hashString(def.name) ^ Math.imul(seed + 1, 0x9e3779b1));
  const M = DEFAULT_MOVEMENT;
  const w = level.width;
  let objects = prepareObjects(level, level.initialObjects);
  // Warm-up build first, so round 0 is not timed with a cold JIT.
  buildReachGraph(level, objects, M);
  let [graph, buildMs] = timed(() => buildReachGraph(level, objects, M));
  let nextId = 1;
  const out: RoundStats[] = [];

  const measure = (round: number, extra: Partial<RoundStats>): RoundStats => {
    const free = placeableCells(level, objects);
    const crit = critical(level, objects, graph, free, rng);
    const hops = hopsFromStart(graph).get(FINISH);
    return {
      round,
      objects: objects.length,
      freeCells: free.length,
      tries: 0,
      refused: 0,
      refusalPct: 0,
      lost: 0,
      lostPerPlayer: 0,
      buildMs,
      serverMs: buildMs,
      maxCheckMs: 0,
      rebuilds: 0,
      standCells: graph.edges.size,
      critPct: crit.pct,
      critQuickPct: crit.quickPct,
      critSampled: crit.sampled,
      routeHops: hops ?? NaN,
      routeCells: routeCells(graph, level),
      raceLineCells: NaN,
      blocksPlaced: 0,
      blockTries: 0,
      blockMaxMs: 0,
      reachable: graph.reachable,
      ...extra,
    };
  };
  out.push(measure(0, {}));

  for (let round = 1; round <= rounds; round++) {
    // --- Placement: the guard starts from the graph of the map as it stands (same build the
    // server does at the start of endPlacement; measured as the previous round's buildMs).
    const line = weightedPool(raceLine(graph, level), level, objects);
    const anywhere = placeableCells(level, objects);
    const guard = new PathGuard(level, objects, M, { graph });
    const needed = objectsForRound(DEFAULT_GAME_CONFIG, round, players);
    const hands = Array.from({ length: players }, () => drawOffer(rng, needed + DEFAULT_GAME_CONFIG.extraOffered).slice(0, needed));
    const order = shuffle(
      rng,
      hands.map((_, i) => i),
    );
    let tries = 0;
    let refused = 0;
    let lost = 0;
    let acceptedMs = 0;
    let rebuilds = 0;
    let maxCheckMs = 0;
    // A cell and a direction for `kind`. A player never clicks an occupied cell, nor a cell
    // where spikes have nothing to lean on in any direction (the preview shows both), so those
    // are not tries. Spikes take a random direction among the supported ones; other rotatable
    // objects any direction.
    const pickCell = (kind: ObjectKind): { c: number; dir?: Dir } | null => {
      for (let k = 0; k < 50; k++) {
        const onLine = line.size > 0 && rng() < RACE_LINE_SHARE;
        if (!onLine && anywhere.length === 0) return null;
        const c = onLine ? line.pick(rng) : pickFrom(rng, anywhere);
        const x = c % w;
        const y = Math.floor(c / w);
        if (!canPlaceAt(level, guard.objects, x, y)) continue;
        if (OBJECT_DEFS[kind].needsSupport) {
          const dirs = DIRS.filter((dir) => canPlaceObject(level, guard.objects, { kind, x, y, dir }));
          if (dirs.length > 0) return { c, dir: pickFrom(rng, dirs) };
          continue;
        }
        return OBJECT_DEFS[kind].rotatable ? { c, dir: pickFrom(rng, DIRS) } : { c };
      }
      return null;
    };
    for (const p of order) {
      // Same order as endPlacement: objects that lean on a block go last in a hand.
      for (const { kind } of supportFirst(hands[p]!.map((kind) => ({ kind })))) {
        if (kind === "eraser") continue; // not drawn (eraserChance 0), here for the type
        let placed = false;
        for (let t = 0; t < MAX_TRIES && !placed; t++) {
          const pick = pickCell(kind);
          if (pick === null) break;
          const obj: PlacedObject = { id: nextId, kind, x: pick.c % w, y: Math.floor(pick.c / w), ownerId: `p${p}` };
          if (pick.dir !== undefined) obj.dir = pick.dir;
          // pickCell already checked it against guard.objects; kept to mirror endPlacement.
          if (!canPlaceObject(level, guard.objects, obj)) continue;
          tries++;
          const before = guardGraph(guard);
          const [ok, ms] = timed(() => guard.tryAdd(obj));
          maxCheckMs = Math.max(maxCheckMs, ms);
          if (ok) {
            placed = true;
            acceptedMs += ms;
            if (guardGraph(guard) !== before) rebuilds++;
            nextId++;
          } else refused++;
        }
        if (!placed) lost++;
      }
    }
    // Cannon lines and vine ropes depend on everything around them: measure them now.
    objects = prepareObjects(level, guard.objects);
    [graph, buildMs] = timed(() => buildReachGraph(level, objects, M));

    // --- Race: dead players' blocks, through a frozen-ranges guard like onBlock. The graph
    // for prepared objects is the same with or without frozen ranges, so it is reused.
    let blocksPlaced = 0;
    let blockTries = 0;
    let blockMaxMs = 0;
    if (round >= 2 && graph.reachable) {
      const raceGuard = new PathGuard(level, objects, M, { frozenRanges: true, graph });
      const blockLine = weightedPool(raceLine(graph, level), level, objects);
      for (let b = 0; b < BLOCKS_PER_ROUND; b++) {
        for (let t = 0; t < BLOCK_TRIES; t++) {
          if (blockLine.size === 0) break;
          const c = blockLine.pick(rng);
          const x = c % w;
          const y = Math.floor(c / w);
          if (!canPlaceAt(level, raceGuard.objects, x, y)) continue;
          blockTries++;
          const [ok, ms] = timed(() => raceGuard.tryAdd({ id: nextId, kind: "platform", x, y, ownerId: "dead" }));
          blockMaxMs = Math.max(blockMaxMs, ms);
          if (ok) {
            nextId++;
            blocksPlaced++;
            break;
          }
        }
      }
      // Blocks disappear at the end of the round: `objects` and `graph` stay as they were.
    }

    out.push(
      measure(round, {
        tries,
        refused,
        refusalPct: tries ? (100 * refused) / tries : 0,
        lost,
        lostPerPlayer: lost / players,
        serverMs: out[out.length - 1]!.buildMs + acceptedMs,
        maxCheckMs,
        rebuilds,
        raceLineCells: line.size,
        blocksPlaced,
        blockTries,
        blockMaxMs,
      }),
    );
  }
  return { rounds: out, finalMap: render(level, objects, graph) };
}

// --- Worker / parent ----------------------------------------------------------------------

async function runJob(job: Job): Promise<JobResult> {
  const def = await load(job.file);
  const t0 = performance.now();
  const { rounds, finalMap } = simulate(def, job.seed, job.players, job.rounds);
  return { file: job.file, name: def.name, seed: job.seed, rounds, finalMap, ms: performance.now() - t0 };
}

async function runAll(jobs: Job[], parallel: number): Promise<JobResult[]> {
  const results: JobResult[] = [];
  const t0 = performance.now();
  const log = (r: JobResult) =>
    console.log(
      `[${String(results.length).padStart(3)}/${jobs.length}] ${r.file} seed ${r.seed}: ${(r.ms / 1000).toFixed(1)} s` +
        `  (elapsed ${((performance.now() - t0) / 1000).toFixed(0)} s)`,
    );
  if (parallel <= 1) {
    for (const j of jobs) {
      results.push(await runJob(j));
      log(results[results.length - 1]!);
    }
    return results;
  }
  const queue = [...jobs];
  await Promise.all(
    Array.from({ length: Math.min(parallel, jobs.length) }, () => {
      return new Promise<void>((resolve, reject) => {
        const child = fork(self, ["--worker"], { execArgv: process.execArgv });
        const next = () => child.send(queue.shift() ?? "stop");
        child.on("message", (m: { ok: true; r: JobResult } | { ok: false; error: string }) => {
          if (!m.ok) {
            child.kill();
            reject(new Error(m.error));
            return;
          }
          results.push(m.r);
          log(m.r);
          next();
        });
        child.on("exit", () => resolve());
        child.on("error", reject);
        next();
      });
    }),
  );
  return results;
}

// --- Summary ------------------------------------------------------------------------------

function median(a: number[]): number {
  const v = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  if (v.length === 0) return NaN;
  const m = v.length >> 1;
  return v.length % 2 ? v[m]! : (v[m - 1]! + v[m]!) / 2;
}

const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : "-");

interface MapSummary {
  file: string;
  name: string;
  /** Median over seeds of each metric, per round. */
  perRound: Array<Record<string, number>>;
  at: Record<string, Record<string, number>>;
  buildMsMedian: number;
  buildMsMax: number;
  serverMsMax: number;
  maxCheckMs: number;
  unreachableRounds: number;
}

const ROUND_KEYS = [
  "objects",
  "freeCells",
  "refusalPct",
  "lost",
  "lostPerPlayer",
  "buildMs",
  "serverMs",
  "maxCheckMs",
  "rebuilds",
  "standCells",
  "critPct",
  "critQuickPct",
  "routeHops",
  "routeCells",
  "raceLineCells",
  "blocksPlaced",
] as const;

function summarize(file: string, runs: JobResult[], rounds: number): MapSummary {
  const perRound: Array<Record<string, number>> = [];
  for (let r = 0; r <= rounds; r++) {
    const row: Record<string, number> = { round: r };
    for (const k of ROUND_KEYS) row[k] = median(runs.map((s) => s.rounds[r]![k] as number));
    // Route growth vs round 0, per seed then median.
    row.routeGrowth = median(runs.map((s) => s.rounds[r]!.routeCells / s.rounds[0]!.routeCells));
    perRound.push(row);
  }
  const checkpoints = [...new Set([3, 6, rounds].filter((r) => r <= rounds))];
  const at: MapSummary["at"] = {};
  for (const r of checkpoints) at[String(r)] = perRound[r]!;
  const all = runs.flatMap((s) => s.rounds);
  return {
    file,
    name: runs[0]!.name,
    perRound,
    at,
    buildMsMedian: median(all.map((s) => s.buildMs)),
    buildMsMax: Math.max(...all.map((s) => s.buildMs)),
    serverMsMax: Math.max(...all.map((s) => s.serverMs)),
    maxCheckMs: Math.max(...all.map((s) => s.maxCheckMs)),
    unreachableRounds: all.filter((s) => !s.reachable).length,
  };
}

function table(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join("  ");
  return [line(headers), widths.map((w) => "-".repeat(w)).join("  "), ...rows.map(line)].join("\n");
}

function printMap(s: MapSummary, seeds: number): void {
  console.log(`\n=== ${s.file} — ${s.name}  (median over ${seeds} seeds)`);
  console.log(
    table(
      ["rnd", "objs", "free", "line", "ref%", "lost", "lost/pl", "stand", "crit%", "quick%", "hops", "route", "×r0", "build", "server", "rebld", "check", "blocks"],
      s.perRound.map((r) => [
        String(r.round),
        fmt(r.objects!),
        fmt(r.freeCells!),
        fmt(r.raceLineCells!),
        fmt(r.refusalPct!, 1),
        fmt(r.lost!, 1),
        fmt(r.lostPerPlayer!, 2),
        fmt(r.standCells!),
        fmt(r.critPct!, 1),
        fmt(r.critQuickPct!, 1),
        fmt(r.routeHops!),
        fmt(r.routeCells!),
        fmt(r.routeGrowth!, 2),
        fmt(r.buildMs!),
        fmt(r.serverMs!),
        fmt(r.rebuilds!),
        fmt(r.maxCheckMs!),
        fmt(r.blocksPlaced!, 1),
      ]),
    ),
  );
  console.log(
    `graph build: median ${fmt(s.buildMsMedian)} ms, max ${fmt(s.buildMsMax)} ms; worst end of placement ${fmt(s.serverMsMax)} ms;` +
      ` worst single check ${fmt(s.maxCheckMs)} ms` +
      (s.unreachableRounds ? `;  FINISH UNREACHABLE in ${s.unreachableRounds} rounds` : ""),
  );
}

function printOverview(sums: MapSummary[], rounds: number): void {
  const cps = Object.keys(sums[0]!.at);
  const tri = (s: MapSummary, k: string, d: number) => cps.map((r) => fmt(s.at[r]![k]!, d)).join("/");
  console.log(`\n=== Overview (medians over seeds at rounds ${cps.join("/")})`);
  console.log(
    table(
      ["map", "objects", "refusal %", "lost/player", "crit %", "stand r0→R", `route ×r0 @${rounds}`, "build med/max ms", "worst EoP ms"],
      sums.map((s) => [
        `${s.file} ${s.name}`,
        tri(s, "objects", 0),
        tri(s, "refusalPct", 0),
        tri(s, "lostPerPlayer", 2),
        tri(s, "critPct", 1),
        `${fmt(s.perRound[0]!.standCells!)}→${fmt(s.perRound[rounds]!.standCells!)}`,
        fmt(s.perRound[rounds]!.routeGrowth!, 2),
        `${fmt(s.buildMsMedian)}/${fmt(s.buildMsMax)}`,
        fmt(s.serverMsMax),
      ]),
    ),
  );
}

/** Debug view at round 0: race line (+, busiest quarter @) and reachable standing cells (·). */
function show(def: LevelDefinition): void {
  const level = parseLevel(def);
  const objects = prepareObjects(level, level.initialObjects);
  const g = buildReachGraph(level, objects, DEFAULT_MOVEMENT);
  const line = raceLine(g, level);
  const free = placeableCells(level, objects);
  const onLine = free.filter((c) => line.has(c));
  const top = [...onLine].sort((a, b) => line.get(b)! - line.get(a)!);
  const hot = new Set(top.slice(0, Math.ceil(top.length / 4)));
  const hotShare = [...hot].reduce((s, c) => s + line.get(c)!, 0) / onLine.reduce((s, c) => s + line.get(c)!, 0);
  console.log(
    `\n${def.name}: race line ${onLine.length} of ${free.length} placeable cells;` +
      ` the busiest quarter (@) gets ${(100 * hotShare).toFixed(0)} % of race-line picks`,
  );
  const objAt = new Set(objects.map((o) => o.y * level.width + o.x));
  for (let y = 0; y < level.height; y++) {
    let s = "";
    for (let x = 0; x < level.width; x++) {
      const k = y * level.width + x;
      if (level.solid[k]) s += "#";
      else if (x === level.start.x && y === level.start.y) s += "S";
      else if (level.finish && x === level.finish.x && y === level.finish.y) s += "F";
      else if (objAt.has(k)) s += "o";
      else if (g.edges.has(k)) s += "·";
      else if (hot.has(k)) s += "@";
      else if (line.has(k)) s += "+";
      else s += " ";
    }
    console.log(s);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const opt = (name: string, def: number) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : def;
  };
  const jsonIdx = args.indexOf("--json");
  const jsonOut = jsonIdx >= 0 ? args[jsonIdx + 1] : undefined;
  const players = opt("--players", 5);
  const rounds = opt("--rounds", 10);
  const seeds = opt("--seeds", 5);
  const parallel = opt("--jobs", Math.max(1, availableParallelism()));
  const valued = new Set(["--players", "--rounds", "--seeds", "--json", "--jobs"]);
  const names = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1] ?? ""));
  const files = args.includes("--all") || names.length === 0 ? await raceLevelFiles() : names.map((n) => n.replace(/\.ts$/, ""));

  if (args.includes("--show")) {
    for (const f of files) show(await load(f));
    return;
  }

  console.log(
    `stress: ${files.length} map(s) x ${seeds} seed(s), ${players} players, ${rounds} rounds, ${parallel} parallel worker(s)` +
      ` (objects per player: ${Array.from({ length: rounds }, (_, i) => objectsForRound(DEFAULT_GAME_CONFIG, i + 1, players)).join(",")})`,
  );
  const jobs: Job[] = files.flatMap((file) => Array.from({ length: seeds }, (_, seed) => ({ file, seed, players, rounds })));
  const t0 = performance.now();
  const results = await runAll(jobs, parallel);
  const sums = files.map((f) =>
    summarize(
      f,
      results.filter((r) => r.file === f).sort((a, b) => a.seed - b.seed),
      rounds,
    ),
  );
  for (const s of sums) {
    printMap(s, seeds);
    if (!args.includes("--dump")) continue;
    for (const r of results.filter((r) => r.file === s.file).sort((a, b) => a.seed - b.seed)) {
      console.log(`\n${s.file} seed ${r.seed}, after round ${rounds} (· = reachable standing cells):\n${r.finalMap}`);
    }
  }
  printOverview(sums, rounds);
  console.log(
    `\nColumns: line = placeable race-line cells at the start of placement; ref% = refused tries / tries;` +
      ` stand = reachable standing cells; crit% = estimated share of placeable cells where a saw would be refused` +
      ` (sample of ${CRIT_SAMPLE}, ${CRIT_CONFIRM} confirmed), quick% = its upper bound; hops/route = shortest route` +
      ` in moves / in cells; build = reach graph build ms; server = build + accepted checks (end of placement);` +
      ` rebld = accepted objects that needed a full rebuild (each one more graph build in that end of placement);` +
      ` check = slowest single check; blocks = dead-player blocks accepted (of ${BLOCKS_PER_ROUND}, from round 2).`,
  );
  console.log(`Total ${((performance.now() - t0) / 1000).toFixed(0)} s.`);
  if (jsonOut) {
    writeFileSync(
      jsonOut,
      JSON.stringify(
        {
          config: { players, rounds, seeds, maxTries: MAX_TRIES, raceLineShare: RACE_LINE_SHARE, critSample: CRIT_SAMPLE, critConfirm: CRIT_CONFIRM },
          maps: sums.map((s) => ({ ...s, runs: results.filter((r) => r.file === s.file).sort((a, b) => a.seed - b.seed) })),
        },
        null,
        1,
      ),
    );
    console.log(`JSON written to ${jsonOut}`);
  }
}

// Entry point last, so every module-level constant above is initialised before it runs.
if (process.argv.includes("--worker")) {
  process.on("message", (job: Job | "stop") => {
    if (job === "stop") process.exit(0);
    void runJob(job).then(
      (r) => process.send!({ ok: true, r }),
      (e: Error) => process.send!({ ok: false, error: `${job.file} seed ${job.seed}: ${e.stack ?? e.message}` }),
    );
  });
} else {
  await main();
}
