/**
 * The connection between the co-op screens and a co-op room (CoopSession on the server).
 * Same queue-and-handler handoff as the race mode's links, typed for the co-op messages, with a
 * monotonic server clock (the co-op world's ticks follow it).
 */
import type { Room } from "@colyseus/sdk";
import type { CoopClientMessage, CoopServerMessage } from "@game/shared/coop";
import { BaseLink, type JoinedRoom } from "../../net/link";
import { ServerClock } from "./serverClock";

export interface CoopLink {
  readonly myId: string;
  send(msg: CoopClientMessage): void;
  setHandler(handler: ((msg: CoopServerMessage) => void) | null): void;
  onStatus: ((status: "lost" | "back" | "closed") => void) | null;
  /** Estimated server time, milliseconds. */
  serverNow(): number;
  /** Shortest recent round trip to the server, milliseconds. */
  readonly rtt: number;
  /** A typical recent round trip (75th percentile of the recent pings), milliseconds; Infinity before the first. */
  readonly recentRtt: number;
  leave(): void;
}

export class CoopOnlineLink extends BaseLink<CoopServerMessage> implements CoopLink {
  readonly myId: string;
  private clock = new ServerClock();
  private pingTimer: number;
  private room: Room;

  constructor(joined: JoinedRoom) {
    super();
    this.room = joined.room;
    this.myId = this.room.sessionId;
    joined.setSink((payload) => this.receive(payload as CoopServerMessage));
    this.room.onDrop(() => this.onStatus?.("lost"));
    this.room.onReconnect(() => this.onStatus?.("back"));
    this.room.onLeave(() => {
      window.clearInterval(this.pingTimer);
      this.onStatus?.("closed");
    });
    // A burst of pings to sync the clock quickly, then one every second.
    for (let i = 0; i < 6; i++) window.setTimeout(() => this.ping(), i * 120);
    this.pingTimer = window.setInterval(() => this.ping(), 1000);
  }

  get rtt(): number {
    return this.clock.rtt;
  }

  get recentRtt(): number {
    return this.clock.recentRtt;
  }

  send(msg: CoopClientMessage): void {
    this.room.send(msg.type, msg);
  }

  serverNow(): number {
    return this.clock.now();
  }

  leave(): void {
    window.clearInterval(this.pingTimer);
    void this.room.leave(true);
  }

  private ping(): void {
    this.send({ type: "ping", c: performance.now() });
  }

  private receive(msg: CoopServerMessage): void {
    if (msg.type === "pong") {
      this.clock.sample(msg.c, msg.s);
      return;
    }
    this.deliver(msg);
  }
}
