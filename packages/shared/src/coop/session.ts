/**
 * The co-op mode's game logic on the server: lobby, the role of Ruben, the story intro, levels.
 * Network-free like the race mode's GameSession (CoopRoom plugs it into Colyseus).
 *
 * During a level the session runs the authoritative CoopWorld from the players' inputs: it steps
 * the world up to the tick the clock says (COOP_HZ steps per second since tick 0 at `startsAt`)
 * and sends snapshots about 30 times a second. The world decides deaths and restarts itself;
 * the session adds what involves the players: who plays Ruben, a restart held by the team, a
 * player who drops (the world waits for them up to COOP_RECONNECT_SECONDS) or leaves.
 *
 * Inputs: clients send [tick, bits] pairs when their keys change, plus a heartbeat. An input is
 * applied at its tick, or as soon as possible if it arrives late (never dropped); at most one
 * queued change per player per step, so a quick tap is never lost. A player silent for
 * COOP_SILENT_MS (or whose tab is hidden) touches nothing until they are heard again.
 *
 * Every coopLevel carries the level's epoch, bumped whenever tick 0 is set again (a level start,
 * a rebuild, a resume, the clock moved after a stall). Clients echo it in their inputs, and inputs
 * stamped on another epoch's clock are dropped: their ticks mean nothing in this world. A stamp far
 * ahead of the clock is brought back to it (COOP_STAMP_AHEAD).
 */
import { MAX_NAME_LENGTH } from "../protocol";
import { COOP, COOP_HZ } from "./coopTuning";
import { ALL_BITS, HELD_BITS, PRESS_BITS } from "./inputBits";
import { parseCoopLevel, type CoopLevelDef } from "./levelFormat";
import {
  COOP_INTRO_MAX_MS,
  COOP_LEVEL_LEAD_MS,
  COOP_PROTOCOL_VERSION,
  COOP_RECONNECT_SECONDS,
  COOP_SILENT_MS,
  COOP_SNAPSHOT_MS,
  type CoopClientMessage,
  type CoopIntroCast,
  type CoopLobbyInfo,
  type CoopPhase,
  type CoopRefereeEvent,
  type CoopSeat,
  type CoopServerMessage,
} from "./protocol";
import { encodeWorld } from "./snapshot";
import { coopTitles } from "./titles";
import { CoopWorld } from "./world";

export interface CoopSessionIO {
  /** Current time, milliseconds (a monotonic clock on the server). */
  now(): number;
  send(playerId: string, msg: CoopServerMessage): void;
  broadcast(msg: CoopServerMessage): void;
  /** Run `fn` after `ms`; returns a function that cancels it. */
  setTimeout(fn: () => void, ms: number): () => void;
  setInterval(fn: () => void, ms: number): () => void;
  /** Random number in [0, 1) (drawing Ruben by lot). */
  random(): number;
}

/** How often the session steps the world and checks the clock, milliseconds. */
export const COOP_TICK_MS = 1000 / 60;
/** At most this many world steps per tick callback; behind more, the clock is moved instead. */
const MAX_CATCH_UP = 240;
/** Inputs kept per player waiting for their tick. */
const MAX_QUEUE = 512;
/**
 * An input stamped further ahead of the server's clock than this, ticks, is applied this far ahead
 * instead: a client's clock estimate and its prediction lead stay well under half a second.
 */
export const COOP_STAMP_AHEAD = COOP_HZ / 2;

interface Player {
  id: string;
  name: string;
  color: number;
  connected: boolean;
  /** Joined during a level: plays from the next level start. */
  waiting: boolean;
  introDone: boolean;
  /** Input changes waiting for their tick, oldest first. */
  queue: Array<[number, number]>;
  /** The last stamp received on this clock (0: none), echoed in the snapshots. */
  lastStamp: number;
  held: number;
  /** Press edges not yet given to the world. */
  presses: number;
  lastInputAt: number;
  /** When the connection dropped (the reconnection window started), server time. */
  droppedAt: number;
}

