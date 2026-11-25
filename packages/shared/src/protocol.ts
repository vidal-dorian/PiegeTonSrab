/**
 * Every message exchanged between the game server and the clients.
 *
 * Colyseus is used for rooms, connections and reconnection only; its automatic state
 * sync is not used. All game data travels in the explicit messages below, so the whole
 * protocol can be read in this one file. Times are server times in milliseconds
 * (Date.now() on the server) unless the name says otherwise.
 */
import type { CardKind, Dir, PlacedObject } from "./objects";
import type { RoundVerdict, ScoreLine } from "./rules";

export const SERVER_PORT = 2567;
export const ROOM_NAME = "game";
export const MAX_PLAYERS = 5;
export const MAX_NAME_LENGTH = 16;
/**
 * Error code of a join the session refused (game already started, room full): the client
 * shows the error's message, written in French for the player, instead of "server down".
 */
export const JOIN_REFUSED_CODE = 4210;
/**
 * Close code sent to a connection whose player was taken back by another one (the same
 * browser in another tab, or the same pseudo from another device): it must not reconnect.
 */
export const TAKEN_OVER_CODE = 4211;
export const TAKEN_OVER_REASON = "Ta place a été reprise depuis une autre fenêtre ou un autre appareil.";

/** Timings of the parts of a game that are not in GameConfig, milliseconds. */
export const TIMING = {
  /** Map carousel: spinning time, then how long the chosen map stays on screen. */
  carouselSpin: 4000,
  carouselHold: 1500,
  /** "Prêt ?" before the race. */
  countdown: 1500,
  /** Extra time the server waits after the placement deadline for late messages. */
  placementGrace: 400,
  /** Pause between the end of the race and the score table. */
  raceEndPause: 1200,
  /** How often the server sends the other players' positions. */
  ghostInterval: 50,
  /** A block placed by a dead player becomes solid this long after the server accepts it. */
  blockDelay: 300,
  /** The same player can't stomp the same victim twice within this long. */
  stompCooldown: 350,
  /** No bumping or stomping this soon after the race starts: everyone starts on the same cell. */
  contactGrace: 800,
  /** A dead player's block requests are answered at most this often (each one can cost a path check). */
  blockThrottle: 500,
  /**
   * A player who dies on a trap this soon after being stomped or bumped was pushed into it,
   * and the pusher is credited (push-kill, see rules.ts). Measured on the victim's round clock
   * from the moment its character was actually pushed, so network lag doesn't eat into it.
   * 1.2 s covers the stun after a stomp (0.55 s) plus a fall of several cells (falling 10
   * cells from rest takes ~0.6 s), or a shove off a ledge into a trap below (~0.4 s); after
   * that the victim has had most of a second back in full control (7 cells of running),
   * so walking into a trap afterwards is their own doing.
   */
  pushCredit: 1200,
  /** A death or finish detected just before the race end may arrive this long after it (network latency). */
  lateReport: 500,
} as const;

/**
 * A stomp is accepted only if the two players' last known positions are this close (cells).
 * Positions arrive 20 times per second, so this leaves room for lag without allowing stomps
 * across the level.
 */
export const STOMP_MAX_DISTANCE = 3;

export interface LobbyPlayer {
  id: string;
  name: string;
  /** Index in the player colour list: 0 black, 1 white, 2 blue, 3 green, 4 purple. */
  color: number;
  connected: boolean;
}

export interface LobbyInfo {
  code: string;
  hostId: string;
  players: LobbyPlayer[];
  targetScore: number;
  inGame: boolean;
}

/** Position of a character as sent during the race. x, y: top-left of the body, cells. */
export interface PlayerPose {
  x: number;
  y: number;
  facing: 1 | -1;
  slide: boolean;
}

export type RaceStatus = "running" | "dead" | "finished" | "out";

/** A death in an object owned by a player, as the playerDied message reports it. */
export interface TrapDeath {
  id: string;
  killerOwner: string;
  pushedBy: string | null;
}

export interface Ghost extends PlayerPose {
  id: string;
  status: RaceStatus;
}

/**
 * A placement as chosen on the client: the server assigns ids and owners.
 * For the eraser, (x, y) is the cell of the object to remove.
 */
export interface PlacementChoice {
  kind: CardKind;
  x: number;
  y: number;
  /** Rotatable objects only (cannon). */
  dir?: Dir;
}

/** One of a player's cards that the session refused at the end of placement. */
export interface RefusedObject {
  kind: CardKind;
  /** "gone": an eraser whose target another player erased first. */
  reason: "path" | "taken" | "invalid" | "gone";
}

