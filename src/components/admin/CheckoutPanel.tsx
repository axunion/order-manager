import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { apiFetch, jsonFetch } from "../../lib/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CheckoutPanel — SolidJS Island for /admin/checkout
// ---------------------------------------------------------------------------

/**
 * Admin checkout panel: polls for payment_requested orders every 5 seconds
 * and allows staff to complete payment for each bill.
 * Cookie authentication is automatic (same-origin HttpOnly cookie).
 */
export default function CheckoutPanel() {
  const [orders, setOrders] = createSignal<PendingOrder[]>([]);
  // pollError: set/cleared by background polling. Cleared on next successful GET.
  const [pollError, setPollError] = createSignal("");
  // actionError: set when 会計完了 POST fails. Only cleared on the next action
  // attempt, NOT by background polling, so the message persists until staff
  // acknowledges it by retrying.
  const [actionError, setActionError] = createSignal("");
  const [processing, setProcessing] = createSignal<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

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
    // Initial load
    loadPending();
    // Poll every 5 seconds to satisfy the roadmap requirement of ≤5 s latency
    const timerId = setInterval(loadPending, 5000);
    onCleanup(() => clearInterval(timerId));
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleCheckout = async (orderId: string) => {
    setActionError(""); // Clear previous action error before each attempt
    setProcessing((prev) => new Set([...prev, orderId]));
    try {
      const result = await jsonFetch<PaymentResult>("/api/payments", "POST", {
        order_id: orderId,
      });
      if (!result.ok) {
        setActionError(result.message ?? "会計処理に失敗しました。");
        return;
      }
      // Reload the full list to reflect the completed payment (paid order disappears)
      await loadPending();
    } finally {
      setProcessing((prev) => {
        const next = new Set(prev);
        next.delete(orderId);
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
    <div class="checkout-panel">
      {/* Action error (会計失敗) — persists until next action, not cleared by poll */}
      <Show when={actionError()}>
        <p class="checkout-panel-error" role="alert">
          {actionError()}
        </p>
      </Show>

      {/* Poll error (GET failure) — shown only when there is no action error */}
      <Show when={pollError() && !actionError()}>
        <p class="checkout-panel-error" role="alert">
          {pollError()}
        </p>
      </Show>

      {/* Empty state */}
      <Show when={orders().length === 0 && !pollError() && !actionError()}>
        <div class="checkout-panel-empty">
          <p>会計待ちの伝票はありません</p>
        </div>
      </Show>

      {/* Pending order list */}
      <div class="checkout-list">
        <For each={orders()}>
          {(order) => (
            <article class="checkout-card">
              {/* Bill header */}
              <div class="checkout-card-header">
                <span class="checkout-seat-name">{order.seat_name}</span>
                <span class="checkout-badge-pay">会計要求中</span>
                <span class="checkout-total">
                  {formatCurrency(order.total)}
                </span>
              </div>

              {/* Line items */}
              <ul class="checkout-items">
                <For each={order.items}>
                  {(item) => (
                    <li class="checkout-item">
                      <span class="checkout-item-name">
                        {item.name_snapshot}
                      </span>
                      <span class="checkout-item-qty">× {item.quantity}</span>
                      <span class="checkout-item-price">
                        {formatCurrency(
                          item.unit_price_snapshot * item.quantity,
                        )}
                      </span>
                    </li>
                  )}
                </For>
              </ul>

              {/* Checkout action */}
              <div class="checkout-card-footer">
                <button
                  type="button"
                  class="btn-checkout"
                  disabled={processing().has(order.id)}
                  onClick={() => handleCheckout(order.id)}
                >
                  {processing().has(order.id) ? "処理中..." : "会計完了"}
                </button>
              </div>
            </article>
          )}
        </For>
      </div>
    </div>
  );
}