export class CoopSession {
  readonly code: string;
  private players = new Map<string, Player>();
  private hostId = "";
  private rubenId: string | null = null;
  private phase: CoopPhase = "lobby";
  private levelIndex = 0;

  private world: CoopWorld | null = null;
  private seats: CoopSeat[] = [];
  private startsAt = 0;
  /** Bumped whenever tick 0 is set again: inputs of another epoch are dropped. */
  private epoch = 0;
  private lastSnapAt = -Infinity;
  private events: CoopRefereeEvent[] = [];
  private pausedFor: string | null = null;
  private pauseUntil = 0;
  private pausedAt = 0;
  private introEndsAt = 0;
  private cast: CoopIntroCast | null = null;
  private introStartedAt = 0;
  /** The end-of-level card, kept for whoever reconnects in the "select" phase. */
  private lastCleared: Extract<CoopServerMessage, { type: "coopCleared" }> | null = null;
  private timers: Array<() => void> = [];
  private ticker: (() => void) | null = null;

  constructor(
    private io: CoopSessionIO,
    code: string,
    private levels: readonly CoopLevelDef[],
  ) {
    this.code = code;
    if (levels.length === 0) throw new Error("co-op session needs at least one level");
  }

  // --- Players ------------------------------------------------------------------------------

  /** Returns an error message (French, shown to the player) or null if the player joined. */
  addPlayer(id: string, rawName: string, version: unknown): string | null {
    if (version !== COOP_PROTOCOL_VERSION) return "Nouvelle version du jeu : recharge la page.";
    if (this.players.size >= COOP.maxPlayers) return `Le salon est plein (${COOP.maxPlayers} joueurs).`;
    const used = new Set([...this.players.values()].map((p) => p.color));
    const color = Array.from({ length: COOP.maxPlayers }, (_, i) => i).find((c) => !used.has(c)) ?? 0;
    const name = cleanName(rawName) || `Joueur ${this.players.size + 1}`;
    this.players.set(id, {
      id,
      name,
      color,
      connected: true,
      waiting: this.phase === "level" || this.phase === "intro",
      introDone: false,
      queue: [],
      lastStamp: 0,
      held: 0,
      presses: 0,
      lastInputAt: -Infinity,
      droppedAt: 0,
    });
    if (!this.hostId) this.hostId = id;
    this.broadcastLobby();
    if (this.phase === "level" || this.phase === "intro") this.resync(id);
    return null;
  }

  /** The player left for good. */
  removePlayer(id: string): void {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    if (this.rubenId === id) this.rubenId = null;
    if (this.hostId === id) {
      // A connected player if there is one, else whoever is reconnecting (never nobody).
      const rest = [...this.players.values()];
      this.hostId = (rest.find((q) => q.connected) ?? rest[0])?.id ?? "";
    }
    const inWorld = this.seats.some((s) => s.id === id);
    if (this.phase === "level" && inWorld) {
      if (this.pausedFor === id) this.pausedFor = null;
      // The level goes on without them: same level, new team (and a new Ruben if it was him).
      if (this.playing().length === 0) this.stopLevel("lobby");
      else this.startLevel(this.levelIndex);
    } else if (this.phase === "intro") {
      this.checkIntroDone();
    }
    this.broadcastLobby();
  }

  /** Connection lost (may come back within COOP_RECONNECT_SECONDS) or restored. */
  setConnected(id: string, connected: boolean): void {
    const p = this.players.get(id);
    if (!p) return;
    p.connected = connected;
    if (!connected) p.droppedAt = this.io.now();
    if (!connected && this.hostId === id) {
      const next = [...this.players.values()].find((q) => q.connected);
      if (next) this.hostId = next.id;
    }
    // Back while the host is away (or gone): the role comes to them.
    if (connected && this.players.get(this.hostId)?.connected !== true) this.hostId = id;
    if (this.phase === "level" && this.seats.some((s) => s.id === id)) {
      if (!connected) this.pause(id);
      else if (this.pausedFor === id) this.resume();
    }
    if (connected) this.resync(id);
    if (this.phase === "intro") this.checkIntroDone();
    this.broadcastLobby();
  }

