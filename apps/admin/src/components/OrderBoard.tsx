import { apiFetch } from "@order/core/client";
import { Button, ConfirmDialog, ErrorAlert } from "@order/ui";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import styles from "./OrderBoard.module.css";
import StatusBadge from "./StatusBadge";

type OrderItemOption = {
  id: string;
  name_snapshot: string;
  group_name_snapshot: string;
  price_delta_snapshot: number;
};

type OrderItem = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  options: OrderItemOption[];
  note: string | null;
  status: "ordered" | "served" | "cancelled";
  created_at: number;
};

function lineTotal(item: OrderItem): number {
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

type AdminOrder = {
  id: string;
  seat_name: string;
  status: "open" | "payment_requested";
  items: OrderItem[];
  total: number;
  created_at: number;
};

const SOUND_STORAGE_KEY = "order-alert-sound";
const HIGHLIGHT_DURATION_MS = 10_000;
const BASE_TITLE = "Order Manager — Admin";

/** Plays a short beep via a Web Audio oscillator. No-ops if unsupported. */
function playAlertBeep() {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.2;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
  } catch {
    // Web Audio unsupported or blocked — the visual alert still fires.
  }
}

export default function OrderBoard() {
  const [orders, setOrders] = createSignal<AdminOrder[]>([]);
  const [error, setError] = createSignal("");
  const [pendingItems, setPendingItems] = createSignal<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = createSignal(
    localStorage.getItem(SOUND_STORAGE_KEY) === "true",
  );
  const [highlightedOrderIds, setHighlightedOrderIds] = createSignal<
    Set<string>
  >(new Set());

  // Not signals: only used inside loadOrders to diff polls, never read in JSX.
  let watermark = -Infinity;
  let hasLoadedOnce = false;
  const highlightTimers = new Map<string, ReturnType<typeof setTimeout>>();

  function highlightOrders(orderIds: Set<string>) {
    setHighlightedOrderIds((prev) => new Set([...prev, ...orderIds]));
    for (const id of orderIds) {
      // A second alert on the same order before its highlight expires
      // restarts the 10s window instead of letting the old timer clear
      // the newer highlight early.
      const existing = highlightTimers.get(id);
      if (existing) clearTimeout(existing);
      highlightTimers.set(
        id,
        setTimeout(() => {
          setHighlightedOrderIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
          highlightTimers.delete(id);
        }, HIGHLIGHT_DURATION_MS),
      );
    }
    if (soundEnabled()) {
      playAlertBeep();
    }
  }

  async function loadOrders() {
    const result = await apiFetch<AdminOrder[]>("/api/admin/orders");
    if (result.ok && result.data) {
      const items = result.data.flatMap((o) => o.items);
      if (!hasLoadedOnce) {
        // Initial load: set the watermark silently, no alert.
        watermark = items.reduce(
          (max, i) => Math.max(max, i.created_at),
          watermark,
        );
        hasLoadedOnce = true;
      } else {
        const newOrderIds = new Set(
          result.data
            .filter((o) => o.items.some((i) => i.created_at > watermark))
            .map((o) => o.id),
        );
        watermark = items.reduce(
          (max, i) => Math.max(max, i.created_at),
          watermark,
        );
        if (newOrderIds.size > 0) {
          highlightOrders(newOrderIds);
        }
      }
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
    onCleanup(() => {
      for (const timer of highlightTimers.values()) clearTimeout(timer);
      highlightTimers.clear();
    });
    onCleanup(() => {
      document.title = BASE_TITLE;
    });
  });

  const unservedCount = createMemo(() =>
    orders().reduce(
      (sum, o) => sum + o.items.filter((i) => i.status === "ordered").length,
      0,
    ),
  );

  createEffect(() => {
    const count = unservedCount();
    document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE;
  });

  const toggleSound = () => {
    const next = !soundEnabled();
    setSoundEnabled(next);
    localStorage.setItem(SOUND_STORAGE_KEY, String(next));
    if (next) {
      // The toggle-on click doubles as the audio-unlocking user gesture.
      playAlertBeep();
    }
  };

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
      <div class={styles.alertControls}>
        <button
          type="button"
          class={styles.soundToggle}
          aria-pressed={soundEnabled()}
          onClick={toggleSound}
        >
          {soundEnabled() ? "🔔 通知音: オン" : "🔕 通知音: オフ"}
        </button>
      </div>

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
              class={`${styles.orderCard ?? ""} ${order.status === "payment_requested" ? (styles.orderCardWarning ?? "") : (styles.orderCardAlert ?? "")} ${highlightedOrderIds().has(order.id) ? (styles.orderCardNewAlert ?? "") : ""}`}
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
                      <div class={styles.orderItemRow}>
                        <span class={styles.orderItemName}>
                          {item.name_snapshot}
                        </span>
                        <span class={styles.orderItemQty}>
                          × {item.quantity}
                        </span>
                        <span class={styles.orderItemPrice}>
                          {formatCurrency(lineTotal(item))}
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
                      </div>
                      <Show when={item.options.length > 0}>
                        <ul class={styles.orderItemOptions}>
                          <For each={item.options}>
                            {(option) => (
                              <li class={styles.orderItemOption}>
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
                        <p class={styles.orderItemNote}>{item.note}</p>
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
