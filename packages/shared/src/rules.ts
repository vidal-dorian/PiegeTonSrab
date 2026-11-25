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
   * From this many players on, every round uses objectsLate, round 1 included. Objects pile up
   * on one map for the whole game, so a full room would otherwise fill it about 25 % faster
   * than 4 players do (decided 2026-11-25: 2 objects from round 1 at 5 players).
   */
  lateOnlyFromPlayers: number;
  /**
   * How many more objects are drawn than placed. 0 (decided 2026-11-24): every player gets
   * exactly the objects they must place, drawn at random, so nobody picks their favourite.
   */
  extraOffered: number;
  /**
   * Victims that count at full value for one player per round, most valuable first; each
   * further victim is worth POINTS.minKill.
   */
  killCap: number;
}

/** Point values (decided 2026-11-25). The rules screen and the tutorial read them from here. */
export const POINTS = {
  finish: 2,
  first: 1,
  onlyOne: 1,
  kill: 1,
  pushKill: 2,
  /** A trap kill is never worth less: victims past killCap, and every victim in a round nobody finished. */
  minKill: 0.5,
} as const;

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
  lateOnlyFromPlayers: 5,
  extraOffered: 0,
  killCap: 2,
};

/** Objects each player places in round `round` (1-based) when `players` are in the game. */
export function objectsForRound(cfg: GameConfig, round: number, players: number): number {
  if (players >= cfg.lateOnlyFromPlayers) return cfg.objectsLate;
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
  /**
   * Owner of the object that killed this player, if any (when several hazards touch in the
   * same step, see findKiller's ranking).
   */
  killedBy: string | null;
  /**
   * Player who pushed this one (stomp or bump) into the object that killed them, shortly
   * before the death (see TIMING.pushCredit), if any. Optional so a result without it reads
   * as "nobody pushed".
   */
  pushedBy?: string | null;
}

/**
 * What one victim is worth at full value to the owner of the trap that killed them:
 * POINTS.pushKill if the owner pushed them into it themselves (decided 2026-11-25), else
 * POINTS.kill. A pusher who doesn't own the trap gets nothing: the trap's owner still gets
 * the kill, so pushing people into others' traps only helps the others. Past killCap, or in
 * a round nobody finished, a victim is worth POINTS.minKill instead (see killPoints).
 */
export function killValue(victim: RaceResult, ownerId: string): number {
  return victim.pushedBy === ownerId ? POINTS.pushKill : POINTS.kill;
}

/**
 * What one owner's victims (results whose killedBy is the owner, the owner excluded) are
 * worth together: the killCap most valuable at full value, every further one POINTS.minKill;
 * in a round nobody finished, every one POINTS.minKill. Used by scoreRound and by the
 * client's kill notices, so both always agree.
 */
export function killPoints(
  victims: readonly RaceResult[],
  ownerId: string,
  cfg: GameConfig,
  nobodyFinished: boolean,
): { points: number; pushKills: number } {
  const ranked = victims
    .map((v) => ({ value: killValue(v, ownerId), pushed: v.pushedBy === ownerId }))
    .sort((a, b) => b.value - a.value);
  let points = 0;
  let pushKills = 0;
  ranked.forEach((v, i) => {
    const full = !nobodyFinished && i < cfg.killCap;
    points += full ? v.value : POINTS.minKill;
    if (full && v.pushed) pushKills++;
  });
  return { points, pushKills };
}

export interface ScoreLine {
  playerId: string;
  finish: number;
  first: number;
  onlyOne: number;
  /** Points from kills: 1, 2 for a push-kill, 0.5 past killCap or when nobody finished. */
  kills: number;
  /** Push-kills counted at full value (POINTS.pushKill each), so the table can say so. */
  pushKills: number;
  /** Other players killed by this player's objects this round; every one of them scores. */
  victims: number;
  total: number;
}

export type RoundVerdict =
  /** Normal round: points awarded. */
  | "scored"
  /** Everybody finished: level too easy, nobody scores. */
  | "everyone-finished"
  /** Nobody finished: no race points; each trap kill is worth POINTS.minKill. */
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
  const nobody = finishers.length === 0;
  const zero = (playerId: string): ScoreLine => ({
    playerId,
    finish: 0,
    first: 0,
    onlyOne: 0,
    kills: 0,
    pushKills: 0,
    victims: 0,
    total: 0,
  });

  // Nobody can die when everyone finished, so no trap kill is lost here.
  if (!nobody && finishers.length === results.length && !soloRules) {
    return { verdict: "everyone-finished", lines: results.map((r) => zero(r.playerId)) };
  }

  const firstTime = nobody ? Infinity : Math.min(...finishers.map((r) => r.finishTime!));
  const lines = results.map((r) => {
    const line = zero(r.playerId);
    if (r.finishTime !== null) {
      line.finish = POINTS.finish;
      if (r.finishTime === firstTime) line.first = POINTS.first;
      if (finishers.length === 1) line.onlyOne = POINTS.onlyOne;
    }
    // Dying in your own trap scores nothing; map objects (no owner) and pits have killedBy null.
    const victims = results.filter((v) => v.killedBy === r.playerId && v.playerId !== r.playerId);
    const k = killPoints(victims, r.playerId, cfg, nobody);
    line.kills = k.points;
    line.pushKills = k.pushKills;
    line.victims = victims.length;
    line.total = line.finish + line.first + line.onlyOne + line.kills;
    return line;
  });
  return { verdict: nobody ? "nobody-finished" : "scored", lines };
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
