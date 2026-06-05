import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { apiFetch } from "../../lib/client";
import Button from "../ui/Button";
import ErrorAlert from "../ui/ErrorAlert";
import styles from "./OrderBoard.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OrderItem = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: "ordered" | "served";
  created_at: number;
};

type AdminOrder = {
  id: string;
  seat_name: string;
  status: "open" | "payment_requested";
  items: OrderItem[];
  total: number;
  created_at: number;
};

// ---------------------------------------------------------------------------
// OrderBoard — SolidJS Island for /admin/orders
// ---------------------------------------------------------------------------

/**
 * Admin order board: polls for active orders every 5 seconds and allows
 * staff to mark individual line items as 'served'.
 * Cookie authentication is automatic (same-origin HttpOnly cookie).
 */
export default function OrderBoard() {
  const [orders, setOrders] = createSignal<AdminOrder[]>([]);
  const [error, setError] = createSignal("");
  const [serving, setServing] = createSignal<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async function loadOrders() {
    const result = await apiFetch<AdminOrder[]>("/api/admin/orders");
    if (result.ok && result.data) {
      setOrders(result.data);
      setError("");
    } else {
      setOrders([]);
      setError(result.message ?? "注文の取得に失敗しました。");
    }
  }

  onMount(() => {
    // Initial load
    loadOrders();
    // Poll every 5 seconds to satisfy the roadmap requirement of ≤5 s latency
    const timerId = setInterval(loadOrders, 5000);
    onCleanup(() => clearInterval(timerId));
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleServe = async (itemId: string) => {
    setServing((prev) => new Set([...prev, itemId]));
    try {
      const result = await apiFetch(`/api/admin/orders/items/${itemId}/serve`, {
        method: "PATCH",
      });
      if (!result.ok) {
        setError(result.message ?? "提供済みマークに失敗しました。");
        return;
      }
      // Reload the full order list to reflect the updated status
      await loadOrders();
    } finally {
      setServing((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const formatCurrency = (amount: number) =>
    `¥${amount.toLocaleString("ja-JP")}`;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div class={styles.orderBoard}>
      {/* Global error */}
      <Show when={error()}>
        <ErrorAlert>{error()}</ErrorAlert>
      </Show>

      {/* Empty state */}
      <Show when={orders().length === 0 && !error()}>
        <div class={styles.orderBoardEmpty}>
          <p>アクティブな注文はありません</p>
        </div>
      </Show>

      {/* Order list */}
      <div class={styles.orderList}>
        <For each={orders()}>
          {(order) => (
            <article
              class={styles.orderCard}
              classList={{
                [styles.orderCardPayRequested]:
                  order.status === "payment_requested",
              }}
            >
              {/* Order header */}
              <div class={styles.orderCardHeader}>
                <span class={styles.orderSeatName}>{order.seat_name}</span>
                <Show when={order.status === "payment_requested"}>
                  <span class={styles.orderBadgePay}>会計要求中</span>
                </Show>
                <span class={styles.orderTotal}>
                  {formatCurrency(order.total)}
                </span>
              </div>

              {/* Line items */}
              <ul class={styles.orderItems}>
                <For each={order.items}>
                  {(item) => (
                    <li
                      class={styles.orderItem}
                      classList={{
                        [styles.orderItemServed]: item.status === "served",
                      }}
                    >
                      <span class={styles.orderItemName}>
                        {item.name_snapshot}
                      </span>
                      <span class={styles.orderItemQty}>× {item.quantity}</span>
                      <span class={styles.orderItemPrice}>
                        {formatCurrency(
                          item.unit_price_snapshot * item.quantity,
                        )}
                      </span>
                      <Button
                        variant="success"
                        size="sm"
                        disabled={
                          item.status === "served" || serving().has(item.id)
                        }
                        onClick={() => handleServe(item.id)}
                      >
                        {serving().has(item.id) ? "処理中..." : "提供済み"}
                      </Button>
                    </li>
                  )}
                </For>
              </ul>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
