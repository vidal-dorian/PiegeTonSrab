/**
 * Colyseus room of the co-op mode ("Sauve Ton Srab"): a thin adapter between the network and
 * CoopSession (packages/shared/src/coop), like GameRoom for the race mode.
 *
 * Differences with GameRoom: the session's clock is monotonic (the co-op world runs on the
 * server and its ticks follow the clock; a wall-clock jump from NTP must not move them), and the
 * room ticks its clock at 60 Hz so the session can step the world and send snapshots on time.
 */
import { Room, ServerError, type Client } from "@colyseus/core";
import { JOIN_REFUSED_CODE } from "@game/shared";
import {
  COOP_LEVELS,
  COOP_RECONNECT_SECONDS,
  COOP_TICK_MS,
  CoopSession,
  COOP,
  type CoopClientMessage,
  type CoopServerMessage,
} from "@game/shared/coop";
import { newCode, releaseCode } from "./roomCodes";

/** Milliseconds on a clock that never jumps (performance.now), offset to look like Date.now(). */
const monotonicNow = (): number => performance.timeOrigin + performance.now();

export class CoopRoom extends Room {
  override maxClients = COOP.maxPlayers;
  private session!: CoopSession;

  override onCreate(): void {
    // The room id doubles as the code players type to join (shared with the race rooms).
    this.roomId = newCode();
    this.session = new CoopSession(
      {
        now: monotonicNow,
        send: (id, msg: CoopServerMessage) => this.clientById(id)?.send(msg.type, msg),
        broadcast: (msg: CoopServerMessage) => this.broadcast(msg.type, msg),
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
      COOP_LEVELS,
    );
    // Tick the room clock (and so the session's timers) at 60 Hz; the default would be the 20 Hz
    // patch rate, too coarse to step the world and send snapshots on time.
    this.setSimulationInterval(() => undefined, COOP_TICK_MS);
    this.onMessage("*", (client, type, message) => {
      if (typeof type !== "string" || typeof message !== "object" || message === null) return;
      this.session.handle(client.sessionId, { ...(message as object), type } as CoopClientMessage);
    });
  }

  override onJoin(client: Client, options?: { name?: string; version?: number }): void {
    const error = this.session.addPlayer(client.sessionId, options?.name ?? "", options?.version);
    if (error) throw new ServerError(JOIN_REFUSED_CODE, error);
  }

  override onDrop(client: Client): void {
    this.session.setConnected(client.sessionId, false);
    this.allowReconnection(client, COOP_RECONNECT_SECONDS).catch(() => this.session.removePlayer(client.sessionId));
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