  get isEmpty(): boolean {
    return ![...this.players.values()].some((p) => p.connected);
  }

  dispose(): void {
    this.clearTimers();
  }

  // --- Messages -----------------------------------------------------------------------------

  handle(id: string, msg: CoopClientMessage): void {
    const p = this.players.get(id);
    if (!p) return;
    switch (msg.type) {
      case "ping":
        this.io.send(id, { type: "pong", c: num(msg.c), s: this.io.now() });
        return;
      case "coopRuben":
        this.onRuben(id, msg.playerId);
        return;
      case "coopStart":
        if (id === this.hostId && (this.phase === "lobby" || this.phase === "select")) this.startIntro();
        return;
      case "coopPlay": {
        const index = Math.floor(num(msg.index));
        if (id === this.hostId && index >= 0 && index < this.levels.length) this.startLevel(index);
        return;
      }
      case "coopIntroDone":
        if (this.phase === "intro" && !p.introDone) {
          p.introDone = true;
          this.io.broadcast({ type: "coopIntroStatus", done: this.introDoneIds() });
          this.checkIntroDone();
        }
        return;
      case "coopIn":
        this.onInputs(p, msg.e, msg.k);
        return;
      case "coopIdle":
        p.queue = [];
        p.held = 0;
        p.presses = 0;
        p.lastInputAt = this.io.now();
        return;
      case "coopBack":
        if (id === this.hostId && this.phase !== "lobby") this.stopLevel("lobby");
        return;
    }
  }

  private onRuben(from: string, target: unknown): void {
    if (this.phase !== "lobby" && this.phase !== "select") return;
    if (target === null) {
      // Give the role back (Ruben himself), or the host clears it.
      if (from === this.rubenId || from === this.hostId) this.rubenId = null;
    } else if (typeof target === "string" && this.players.has(target)) {
      // Anyone can claim it for themselves (the last press wins); the host can give it to anyone.
      if (target === from || from === this.hostId) this.rubenId = target;
    }
    this.broadcastLobby();
  }

  private onInputs(p: Player, epoch: unknown, raw: unknown): void {
    // Only a running level takes inputs, and only stamped on its current clock.
    if (this.phase !== "level" || !this.world || epoch !== this.epoch || !Array.isArray(raw)) return;
    const horizon = Math.max(0, this.clockTarget(this.world)) + COOP_STAMP_AHEAD;
    for (const pair of raw.slice(0, 64)) {
      if (!Array.isArray(pair)) continue;
      const stamp = Math.floor(num(pair[0]));
      const tick = Math.min(stamp, horizon);
      const bits = Math.floor(num(pair[1])) & ALL_BITS;
      p.queue.push([tick, bits]);
      if (stamp > p.lastStamp) p.lastStamp = stamp;
    }
    if (p.queue.length > MAX_QUEUE) p.queue.splice(0, p.queue.length - MAX_QUEUE);
    p.lastInputAt = this.io.now();
  }

  // --- Intro -------------------------------------------------------------------------------------

  private startIntro(): void {
    if (this.playing().length === 0) return;
    this.clearTimers();
    this.phase = "intro";
    this.levelIndex = 0;
    for (const p of this.players.values()) {
      p.introDone = false;
      p.waiting = false;
    }
    this.cast = this.drawCast();
    this.introStartedAt = this.io.now();
    this.introEndsAt = this.introStartedAt + COOP_INTRO_MAX_MS;
    this.lastCleared = null;
    // The lobby first: a player still on the end-of-level card goes to the lobby screen on it,
    // and that screen then gets the intro (the card's screen would drop it).
    this.broadcastLobby();
    this.io.broadcast({ type: "coopIntro", cast: this.cast, startedAt: this.introStartedAt, endsAt: this.introEndsAt });
    this.later(() => {
      if (this.phase === "intro") this.startLevel(0);
    }, COOP_INTRO_MAX_MS);
  }

  private introDoneIds(): string[] {
    return [...this.players.values()].filter((p) => p.introDone).map((p) => p.id);
  }

