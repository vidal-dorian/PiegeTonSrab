/**
 * The menu while a room is joining: "Créer un salon coop" waits for the room's first message (up to
 * 8 s). Another entry picked meanwhile (practice, solo, tutorial) starts its own scene, and the
 * room that answers later must be left, not opened on top of it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuActions } from "../ui/screens";

const h = vi.hoisted(() => ({
  actions: null as MenuActions | null,
  joins: [] as Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }>,
  errors: [] as string[],
}));

vi.mock("phaser", () => ({ default: { Scene: class {} } }));
vi.mock("../net/link", () => ({
  joinRoom: () => new Promise((resolve, reject) => h.joins.push({ resolve, reject })),
  LocalLink: class {},
  OnlineLink: { fromRoom: () => ({}) },
}));
vi.mock("./net/coopLink", () => ({ CoopOnlineLink: class {} }));
vi.mock("../ui/overlay", () => ({ overlay: { hideAll: () => {} } }));
vi.mock("../ui/screens", () => ({
  menuScreen: {
    show: (actions: MenuActions) => {
      h.actions = actions;
    },
    hide: () => {},
    setError: (text: string) => h.errors.push(text),
  },
}));

const { MenuScene } = await import("../scenes/MenuScene");

/** A menu scene with Phaser's scene manager reduced to what the menu uses. */
function menu() {
  const scene = new MenuScene() as unknown as {
    create(data: object): void;
    sys: { isActive(): boolean };
    scene: { start(key: string, data?: unknown): void };
  };
  let active = false;
  const started: string[] = [];
  scene.sys = { isActive: () => active };
  scene.scene = {
    start: (key) => {
      // Starting another scene from the menu stops the menu.
      started.push(key);
      active = key === "menu";
      if (key === "menu") scene.create({});
    },
  };
  active = true;
  scene.create({});
  return { started, start: scene.scene.start };
}

function joined(mode: "coop" | "race") {
  return { mode, room: { leave: vi.fn(async () => {}) }, setSink: () => {} };
}

beforeEach(() => {
  h.joins = [];
  h.errors = [];
  vi.stubGlobal("location", { search: "" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("a room that answers after the player picked another menu entry", () => {
  it("is left, and the co-op lobby does not open over the practice level", async () => {
    const m = menu();
    h.actions!.createCoop("Alice");
    h.actions!.practice();
    const room = joined("coop");
    h.joins[0]!.resolve(room);
    await flush();
    expect(m.started).toEqual(["solo"]);
    expect(room.room.leave).toHaveBeenCalledWith(true);
  });

  it("is left even when the player is back on the menu by then (a race room too)", async () => {
    const m = menu();
    h.actions!.create("Alice");
    h.actions!.tutorial();
    m.start("menu");
    const room = joined("race");
    h.joins[0]!.resolve(room);
    await flush();
    expect(m.started).toEqual(["tutorial", "menu"]);
    expect(room.room.leave).toHaveBeenCalled();
  });

  it("a join that fails late leaves no error on the menu shown again", async () => {
    const m = menu();
    h.actions!.createCoop("Alice");
    h.actions!.practice();
    m.start("menu");
    h.joins[0]!.reject(new Error("Le serveur ne répond pas."));
    await flush();
    expect(h.errors).toEqual([]);
  });

  it("with the menu still there, the room opens its lobby as before", async () => {
    const m = menu();
    h.actions!.createCoop("Alice");
    const room = joined("coop");
    h.joins[0]!.resolve(room);
    await flush();
    expect(m.started).toEqual(["coopLobby"]);
    expect(room.room.leave).not.toHaveBeenCalled();
  });
});
