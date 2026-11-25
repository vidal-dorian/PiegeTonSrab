/**
 * Every message exchanged between the game server and the clients.
 *
 * Colyseus is used for rooms, connections and reconnection only; its automatic state
 * sync is not used. All game data travels in the explicit messages below, so the whole
 * protocol can be read in this one file. Times are server times in milliseconds
 * (Date.now() on the server) unless the name says otherwise.
 */
import type { CardKind, PlacedObject } from "./objects";
import type { RoundVerdict, ScoreLine } from "./rules";

export const SERVER_PORT = 2567;
export const ROOM_NAME = "game";
export const MAX_PLAYERS = 4;
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
} as const;

export interface LobbyPlayer {
  id: string;
  name: string;
  /** Index in the player colour list: 0 black, 1 white, 2 blue, 3 green. */
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

/**
 * A placement as chosen on the client: the server assigns ids and owners.
 * For the eraser, (x, y) is the cell of the object to remove.
 */
export interface PlacementChoice {
  kind: CardKind;
  x: number;
  y: number;
}

// --- Server to client ---------------------------------------------------------

export type ServerMessage =
  | { type: "lobby"; lobby: LobbyInfo }
  | { type: "gameStart"; levelIndex: number; spinMs: number; holdMs: number }
  | {
      type: "placement";
      round: number;
      needed: number;
      offer: CardKind[];
      endsAt: number;
      objects: PlacedObject[];
      /** Your own choice so far, when rejoining in the middle of placement. */
      mine: PlacementChoice[];
    }
  /** Who has validated their placement. Never where (placement is hidden). */
  | { type: "placedStatus"; done: string[] }
  | {
      type: "countdown";
      round: number;
      objects: PlacedObject[];
      /** How many of your objects were refused because, together with the others', they cut the path. */
      refused: number;
      /** How many of your erasers were lost: target already erased by someone else, or needed for the path. */
      eraseRefused: number;
      raceStartsAt: number;
      raceEndsAt: number;
    }
  | { type: "ghosts"; t: number; players: Ghost[] }
  | { type: "playerDied"; id: string; x: number; y: number; fell: boolean }
  | { type: "playerFinished"; id: string; time: number }
  /** A block placed by a dead player; solid from round time `appearsAt` (seconds). */
  | { type: "block"; block: PlacedObject; appearsAt: number }
  | { type: "blockRefused"; reason: string }
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
  | { type: "died"; killerId: number | null; x: number; y: number; fell: boolean }
  | { type: "finished"; time: number }
  | { type: "block"; x: number; y: number }
  | { type: "ping"; c: number }
  | { type: "backToLobby" };

export type ServerMessageOf<T extends ServerMessage["type"]> = Extract<ServerMessage, { type: T }>;
export type ClientMessageOf<T extends ClientMessage["type"]> = Extract<ClientMessage, { type: T }>;
