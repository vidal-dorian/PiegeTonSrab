/**
 * The connection between the game screen and a game session.
 *
 * Two implementations behind one interface:
 * - OnlineLink talks to the Colyseus server.
 * - LocalLink runs the same GameSession inside the browser, for the offline solo mode.
 * The game scene does not know which one it uses.
 */
import { Client, type Room } from "@colyseus/sdk";
import {
  GameSession,
  JOIN_REFUSED_CODE,
  SERVER_PORT,
  TAKEN_OVER_CODE,
  TAKEN_OVER_REASON,
  type ClientMessage,
  type ServerMessage,
} from "@game/shared";
import { ClockSync } from "./clock";
import { playerKey, rememberRoomInUrl } from "./playerKey";

export interface GameLink {
  readonly myId: string;
  readonly online: boolean;
  send(msg: ClientMessage): void;
  /**
   * Receive messages. Messages that arrive while no handler is set are kept and delivered
   * to the next handler, so nothing is lost while a scene is starting.
   */
  setHandler(handler: ((msg: ServerMessage) => void) | null): void;
  /** Connection status changes: lost (trying to reconnect), back, or closed for good. */
  onStatus: ((status: "lost" | "back" | "closed") => void) | null;
  /** Once closed: why, in French for the player, when the server said (else null). */
  readonly closeMessage: string | null;
  /** Whether the connection is down right now (between "lost" and "back", or closed). */
  readonly isLost: boolean;
  /** Estimated server time, milliseconds. */
  serverNow(): number;
  leave(): void;
}

/** Message queue and handler handoff shared by every link (race and co-op). */
export abstract class BaseLink<S = ServerMessage> {
  closeMessage: string | null = null;
  isLost = false;
  private handler: ((msg: S) => void) | null = null;
  private queue: S[] = [];
  onStatus: ((status: "lost" | "back" | "closed") => void) | null = null;

  setHandler(handler: ((msg: S) => void) | null): void {
    this.handler = handler;
    // One at a time, and only while this handler is still the one set: a handler that lets go
    // in the middle (GameScene on gameStart, LobbyScene when the game starts, a co-op scene
    // switch) leaves the rest, in order, to the next one. Messages that arrive meanwhile are
    // queued behind them.
    while (handler && this.handler === handler && this.queue.length > 0) handler(this.queue.shift()!);
  }

  protected deliver(msg: S): void {
    if (this.handler) this.handler(msg);
    else this.queue.push(msg);
  }
}

/**
 * A joined Colyseus room whose first message told which game mode it plays. Messages are kept
 * until a link takes the room over (setSink), so nothing is lost while the menu decides.
 */
export interface JoinedRoom {
  room: Room;
  mode: "race" | "coop";
  /** Hand every message (those received so far first) to `sink`. */
  setSink(sink: (msg: unknown) => void): void;
}

/** How long to wait for a room's first message before giving up, milliseconds. */
const FIRST_MESSAGE_TIMEOUT_MS = 8000;

/**
 * Create a room of type `roomName`, or join one by its code (whatever its mode), then wait for
 * the session's first message: "lobby" for the race, "coopLobby" for the co-op mode.
 * Throws with a French message on failure. `version` is checked by the co-op rooms.
 */
export async function joinRoom(name: string, code: string | null, roomName: string, version: number): Promise<JoinedRoom> {
  const client = new Client(serverUrl());
  let room: Room;
  // `key` lets a player who reloaded the page take their place back in a running race (see
  // playerKey.ts); `version` is checked by the co-op rooms. Each room reads what it needs.
  const options = { name, version, key: playerKey() };
  try {
    room = code ? await client.joinById(code.toUpperCase(), options) : await client.create(roomName, options);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // The session said why (game already started, new version...), in French: show it as is.
    if ((e as { code?: unknown }).code === JOIN_REFUSED_CODE && message) throw new Error(message);
    if (code && /not found|locked|full/i.test(message)) throw new Error(`Salon ${code.toUpperCase()} introuvable ou plein.`);
    throw new Error(`Impossible de joindre le serveur (${serverUrl()}). Est-il lancé ?`);
  }
  const buffered: unknown[] = [];
  let sink: ((msg: unknown) => void) | null = null;
  let first: ((msg: unknown) => void) | null = null;
  room.onMessage("*", (_type, payload) => {
    if (sink) sink(payload);
    else buffered.push(payload);
    first?.(payload);
  });
  const firstMessage = await new Promise<unknown>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Le serveur ne répond pas.")), FIRST_MESSAGE_TIMEOUT_MS);
    first = (msg) => {
      window.clearTimeout(timer);
      first = null;
      resolve(msg);
    };
    if (buffered.length > 0) first(buffered[0]);
  }).catch((e: unknown) => {
    void room.leave(true);
    throw e;
  });
  const mode = (firstMessage as { type?: string }).type === "coopLobby" ? "coop" : "race";
  // Reloading the page now lands on the menu with this room's code filled in (?salon=ABCD).
  rememberRoomInUrl(room.roomId);
  return {
    room,
    mode,
    setSink: (s) => {
      sink = s;
      const pending = buffered.splice(0);
      for (const m of pending) s(m);
    },
  };
}

