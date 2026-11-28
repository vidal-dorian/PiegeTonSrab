/**
 * Colyseus room: a thin adapter between the network and GameSession (packages/shared),
 * which holds all of the game logic. This file only maps Colyseus events to session calls.
 */
import { Room, ServerError, type Client } from "@colyseus/core";
import {
  GameSession,
  JOIN_REFUSED_CODE,
  MAX_PLAYERS,
  TAKEN_OVER_CODE,
  TAKEN_OVER_REASON,
  type ClientMessage,
  type ServerMessage,
} from "@game/shared";
import { newCode, releaseCode } from "./roomCodes";

/** Seconds a dropped player has to come back before being removed. */
const RECONNECT_SECONDS = 30;

export class GameRoom extends Room {
  /**
   * Connections, not players: the session refuses a sixth player itself (addPlayer). The
   * headroom is for players coming back into a running game (page reloaded) while their old
   * connection still holds a seat: its 30 s reconnection seat, or a tab still open. With
   * maxClients at MAX_PLAYERS, a full room stayed locked and refused them as "full".
   */
  override maxClients = MAX_PLAYERS * 2;
  private session!: GameSession;
  /** Pending reconnection of each dropped connection, so a comeback can cancel it. */
  private reconnections = new Map<string, ReturnType<Room["allowReconnection"]>>();

  override onCreate(): void {
    // The room id doubles as the code players type to join.
    this.roomId = newCode();
    this.session = new GameSession(
      {
        now: () => Date.now(),
        send: (id, msg) => this.clientById(id)?.send(msg.type, msg),
        broadcast: (msg: ServerMessage) => this.broadcast(msg.type, msg),
        setTimeout: (fn, ms) => {
          const t = this.clock.setTimeout(fn, ms);
          return () => t.clear();
        },
        setInterval: (fn, ms) => {
          const t = this.clock.setInterval(fn, ms);
          return () => t.clear();
        },
        random: () => Math.random(),
      },
      this.roomId,
    );
    // A player came back under a new connection: close the old one if it is still open (it
    // would sit in the room with nobody to play), and free its reconnection seat.
    this.session.onTakeover = (oldId) => {
      this.clientById(oldId)?.leave(TAKEN_OVER_CODE, TAKEN_OVER_REASON);
      // allowReconnection hands back a plain rejected promise for a client that never
      // finished joining: only a pending reconnection can be cancelled.
      const pending = this.reconnections.get(oldId);
      if (pending && typeof pending.reject === "function") pending.reject(new Error("taken over"));
      this.reconnections.delete(oldId);
    };
    // Every message type goes to the session, which checks it.
    this.onMessage("*", (client, type, message) => {
      if (typeof type !== "string" || typeof message !== "object" || message === null) return;
      this.session.handle(client.sessionId, { ...(message as object), type } as ClientMessage);
    });
  }

  override onJoin(client: Client, options?: { name?: string; key?: string }): void {
    // `key` lets a player who reloaded the page take their place back in a running game.
    const error = this.session.addPlayer(client.sessionId, options?.name ?? "", options?.key);
    // Refuse the join itself: a message sent from here never reaches the client (it has not
    // finished joining), and the player would only see a closed connection.
    if (error) throw new ServerError(JOIN_REFUSED_CODE, error);
  }

  override onDrop(client: Client): void {
    const id = client.sessionId;
    // A connection whose player was taken back (closed by onTakeover) has nothing to come back to.
    if (!this.session.hasPlayer(id)) return;
    this.session.setConnected(id, false);
    const reconnection = this.allowReconnection(client, RECONNECT_SECONDS);
    this.reconnections.set(id, reconnection);
    reconnection
      .then(() => this.reconnections.delete(id))
      .catch(() => {
        this.reconnections.delete(id);
        this.session.removePlayer(id);
      });
  }

  override onReconnect(client: Client): void {
    this.session.setConnected(client.sessionId, true);
  }

  override onLeave(client: Client): void {
    this.session.removePlayer(client.sessionId);
  }

  override onDispose(): void {
    this.session.dispose();
    releaseCode(this.roomId);
  }

  private clientById(id: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === id);
  }
}
