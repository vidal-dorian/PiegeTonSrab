import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The overlay builds DOM elements when it loads; tests run without a DOM.
const showNotice = vi.fn();
vi.mock("./ui/overlay", () => ({ overlay: { showNotice } }));

const { errorCount, guarded, reportError, watchGameLoop } = await import("./errors");

describe("errors never freeze the game", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    showNotice.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("guarded() reports instead of throwing, and logs a repeated error once in a while", () => {
    const before = errorCount();
    expect(() =>
      guarded("un test", () => {
        throw new Error("boum");
      }),
    ).not.toThrow();
    for (let i = 0; i < 100; i++) reportError("un test", new Error("boum"));
    expect(errorCount() - before).toBe(101);
    // One log line for the burst, one notice for the player.
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(showNotice).toHaveBeenCalledTimes(1);
  });

  it("the watchdog restarts a loop that stopped, and leaves a running or hidden one alone", () => {
    let visibility = "visible";
    vi.stubGlobal("window", { setInterval, clearInterval });
    vi.stubGlobal("document", {
      get visibilityState() {
        return visibility;
      },
    });
    const loop = { frame: 0, running: true, sleep: vi.fn(), wake: vi.fn() };
    const stop = watchGameLoop({ loop } as never);

    // Running: frames advance, nothing happens.
    for (let i = 0; i < 5; i++) {
      loop.frame++;
      vi.advanceTimersByTime(1000);
    }
    expect(loop.wake).not.toHaveBeenCalled();

    // Hidden tab: no frames, but that is normal.
    visibility = "hidden";
    vi.advanceTimersByTime(5000);
    expect(loop.wake).not.toHaveBeenCalled();

    // Visible and no frame for two checks: the loop died, restart it.
    visibility = "visible";
    vi.advanceTimersByTime(1000); // first check sees the new state
    vi.advanceTimersByTime(2000);
    expect(loop.sleep).toHaveBeenCalledTimes(1);
    expect(loop.wake).toHaveBeenCalledWith(true);
    stop();
  });
});
