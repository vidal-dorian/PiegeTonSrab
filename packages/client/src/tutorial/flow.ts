/**
 * The tutorial's script, as a pure state machine (no Phaser, no DOM) so it can be unit-tested.
 *
 * Hard requirement from the game designer: 20 to 30 s for a player who follows the prompts.
 * So the script is a fixed list of steps; each step is one or more goals the player must
 * reach, then one or more short "outro" lines that explain what just happened (the points).
 * The tutorial must never stall: a goal not reached within `helpAfter` seconds is done for
 * the player (the scene gets a "help" event and acts it out: places the saw, moves the
 * player...), and the flow carries on. With every goal helped, the whole thing still ends
 * within the 30 s budget (see tutorial.test.ts).
 *
 * Text conventions: "[Q]" is drawn as a key cap, "+2" as an orange points badge (hud.ts).
 */

export type StepId = "move" | "trap" | "stomp" | "flag";
export type GoalId = "marker" | "place" | "rivalDies" | "stomp" | "flag";

export interface GoalDef {
  id: GoalId;
  prompt: string;
  /** Smaller second line under the prompt. */
  sub?: string;
  /** Seconds before the tutorial does it for the player. */
  helpAfter: number;
}

export interface OutroDef {
  text: string;
  sub?: string;
  /** Seconds on screen. */
  time: number;
}

export interface StepDef {
  id: StepId;
  goals: readonly GoalDef[];
  outros: readonly OutroDef[];
}

export const TUTORIAL_STEPS: readonly StepDef[] = [
  {
    id: "move",
    goals: [
      {
        id: "marker",
        prompt: "Cours avec [Q] / [D], saute avec [Espace]",
        sub: "Saute par-dessus le trou, jusqu'à la flèche",
        helpAfter: 5,
      },
    ],
    outros: [{ text: "Bien !", time: 0.8 }],
  },
  {
    id: "trap",
    goals: [
      { id: "place", prompt: "Pose ta scie sur le chemin du rival", sub: "Clique sur une case orange", helpAfter: 6 },
      // Only a safety net: the rival dies on the saw well under a second after it starts running.
      { id: "rivalDies", prompt: "Le voilà qui fonce…", helpAfter: 3 },
    ],
    outros: [{ text: "+1 : il est mort dans TON piège", sub: "Chaque rival tué par ton piège : 1 point", time: 2.2 }],
  },
  {
    id: "stomp",
    goals: [{ id: "stomp", prompt: "Saute-lui sur la tête !", sub: "Retombe sur lui, d'en haut", helpAfter: 5 }],
    outros: [
      { text: "POF ! Il est sonné.", time: 1 },
      { text: "Pousse un rival dans TON piège : +2", sub: "Écrase-le ou bouscule-le juste devant", time: 2.5 },
    ],
  },
  {
    id: "flag",
    goals: [{ id: "flag", prompt: "File au drapeau !", helpAfter: 3.5 }],
    outros: [{ text: "+2 en arrivant, +1 si tu es premier", time: 2.5 }],
  },
];

export type FlowEvent =
  /** A new step starts (the scene sets up its area: checkpoint, rival). */
  | { type: "step"; step: StepId; number: number }
  /** A goal starts: show its prompt. */
  | { type: "goal"; step: StepId; goal: GoalDef }
  /** The player took too long (or pressed "next"): the scene does the goal for them. */
  | { type: "help"; step: StepId; goal: GoalId }
  /** An outro line starts: show it. */
  | { type: "outro"; step: StepId; outro: OutroDef }
  /** The script is over: show the end card. */
  | { type: "done" };

export type FlowPhase =
  | { kind: "goal"; step: StepDef; goal: GoalDef }
  | { kind: "outro"; step: StepDef; outro: OutroDef }
  | { kind: "done" };

export class TutorialFlow {
  /** Seconds since start(). */
  elapsed = 0;
  /** Seconds since the current goal or outro started. */
  phaseTime = 0;
  private stepIndex = 0;
  private goalIndex = 0;
  /** -1 while the step's goals are running. */
  private outroIndex = -1;
  private finished = false;

  constructor(readonly steps: readonly StepDef[] = TUTORIAL_STEPS) {}

  get stepCount(): number {
    return this.steps.length;
  }

