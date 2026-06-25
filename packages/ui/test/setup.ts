import { cleanup } from "@solidjs/testing-library";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// happy-dom returns "" for getComputedStyle().animationName (no CSS engine),
// which causes solid-presence to enter "hiding" and wait for animationend.
// Returning "none" makes solid-presence transition to "hidden" immediately,
// so Kobalte portals unmount without needing <Show> workarounds.
const origGetComputedStyle = window.getComputedStyle.bind(window);
Object.defineProperty(window, "getComputedStyle", {
  value: (element: Element, pseudo?: string | null) => {
    const style = origGetComputedStyle(element, pseudo);
    return new Proxy(style, {
      get(target, prop) {
        if (prop === "animationName") return "none";
        const val = (target as unknown as Record<string, unknown>)[
          prop as string
        ];
        return typeof val === "function" ? val.bind(target) : val;
      },
    });
  },
  writable: true,
  configurable: true,
});
