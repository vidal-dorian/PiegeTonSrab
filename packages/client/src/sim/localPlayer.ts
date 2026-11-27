/**
 * The character simulated on this machine: fixed-step loop, interpolation for rendering,
 * and death / finish detection after every step. Used by both the solo practice scene
 * and the round scene.
 */
import {
  CharacterController,
  findKiller,
  HAZARD_INSET,
  SIM_HZ,
  TIMING,
  type Box,
  type Level,
  type MovementTuning,
  type PlacedObject,
  type StepInput,
  type Vine,
} from "@game/shared";

export const STEP = 1 / SIM_HZ;

export type StepOutcome =
  | { kind: "died"; killer: PlacedObject | null; fell: boolean }
  | { kind: "finished"; time: number };

export class LocalPlayer {
  readonly controller: CharacterController;
  /** Simulated seconds since the last reset. Objects use it as the round clock. */
  time = 0;
  /** Body position one simulation step ago (used to tell a stomp from a bump). */
  prevX = 0;
  prevY = 0;
  private accumulator = 0;

  /**
   * Which spawn cell this character uses on the spawn pad: the player's colour index online
   * (unique per room), 0 offline, in practice and in the tutorial. Read on every reset.
   */
  seat = 0;

  /** Vines in the level, and whether this player may grab one (someone else may hold it). */
  vines: readonly Vine[] = [];
  canHoldVine: (vineId: number) => boolean = () => true;
  /** Called when this character grabs (hold) or lets go of a vine. */
  onVine: ((vineId: number, hold: boolean) => void) | null = null;
  /** Called when this character bounces on a spring; `cell` is the spring's cell index. */
  onBounce: ((cell: number) => void) | null = null;
  /** The vine last reported through onVine. */
  private reportedVine: number | undefined;
  /** This character's player id, so a death on several hazards can prefer another player's trap. */
  selfId: string | null = null;
  /**
   * When other players pushed this character (stomped on it or bumped it) within the last
   * TIMING.pushCredit, on the simulated round clock, oldest first. A death on a trap soon
   * after credits a pusher (push-kill, rules.ts).
   */
  private pushes: Array<{ by: string; at: number }> = [];

  constructor(
    private level: Level,
    collision: Level,
    private tuning: MovementTuning,
  ) {
    this.controller = new CharacterController(collision, tuning);
    this.reset();
  }

  /** Back to this seat's spawn cell, clock at zero. */
  reset(): void {
    this.controller.respawn(this.seat);
    this.syncVine();
    this.prevX = this.controller.x;
    this.prevY = this.controller.y;
    this.accumulator = 0;
    this.time = 0;
    this.pushes = [];
  }

  /** Another player just pushed this character. Every push of the credit window is kept. */
  pushedBy(playerId: string): void {
    this.pushes = this.pushes.filter((p) => p.by !== playerId && this.isRecent(p));
    this.pushes.push({ by: playerId, at: this.time });
  }

  /** Players who pushed this character within the credit window, oldest first. */
  recentPushers(): string[] {
    return this.pushes.filter((p) => this.isRecent(p)).map((p) => p.by);
  }

  /**
   * Who gets the push credit if this character dies on a trap now: the trap's owner if they
   * are among the recent pushers (a later push by someone else does not steal it), else the
   * latest recent pusher, else null.
   */
  creditedPusher(ownerId?: string | null): string | null {
    const recent = this.recentPushers();
    if (ownerId && recent.includes(ownerId)) return ownerId;
    return recent[recent.length - 1] ?? null;
  }

  private isRecent(p: { at: number }): boolean {
    return this.time - p.at <= TIMING.pushCredit / 1000;
  }

  setCollision(collision: Level): void {
    this.controller.replaceLevel(collision);
  }

  /**
   * Run as many fixed steps as `frameDt` allows. Stops at the first death or finish and returns it.
   * `onStep` runs after every step (used for the debug trail).
   */
  advance(
    frameDt: number,
    takeInput: () => StepInput,
    objects: readonly PlacedObject[],
    onStep?: () => void,
  ): StepOutcome | null {
    this.accumulator += frameDt;
    while (this.accumulator >= STEP) {
      const c = this.controller;
      // A network message (a stomp) may have dropped the vine since the last step.
      this.syncVine();
      this.prevX = c.x;
      this.prevY = c.y;
      const bounces = c.bounceCount;
      c.step(STEP, takeInput());
      if (!c.swing) c.tryGrabVine(this.vines, this.canHoldVine);
      this.syncVine();
      if (c.bounceCount !== bounces) this.onBounce?.(c.lastBounceCell);
      this.time += STEP;
      this.accumulator -= STEP;
      onStep?.();
      // onStep may push the character (a stomp bounce lets go of the vine).
      this.syncVine();
      const outcome = this.check(objects);
      if (outcome) {
        this.accumulator = 0;
        this.letGo();
        return outcome;
      }
    }
    return null;
  }

  /** Let go of the vine held, if any (death, finish, or someone else got it first). */
  letGo(): void {
    this.controller.releaseVine(false);
    this.syncVine();
  }

  /**
   * Report any change of the vine held since the last report. Every way of grabbing or
   * letting go (steps, stomps, deaths, resets) ends up here, so the session always knows.
   */
  syncVine(): void {
    const now = this.controller.swing?.vineId;
    if (now === this.reportedVine) return;
    const was = this.reportedVine;
    this.reportedVine = now;
    if (was !== undefined) this.onVine?.(was, false);
    if (now !== undefined) this.onVine?.(now, true);
  }

  /** Move the clock forward without simulating (the tab froze): keeps traps in step with everyone. */
  catchUp(roundTime: number): void {
    const skipped = roundTime - this.time;
    if (skipped <= 0) return;
    // The push-credit window counts simulated time only: the body did not move meanwhile.
    for (const p of this.pushes) p.at += skipped;
    this.time = roundTime;
  }

  /** Position to draw at, interpolated between the last two steps. */
  renderPosition(): { x: number; y: number } {
    const a = this.accumulator / STEP;
    const c = this.controller;
    return { x: this.prevX + (c.x - this.prevX) * a, y: this.prevY + (c.y - this.prevY) * a };
  }

  /** Round clock including the fraction of a step not simulated yet, for smooth object animation. */
  renderTime(): number {
    return this.time + this.accumulator;
  }

  /** Centre of the body, cells. */
  centre(): { x: number; y: number } {
    const c = this.controller;
    return { x: c.x + this.tuning.bodyWidth / 2, y: c.y + this.tuning.bodyHeight / 2 };
  }

  private check(objects: readonly PlacedObject[]): StepOutcome | null {
    const c = this.controller;
    const t = this.tuning;
    if (c.fellOut) return { kind: "died", killer: null, fell: true };
    const box: Box = {
      x: c.x + HAZARD_INSET,
      y: c.y + HAZARD_INSET,
      w: t.bodyWidth - 2 * HAZARD_INSET,
      h: t.bodyHeight - 2 * HAZARD_INSET,
    };
    // vx too: spikes facing sideways spare a body moving away from their points.
    const killer = findKiller(
      objects,
      box,
      c.vy,
      this.time,
      { victimId: this.selfId, pusherIds: this.recentPushers() },
      c.vx,
    );
    if (killer) return { kind: "died", killer, fell: false };
    const f = this.level.finish;
    if (f && c.x < f.x + 1 && c.x + t.bodyWidth > f.x && c.y < f.y + 1 && c.y + t.bodyHeight > f.y) {
      return { kind: "finished", time: this.time };
    }
    return null;
  }
}
