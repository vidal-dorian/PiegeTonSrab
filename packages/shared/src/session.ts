/**
 * One game room: lobby, map draw, rounds (placement, race, score) and end of game.
 *
 * This is the referee described in HANDOFF.md: it runs the timers, receives placements and
 * checks them, attributes kills and counts points. It knows nothing about the network:
 * it receives messages through `handle()` and talks through the `SessionIO` it is given.
 * The Colyseus room on the server wraps it, and the offline solo mode runs the very same
 * class inside the browser.
 */
import { parseLevel, type Level, type LevelDefinition } from "./level";
import { DEFAULT_MOVEMENT } from "./movement/tuning";
import { canPlaceAt, OBJECT_DEFS, prepareObjects, type Dir, type ObjectKind, type PlacedObject } from "./objects";
import { PathGuard } from "./reachability";
import {
  createRng,
  DEFAULT_GAME_CONFIG,
  drawOffer,
  gameWinner,
  objectsForRound,
  scoreRound,
  type GameConfig,
  type RaceResult,
} from "./rules";
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  STOMP_MAX_DISTANCE,
  TIMING,
  type ClientMessage,
  type ClientMessageOf,
  type LobbyInfo,
  type PlacementChoice,
  type PlayerPose,
  type RaceStatus,
  type ServerMessage,
} from "./protocol";
import { RACE_LEVELS } from "./levelList";

export interface SessionIO {
  /** Current time, milliseconds. */
  now(): number;
  send(playerId: string, msg: ServerMessage): void;
  broadcast(msg: ServerMessage): void;
  /** Run `fn` after `ms`; returns a function that cancels it. */
  setTimeout(fn: () => void, ms: number): () => void;
  setInterval(fn: () => void, ms: number): () => void;
  /** Random number in [0, 1), used to seed the game. */
  random(): number;
}

type Phase = "lobby" | "carousel" | "placement" | "countdown" | "race" | "raceEnd" | "score" | "over";

interface Player {
  id: string;
  name: string;
  color: number;
  connected: boolean;
  /** Took part in the current game (joined before it started). */
  inGame: boolean;
  // Placement
  offer: ObjectKind[];
  choice: PlacementChoice[];
  doneAt: number | null;
  // Race
  status: RaceStatus;
  pose: PlayerPose | null;
  finishTime: number | null;
  killedBy: string | null;
  placedBlock: boolean;
  lastBlockRequest: number;
}

export class GameSession {
  readonly code: string;
  private players = new Map<string, Player>();
  private hostId = "";
  private cfg: GameConfig = { ...DEFAULT_GAME_CONFIG };
  private phase: Phase = "lobby";

  private rng: () => number = Math.random;
  private levelIndex = 0;
  private level: Level | null = null;
  private round = 0;
  private needed = 0;
  private objects: PlacedObject[] = [];
  private nextObjectId = 1;
  private scores = new Map<string, number>();

  private placementEndsAt = 0;
  private raceStartsAt = 0;
  private raceEndsAt = 0;
  private raceGuard: PathGuard | null = null;
  private refused = new Map<string, number>();
  /** Vine id -> player holding it. */
  private vineHolders = new Map<number, string>();
  /** "stomper>victim" -> time of the last accepted stomp. */
  private lastStomp = new Map<string, number>();

  private timers: Array<() => void> = [];
  private ghostTimer: (() => void) | null = null;

  constructor(
    private io: SessionIO,
    code: string,
    /** Maps to draw from; tests pass their own. */
    private levels: readonly LevelDefinition[] = RACE_LEVELS,
  ) {
    this.code = code;
  }

  // --- Players ------------------------------------------------------------------

