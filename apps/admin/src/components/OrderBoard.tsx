import { apiFetch } from "@order/core/client";
import { Button, ErrorAlert } from "@order/ui";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import styles from "./OrderBoard.module.css";
import StatusBadge from "./StatusBadge";

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

export default function OrderBoard() {
  const [orders, setOrders] = createSignal<AdminOrder[]>([]);
  const [error, setError] = createSignal("");
  const [serving, setServing] = createSignal<Set<string>>(new Set());

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
    loadOrders();
    const timerId = setInterval(loadOrders, 5000);
    onCleanup(() => clearInterval(timerId));
  });

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
      await loadOrders();
    } finally {
      setServing((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const formatCurrency = (amount: number) =>
    `¥${amount.toLocaleString("ja-JP")}`;

  return (
    <div class={styles.orderBoard}>
      <Show when={error()}>
        <ErrorAlert>{error()}</ErrorAlert>
      </Show>

      <Show when={orders().length === 0 && !error()}>
        <div class={styles.orderBoardEmpty}>
          <p>アクティブな注文はありません</p>
        </div>
      </Show>

      <div class={styles.orderList}>
        <For each={orders()}>
          {(order) => (
            <article
              class={`${styles.orderCard ?? ""} ${order.status === "payment_requested" ? (styles.orderCardWarning ?? "") : (styles.orderCardAlert ?? "")}`}
            >
              <div class={styles.orderCardHeader}>
                <Show when={order.status === "open"}>
                  <span class={styles.pulseDot} aria-hidden="true" />
                </Show>
                <span class={styles.orderSeatName}>{order.seat_name}</span>
                <Show when={order.status === "open"}>
                  <StatusBadge tone="alert">新規注文</StatusBadge>
                </Show>
                <Show when={order.status === "payment_requested"}>
                  <StatusBadge tone="warning">会計要求中</StatusBadge>
                </Show>
                <span class={styles.orderTotal}>
                  {formatCurrency(order.total)}
                </span>
              </div>

              <ul class={styles.orderItems}>
                <For each={order.items}>
                  {(item) => (
                    <li
                      class={`${styles.orderItem ?? ""} ${item.status === "served" ? (styles.orderItemServed ?? "") : ""}`}
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