  /** 1-based step number, for the "2/4" counter. */
  get stepNumber(): number {
    return Math.min(this.stepIndex + 1, this.steps.length);
  }

  get done(): boolean {
    return this.finished;
  }

  get phase(): FlowPhase {
    if (this.finished) return { kind: "done" };
    const step = this.steps[this.stepIndex]!;
    if (this.outroIndex < 0) return { kind: "goal", step, goal: step.goals[this.goalIndex]! };
    return { kind: "outro", step, outro: step.outros[this.outroIndex]! };
  }

  /** The goal the player is working on, if any. */
  get goal(): GoalId | null {
    const p = this.phase;
    return p.kind === "goal" ? p.goal.id : null;
  }

  start(): FlowEvent[] {
    this.elapsed = 0;
    this.finished = false;
    return this.enterStep(0);
  }

  /** Advance the clocks; fires the help of a goal that took too long and ends outros. */
  update(dt: number): FlowEvent[] {
    if (this.finished) return [];
    this.elapsed += dt;
    this.phaseTime += dt;
    const p = this.phase;
    if (p.kind === "goal" && this.phaseTime >= p.goal.helpAfter) return this.help();
    if (p.kind === "outro" && this.phaseTime >= p.outro.time) return this.nextOutro();
    return [];
  }

  /** The player reached `goal`. Ignored unless it is the current goal (reached early or late). */
  reach(goal: GoalId): FlowEvent[] {
    if (this.goal !== goal) return [];
    return this.completeGoal();
  }

  /** "Étape suivante": the current goal is done for the player, or the current outro is cut short. */
  next(): FlowEvent[] {
    const p = this.phase;
    if (p.kind === "goal") return this.help();
    if (p.kind === "outro") return this.nextOutro();
    return [];
  }

  private help(): FlowEvent[] {
    const p = this.phase;
    if (p.kind !== "goal") return [];
    return [{ type: "help", step: p.step.id, goal: p.goal.id }, ...this.completeGoal()];
  }

  private completeGoal(): FlowEvent[] {
    const step = this.steps[this.stepIndex]!;
    this.phaseTime = 0;
    if (this.goalIndex + 1 < step.goals.length) {
      this.goalIndex++;
      return [{ type: "goal", step: step.id, goal: step.goals[this.goalIndex]! }];
    }
    if (step.outros.length === 0) return this.enterStep(this.stepIndex + 1);
    this.outroIndex = 0;
    return [{ type: "outro", step: step.id, outro: step.outros[0]! }];
  }

  private nextOutro(): FlowEvent[] {
    const step = this.steps[this.stepIndex]!;
    this.phaseTime = 0;
    if (this.outroIndex + 1 < step.outros.length) {
      this.outroIndex++;
      return [{ type: "outro", step: step.id, outro: step.outros[this.outroIndex]! }];
    }
    return this.enterStep(this.stepIndex + 1);
  }

  private enterStep(index: number): FlowEvent[] {
    this.phaseTime = 0;
    this.goalIndex = 0;
    this.outroIndex = -1;
    if (index >= this.steps.length) {
      this.stepIndex = this.steps.length - 1;
      this.finished = true;
      return [{ type: "done" }];
    }
    this.stepIndex = index;
    const step = this.steps[index]!;
    return [
      { type: "step", step: step.id, number: index + 1 },
      { type: "goal", step: step.id, goal: step.goals[0]! },
    ];
  }
}

/** Seconds of the script the player cannot shorten by playing well (every outro line). */
export function outroTime(steps: readonly StepDef[] = TUTORIAL_STEPS): number {
  return steps.reduce((sum, s) => sum + s.outros.reduce((a, o) => a + o.time, 0), 0);
}

/** A piece of prompt text: plain, a key cap ("[Espace]") or a points badge ("+2"). */
export type PromptToken = { kind: "text" | "key" | "points"; text: string };

/** Split a prompt into plain text, key caps and points badges (drawn by hud.ts). */
export function tokenizePrompt(text: string): PromptToken[] {
  const tokens: PromptToken[] = [];
  const re = /\[([^\]]+)\]|(\+\d+)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) tokens.push({ kind: "text", text: text.slice(last, m.index) });
    tokens.push(m[1] !== undefined ? { kind: "key", text: m[1] } : { kind: "points", text: m[2]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) tokens.push({ kind: "text", text: text.slice(last) });
  return tokens;
}