  /** Returns an error message (in French, shown to the player) or null if the player joined. */
  addPlayer(id: string, rawName: string): string | null {
    if (this.phase !== "lobby") return "La partie a déjà commencé.";
    if (this.players.size >= MAX_PLAYERS) return "Le salon est plein (4 joueurs).";
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = [0, 1, 2, 3].find((c) => !used.has(c)) ?? 0;
    const name = cleanName(rawName) || `Joueur ${this.players.size + 1}`;
    this.players.set(id, {
      id,
      name,
      color,
      connected: true,
      inGame: false,
      offer: [],
      choice: [],
      doneAt: null,
      status: "out",
      pose: null,
      finishTime: null,
      killedBy: null,
      placedBlock: false,
      lastBlockRequest: -Infinity,
    });
    if (!this.hostId) this.hostId = id;
    this.broadcastLobby();
    return null;
  }

  /** The player left for good. */
  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === "lobby" || !p.inGame) this.players.delete(id);
    else {
      p.connected = false;
      this.onPlayerGone(p);
    }
    if (this.hostId === id) {
      const next = [...this.players.values()].find((q) => q.connected);
      this.hostId = next?.id ?? "";
    }
    this.broadcastLobby();
  }

  /** Connection lost (may come back) or restored. */
  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (connected) this.resync(id);
    else this.onPlayerGone(p);
    this.broadcastLobby();
  }

  get isEmpty(): boolean {
    return ![...this.players.values()].some((p) => p.connected);
  }

  /** Stop every timer (room disposed). */
  dispose(): void {
    this.clearTimers();
  }

  // --- Messages -----------------------------------------------------------------

  handle(id: string, msg: ClientMessage): void {
    const p = this.players.get(id);
    if (!p) return;
    switch (msg.type) {
      case "ping":
        this.io.send(id, { type: "pong", c: msg.c, s: this.io.now() });
        return;
      case "setTarget":
        if (id === this.hostId && this.phase === "lobby" && [10, 25].includes(msg.targetScore)) {
          this.cfg.targetScore = msg.targetScore;
          this.broadcastLobby();
        }
        return;
      case "start":
        if (id === this.hostId && (this.phase === "lobby" || this.phase === "over")) this.startGame();
        return;
      case "backToLobby":
        if (id === this.hostId && this.phase === "over") {
          this.phase = "lobby";
          // Players who left during the game are dropped now.
          for (const [pid, q] of this.players) if (!q.connected) this.players.delete(pid);
          this.broadcastLobby();
        }
        return;
      case "placement":
        this.onPlacement(p, msg);
        return;
      case "pose":
        if (this.phase === "race" && p.status === "running") {
          p.pose = { x: num(msg.x), y: num(msg.y), facing: msg.facing === -1 ? -1 : 1, slide: !!msg.slide };
        }
        return;
      case "died":
        this.onDied(p, msg);
        return;
      case "finished":
        this.onFinished(p, msg);
        return;
      case "block":
        this.onBlock(p, msg);
        return;
      case "stomp":
        this.onStomp(p, msg);
        return;
      case "vine":
        this.onVine(p, msg);
        return;
    }
  }

  // --- Lobby and game start ---------------------------------------------------------

  private lobbyInfo(): LobbyInfo {
    return {
      code: this.code,
      hostId: this.hostId,
      players: [...this.players.values()].map(({ id, name, color, connected }) => ({ id, name, color, connected })),
      targetScore: this.cfg.targetScore,
      inGame: this.phase !== "lobby",
    };
  }

  private broadcastLobby(): void {
    this.io.broadcast({ type: "lobby", lobby: this.lobbyInfo() });
  }

  private startGame(): void {
    this.clearTimers();
    this.rng = createRng(Math.floor(this.io.random() * 2 ** 32));
    this.levelIndex = Math.floor(this.rng() * this.levels.length);
    this.level = parseLevel(this.levels[this.levelIndex]!);
    this.round = 0;
    // Objects drawn in the map itself (springs, vines, cannons...) are there from the start.
    this.objects = prepareObjects(this.level, this.level.initialObjects);
    this.nextObjectId = 1;
    this.scores = new Map();
    for (const p of this.players.values()) {
      p.inGame = p.connected;
      if (p.inGame) this.scores.set(p.id, 0);
    }
    this.phase = "carousel";
    this.broadcastLobby();
    this.io.broadcast({
      type: "gameStart",
      levelIndex: this.levelIndex,
      spinMs: TIMING.carouselSpin,
      holdMs: TIMING.carouselHold,
    });
    this.later(() => this.startPlacement(), TIMING.carouselSpin + TIMING.carouselHold);
  }

  private inGamePlayers(): Player[] {
    return [...this.players.values()].filter((p) => p.inGame);
  }

  // --- Placement ----------------------------------------------------------------------

  private startPlacement(): void {
    this.clearTimers();
    this.phase = "placement";
    this.round++;
    this.needed = objectsForRound(this.cfg, this.round);
    this.placementEndsAt = this.io.now() + this.cfg.placementTime * 1000;
    for (const p of this.inGamePlayers()) {
      p.offer = drawOffer(this.rng, this.needed + this.cfg.extraOffered);
      p.choice = [];
      p.doneAt = null;
      this.sendPlacement(p);
    }
    this.broadcastPlacedStatus();
    this.later(() => this.endPlacement(), this.cfg.placementTime * 1000 + TIMING.placementGrace);
  }

  private sendPlacement(p: Player): void {
    this.io.send(p.id, {
      type: "placement",
      round: this.round,
      needed: this.needed,
      offer: p.offer,
      endsAt: this.placementEndsAt,
      objects: this.objects,
      mine: p.choice,
      done: p.doneAt !== null,
    });
  }

  private onPlacement(p: Player, msg: ClientMessageOf<"placement">): void {
    if (this.phase !== "placement" || !p.inGame || p.doneAt !== null) return;
    const choice = this.cleanChoice(p, msg.objects);
    if (!choice) return;
    p.choice = choice;
    if (msg.done && choice.length === this.needed) {
      p.doneAt = this.io.now();
      this.broadcastPlacedStatus();
      if (this.inGamePlayers().every((q) => !q.connected || q.doneAt !== null)) this.endPlacement();
    }
  }

  /** Keep only well-formed choices that use the player's offered objects. */
  private cleanChoice(p: Player, objects: unknown): PlacementChoice[] | null {
    if (!Array.isArray(objects) || objects.length > this.needed) return null;
    const available = [...p.offer];
    const out: PlacementChoice[] = [];
    for (const o of objects as PlacementChoice[]) {
      const i = available.indexOf(o?.kind);
      if (i < 0 || !Number.isInteger(o.x) || !Number.isInteger(o.y)) return null;
      available.splice(i, 1);
      const choice: PlacementChoice = { kind: o.kind, x: o.x, y: o.y };
      if (OBJECT_DEFS[o.kind].rotatable) choice.dir = cleanDir(o.dir);
      out.push(choice);
    }
    return out;
  }

  private broadcastPlacedStatus(): void {
    const done = this.inGamePlayers()
      .filter((p) => p.doneAt !== null)
      .map((p) => p.id);
    this.io.broadcast({ type: "placedStatus", done });
  }

  /**
   * Apply everyone's placements one at a time, in the order players validated (then the
   * others), refusing any object that is illegal or would cut the last path to the finish.
   */
  private endPlacement(): void {
    if (this.phase !== "placement" || !this.level) return;
    this.clearTimers();
    const order = this.inGamePlayers().sort((a, b) => (a.doneAt ?? Infinity) - (b.doneAt ?? Infinity));
    const guard = new PathGuard(this.level, this.objects, DEFAULT_MOVEMENT);
    this.refused = new Map();
    for (const p of order) {
      for (const c of p.choice) {
        const obj: PlacedObject = { id: this.nextObjectId, kind: c.kind, x: c.x, y: c.y, ownerId: p.id };
        if (c.dir !== undefined) obj.dir = c.dir;
        if (canPlaceAt(this.level, guard.objects, c.x, c.y) && guard.tryAdd(obj)) this.nextObjectId++;
        else this.refused.set(p.id, (this.refused.get(p.id) ?? 0) + 1);
      }
    }
    // Cannon lines and vine ropes depend on everything around them: measure them now.
    this.objects = prepareObjects(this.level, guard.objects);
    this.startCountdown();
  }

  // --- Race ----------------------------------------------------------------------------

  private startCountdown(): void {
    if (!this.level) return;
    this.phase = "countdown";
    const now = this.io.now();
    this.raceStartsAt = now + TIMING.countdown;
    this.raceEndsAt = this.raceStartsAt + this.cfg.raceTime * 1000;
    for (const p of this.inGamePlayers()) {
      p.status = p.connected ? "running" : "out";
      p.pose = null;
      p.finishTime = null;
      p.killedBy = null;
      p.placedBlock = false;
      p.lastBlockRequest = -Infinity;
      this.sendCountdown(p);
    }
    this.vineHolders.clear();
    this.lastStomp.clear();
    // Built now so dead players' blocks can be checked quickly during the race. Cannon lines
    // stay as measured now, like on the clients: blocks don't stop balls.
    this.raceGuard = new PathGuard(this.level, this.objects, DEFAULT_MOVEMENT, { frozenRanges: true });
    this.later(() => this.startRace(), Math.max(0, this.raceStartsAt - this.io.now()));
  }

  private sendCountdown(p: Player): void {
    this.io.send(p.id, {
      type: "countdown",
      round: this.round,
      objects: this.objects,
      refused: this.refused.get(p.id) ?? 0,
      raceStartsAt: this.raceStartsAt,
      raceEndsAt: this.raceEndsAt,
    });
  }

  private startRace(): void {
    this.phase = "race";
    this.ghostTimer = this.io.setInterval(() => this.broadcastGhosts(), TIMING.ghostInterval);
    this.later(() => this.endRace(), Math.max(0, this.raceEndsAt - this.io.now()));
    this.checkRaceDone();
  }

  private broadcastGhosts(): void {
    const players = this.inGamePlayers()
      .filter((p) => p.pose)
      .map((p) => ({ id: p.id, status: p.status, ...p.pose! }));
    this.io.broadcast({ type: "ghosts", t: this.io.now(), players });
  }

  private onDied(p: Player, msg: ClientMessageOf<"died">): void {
    if (!this.raceRunning() || p.status !== "running") return;
    p.status = "dead";
    // The client says which object killed it; the kill goes to that object's owner.
    const killer = msg.killerId === null ? undefined : this.objects.find((o) => o.id === msg.killerId);
    p.killedBy = killer?.ownerId ?? null;
    this.releaseVines(p.id);
    this.io.broadcast({ type: "playerDied", id: p.id, x: num(msg.x), y: num(msg.y), fell: !!msg.fell });
    this.checkRaceDone();
  }

  private onFinished(p: Player, msg: ClientMessageOf<"finished">): void {
    if (!this.raceRunning() || p.status !== "running") return;
    p.status = "finished";
    p.finishTime = Math.min(Math.max(num(msg.time), 0), this.cfg.raceTime);
    this.releaseVines(p.id);
    this.io.broadcast({ type: "playerFinished", id: p.id, time: p.finishTime });
    this.checkRaceDone();
  }

  /** A dead player places their one platform for this round. */
  private onBlock(p: Player, msg: ClientMessageOf<"block">): void {
    const refuse = (reason: string) => this.io.send(p.id, { type: "blockRefused", reason });
    if (this.phase !== "race" || !this.level || !this.raceGuard) return refuse("Pas maintenant.");
    if (p.status !== "dead") return refuse("Seuls les joueurs morts posent des blocs.");
    if (p.placedBlock) return refuse("Un seul bloc par round.");
    const now = this.io.now();
    if (now - p.lastBlockRequest < TIMING.blockThrottle) return refuse("Doucement !");
    p.lastBlockRequest = now;
    const x = msg.x;
    const y = msg.y;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return refuse("Case invalide.");
    if (!canPlaceAt(this.level, this.raceGuard.objects, x, y)) return refuse("Case occupée.");
    // Not on or right next to a living player, so nobody ends up inside a block.
    for (const q of this.inGamePlayers()) {
      if (q.status !== "running" || !q.pose) continue;
      const near = q.pose.x - 1 < x + 1 && q.pose.x + 2 > x && q.pose.y - 1 < y + 1 && q.pose.y + 2 > y;
      if (near) return refuse("Trop près d'un joueur.");
    }
    const block: PlacedObject = { id: this.nextObjectId, kind: "platform", x, y, ownerId: p.id };
    // Nor shut a living player in: the finish must stay reachable from where each one stands.
    const standing = this.inGamePlayers()
      .filter((q) => q.status === "running" && q.pose)
      .map((q) => standCellOf(q.pose!, this.level!));
    if (!this.raceGuard.keepsPathFrom(standing, block)) return refuse("Enfermerait un joueur.");
    if (!this.raceGuard.tryAdd(block)) return refuse("Bloquerait le chemin vers l'arrivée.");
    this.nextObjectId++;
    p.placedBlock = true;
    const roundTime = (this.io.now() - this.raceStartsAt) / 1000;
    this.io.broadcast({ type: "block", block, appearsAt: roundTime + TIMING.blockDelay / 1000 });
  }

  /**
   * A player landed on another one's head. The stomper's machine detects it (it sees the
   * victim where the victim was ~100 ms ago); the server only checks it is plausible and
   * tells everyone, and the victim's machine pushes its own character down.
   */
  private onStomp(p: Player, msg: ClientMessageOf<"stomp">): void {
    if (this.phase !== "race" || p.status !== "running") return;
    const victim = this.players.get(String(msg.victim));
    if (!victim || victim.id === p.id || !victim.inGame || victim.status !== "running") return;
    if (p.pose && victim.pose) {
      const far = Math.abs(p.pose.x - victim.pose.x) > STOMP_MAX_DISTANCE || Math.abs(p.pose.y - victim.pose.y) > STOMP_MAX_DISTANCE;
      if (far) return;
    }
    const now = this.io.now();
    if (now - this.raceStartsAt < TIMING.contactGrace) return;
    const key = `${p.id}>${victim.id}`;
    if (now - (this.lastStomp.get(key) ?? -Infinity) < TIMING.stompCooldown) return;
    this.lastStomp.set(key, now);
    // The victim's machine lets go of any vine when slammed; don't wait for it to say so.
    this.releaseVines(victim.id);
    this.io.broadcast({ type: "stomped", by: p.id, victim: victim.id });
  }

  /** Grab or let go of a vine. The first to grab it holds it; the others are told it is taken. */
  private onVine(p: Player, msg: ClientMessageOf<"vine">): void {
    if (this.phase !== "race" && this.phase !== "countdown") return;
    const id = msg.id;
    if (!Number.isInteger(id) || !this.objects.some((o) => o.id === id && o.kind === "vine")) return;
    const holder = this.vineHolders.get(id);
    if (msg.hold) {
      if (p.status !== "running") return;
      if (holder && holder !== p.id) {
        // Someone else got there first: tell this player so their client lets go.
        this.io.send(p.id, { type: "vine", id, holder });
        return;
      }
      if (holder === p.id) return;
      this.releaseVines(p.id);
      this.vineHolders.set(id, p.id);
      this.io.broadcast({ type: "vine", id, holder: p.id });
    } else if (holder === p.id) {
      this.vineHolders.delete(id);
      this.io.broadcast({ type: "vine", id, holder: null });
    }
  }

  private releaseVines(playerId: string): void {
    for (const [id, holder] of this.vineHolders) {
      if (holder !== playerId) continue;
      this.vineHolders.delete(id);
      this.io.broadcast({ type: "vine", id, holder: null });
    }
  }

  private raceRunning(): boolean {
    return this.phase === "race" || this.phase === "countdown";
  }

  private checkRaceDone(): void {
    if (this.phase !== "race") return;
    if (!this.inGamePlayers().some((p) => p.status === "running")) this.endRace();
  }

  private endRace(): void {
    if (this.phase !== "race") return;
    this.clearTimers();
    this.phase = "raceEnd";
    this.broadcastGhosts();
    this.later(() => this.showScore(), TIMING.raceEndPause);
  }

  /** A player who disconnects or leaves stops counting as running or as pending. */
  private onPlayerGone(p: Player): void {
    if (this.phase === "placement" && this.inGamePlayers().every((q) => !q.connected || q.doneAt !== null)) {
      this.endPlacement();
    } else if (this.phase === "race" || this.phase === "countdown") {
      if (p.status === "running") p.status = "out";
      this.releaseVines(p.id);
      this.checkRaceDone();
    }
  }

  // --- Score and end of game -----------------------------------------------------------

  private showScore(): void {
    this.phase = "score";
    const players = this.inGamePlayers();
    const results: RaceResult[] = players.map((p) => ({ playerId: p.id, finishTime: p.finishTime, killedBy: p.killedBy }));
    const rs = scoreRound(results, this.cfg, players.length === 1);
    for (const l of rs.lines) this.scores.set(l.playerId, (this.scores.get(l.playerId) ?? 0) + l.total);
    this.io.broadcast({
      type: "score",
      round: this.round,
      verdict: rs.verdict,
      lines: rs.lines,
      totals: Object.fromEntries(this.scores),
      endsAt: this.io.now() + this.cfg.scoreTime * 1000,
    });
    this.later(() => this.afterScore(), this.cfg.scoreTime * 1000);
  }

  private afterScore(): void {
    const winner = gameWinner(this.scores, this.cfg);
    if (!winner) {
      this.startPlacement();
      return;
    }
    this.clearTimers();
    this.phase = "over";
    this.io.broadcast({ type: "over", winner, totals: Object.fromEntries(this.scores), rounds: this.round });
    this.broadcastLobby();
  }

  // --- Reconnection --------------------------------------------------------------------

  /** Bring a reconnected player up to date with the current phase. */
  private resync(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.io.send(id, { type: "lobby", lobby: this.lobbyInfo() });
    if (this.phase === "lobby" || !p.inGame) return;
    this.io.send(id, { type: "gameStart", levelIndex: this.levelIndex, spinMs: 0, holdMs: 0 });
    if (this.phase === "placement") {
      this.sendPlacement(p);
      this.broadcastPlacedStatus();
    } else if (this.phase === "countdown" || this.phase === "race" || this.phase === "raceEnd") {
      this.sendCountdown(p);
      for (const [vid, holder] of this.vineHolders) this.io.send(id, { type: "vine", id: vid, holder });
    }
  }

  // --- Timers ----------------------------------------------------------------------------

  private later(fn: () => void, ms: number): void {
    this.timers.push(this.io.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const cancel of this.timers) cancel();
    this.timers = [];
    this.ghostTimer?.();
    this.ghostTimer = null;
  }
}

function cleanName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/** The stand cell under a player's pose (the cell holding their feet). */
function standCellOf(pose: PlayerPose, level: Level): number {
  const m = DEFAULT_MOVEMENT;
  const cx = Math.floor(pose.x + m.bodyWidth / 2);
  const cy = Math.floor(pose.y + m.bodyHeight - 0.01);
  return cy * level.width + cx;
}

function cleanDir(v: unknown): Dir {
  return v === 0 || v === 1 || v === 2 || v === 3 ? v : 2;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
