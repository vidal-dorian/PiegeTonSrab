export * from "./level";
export * from "./objects";
export * from "./movement/tuning";
export * from "./movement/controller";
export * from "./reachability";
export * from "./rules";
export { testLevel } from "./levels/testLevel";
export { level1 } from "./levels/level1";
export { level2 } from "./levels/level2";
export { level3 } from "./levels/level3";

import type { LevelDefinition } from "./level";
import { level1 } from "./levels/level1";
import { level2 } from "./levels/level2";
import { level3 } from "./levels/level3";

/** Levels a game can be played on. */
export const RACE_LEVELS: LevelDefinition[] = [level1, level2, level3];
