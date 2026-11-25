/**
 * What this client knows about its own run and the round's kills, kept right across a
 * reconnection in the middle of a race (GameScene). Pure, so it can be unit-tested.
 */
import { DEFAULT_GAME_CONFIG, killPoints, type RaceResult, type RaceStatus, type TrapDeath } from "@game/shared";

/** This client's own race status. "timeout": the race time ran out while still running. */
export type MyStatus = "running" | "dead" | "finished" | "timeout";

/**
 * Our status when a countdown arrives. A player who rejoins a race the session already has
 * them dead or finished in watches the rest of it: a new run would count for nothing.
 */
export function statusFromCountdown(status: RaceStatus | undefined): MyStatus {
  return status === "dead" || status === "finished" ? status : "running";
}

/**
 * Our status once the session reports our own death or finish. Normally we already know (we
 * sent it). Not when a report sent while offline (the network layer buffers it) reaches the
 * session after we rejoined and restarted from the spawn: the session counts that old run,
 * so ours is over too.
 */
export function statusAfterOwnReport(current: MyStatus, report: "dead" | "finished"): MyStatus {
  return current === "running" ? report : current;
}

/**
 * Each trap owner's victims this round, for the "+N" of the kill notices. Seeded from the
 * countdown (a client that rejoins mid-race missed the earlier deaths), then fed each
 * playerDied, so the gain shown matches the score past killCap.
 */
export class RoundKills {
  private victims = new Map<string, RaceResult[]>();

  /** A player came back under a new id (see the "renamed" message). */
  rename(from: string, to: string): void {
    const r = (id: string | null) => (id === from ? to : id);
    this.victims = new Map(
      [...this.victims].map(([owner, list]) => [
        r(owner)!,
        list.map((v) => ({ ...v, playerId: r(v.playerId)!, killedBy: r(v.killedBy), pushedBy: r(v.pushedBy ?? null) })),
      ]),
    );
  }

  reset(deaths: readonly TrapDeath[] = []): void {
    this.victims.clear();
    for (const d of deaths) this.add(d);
  }

  /** Record a death in `killerOwner`'s object; returns what it adds to their kill points (null: their own trap, no kill). */
  add(d: TrapDeath): number | null {
    if (d.killerOwner === d.id) return null;
    // The session never changes killCap, so the default config gives the same values as the score.
    const list = this.victims.get(d.killerOwner) ?? [];
    const before = killPoints(list, d.killerOwner, DEFAULT_GAME_CONFIG, false).points;
    list.push({ playerId: d.id, finishTime: null, killedBy: d.killerOwner, pushedBy: d.pushedBy });
    this.victims.set(d.killerOwner, list);
    return killPoints(list, d.killerOwner, DEFAULT_GAME_CONFIG, false).points - before;
  }
}