// --- Server to client ---------------------------------------------------------

export type ServerMessage =
  | { type: "lobby"; lobby: LobbyInfo }
  | {
      type: "gameStart";
      levelIndex: number;
      spinMs: number;
      holdMs: number;
      /** Scores so far, for a player who joins a running game again (absent at a real start). */
      totals?: Record<string, number>;
    }
  /**
   * A player came back under a new connection id (see GameSession.takeOver): clients rename
   * what they keep by player id. Sent before the lobby that lists the new id.
   */
  | { type: "renamed"; from: string; to: string }
  | {
      type: "placement";
      round: number;
      needed: number;
      offer: CardKind[];
      endsAt: number;
      objects: PlacedObject[];
      /** Your own choice so far, when rejoining in the middle of placement. */
      mine: PlacementChoice[];
      /** You already validated it (rejoining after "Valider la pose"). */
      done: boolean;
    }
  /** Who has validated their placement. Never where (placement is hidden). */
  | { type: "placedStatus"; done: string[] }
  | {
      type: "countdown";
      round: number;
      objects: PlacedObject[];
      /** How many of your objects were refused at the end of placement (same as refusedObjects.length). */
      refused: number;
      /**
       * Your objects refused at the end of placement, and why: "path" (together with the others'
       * objects it would have cut the last path to the finish; for an eraser, removing its target
       * would), "taken" (a player who validated before you put something on that cell),
       * "invalid" (a cell where nothing can go), "gone" (an eraser whose target was already erased).
       */
      refusedObjects?: RefusedObject[];
      /** Objects you had still not placed when the placement time ran out (0 if you validated). */
      unplaced?: number;
      raceStartsAt: number;
      raceEndsAt: number;
      /**
       * Your race status on the server. Matters when rejoining mid-race: "dead" or "finished"
       * means your run is over and you watch; otherwise you run (again) from the spawn.
       */
      status?: RaceStatus;
      /**
       * This round's deaths in someone's trap so far (rejoining mid-race), so the kill notices
       * that follow count the owner's earlier victims, like the score does.
       */
      deaths?: TrapDeath[];
    }
  | { type: "ghosts"; t: number; players: Ghost[] }
  /**
   * `killerOwner`: owner of the object that killed the player (null: a pit, a map object or no
   * object). `pushedBy`: who pushed them into it (push-kill), already checked by the session.
   */
  | { type: "playerDied"; id: string; x: number; y: number; fell: boolean; killerOwner: string | null; pushedBy: string | null }
  | { type: "playerFinished"; id: string; time: number }
  /** A block placed by a dead player; solid from round time `appearsAt` (seconds). */
  | { type: "block"; block: PlacedObject; appearsAt: number }
  | { type: "blockRefused"; reason: string }
  /** `by` landed on `victim`'s head: the victim's client slams its character down and stuns it. */
  | { type: "stomped"; by: string; victim: string }
  /** Who holds a vine now (null: nobody). Only one player holds a vine at a time. */
  | { type: "vine"; id: number; holder: string | null }
  | {
      type: "score";
      round: number;
      verdict: RoundVerdict;
      lines: ScoreLine[];
      totals: Record<string, number>;
      endsAt: number;
    }
  | { type: "over"; winner: string; totals: Record<string, number>; rounds: number }
  | { type: "pong"; c: number; s: number }
  | { type: "error"; message: string };

// --- Client to server ---------------------------------------------------------

export type ClientMessage =
  | { type: "setTarget"; targetScore: number }
  | { type: "start" }
  /**
   * Current choice during placement; `done` when the player pressed "Valider la pose". A
   * validated choice may hold fewer objects than needed (the others were discarded).
   */
  | { type: "placement"; objects: PlacementChoice[]; done: boolean }
  | ({ type: "pose" } & PlayerPose)
  /**
   * `pushedBy`: the player who stomped or bumped this one less than TIMING.pushCredit before
   * the death, if the death is on an object. Optional: a message without it means nobody.
   */
  | { type: "died"; killerId: number | null; x: number; y: number; fell: boolean; pushedBy?: string | null }
  | { type: "finished"; time: number }
  | { type: "block"; x: number; y: number }
  /** This player's character landed on `victim`'s head (detected on the stomper's machine). */
  | { type: "stomp"; victim: string }
  /** This player grabbed (hold) or let go of a vine. */
  | { type: "vine"; id: number; hold: boolean }
  | { type: "ping"; c: number }
  | { type: "backToLobby" };

export type ServerMessageOf<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;
export type ClientMessageOf<T extends ClientMessage["type"]> = Extract<ClientMessage, { type: T }>;
