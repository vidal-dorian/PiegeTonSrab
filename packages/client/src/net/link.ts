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
  type ClientMessage,
  type ServerMessage,
} from "@game/shared";

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
  /** Estimated server time, milliseconds. */
  serverNow(): number;
  leave(): void;
}

/** Message queue and handler handoff shared by every link (race and co-op). */
export abstract class BaseLink<S = ServerMessage> {
  private handler: ((msg: S) => void) | null = null;
  private queue: S[] = [];
  onStatus: ((status: "lost" | "back" | "closed") => void) | null = null;

  setHandler(handler: ((msg: S) => void) | null): void {
    this.handler = handler;
    // One message at a time: a message can make its handler step down (a scene switch), and what
    // is left then waits for the next handler instead of going to the one that left.
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
  try {
    room = code ? await client.joinById(code.toUpperCase(), { name, version }) : await client.create(roomName, { name, version });
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

export class OnlineLink extends BaseLink implements GameLink {
  readonly online = true;
  readonly myId: string;
  /** serverTime ≈ Date.now() + offset, measured with ping/pong. */
  private offset = 0;
  private bestRtt = Infinity;
  private pingTimer: number;

  private constructor(
    private room: Room,
    joined?: JoinedRoom,
  ) {
    super();
    this.myId = room.sessionId;
    if (joined) joined.setSink((payload) => this.receive(payload as ServerMessage));
    else room.onMessage("*", (_type, payload) => this.receive(payload as ServerMessage));
    room.onDrop(() => this.onStatus?.("lost"));
    room.onReconnect(() => this.onStatus?.("back"));
    room.onLeave(() => {
      window.clearInterval(this.pingTimer);
      this.onStatus?.("closed");
    });
    // A burst of pings to sync the clock quickly, then one every 2 seconds.
    for (let i = 0; i < 5; i++) window.setTimeout(() => this.ping(), i * 150);
    this.pingTimer = window.setInterval(() => this.ping(), 2000);
  }

  /** Take over a race room joined with joinRoom (its first message was the race lobby). */
  static fromRoom(joined: JoinedRoom): OnlineLink {
    return new OnlineLink(joined.room, joined);
  }

  /** Create a new room, or join one by its code. Throws with a French message on failure. */
  static async connect(name: string, code: string | null): Promise<OnlineLink> {
    const client = new Client(serverUrl());
    try {
      const room = code ? await client.joinById(code.toUpperCase(), { name }) : await client.create(ROOM_NAME, { name });
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
    this.room.send(msg.type, msg);
  }

  serverNow(): number {
    return Date.now() + this.offset;
  }

  leave(): void {
    window.clearInterval(this.pingTimer);
    void this.room.leave(true);
  }

  private ping(): void {
    this.send({ type: "ping", c: Date.now() });
  }

  private receive(msg: ServerMessage): void {
    if (msg.type === "pong") {
      // Keep the measurement with the shortest round trip: it has the least uncertainty.
      const now = Date.now();
      const rtt = now - msg.c;
      if (rtt <= this.bestRtt * 1.2) {
        this.bestRtt = Math.min(this.bestRtt, rtt);
        this.offset = msg.s + rtt / 2 - now;
      }
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
        now: () => Date.now(),
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
    return Date.now();
  }

  leave(): void {
    this.session.dispose();
  }
}
