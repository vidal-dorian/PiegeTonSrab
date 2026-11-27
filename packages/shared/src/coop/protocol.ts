/**
 * Every message of the co-op mode ("Sauve Ton Srab") between its Colyseus room and the clients.
 *
 * The server runs the authoritative co-op world (world.ts) from the players' inputs and sends
 * compact snapshots of it about 30 times a second; clients draw them (and later predict ahead).
 * Times are server times in milliseconds (a monotonic clock on the server) unless named otherwise;
 * ticks count world steps (COOP_HZ per second) since the level started.
 */
import type { CoopTitle } from "./titles";
import type { CoopEvent } from "./world";

export const COOP_ROOM_NAME = "coop";
/**
 * Bumped whenever the co-op rules or messages change: every machine must simulate the same world,
 * so a tab still running an older build is refused with a message asking to reload.
 */
export const COOP_PROTOCOL_VERSION = 6;
/**
 * The server stops waiting for the story intro after this long, milliseconds: its length (87 s,
 * INTRO_DURATION_S on the client) plus 10 s for whoever paused on a frame or joined late.
 */
export const COOP_INTRO_MAX_MS = 97_000;
/** How often the server sends a snapshot of the world, milliseconds. */
export const COOP_SNAPSHOT_MS = 1000 / 30;
/** A player who sent no input for this long is treated as touching nothing, milliseconds. */
export const COOP_SILENT_MS = 250;
/** Seconds a dropped player has to come back before the level goes on without them. */
export const COOP_RECONNECT_SECONDS = 30;
/** "Prêt ?" before tick 0 of a level, milliseconds. */
export const COOP_LEVEL_LEAD_MS = 1500;
/** Restart held this long (by half the team from 3 players) restarts the level, seconds (the world decides). */
export const COOP_RESTART_HOLD = 1.5;

export type CoopPhase = "lobby" | "intro" | "select" | "level";

export interface CoopLobbyPlayer {
  id: string;
  name: string;
  /** Seat: index in PLAYER_COLORS (0 black, 1 white, 2 blue, 3 green, 4 purple). */
  color: number;
  connected: boolean;
  /** Joined while a level was running: plays from the next start. */
  waiting: boolean;
}

export interface CoopLobbyInfo {
  mode: "coop";
  code: string;
  hostId: string;
  players: CoopLobbyPlayer[];
  /** The player who plays Ruben, or null (then drawn at launch). */
  rubenId: string | null;
  phase: CoopPhase;
  /** Index of the level being played (phase "level"), or the next one to play. */
  levelIndex: number;
}

/** One body of the world, in rope order. */
export interface CoopSeat {
  id: string;
  name: string;
  color: number;
  isRuben: boolean;
}

export interface CoopIntroCast {
  ruben: { id: string; pseudo: string; color: number; drawnByLot: boolean };
  friends: Array<{ id: string; pseudo: string; color: number }>;
}

/**
 * What happened in the world, as the server's referee saw it: the world's events with their tick
 * (a restart also says who held R, by pseudo).
 */
export type CoopRefereeEvent = (Exclude<CoopEvent, { kind: "restart" }> | { kind: "restart"; attempt: number; by: string | null }) & { tick: number };

export type CoopServerMessage =
  | { type: "coopLobby"; lobby: CoopLobbyInfo }
  /** The story intro: every player watches it on their own computer. */
  | { type: "coopIntro"; cast: CoopIntroCast; startedAt: number; endsAt: number }
  | { type: "coopIntroStatus"; done: string[] }
  /**
   * A level starts (or restarts with a new team, or its clock moved after a pause or a stall):
   * tick 0 happens at server time `startsAt`. `epoch` changes with every such message; inputs
   * carry it back, and the server drops those stamped on another epoch's clock.
   */
  | { type: "coopLevel"; index: number; levelId: string; seats: CoopSeat[]; startsAt: number; epoch: number }
  /**
   * The world at `tick`: encodeWorld bytes, the referee's events since the last snapshot, each
   * seat's held input bits at that tick, the input changes the server already received for
   * later ticks (clients predict the others with them, presses included), and each seat's last
   * stamp received on this level's clock (0: none), so a predicting client knows which of its own
   * changes the server had at that tick, even when its upstream stalled.
   */
  | {
      type: "coopSnap";
      tick: number;
      world: Uint8Array;
      events: CoopRefereeEvent[];
      held: number[];
      pending: Array<Array<[number, number]>>;
      ack: number[];
    }
  /** The world waits for a dropped player (null: it goes on). */
  | { type: "coopPause"; waitingFor: string | null; until: number }
  /** Everybody went through the door: the end-of-level card. Then the host picks the next level. */
  | { type: "coopCleared"; index: number; levelId: string; seats: CoopSeat[]; attempts: number; seconds: number; titles: CoopTitle[] }
  | { type: "coopNotice"; text: string }
  | { type: "pong"; c: number; s: number }
  | { type: "error"; message: string };

export type CoopClientMessage =
  /** Claim the role of Ruben (playerId = self), give it (host: anyone) or free it (null). */
  | { type: "coopRuben"; playerId: string | null }
  /** Host: launch the story (intro, then the first level). */
  | { type: "coopStart" }
  /** Host: play this level now. */
  | { type: "coopPlay"; index: number }
  /** The intro ended or was skipped on this computer. */
  | { type: "coopIntroDone" }
  /**
   * Inputs: [tick, bits] pairs, oldest first; bits are inputBits.ts values. `e` is the epoch of
   * the coopLevel whose clock stamped them (an empty list is a heartbeat). Ignored outside a level.
   */
  | { type: "coopIn"; e: number; k: Array<[number, number]> }
  /** The tab was hidden: touch nothing until the next input. */
  | { type: "coopIdle" }
  /** Host: back to the lobby. */
  | { type: "coopBack" }
  | { type: "ping"; c: number };
