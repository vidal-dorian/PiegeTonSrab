/**
 * Colyseus room: a thin adapter between the network and GameSession (packages/shared),
 * which holds all of the game logic. This file only maps Colyseus events to session calls.
 */
import { Room, ServerError, type Client } from "@colyseus/core";
import { GameSession, JOIN_REFUSED_CODE, MAX_PLAYERS, type ClientMessage, type ServerMessage } from "@game/shared";

/** Seconds a dropped player has to come back before being removed. */
const RECONNECT_SECONDS = 30;
/** Room codes: 4 letters, without I and O which look like digits. */
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const usedCodes = new Set<string>();

function newCode(): string {
  for (;;) {
    let code = "";
    for (let i = 0; i < 4; i++) code += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
    if (!usedCodes.has(code)) return code;
  }
}

export class GameRoom extends Room {
  override maxClients = MAX_PLAYERS;
  private session!: GameSession;

  override onCreate(): void {
    // The room id doubles as the code players type to join.
    this.roomId = newCode();
    usedCodes.add(this.roomId);
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
    this.session.setConnected(client.sessionId, false);
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => this.session.removePlayer(client.sessionId));
  }

  override onReconnect(client: Client): void {
    this.session.setConnected(client.sessionId, true);
  }

  override onLeave(client: Client): void {
    this.session.removePlayer(client.sessionId);
  }

  override onDispose(): void {
    this.session.dispose();
    usedCodes.delete(this.roomId);
  }

  private clientById(id: string): Client | undefined {
    return this.clients.find((c) => c.sessionId === id);
  }
}
