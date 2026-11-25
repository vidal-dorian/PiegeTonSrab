/**
 * Contract between the co-op mode ("Sauve Ton Srab") and its animated story intro.
 *
 * The intro itself (IntroScene.ts and the files next to it in this folder) is written by a
 * dedicated agent; the rest of the game relies only on what is declared here. Changes to this file
 * must stay backward compatible: the co-op scene, the dev route (?intro) and the online intro phase
 * all depend on it.
 *
 * How the game uses the intro:
 * - It starts the Phaser scene INTRO_SCENE_KEY with an IntroSceneData (after hiding the HTML overlay).
 * - The scene plays the story once, from `startAt` seconds in, and calls `onDone(false)` when it
 *   reaches the end, or `onDone(true)` as soon as the player skips it (Entrée, Espace, the gamepad's
 *   A or Start button, or the on-screen "Passer" button). `onDone` is called exactly once. After it,
 *   the scene may keep showing its last frame; it never starts another scene itself.
 * - The game can stop the scene at any time (this.scene.stop(INTRO_SCENE_KEY)): for example online,
 *   when everyone has skipped or the server's time limit is reached. On shutdown the scene removes
 *   everything it added, DOM elements included, and does not call `onDone`.
 * - Online every player watches the intro on their own computer; the server only waits for each
 *   player's onDone (or a timeout), so the scene itself knows nothing about the network.
 */

export const INTRO_SCENE_KEY = "coopIntro";

/** One character of the story, as the players see it in the lobby. */
export interface IntroActor {
  /** The player's nickname (1 to 16 characters, may contain accents, spaces, emoji; may repeat). */
  pseudo: string;
  /** The player's colour, 0xRRGGBB, one of PLAYER_COLORS (render/playerColors.ts). */
  color: number;
}

export interface IntroCast {
  /**
   * The player who plays Ruben. The hero is always called "Ruben" in the story; when the pseudo is
   * not "Ruben", the intro shows who plays him ("joué par <pseudo>").
   */
  ruben: IntroActor & {
    /** True when nobody picked the role and the game drew Ruben by lot: the intro announces it. */
    drawnByLot: boolean;
  };
  /** Ruben's friends, the other players, in seat order: 0 to 4 of them. */
  friends: IntroActor[];
}

export interface IntroSceneData {
  cast: IntroCast;
  /** Seconds into the intro to start from (a player who reloads mid-intro resumes there). Default 0. */
  startAt?: number;
  /** Called once: skipped = true when the player skipped, false when the intro played to its end. */
  onDone: (skipped: boolean) => void;
}

/**
 * Length of the intro when watched to the end, seconds. The online phase waits at most this plus
 * 10 seconds. The intro's author keeps it equal to the real length of the timeline.
 */
export const INTRO_DURATION_S = 80;
