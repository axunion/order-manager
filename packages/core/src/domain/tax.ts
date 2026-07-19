/**
 * Tax breakdown for receipts. Prices are tax-inclusive JPY; this only
 * decomposes an already-charged total into taxable base + tax per rate
 * bucket — it never changes what's charged.
 * No I/O — safe to test in the node environment (no Workers/D1 needed).
 */

type OrderItemOptionForTax = {
  price_delta_snapshot: number;
};

type OrderItemForTax = {
  unit_price_snapshot: number;
  quantity: number;
  status: string;
  tax_rate_snapshot: number;
  options: OrderItemOptionForTax[];
};

export type TaxBucket = {
  /** Whole percent, e.g. 10 for standard rate. */
  rate: number;
  /** Pre-tax subtotal for this rate bucket (rounded). */
  taxableAmount: number;
  /** taxableAmount's total minus its taxable base. */
  taxAmount: number;
};

/**
 * Rounds half down (2.5 → 2, 3.5 → 3), per the single-rounding-per-rate
 * rule for invoice tax breakdowns — a bucket is rounded once, never per
 * line item.
 */
function roundHalfDown(n: number): number {
  return Math.ceil(n - 0.5);
}

/**
 * Buckets items by tax_rate_snapshot, sums each bucket's line totals, and
 * derives the tax portion of each bucket via the inclusive-tax formula
 * (tax = total − round(total / (1 + rate / 100))). Cancelled items are
 * excluded, matching sumOrderItems. Buckets are returned highest rate
 * first; empty input returns [].
 */
export function computeTaxBreakdown(items: OrderItemForTax[]): TaxBucket[] {
  const totalsByRate = new Map<number, number>();
  for (const item of items) {
    if (item.status === "cancelled") continue;
    const optionDelta = item.options.reduce(
      (sum, option) => sum + option.price_delta_snapshot,
      0,
    );
    const lineTotal = (item.unit_price_snapshot + optionDelta) * item.quantity;
    totalsByRate.set(
      item.tax_rate_snapshot,
      (totalsByRate.get(item.tax_rate_snapshot) ?? 0) + lineTotal,
    );
  }
  return [...totalsByRate.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, total]) => {
      const taxableAmount = roundHalfDown(total / (1 + rate / 100));
      return { rate, taxableAmount, taxAmount: total - taxableAmount };
    });
}
