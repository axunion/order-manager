import { apiFetch, jsonFetch } from "@order/core/client";
import { Button, ErrorAlert } from "@order/ui";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import styles from "./CheckoutPanel.module.css";

type CheckoutItem = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: string;
  created_at: number;
};

type PendingOrder = {
  id: string;
  seat_name: string;
  status: string;
  items: CheckoutItem[];
  total: number;
  created_at: number;
};

type PaymentResult = {
  id: string;
  order_id: string;
  total_amount: number;
  method: string;
  paid_at: number;
};

export default function CheckoutPanel() {
  const [orders, setOrders] = createSignal<PendingOrder[]>([]);
  const [pollError, setPollError] = createSignal("");
  const [actionError, setActionError] = createSignal("");
  const [processing, setProcessing] = createSignal<Set<string>>(new Set());

  async function loadPending() {
    const result = await apiFetch<PendingOrder[]>("/api/payments/pending");
    if (result.ok && result.data) {
      setOrders(result.data);
      setPollError("");
    } else {
      setOrders([]);
      setPollError(result.message ?? "伝票の取得に失敗しました。");
    }
  }

  onMount(() => {
    loadPending();
    const timerId = setInterval(loadPending, 5000);
    onCleanup(() => clearInterval(timerId));
  });

  const handleCheckout = async (orderId: string) => {
    setActionError("");
    setProcessing((prev) => new Set([...prev, orderId]));
    try {
      const result = await jsonFetch<PaymentResult>("/api/payments", "POST", {
        order_id: orderId,
      });
      if (!result.ok) {
        setActionError(result.message ?? "会計処理に失敗しました。");
        return;
      }
      await loadPending();
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
        return next;
      });
    }
  };

  const formatCurrency = (amount: number) =>
    `¥${amount.toLocaleString("ja-JP")}`;

  return (
    <div class={styles.checkoutPanel}>
      <Show when={actionError()}>
        <ErrorAlert>{actionError()}</ErrorAlert>
      </Show>
      <Show when={pollError() && !actionError()}>
        <ErrorAlert>{pollError()}</ErrorAlert>
      </Show>

      <Show when={orders().length === 0 && !pollError() && !actionError()}>
        <div class={styles.checkoutPanelEmpty}>
          <p>会計待ちの伝票はありません</p>
        </div>
      </Show>

      <div class={styles.checkoutList}>
        <For each={orders()}>
          {(order) => (
            <article class={styles.checkoutCard}>
              <div class={styles.checkoutCardHeader}>
                <span class={styles.checkoutSeatName}>{order.seat_name}</span>
                <span class={styles.checkoutBadgePay}>会計要求中</span>
                <span class={styles.checkoutTotal}>
                  {formatCurrency(order.total)}
                </span>
              </div>

              <ul class={styles.checkoutItems}>
                <For each={order.items}>
                  {(item) => (
                    <li class={styles.checkoutItem}>
                      <span class={styles.checkoutItemName}>
                        {item.name_snapshot}
                      </span>
                      <span class={styles.checkoutItemQty}>
                        × {item.quantity}
                      </span>
                      <span class={styles.checkoutItemPrice}>
                        {formatCurrency(
                          item.unit_price_snapshot * item.quantity,
                        )}
                      </span>
                    </li>
                  )}
                </For>
              </ul>

              <div class={styles.checkoutCardFooter}>
                <Button
                  variant="success"
                  disabled={processing().has(order.id)}
                  onClick={() => handleCheckout(order.id)}
                >
                  {processing().has(order.id) ? "処理中..." : "会計完了"}
                </Button>
              </div>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