  private checkIntroDone(): void {
    if (this.phase !== "intro") return;
    // A player who dropped does not hold the others back: the level starts paused for them.
    const watching = [...this.players.values()].filter((p) => p.connected && !p.waiting);
    if (watching.length > 0 && watching.every((p) => p.introDone)) this.startLevel(0);
  }

  /** Ruben is the player who picked the role, else the one named Ruben, else drawn by lot. */
  private drawCast(): CoopIntroCast {
    const team = this.playing();
    let drawnByLot = false;
    let ruben = team.find((p) => p.id === this.rubenId);
    if (!ruben) ruben = team.find((p) => normalize(p.name) === "ruben");
    if (!ruben) {
      ruben = team[Math.floor(this.io.random() * team.length)] ?? team[0];
      drawnByLot = true;
    }
    this.rubenId = ruben?.id ?? null;
    return {
      ruben: { id: ruben!.id, pseudo: ruben!.name, color: ruben!.color, drawnByLot },
      friends: team.filter((p) => p !== ruben).map((p) => ({ id: p.id, pseudo: p.name, color: p.color })),
    };
  }

  // --- Levels ------------------------------------------------------------------------------------

  /**
   * Players in the next level, in seat order: everyone in the room, including whoever dropped and
   * is still inside their reconnection window (the level then waits for them).
   */
  private playing(): Player[] {
    return [...this.players.values()].sort((a, b) => a.color - b.color);
  }

  private startLevel(index: number): void {
    this.clearTimers();
    for (const p of this.players.values()) p.waiting = false;
    this.clearInputs();
    const team = this.playing();
    if (team.length === 0) {
      this.stopLevel("lobby");
      return;
    }
    if (!team.some((p) => p.id === this.rubenId)) {
      // Nobody (or a player who left) plays Ruben: the name rule, then the lot.
      this.rubenId = null;
      this.rubenId = this.drawCastFor(team);
    }
    const friends = team.filter((p) => p.id !== this.rubenId);
    const ruben = team.find((p) => p.id === this.rubenId)!;
    this.seats = [...friends, ruben].map((p) => ({ id: p.id, name: p.name, color: p.color, isRuben: p.id === this.rubenId }));
    const def = this.levels[index]!;
    // Team weights ("W") and team-size variants follow the team that plays (clients parse the same way).
    this.world = new CoopWorld(
      parseCoopLevel(def, this.seats.length),
      this.seats.map((s) => ({ name: s.name, isRuben: s.isRuben })),
    );
    this.phase = "level";
    this.levelIndex = index;
    this.pausedFor = null;
    this.lastCleared = null;
    this.events = [];
    this.lastSnapAt = -Infinity;
    this.startsAt = this.io.now() + COOP_LEVEL_LEAD_MS;
    this.epoch++;
    this.io.broadcast(this.levelMessage());
    this.sendSnapshot();
    this.ticker = this.io.setInterval(() => this.tick(), COOP_TICK_MS);
    this.broadcastLobby();
    // Someone of the team dropped and may come back: wait for them from the start.
    this.pauseForAway();
  }

  private levelMessage(): Extract<CoopServerMessage, { type: "coopLevel" }> {
    const index = this.levelIndex;
    return { type: "coopLevel", index, levelId: this.levels[index]!.id, seats: this.seats, startsAt: this.startsAt, epoch: this.epoch };
  }

  /** Forget every queued input, held key and press (tick 0 was set again). */
  private clearInputs(): void {
    for (const p of this.players.values()) {
      p.queue = [];
      p.lastStamp = 0;
      p.held = 0;
      p.presses = 0;
    }
  }

  /** The tick the clock says now (the world's own tick while it waits for someone). */
  private clockTarget(world: CoopWorld): number {
    if (this.pausedFor) return world.tick;
    return Math.floor(((this.io.now() - this.startsAt) * COOP_HZ) / 1000);
  }