/** Server address: same host as the page, port 2567, unless VITE_SERVER_URL says otherwise. */
export function serverUrl(): string {
  const fromEnv = import.meta.env.VITE_SERVER_URL as string | undefined;
  if (fromEnv) return fromEnv;
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${location.hostname}:${SERVER_PORT}`;
}

/**
 * Messages that are pointless once they are late, so they are not sent while the connection
 * is down. The network layer keeps only the last few messages sent while offline
 * (Colyseus: 10), and poses go out every 50 ms: without this they would push out, within
 * half a second, the messages that matter ("died", "finished", the dead player's block...).
 * A ping sent offline would also come back with a meaningless round trip.
 */
export function skipWhileOffline(msg: ClientMessage): boolean {
  // Vine grabs and stomps are stale too: the session releases the vines of a player who
  // drops, and on reconnection the run restarts from the spawn. Replayed after the resync,
  // an old "vine hold" would lock that vine for everyone.
  return msg.type === "pose" || msg.type === "ping" || msg.type === "vine" || msg.type === "stomp";
}

export class OnlineLink extends BaseLink implements GameLink {
  readonly online = true;
  readonly myId: string;
  private clock = new ClockSync();
  /** False between a dropped connection and its reconnection. */
  private connected = true;
  private pingTimer: number;

  private constructor(
    private room: Room,
    joined: JoinedRoom,
  ) {
    super();
    this.myId = room.sessionId;
    joined.setSink((payload) => this.receive(payload as ServerMessage));
    room.onDrop(() => {
      this.connected = false;
      this.isLost = true;
      this.onStatus?.("lost");
    });
    room.onReconnect(() => {
      this.connected = true;
      this.isLost = false;
      // The route may have changed: measure the clock again quickly.
      this.pingBurst();
      this.onStatus?.("back");
    });
    room.onLeave((code) => {
      this.connected = false;
      this.isLost = true;
      // The session took this player back under another connection: say so, not "server down".
      if (code === TAKEN_OVER_CODE) this.closeMessage = TAKEN_OVER_REASON;
      window.clearInterval(this.pingTimer);
      this.onStatus?.("closed");
    });
    // A burst of pings to sync the clock quickly, then one every 2 seconds.
    this.pingBurst();
    this.pingTimer = window.setInterval(() => this.ping(), 2000);
  }

  /** Take over a race room joined with joinRoom (its first message was the race lobby). */
  static fromRoom(joined: JoinedRoom): OnlineLink {
    return new OnlineLink(joined.room, joined);
  }

  send(msg: ClientMessage): void {
    if (!this.connected && skipWhileOffline(msg)) return;
    this.room.send(msg.type, msg);
  }

  /**
   * Server time, from the monotonic clock: a jump of this machine's wall clock does not move
   * it. Before the first pong, this machine's wall clock stands in.
   */
  serverNow(): number {
    return this.clock.serverNow(performance.now(), Date.now());
  }

  leave(): void {
    window.clearInterval(this.pingTimer);
    void this.room.leave(true);
  }

  private pingBurst(): void {
    for (let i = 0; i < 5; i++) window.setTimeout(() => this.ping(), i * 150);
  }

  private ping(): void {
    // `c` is echoed back: performance.now, so the round trip ignores wall clock jumps.
    this.send({ type: "ping", c: performance.now() });
  }

  private receive(msg: ServerMessage): void {
    if (msg.type === "pong") {
      this.clock.addSample(msg.c, performance.now(), msg.s);
      return;
    }
    this.deliver(msg);
  }
}

export class LocalLink extends BaseLink implements GameLink {
  readonly online = false;
  readonly myId = "moi";
  private session: GameSession;

  constructor(name: string) {
    super();
    // Messages are delivered asynchronously, like over a network, so the scene code
    // never sees a reply in the middle of sending.
    const post = (msg: ServerMessage) => queueMicrotask(() => this.deliver(msg));
    this.session = new GameSession(
      {
        // The monotonic clock on both sides: a jump of the wall clock must not end a race.
        now: () => performance.now(),
        send: (_id, msg) => post(msg),
        broadcast: post,
        setTimeout: (fn, ms) => {
          const t = window.setTimeout(fn, ms);
          return () => window.clearTimeout(t);
        },
        setInterval: (fn, ms) => {
          const t = window.setInterval(fn, ms);
          return () => window.clearInterval(t);
        },
        random: () => Math.random(),
      },
      "SOLO",
    );
    this.session.addPlayer(this.myId, name);
  }

  send(msg: ClientMessage): void {
    if (msg.type === "ping") return;
    queueMicrotask(() => this.session.handle(this.myId, msg));
  }

  serverNow(): number {
    return performance.now();
  }

  leave(): void {
    this.session.dispose();
  }
}
