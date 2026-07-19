import { apiFetch, jsonFetch } from "@order/core/client";
import { Button, ErrorAlert } from "@order/ui";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import styles from "./CheckoutPanel.module.css";
import StatusBadge from "./StatusBadge";

type CheckoutItemOption = {
  id: string;
  name_snapshot: string;
  group_name_snapshot: string;
  price_delta_snapshot: number;
};

type CheckoutItem = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  options: CheckoutItemOption[];
  note: string | null;
  status: string;
  created_at: number;
};

function lineTotal(item: CheckoutItem): number {
  const optionDelta = item.options.reduce(
    (sum, option) => sum + option.price_delta_snapshot,
    0,
  );
  return (item.unit_price_snapshot + optionDelta) * item.quantity;
}

/** Formats a price delta as a signed yen amount, or "" when it's 0. */
function formatDelta(delta: number): string {
  if (delta === 0) return "";
  const sign = delta > 0 ? "+" : "-";
  return `${sign}¥${Math.abs(delta).toLocaleString("ja-JP")}`;
}

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

type PaymentMethod = "cash" | "card" | "qr";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "現金" },
  { value: "card", label: "カード" },
  { value: "qr", label: "QR決済" },
];

export default function CheckoutPanel() {
  const [orders, setOrders] = createSignal<PendingOrder[]>([]);
  const [pollError, setPollError] = createSignal("");
  const [actionError, setActionError] = createSignal("");
  const [processing, setProcessing] = createSignal<Set<string>>(new Set());
  const [methodByOrder, setMethodByOrder] = createSignal<
    Map<string, PaymentMethod>
  >(new Map());

  const methodFor = (orderId: string): PaymentMethod =>
    methodByOrder().get(orderId) ?? "cash";

  const setMethodFor = (orderId: string, method: PaymentMethod) => {
    setMethodByOrder((prev) => new Map(prev).set(orderId, method));
  };

  async function loadPending() {
    const result = await apiFetch<PendingOrder[]>("/api/payments/pending");
    if (result.ok && result.data) {
      setOrders(result.data);
      setPollError("");
      // Prune method selections for orders that left the pending list
      // (checked out or reopened), so the map doesn't grow unbounded
      // across a long shift with many turnovers.
      const stillPendingIds = new Set(result.data.map((o) => o.id));
      setMethodByOrder((prev) => {
        const next = new Map(
          [...prev].filter(([orderId]) => stillPendingIds.has(orderId)),
        );
        return next;
      });
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
        method: methodFor(orderId),
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

  const handleReopen = async (orderId: string) => {
    setActionError("");
    setProcessing((prev) => new Set([...prev, orderId]));
    try {
      const result = await apiFetch(`/api/admin/orders/${orderId}/reopen`, {
        method: "PATCH",
      });
      if (!result.ok) {
        setActionError(result.message ?? "席への差し戻しに失敗しました。");
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
                <StatusBadge tone="warning">会計要求中</StatusBadge>
                <span class={styles.checkoutTotal}>
                  {formatCurrency(order.total)}
                </span>
              </div>

              <ul class={styles.checkoutItems}>
                <For each={order.items}>
                  {(item) => (
                    <li class={styles.checkoutItem}>
                      <div class={styles.checkoutItemRow}>
                        <span class={styles.checkoutItemName}>
                          {item.name_snapshot}
                        </span>
                        <span class={styles.checkoutItemQty}>
                          × {item.quantity}
                        </span>
                        <span class={styles.checkoutItemPrice}>
                          {formatCurrency(lineTotal(item))}
                        </span>
                      </div>
                      <Show when={item.options.length > 0}>
                        <ul class={styles.checkoutItemOptions}>
                          <For each={item.options}>
                            {(option) => (
                              <li class={styles.checkoutItemOption}>
                                {option.name_snapshot}
                                <Show when={option.price_delta_snapshot !== 0}>
                                  {" "}
                                  ({formatDelta(option.price_delta_snapshot)})
                                </Show>
                              </li>
                            )}
                          </For>
                        </ul>
                      </Show>
                      <Show when={item.note}>
                        <p class={styles.checkoutItemNote}>{item.note}</p>
                      </Show>
                    </li>
                  )}
                </For>
              </ul>

              <div
                class={styles.checkoutMethodGroup}
                role="radiogroup"
                aria-label="支払い方法"
              >
                <For each={PAYMENT_METHODS}>
                  {(method) => (
                    <Button
                      type="button"
                      role="radio"
                      variant={
                        methodFor(order.id) === method.value
                          ? "primary"
                          : "secondary"
                      }
                      size="sm"
                      aria-checked={methodFor(order.id) === method.value}
                      disabled={processing().has(order.id)}
                      onClick={() => setMethodFor(order.id, method.value)}
                    >
                      {method.label}
                    </Button>
                  )}
                </For>
              </div>

              <div class={styles.checkoutCardFooter}>
                <Button
                  variant="secondary"
                  disabled={processing().has(order.id)}
                  onClick={() => handleReopen(order.id)}
                >
                  {processing().has(order.id) ? "処理中..." : "席に戻す"}
                </Button>
                <Button
                  variant="primary"
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
