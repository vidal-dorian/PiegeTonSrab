/**
 * The co-op campaign, in order: Ruben's semester at the IUT de Rodez. Levels join as they are
 * designed and checked by the bots at 2 to 5 players (docs/coop-levels.md).
 */
import type { CoopLevelDef } from "./levelFormat";
import { coop01 } from "./levels/coop01";
import { coop02 } from "./levels/coop02";
import { coop03 } from "./levels/coop03";
import { coop04 } from "./levels/coop04";
import { coop05 } from "./levels/coop05";

export const COOP_LEVELS: readonly CoopLevelDef[] = [coop01, coop02, coop03, coop04, coop05];
