/**
 * Development shortcuts for the co-op mode, read from the address bar. Dev builds only.
 *
 * ?intro                       play the story intro with a sample cast, then back to the menu
 * ?intro=Léo,Alice,Bob,Chloé   the first name plays Ruben, the others are his friends (0 to 4)
 *   &lot                        Ruben was drawn by lot (the intro announces it)
 *   &t=30                       start 30 seconds in
 */
import type Phaser from "phaser";
import { PLAYER_COLORS } from "../render/playerColors";
import { overlay } from "../ui/overlay";
import { INTRO_SCENE_KEY, type IntroCast, type IntroSceneData } from "./intro/introContract";

/** Seat colours in seat order, as a room would give them. */
function colorOf(seat: number): number {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length]!;
}

export function introCastFromQuery(value: string | null, lot: boolean): IntroCast {
  const names = (value ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map((n) => n.slice(0, 16));
  const all = names.length > 0 ? names : ["Ruben", "Alice", "Bob", "Chloé"];
  const [ruben, ...friends] = all;
  return {
    ruben: { pseudo: ruben!, color: colorOf(2), drawnByLot: lot },
    friends: friends.slice(0, 4).map((pseudo, i) => ({ pseudo, color: colorOf([0, 1, 3, 4][i]!) })),
  };
}

/** Starts a dev route if the address asks for one. Returns true if it did. */
export function startDevRoute(game: Phaser.Game): boolean {
  if (!import.meta.env.DEV) return false;
  const params = new URLSearchParams(location.search);
  if (!params.has("intro")) return false;
  const data: IntroSceneData = {
    cast: introCastFromQuery(params.get("intro"), params.has("lot")),
    startAt: Number(params.get("t") ?? 0) || 0,
    onDone: (skipped) => {
      console.info(`[intro] done (skipped: ${skipped})`);
      game.scene.stop(INTRO_SCENE_KEY);
      game.scene.start("menu");
    },
  };
  game.scene.stop("menu");
  overlay.hideAll();
  game.scene.start(INTRO_SCENE_KEY, data);
  return true;
}
