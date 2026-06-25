import { describe, expect, it } from "vitest";
import { newId } from "./id";

describe("newId", () => {
  it("returns a string", () => {
    expect(typeof newId()).toBe("string");
  });

  it("matches UUID v4 format", () => {
    const uuidV4 =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newId()).toMatch(uuidV4);
  });

  it("generates unique values each call", () => {
    const ids = new Set(Array.from({ length: 20 }, () => newId()));
    expect(ids.size).toBe(20);
  });
});
