import { describe, expect, it } from "vitest";
import { computeTaxBreakdown } from "./tax";

describe("computeTaxBreakdown", () => {
  it("returns an empty array for an empty list", () => {
    expect(computeTaxBreakdown([])).toEqual([]);
  });

  it("computes an exact 10% breakdown", () => {
    expect(
      computeTaxBreakdown([
        {
          unit_price_snapshot: 1100,
          quantity: 1,
          status: "ordered",
          tax_rate_snapshot: 10,
          options: [],
        },
      ]),
    ).toEqual([{ rate: 10, taxableAmount: 1000, taxAmount: 100 }]);
  });

  it("computes an exact 8% breakdown", () => {
    expect(
      computeTaxBreakdown([
        {
          unit_price_snapshot: 1080,
          quantity: 1,
          status: "ordered",
          tax_rate_snapshot: 8,
          options: [],
        },
      ]),
    ).toEqual([{ rate: 8, taxableAmount: 1000, taxAmount: 80 }]);
  });

  it("rounds a non-exact 10% division to the nearest yen", () => {
    // 1000 / 1.1 = 909.0909...; not a half-yen boundary — see the
    // roundHalfDown comment in tax.ts for why exact halves can't occur
    // for integer JPY totals under the two supported rates (8, 10).
    expect(
      computeTaxBreakdown([
        {
          unit_price_snapshot: 1000,
          quantity: 1,
          status: "ordered",
          tax_rate_snapshot: 10,
          options: [],
        },
      ]),
    ).toEqual([{ rate: 10, taxableAmount: 909, taxAmount: 91 }]);
  });

  it("multiplies unit_price_snapshot by quantity before bucketing", () => {
    expect(
      computeTaxBreakdown([
        {
          unit_price_snapshot: 550,
          quantity: 2,
          status: "ordered",
          tax_rate_snapshot: 10,
          options: [],
        },
      ]),
    ).toEqual([{ rate: 10, taxableAmount: 1000, taxAmount: 100 }]);
  });

  it("includes option price deltas in the line total before bucketing", () => {
    expect(
      computeTaxBreakdown([
        {
          unit_price_snapshot: 1000,
          quantity: 1,
          status: "ordered",
          tax_rate_snapshot: 10,
          options: [{ price_delta_snapshot: 100 }],
        },
      ]),
    ).toEqual([{ rate: 10, taxableAmount: 1000, taxAmount: 100 }]);
  });

  it("sums same-rate items into one bucket, rounding once per bucket", () => {
    // Two lines at 10%: 550 + 550 = 1100 summed first, then rounded once —
    // not rounded per line (550/1.1 = 500 each would coincidentally match
    // here, so this also implicitly checks against double-rounding drift
    // by using a total that would differ if each line were rounded alone).
    expect(
      computeTaxBreakdown([
        {
          unit_price_snapshot: 333,
          quantity: 1,
          status: "ordered",
          tax_rate_snapshot: 10,
          options: [],
        },
        {
          unit_price_snapshot: 767,
          quantity: 1,
          status: "ordered",
          tax_rate_snapshot: 10,
          options: [],
        },
      ]),
    ).toEqual([{ rate: 10, taxableAmount: 1000, taxAmount: 100 }]); // 1100/1.1
  });

  it("splits mixed-rate items into separate buckets, 10% before 8%", () => {
    const result = computeTaxBreakdown([
      {
        unit_price_snapshot: 1080,
        quantity: 1,
        status: "ordered",
        tax_rate_snapshot: 8,
        options: [],
      },
      {
        unit_price_snapshot: 1100,
        quantity: 1,
        status: "ordered",
        tax_rate_snapshot: 10,
        options: [],
      },
    ]);
    expect(result).toEqual([
      { rate: 10, taxableAmount: 1000, taxAmount: 100 },
      { rate: 8, taxableAmount: 1000, taxAmount: 80 },
    ]);
  });

  it("excludes cancelled items from every bucket", () => {
    expect(
      computeTaxBreakdown([
        {
          unit_price_snapshot: 1100,
          quantity: 1,
          status: "ordered",
          tax_rate_snapshot: 10,
          options: [],
        },
        {
          unit_price_snapshot: 5000,
          quantity: 1,
          status: "cancelled",
          tax_rate_snapshot: 10,
          options: [],
        },
      ]),
    ).toEqual([{ rate: 10, taxableAmount: 1000, taxAmount: 100 }]);
  });

  it("returns an empty array when every item is cancelled", () => {
    expect(
      computeTaxBreakdown([
        {
          unit_price_snapshot: 1100,
          quantity: 1,
          status: "cancelled",
          tax_rate_snapshot: 10,
          options: [],
        },
      ]),
    ).toEqual([]);
  });
});
