import { describe, expect, it } from "vitest";
import { buildSlug, slugify } from "./slug";

describe("slugify", () => {
  it("lowercases ASCII", () => {
    expect(slugify("My Cafe")).toBe("my-cafe");
  });

  it("replaces non-alphanumeric runs with a single hyphen", () => {
    expect(slugify("Hello World!")).toBe("hello-world");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("---test---")).toBe("test");
  });

  it("returns 'store' when result is empty (e.g. Japanese-only name)", () => {
    expect(slugify("カフェ")).toBe("store");
  });

  it("returns 'store' for empty string", () => {
    expect(slugify("")).toBe("store");
  });

  it("handles mixed ASCII and non-ASCII", () => {
    expect(slugify("Cafe カフェ 123")).toBe("cafe-123");
  });
});

describe("buildSlug", () => {
  it("returns a string starting with the slugified name", () => {
    const slug = buildSlug("My Cafe");
    expect(slug.startsWith("my-cafe-")).toBe(true);
  });

  it("appends a random suffix", () => {
    const s1 = buildSlug("My Cafe");
    const s2 = buildSlug("My Cafe");
    // Same name → different suffix (probabilistic; fails ~1 in 10^7)
    expect(s1).not.toBe(s2);
  });

  it("suffix is 5 lowercase alphanumeric characters", () => {
    const slug = buildSlug("Shop");
    const suffix = slug.split("-").at(-1) ?? "";
    expect(suffix).toMatch(/^[a-z0-9]{5}$/);
  });

  it("works with Japanese-only names (fallback to 'store')", () => {
    const slug = buildSlug("居酒屋");
    expect(slug.startsWith("store-")).toBe(true);
  });
});
