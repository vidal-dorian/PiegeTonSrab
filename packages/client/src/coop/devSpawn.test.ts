import { describe, expect, it } from "vitest";
import { parseCoopLevel, sandboxLevel } from "@game/shared/coop";
import { withSpawnAt } from "./devSpawn";

describe("dev spawn", () => {
  it("moves the sandbox's team to the end ledge before the pulley", () => {
    const moved = withSpawnAt(sandboxLevel, 61)!;
    expect(moved).not.toBeNull();
    const level = parseCoopLevel(moved, 2);
    expect(level.spawns[0]).toMatchObject({ x: 61, y: 10 });
    expect(moved.rows.join("").split("S")).toHaveLength(2);
    // The original is untouched.
    expect(parseCoopLevel(sandboxLevel, 2).spawns[0]).toMatchObject({ x: 2, y: 19 });
  });

  it("gives up where five cells of floor cannot be found", () => {
    expect(withSpawnAt(sandboxLevel, 66)).toBeNull();
    expect(withSpawnAt(sandboxLevel, 200)).toBeNull();
  });
});
