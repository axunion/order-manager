import { createRoot } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHighlightTracker,
  formatElapsed,
  loadSoundPreference,
  playAlertBeep,
  saveSoundPreference,
} from "./orderAlerts";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

describe("formatElapsed", () => {
  it("formats sub-minute durations in seconds", () => {
    expect(formatElapsed(1000, 1000 + 45_000)).toBe("45秒前");
  });

  it("formats minute-or-longer durations in minutes, rounded down", () => {
    expect(formatElapsed(1000, 1000 + 125_000)).toBe("2分前");
  });

  it("treats a timestamp in the future as 0秒前 rather than negative", () => {
    expect(formatElapsed(2000, 1000)).toBe("0秒前");
  });
});

describe("sound preference", () => {
  it("defaults to disabled when nothing is stored", () => {
    expect(loadSoundPreference()).toBe(false);
  });

  it("round-trips true and false through localStorage", () => {
    saveSoundPreference(true);
    expect(loadSoundPreference()).toBe(true);
    saveSoundPreference(false);
    expect(loadSoundPreference()).toBe(false);
  });
});

describe("playAlertBeep", () => {
  it("starts and stops an oscillator via the Web Audio API", () => {
    const start = vi.fn();
    const stop = vi.fn();
    class MockAudioContext {
      currentTime = 0;
      createOscillator() {
        return {
          type: "",
          frequency: { value: 0 },
          connect: vi.fn(),
          start,
          stop,
        };
      }
      createGain() {
        return { gain: { value: 0 }, connect: vi.fn() };
      }
    }
    vi.stubGlobal("AudioContext", MockAudioContext);

    playAlertBeep();

    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not throw when the Web Audio API is unsupported", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    expect(() => playAlertBeep()).not.toThrow();
  });
});

describe("createHighlightTracker", () => {
  it("marks highlighted ids as present", () => {
    createRoot((dispose) => {
      const { highlightedIds, highlight } = createHighlightTracker();
      expect(highlightedIds().has("a")).toBe(false);

      highlight(new Set(["a", "b"]));
      expect(highlightedIds().has("a")).toBe(true);
      expect(highlightedIds().has("b")).toBe(true);
      dispose();
    });
  });

  it("expires a highlighted id after the highlight duration", () => {
    vi.useFakeTimers();
    createRoot((dispose) => {
      const { highlightedIds, highlight } = createHighlightTracker();
      highlight(new Set(["a"]));
      expect(highlightedIds().has("a")).toBe(true);

      vi.advanceTimersByTime(10_000);
      expect(highlightedIds().has("a")).toBe(false);
      dispose();
    });
  });

  it("restarts the expiry window on a second highlight of the same id", () => {
    vi.useFakeTimers();
    createRoot((dispose) => {
      const { highlightedIds, highlight } = createHighlightTracker();
      highlight(new Set(["a"]));

      vi.advanceTimersByTime(6_000);
      highlight(new Set(["a"])); // restarts the 10s window at t=6s

      vi.advanceTimersByTime(6_000); // t=12s: past the original 10s expiry
      expect(highlightedIds().has("a")).toBe(true);

      vi.advanceTimersByTime(4_000); // t=16s: past the restarted 16s expiry
      expect(highlightedIds().has("a")).toBe(false);
      dispose();
    });
  });

  it("clears all pending timers on cleanup", () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    createRoot((dispose) => {
      const { highlight } = createHighlightTracker();
      highlight(new Set(["a", "b"]));
      dispose();
    });
    expect(clearSpy).toHaveBeenCalled();
  });
});
