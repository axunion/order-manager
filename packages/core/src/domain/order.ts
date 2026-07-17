/**
 * Pure order calculation helpers.
 * No I/O — safe to test in the node environment (no Workers/D1 needed).
 */

type OrderItemOptionForSum = {
  price_delta_snapshot: number;
};

type OrderItemForSum = {
  unit_price_snapshot: number;
  quantity: number;
  status: string;
  /** Selected option deltas for this line. Required — pass [] when none. */
  options: OrderItemOptionForSum[];
};

/**
 * Calculates the total price for a list of order items.
 * Each line's contribution is (unit_price_snapshot + Σ option price
 * deltas) × quantity. Cancelled items are excluded so voided lines never
 * affect the total.
 *
 * @returns Total in JPY (integer), 0 for an empty list.
 */
export function sumOrderItems(items: OrderItemForSum[]): number {
  return items
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => {
      const optionDelta = item.options.reduce(
        (total, option) => total + option.price_delta_snapshot,
        0,
      );
      return sum + (item.unit_price_snapshot + optionDelta) * item.quantity;
    }, 0);
}
