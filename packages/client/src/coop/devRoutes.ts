/**
 * Development shortcuts for the co-op mode, read from the address bar. Dev builds only.
 *
 * ?intro                       play the story intro with a sample cast, then back to the menu
 * ?intro=Léo,Alice,Bob,Chloé   the first name plays Ruben, the others are his friends (0 to 4)
 *   &lot                        Ruben was drawn by lot (the intro announces it)
 *   &t=30                       start 30 seconds in
 * ?coopLocal=2                 a co-op level with two players on one keyboard
 *                              (J1: Q/D, Z, S, R; J2: arrows, Suppr); 3 to 5 adds passive bodies
 *   &level=<id>                 which level: a campaign id, "showcase" for one of every thing, or
 *                              "sandbox" for the rope (the pulley is at its far right)
 *                              (default: the first level of the campaign)
 *   &spawn=<x>                  the team spawns from column x instead (on the highest floor there;
 *                              restarts too): "?coopLocal=2&level=sandbox&spawn=61" starts at the pulley
 *   &noruben                    every body is a friend (J2 drives the last one): the pulley's two
 *                              sides then weigh the same
 */
import type Phaser from "phaser";
import { COOP_LEVELS, sandboxLevel, type CoopLevelDef } from "@game/shared/coop";
import { SPLIT_KEYS } from "../input";
import { PLAYER_COLORS } from "../render/playerColors";
import { overlay } from "../ui/overlay";
import { showcaseLevel } from "./devShowcase";
import { withSpawnAt } from "./devSpawn";
import { INTRO_SCENE_KEY, type IntroCast, type IntroSceneData } from "./intro/introContract";

/** Seat colours in seat order, as a room would give them. */
function colorOf(seat: number): number {
  return PLAYER_COLORS[seat % PLAYER_COLORS.length]!;
}

/** Levels the dev tool can open: the campaign, then the showcase and the rope's sandbox. */
export const DEV_LEVELS: readonly CoopLevelDef[] = [...COOP_LEVELS, showcaseLevel, sandboxLevel];

/** The level asked for by `?level=` (unknown or missing: the first). */
export function devLevel(id: string | null): CoopLevelDef {
  return DEV_LEVELS.find((l) => l.id === id) ?? DEV_LEVELS[0]!;
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
  if (params.has("coopLocal")) {
    const level = devLevel(params.get("level"));
    const spawn = params.get("spawn");
    const moved = spawn !== null && Number.isInteger(Number(spawn)) ? withSpawnAt(level, Number(spawn)) : null;
    startCoopLocal(game, Number(params.get("coopLocal")) || 2, moved ?? level, !params.has("noruben"));
    return true;
  }
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

/** A co-op level on one keyboard: friends in seat order, Ruben last in the chain. */
function startCoopLocal(game: Phaser.Game, count: number, level: CoopLevelDef, withRuben: boolean): void {
  const n = Math.max(2, Math.min(5, count));
  const names = ["J1", "Alice", "Bob", "Chloé"];
  const players = Array.from({ length: n }, (_, i) => {
    const last = i === n - 1;
    const isRuben = withRuben && last;
    const name = isRuben ? "Ruben (J2)" : last ? "J2" : (names[i] ?? `J${i + 1}`);
    return { name, color: colorOf(isRuben ? 2 : [0, 1, 3, 4][i]!), isRuben };
  });
  // J1 drives the first body, J2 the last one (Ruben, unless &noruben); the others stay passive.
  const localKeys = players.map((_, i) => (i === 0 ? SPLIT_KEYS[0]! : i === n - 1 ? SPLIT_KEYS[1]! : null));
  game.scene.stop("menu");
  overlay.hideAll();
  game.scene.start("coop", {
    mode: "local",
    level,
    players,
    localKeys,
    levels: DEV_LEVELS,
    onExit: () => {
      game.scene.stop("coop");
      game.scene.start("menu");
    },
  });
}
