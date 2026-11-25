/**
 * Every message exchanged between the game server and the clients.
 *
 * Colyseus is used for rooms, connections and reconnection only; its automatic state
 * sync is not used. All game data travels in the explicit messages below, so the whole
 * protocol can be read in this one file. Times are server times in milliseconds
 * (Date.now() on the server) unless the name says otherwise.
 */
import type { Dir, ObjectKind, PlacedObject } from "./objects";
import type { RoundVerdict, ScoreLine } from "./rules";

export const SERVER_PORT = 2567;
export const ROOM_NAME = "game";
export const MAX_PLAYERS = 5;
export const MAX_NAME_LENGTH = 16;

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

export interface Ghost extends PlayerPose {
  id: string;
  status: RaceStatus;
}

/** A placement as chosen on the client: the server assigns ids and owners. */
export interface PlacementChoice {
  kind: ObjectKind;
  x: number;
  y: number;
  /** Rotatable objects only (cannon). */
  dir?: Dir;
}

// --- Server to client ---------------------------------------------------------

export type ServerMessage =
  | { type: "lobby"; lobby: LobbyInfo }
  | { type: "gameStart"; levelIndex: number; spinMs: number; holdMs: number }
  | {
      type: "placement";
      round: number;
      needed: number;
      offer: ObjectKind[];
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
      /** How many of your objects were refused because, together with the others', they cut the path. */
      refused: number;
      raceStartsAt: number;
      raceEndsAt: number;
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
  /** Current choice during placement; `done` when the player pressed "Valider la pose". */
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
