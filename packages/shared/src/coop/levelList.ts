/**
 * The co-op campaign, in order: Ruben's semester at the IUT de Rodez.
 * Until the real levels exist, the physics sandbox stands in for the campaign.
 */
import type { CoopLevelDef } from "./levelFormat";
import { sandboxLevel } from "./levels/sandbox";

export const COOP_LEVELS: readonly CoopLevelDef[] = [sandboxLevel];
