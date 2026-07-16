/**
 * Pure order calculation helpers.
 * No I/O — safe to test in the node environment (no Workers/D1 needed).
 */

type OrderItemForSum = {
  unit_price_snapshot: number;
  quantity: number;
  status: string;
};

/**
 * Calculates the total price for a list of order items.
 * Each line's contribution is unit_price_snapshot × quantity.
 * Cancelled items are excluded so voided lines never affect the total.
 *
 * @returns Total in JPY (integer), 0 for an empty list.
 */
export function sumOrderItems(items: OrderItemForSum[]): number {
  return items
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + item.unit_price_snapshot * item.quantity, 0);
}