  /**
   * Tick 0 moved: a new epoch, every input stamped on the old clock forgotten, and the new clock
   * sent to everyone (clients start the level screen over from it).
   */
  private clockMoved(): void {
    this.epoch++;
    this.clearInputs();
    this.io.broadcast(this.levelMessage());
    this.sendSnapshot();
  }

  /** The id of who plays Ruben in this team (name rule, then lot). */
  private drawCastFor(team: Player[]): string {
    const named = team.find((p) => normalize(p.name) === "ruben");
    if (named) return named.id;
    return (team[Math.floor(this.io.random() * team.length)] ?? team[0]!).id;
  }

  private stopLevel(to: CoopPhase): void {
    this.clearTimers();
    this.world = null;
    this.seats = [];
    this.phase = to;
    this.pausedFor = null;
    this.lastCleared = null;
    this.clearInputs();
    this.broadcastLobby();
  }

  private pause(id: string): void {
    if (this.pausedFor) return;
    this.pausedFor = id;
    this.pausedAt = this.io.now();
    // Their reconnection window started when they dropped.
    const droppedAt = this.players.get(id)?.droppedAt ?? this.pausedAt;
    this.pauseUntil = Math.max(this.pausedAt, droppedAt + COOP_RECONNECT_SECONDS * 1000);
    this.io.broadcast({ type: "coopPause", waitingFor: id, until: this.pauseUntil });
  }

  /** Wait for the first player of the team who is away, if any. */
  private pauseForAway(): void {
    const away = this.seats.find((s) => this.players.get(s.id)?.connected === false);
    if (away) this.pause(away.id);
  }

  private resume(): void {
    if (!this.pausedFor) return;
    // The world did not move while waiting: tick 0 moves later by the pause.
    this.startsAt += this.io.now() - this.pausedAt;
    this.pausedFor = null;
    this.io.broadcast({ type: "coopPause", waitingFor: null, until: 0 });
    this.clockMoved();
    // Someone else of the team is still away: wait for them now.
    this.pauseForAway();
  }

  /** Step the world up to the tick the clock says; send a snapshot when one is due. */
  private tick(): void {
    const world = this.world;
    if (!world || this.phase !== "level") return;
    const now = this.io.now();
    if (this.pausedFor) return;
    let target = this.clockTarget(world);
    if (target - world.tick > MAX_CATCH_UP) {
      // Far behind (the server stalled): move the clock instead of fast-forwarding the game,
      // and tell everyone, or every input would be stamped that far in the server's future.
      this.startsAt += ((target - world.tick - MAX_CATCH_UP) * 1000) / COOP_HZ;
      target = world.tick + MAX_CATCH_UP;
      this.clockMoved();
    }
    while (world.tick < target && this.world === world) this.step(world, now);
    if (this.world === world && now - this.lastSnapAt >= COOP_SNAPSHOT_MS - 1) this.sendSnapshot();
  }

  private step(world: CoopWorld, now: number): void {
    const tick = world.tick + 1;
    const bits = this.seats.map((s) => {
      const p = this.players.get(s.id);
      if (!p) return 0;
      const next = p.queue[0];
      if (next && next[0] <= tick) {
        p.queue.shift();
        p.held = next[1] & HELD_BITS;
        p.presses |= next[1] & PRESS_BITS;
      }
      // A silent player touches nothing for this step; their keys are kept for when they are
      // heard again (a client only sends changes, so erasing them would stop a held key for good).
      const b = this.silent(p, now) ? 0 : p.held | p.presses;
      p.presses = 0;
      return b;
    });
    // The world decides restarts (R held long enough, deaths); the referee names who held R.
    world.step(bits);
    for (const e of world.events) {
      if (e.kind === "restart") this.events.push({ kind: "restart", tick: world.tick, attempt: e.attempt, by: e.by >= 0 ? (this.seats[e.by]?.name ?? null) : null });
      else this.events.push({ ...e, tick: world.tick });
    }
    if (world.won) this.cleared(world);
  }

