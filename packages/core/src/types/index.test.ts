import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CreateItemInput, UpdateItemInput } from "./index";

const baseCreate = { name: "Coffee", price: 500 };
const baseUpdate = { name: "Coffee", price: 500, is_available: true };

describe("CreateItemInput description", () => {
  it("defaults to null when omitted", () => {
    const result = CreateItemInput.parse(baseCreate);
    expect(result.description).toBeNull();
  });

  it("accepts null explicitly", () => {
    const result = CreateItemInput.parse({ ...baseCreate, description: null });
    expect(result.description).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    const result = CreateItemInput.parse({
      ...baseCreate,
      description: "  Freshly roasted.  ",
    });
    expect(result.description).toBe("Freshly roasted.");
  });

  it("normalizes a whitespace-only string to null", () => {
    const result = CreateItemInput.parse({
      ...baseCreate,
      description: "   ",
    });
    expect(result.description).toBeNull();
  });

  it("accepts exactly 500 characters", () => {
    const description = "a".repeat(500);
    const result = CreateItemInput.parse({ ...baseCreate, description });
    expect(result.description).toBe(description);
  });

  it("rejects 501 characters", () => {
    expect(() =>
      CreateItemInput.parse({
        ...baseCreate,
        description: "a".repeat(501),
      }),
    ).toThrow(z.ZodError);
  });

  it("checks the length limit against the raw string, before trimming", () => {
    // 502 raw chars that trim down to exactly 500 non-whitespace chars are
    // still rejected: max(500) runs before the trim transform.
    const description = ` ${"a".repeat(500)} `;
    expect(() => CreateItemInput.parse({ ...baseCreate, description })).toThrow(
      z.ZodError,
    );
  });
});

describe("UpdateItemInput description", () => {
  it("is undefined when omitted, preserving the current DB value", () => {
    const result = UpdateItemInput.parse(baseUpdate);
    expect(result.description).toBeUndefined();
  });

  it("clears the description when explicitly null", () => {
    const result = UpdateItemInput.parse({
      ...baseUpdate,
      description: null,
    });
    expect(result.description).toBeNull();
  });

  it("rejects 501 characters", () => {
    expect(() =>
      UpdateItemInput.parse({
        ...baseUpdate,
        description: "a".repeat(501),
      }),
    ).toThrow(z.ZodError);
  });
});
