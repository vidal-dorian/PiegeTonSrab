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
  ROOM_NAME,
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

export abstract class BaseLink {
  closeMessage: string | null = null;
  isLost = false;
  private handler: ((msg: ServerMessage) => void) | null = null;
  private queue: ServerMessage[] = [];
  onStatus: ((status: "lost" | "back" | "closed") => void) | null = null;

  setHandler(handler: ((msg: ServerMessage) => void) | null): void {
    this.handler = handler;
    // One at a time, and only while this handler is still the one set: a handler that lets go
    // in the middle (GameScene on gameStart, LobbyScene when the game starts) leaves the rest,
    // in order, to the next one. Messages that arrive meanwhile are queued behind them.
    while (handler && this.handler === handler && this.queue.length > 0) handler(this.queue.shift()!);
  }

  protected deliver(msg: ServerMessage): void {
    if (this.handler) this.handler(msg);
    else this.queue.push(msg);
  }
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

  private constructor(private room: Room) {
    super();
    this.myId = room.sessionId;
    room.onMessage("*", (_type, payload) => this.receive(payload as ServerMessage));
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

  /** Create a new room, or join one by its code. Throws with a French message on failure. */
  static async connect(name: string, code: string | null): Promise<OnlineLink> {
    const client = new Client(serverUrl());
    try {
      const options = { name, key: playerKey() };
      const room = code ? await client.joinById(code.toUpperCase(), options) : await client.create(ROOM_NAME, options);
      rememberRoomInUrl(room.roomId);
      return new OnlineLink(room);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // The session said why (game already started...), in French: show it as is.
      if ((e as { code?: unknown }).code === JOIN_REFUSED_CODE && message) throw new Error(message);
      if (code && /not found|locked|full/i.test(message)) throw new Error(`Salon ${code.toUpperCase()} introuvable ou plein.`);
      throw new Error(`Impossible de joindre le serveur (${serverUrl()}). Est-il lancé ?`);
    }
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
