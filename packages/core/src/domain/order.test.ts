import { describe, expect, it } from "vitest";
import { sumOrderItems } from "./order";

describe("sumOrderItems", () => {
  it("returns 0 for an empty list", () => {
    expect(sumOrderItems([])).toBe(0);
  });

  it("returns the price for a single item with quantity 1", () => {
    expect(sumOrderItems([{ unit_price_snapshot: 500, quantity: 1 }])).toBe(
      500,
    );
  });

  it("multiplies unit_price_snapshot by quantity for a single item", () => {
    expect(sumOrderItems([{ unit_price_snapshot: 300, quantity: 3 }])).toBe(
      900,
    );
  });

  it("sums across multiple items", () => {
    expect(
      sumOrderItems([
        { unit_price_snapshot: 500, quantity: 2 },
        { unit_price_snapshot: 300, quantity: 1 },
        { unit_price_snapshot: 200, quantity: 4 },
      ]),
    ).toBe(500 * 2 + 300 * 1 + 200 * 4); // 1000 + 300 + 800 = 2100
  });

  it("handles items with unit_price_snapshot of 0 (edge case)", () => {
    expect(
      sumOrderItems([
        { unit_price_snapshot: 0, quantity: 5 },
        { unit_price_snapshot: 100, quantity: 1 },
      ]),
    ).toBe(100);
  });
});
