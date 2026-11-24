/**
 * Game rules: round timing, object draw, scoring and end of game (see HANDOFF.md).
 * Pure functions, so the server can run exactly the same rules in build step 4.
 */
import { OBJECT_KINDS, type ObjectKind } from "./objects";

export interface GameConfig {
  /** Score that ends the game: 10 (short game) or 25 (long game). */
  targetScore: number;
  /** Seconds. Drawing and placing happen on the same screen. */
  placementTime: number;
  raceTime: number;
  scoreTime: number;
  /** Objects each player places per round, before and after the switch-over round. */
  objectsEarly: number;
  objectsLate: number;
  /** Rounds 1..switchAfterRound use objectsEarly; later rounds use objectsLate. */
  switchAfterRound: number;
  /**
   * How many more objects are drawn than placed. 0 (decided 2026-11-24): every player gets
   * exactly the objects they must place, drawn at random, so nobody picks their favourite.
   */
  extraOffered: number;
  /** Maximum points from kills per player per round. */
  killCap: number;
}

export const SHORT_GAME = 10;
export const LONG_GAME = 25;

export const DEFAULT_GAME_CONFIG: GameConfig = {
  targetScore: SHORT_GAME,
  placementTime: 35,
  raceTime: 45,
  scoreTime: 5,
  objectsEarly: 3,
  objectsLate: 2,
  switchAfterRound: 3,
  extraOffered: 0,
  killCap: 2,
};

/** Objects each player places in round `round` (1-based). */
export function objectsForRound(cfg: GameConfig, round: number): number {
  return round <= cfg.switchAfterRound ? cfg.objectsEarly : cfg.objectsLate;
}

/** Seeded random generator (mulberry32), so a draw can be reproduced from its seed. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Relative chance of each object in the draw. The eraser (later) will get a low weight. */
export const DRAW_WEIGHTS: Record<ObjectKind, number> = {
  saw: 1,
  spikes: 1,
  cannon: 0.8,
  spring: 0.8,
  vine: 0.6,
  platform: 0.8,
};

/**
 * Random objects drawn for one player for one round. The same object is never drawn more
 * than twice in one hand, so a hand of three is never three platforms.
 */
export function drawOffer(rng: () => number, count: number): ObjectKind[] {
  const offer: ObjectKind[] = [];
  for (let i = 0; i < count; i++) {
    const allowed = OBJECT_KINDS.filter((k) => offer.filter((o) => o === k).length < 2);
    const pool = allowed.length > 0 ? allowed : OBJECT_KINDS;
    const total = pool.reduce((s, k) => s + DRAW_WEIGHTS[k], 0);
    let r = rng() * total;
    let picked: ObjectKind = pool[0]!;
    for (const k of pool) {
      r -= DRAW_WEIGHTS[k];
      if (r < 0) {
        picked = k;
        break;
      }
    }
    offer.push(picked);
  }
  return offer;
}

/** How one player's race ended. */
export interface RaceResult {
  playerId: string;
  /** Seconds after the race start, or null if the player did not finish. */
  finishTime: number | null;
  /** Owner of the object that killed this player, if any (the last one touched). */
  killedBy: string | null;
}

export interface ScoreLine {
  playerId: string;
  finish: number;
  first: number;
  onlyOne: number;
  kills: number;
  total: number;
}

export type RoundVerdict =
  /** Normal round: points awarded. */
  | "scored"
  /** Everybody finished: level too easy, nobody scores. */
  | "everyone-finished"
  /** Nobody finished: level impossible, nobody scores (kills included). */
  | "nobody-finished";

export interface RoundScore {
  verdict: RoundVerdict;
  lines: ScoreLine[];
}

/**
 * Points for one round.
 * `soloRules`: with a single player, "everyone finished" would cancel every round,
 * so that rule is skipped. Used only for local testing.
 */
export function scoreRound(results: readonly RaceResult[], cfg: GameConfig, soloRules = false): RoundScore {
  const finishers = results.filter((r) => r.finishTime !== null);
  const zero = (playerId: string): ScoreLine => ({ playerId, finish: 0, first: 0, onlyOne: 0, kills: 0, total: 0 });

  if (finishers.length === 0) return { verdict: "nobody-finished", lines: results.map((r) => zero(r.playerId)) };
  if (finishers.length === results.length && !soloRules) {
    return { verdict: "everyone-finished", lines: results.map((r) => zero(r.playerId)) };
  }

  const firstTime = Math.min(...finishers.map((r) => r.finishTime!));
  const lines = results.map((r) => {
    const line = zero(r.playerId);
    if (r.finishTime !== null) {
      line.finish = 2;
      if (r.finishTime === firstTime) line.first = 1;
      if (finishers.length === 1) line.onlyOne = 1;
    }
    const victims = results.filter((v) => v.killedBy === r.playerId && v.playerId !== r.playerId).length;
    line.kills = Math.min(victims, cfg.killCap);
    line.total = line.finish + line.first + line.onlyOne + line.kills;
    return line;
  });
  return { verdict: "scored", lines };
}

/**
 * Winner once a round is over, or null if the game goes on: the game ends when someone
 * has reached the target score and is alone in first place (a tie means one more round).
 */
export function gameWinner(scores: ReadonlyMap<string, number>, cfg: GameConfig): string | null {
  let best = -Infinity;
  let leaders: string[] = [];
  for (const [id, s] of scores) {
    if (s > best) {
      best = s;
      leaders = [id];
    } else if (s === best) leaders.push(id);
  }
  return best >= cfg.targetScore && leaders.length === 1 ? leaders[0]! : null;
}
