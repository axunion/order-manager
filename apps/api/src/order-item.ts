export type OrderItemPayload = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: string;
  created_at: number;
};

export function mapOrderItem(item: {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: string;
  created_at: number;
}): OrderItemPayload {
  return {
    id: item.id,
    name_snapshot: item.name_snapshot,
    unit_price_snapshot: item.unit_price_snapshot,
    quantity: item.quantity,
    status: item.status,
    created_at: item.created_at,
  };
}