  /** Everybody is through the door: the end-of-level card, then the host picks the next level. */
  private cleared(world: CoopWorld): void {
    this.sendSnapshot();
    const def = this.levels[this.levelIndex]!;
    const card: Extract<CoopServerMessage, { type: "coopCleared" }> = {
      type: "coopCleared",
      index: this.levelIndex,
      levelId: def.id,
      seats: this.seats,
      attempts: world.attempt,
      seconds: Math.round(world.tick / COOP_HZ),
      titles: coopTitles(world.stats),
    };
    this.io.broadcast(card);
    const next = Math.min(this.levelIndex + 1, this.levels.length - 1);
    this.stopLevel("select");
    this.lastCleared = card;
    this.levelIndex = next;
    this.broadcastLobby();
  }

  private sendSnapshot(): void {
    const world = this.world;
    if (!world) return;
    this.lastSnapAt = this.io.now();
    this.io.broadcast({ type: "coopSnap", tick: world.tick, world: encodeWorld(world.save()), events: this.events, held: this.heldBits(), pending: this.pendingInputs(), ack: this.acks() });
    this.events = [];
  }

  /** Whether the world treats this player as touching nothing (dropped, or not heard lately). */
  private silent(p: Player, now: number): boolean {
    return !p.connected || now - p.lastInputAt > COOP_SILENT_MS;
  }

  /** Each seat's held bits at the world's current tick, as the world uses them. */
  private heldBits(): number[] {
    const now = this.io.now();
    return this.seats.map((s) => {
      const p = this.players.get(s.id);
      return p && !this.silent(p, now) ? p.held : 0;
    });
  }

  /** Each seat's last stamp received on this clock. */
  private acks(): number[] {
    return this.seats.map((s) => this.players.get(s.id)?.lastStamp ?? 0);
  }

  /** Each seat's input changes received but not applied yet (at most 16), in the order they will apply. */
  private pendingInputs(): Array<Array<[number, number]>> {
    return this.seats.map((s) => (this.players.get(s.id)?.queue ?? []).slice(0, 16).map(([t, b]) => [t, b] as [number, number]));
  }

  // --- Lobby and resync -------------------------------------------------------------------------

  private lobbyInfo(): CoopLobbyInfo {
    return {
      mode: "coop",
      code: this.code,
      hostId: this.hostId,
      players: [...this.players.values()].map(({ id, name, color, connected, waiting }) => ({ id, name, color, connected, waiting })),
      rubenId: this.rubenId,
      phase: this.phase,
      levelIndex: this.levelIndex,
    };
  }

  private broadcastLobby(): void {
    this.io.broadcast({ type: "coopLobby", lobby: this.lobbyInfo() });
  }

  /** Everything a (re)joining player needs to see the current phase. */
  private resync(id: string): void {
    this.io.send(id, { type: "coopLobby", lobby: this.lobbyInfo() });
    if (this.phase === "intro" && this.cast) {
      this.io.send(id, { type: "coopIntro", cast: this.cast, startedAt: this.introStartedAt, endsAt: this.introEndsAt });
      this.io.send(id, { type: "coopIntroStatus", done: this.introDoneIds() });
    }
    if (this.phase === "select" && this.lastCleared) this.io.send(id, this.lastCleared);
    if (this.phase === "level" && this.world) {
      this.io.send(id, this.levelMessage());
      this.io.send(id, { type: "coopSnap", tick: this.world.tick, world: encodeWorld(this.world.save()), events: [], held: this.heldBits(), pending: this.pendingInputs(), ack: this.acks() });
      if (this.pausedFor) this.io.send(id, { type: "coopPause", waitingFor: this.pausedFor, until: this.pauseUntil });
    }
  }

  // --- Timers -----------------------------------------------------------------------------------

  private later(fn: () => void, ms: number): void {
    this.timers.push(this.io.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const cancel of this.timers) cancel();
    this.timers = [];
    this.ticker?.();
    this.ticker = null;
  }
}

function cleanName(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\u0000-\u001f]/g, "")
    .trim()
    .slice(0, MAX_NAME_LENGTH);
}

/** Lower case without accents: "Rubén" and "RUBEN" are "ruben". */
function normalize(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
