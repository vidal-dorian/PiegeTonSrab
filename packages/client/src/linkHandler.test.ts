/**
 * BaseLink's handler handoff: messages queued while no screen listens go to the next handler, one
 * at a time, and stop as soon as a message makes its handler step down (a scene switch).
 */
import { describe, expect, it } from "vitest";
import { BaseLink } from "./net/link";

class TestLink extends BaseLink<string> {
  push(msg: string): void {
    this.deliver(msg);
  }
}

describe("BaseLink handler handoff", () => {
  it("keeps what follows a scene switch for the next screen", () => {
    const link = new TestLink();
    for (const m of ["lobby", "level", "snap", "pause"]) link.push(m);
    const lobby: string[] = [];
    link.setHandler((m) => {
      lobby.push(m);
      // The lobby screen hands over to the game screen, which starts later.
      if (m === "level") link.setHandler(null);
    });
    expect(lobby).toEqual(["lobby", "level"]);
    const game: string[] = [];
    link.setHandler((m) => game.push(m));
    expect(game).toEqual(["snap", "pause"]);
    link.push("later");
    expect(game).toEqual(["snap", "pause", "later"]);
  });

  it("a handler that installs the next one directly hands it the rest, in order", () => {
    const link = new TestLink();
    for (const m of ["a", "b", "c"]) link.push(m);
    const first: string[] = [];
    const second: string[] = [];
    link.setHandler((m) => {
      first.push(m);
      link.setHandler((n) => second.push(n));
    });
    expect(first).toEqual(["a"]);
    expect(second).toEqual(["b", "c"]);
  });
});
