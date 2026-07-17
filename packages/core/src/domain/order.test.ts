import { describe, expect, it } from "vitest";
import { sumOrderItems } from "./order";

describe("sumOrderItems", () => {
  it("returns 0 for an empty list", () => {
    expect(sumOrderItems([])).toBe(0);
  });

  it("returns the price for a single item with quantity 1", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 500,
          quantity: 1,
          status: "ordered",
          options: [],
        },
      ]),
    ).toBe(500);
  });

  it("multiplies unit_price_snapshot by quantity for a single item", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 300,
          quantity: 3,
          status: "ordered",
          options: [],
        },
      ]),
    ).toBe(900);
  });

  it("sums across multiple items", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 500,
          quantity: 2,
          status: "ordered",
          options: [],
        },
        {
          unit_price_snapshot: 300,
          quantity: 1,
          status: "served",
          options: [],
        },
        {
          unit_price_snapshot: 200,
          quantity: 4,
          status: "ordered",
          options: [],
        },
      ]),
    ).toBe(500 * 2 + 300 * 1 + 200 * 4); // 1000 + 300 + 800 = 2100
  });

  it("handles items with unit_price_snapshot of 0 (edge case)", () => {
    expect(
      sumOrderItems([
        { unit_price_snapshot: 0, quantity: 5, status: "ordered", options: [] },
        {
          unit_price_snapshot: 100,
          quantity: 1,
          status: "served",
          options: [],
        },
      ]),
    ).toBe(100);
  });

  it("excludes cancelled items from the total", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 500,
          quantity: 1,
          status: "ordered",
          options: [],
        },
        {
          unit_price_snapshot: 300,
          quantity: 2,
          status: "cancelled",
          options: [],
        },
        {
          unit_price_snapshot: 200,
          quantity: 1,
          status: "served",
          options: [],
        },
      ]),
    ).toBe(700);
  });

  it("returns 0 when every item is cancelled", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 500,
          quantity: 1,
          status: "cancelled",
          options: [],
        },
      ]),
    ).toBe(0);
  });

  it("adds a single positive option delta before multiplying by quantity", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 500,
          quantity: 2,
          status: "ordered",
          options: [{ price_delta_snapshot: 100 }],
        },
      ]),
    ).toBe((500 + 100) * 2); // 1200
  });

  it("sums multiple option deltas on the same line", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 500,
          quantity: 1,
          status: "ordered",
          options: [
            { price_delta_snapshot: 100 },
            { price_delta_snapshot: 50 },
          ],
        },
      ]),
    ).toBe(650);
  });

  it("applies a negative option delta", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 500,
          quantity: 1,
          status: "ordered",
          options: [{ price_delta_snapshot: -100 }],
        },
      ]),
    ).toBe(400);
  });

  it("still excludes a cancelled item's options from the total", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 500,
          quantity: 3,
          status: "cancelled",
          options: [{ price_delta_snapshot: 1000 }],
        },
      ]),
    ).toBe(0);
  });

  it("keeps option deltas independent per line", () => {
    expect(
      sumOrderItems([
        {
          unit_price_snapshot: 500,
          quantity: 1,
          status: "ordered",
          options: [{ price_delta_snapshot: 100 }],
        },
        {
          unit_price_snapshot: 300,
          quantity: 1,
          status: "ordered",
          options: [],
        },
      ]),
    ).toBe(600 + 300);
  });
});
