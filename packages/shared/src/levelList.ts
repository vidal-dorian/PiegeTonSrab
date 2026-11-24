import type { LevelDefinition } from "./level";
import { level1 } from "./levels/level1";
import { level2 } from "./levels/level2";
import { level3 } from "./levels/level3";

/** Levels a game can be played on; the map carousel picks one at random. Add new maps here. */
export const RACE_LEVELS: LevelDefinition[] = [level1, level2, level3];
