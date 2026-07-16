import { apiFetch } from "@order/core/client";
import { Button, ConfirmDialog, ErrorAlert } from "@order/ui";
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import styles from "./OrderBoard.module.css";
import StatusBadge from "./StatusBadge";

type OrderItem = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: "ordered" | "served" | "cancelled";
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
  const [pendingItems, setPendingItems] = createSignal<Set<string>>(new Set());

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

  const runItemAction = async (
    itemId: string,
    path: string,
    failureMessage: string,
  ) => {
    setPendingItems((prev) => new Set([...prev, itemId]));
    try {
      const result = await apiFetch(path, { method: "PATCH" });
      if (!result.ok) {
        setError(result.message ?? failureMessage);
        return;
      }
      await loadOrders();
    } finally {
      setPendingItems((prev) => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const handleServe = (itemId: string) =>
    runItemAction(
      itemId,
      `/api/admin/orders/items/${itemId}/serve`,
      "提供済みマークに失敗しました。",
    );

  const handleUnserve = (itemId: string) =>
    runItemAction(
      itemId,
      `/api/admin/orders/items/${itemId}/unserve`,
      "提供取消に失敗しました。",
    );

  const handleVoidItem = (itemId: string) =>
    runItemAction(
      itemId,
      `/api/admin/orders/items/${itemId}/cancel`,
      "明細の取消に失敗しました。",
    );

  const handleCancelOrder = async (orderId: string) => {
    const result = await apiFetch(`/api/admin/orders/${orderId}/cancel`, {
      method: "PATCH",
    });
    if (!result.ok) {
      setError(result.message ?? "注文のキャンセルに失敗しました。");
      return;
    }
    await loadOrders();
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
                <ConfirmDialog
                  triggerLabel="注文をキャンセル"
                  triggerVariant="danger"
                  triggerSize="sm"
                  aria-label={`注文をキャンセル ${order.seat_name}`}
                  title="注文のキャンセル"
                  description={`「${order.seat_name}」の注文をキャンセルしますか？明細もすべて取り消されます。この操作は元に戻せません。`}
                  confirmLabel="キャンセルする"
                  onConfirm={() => handleCancelOrder(order.id)}
                />
              </div>

              <ul class={styles.orderItems}>
                <For each={order.items}>
                  {(item) => (
                    <li
                      class={`${styles.orderItem ?? ""} ${item.status === "served" ? (styles.orderItemServed ?? "") : ""} ${item.status === "cancelled" ? (styles.orderItemCancelled ?? "") : ""}`}
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
                      <Show
                        when={item.status !== "cancelled"}
                        fallback={
                          <StatusBadge tone="danger">取消済み</StatusBadge>
                        }
                      >
                        <Show
                          when={item.status === "served"}
                          fallback={
                            <Button
                              variant="success"
                              size="sm"
                              disabled={pendingItems().has(item.id)}
                              onClick={() => handleServe(item.id)}
                            >
                              {pendingItems().has(item.id)
                                ? "処理中..."
                                : "提供済み"}
                            </Button>
                          }
                        >
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={pendingItems().has(item.id)}
                            onClick={() => handleUnserve(item.id)}
                          >
                            {pendingItems().has(item.id)
                              ? "処理中..."
                              : "提供取消"}
                          </Button>
                        </Show>
                        <ConfirmDialog
                          triggerLabel="取消"
                          triggerVariant="danger"
                          triggerSize="sm"
                          aria-label={`明細を取消 ${item.name_snapshot} (${item.id})`}
                          title="明細の取消"
                          description={`「${item.name_snapshot}」を取消しますか？この操作は元に戻せません。`}
                          confirmLabel="取消する"
                          onConfirm={() => handleVoidItem(item.id)}
                        />
                      </Show>
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
