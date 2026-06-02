import { createSignal, For, Show } from "solid-js";
import type { Order } from "./OrderScreen";

// ---------------------------------------------------------------------------
// OrderSummary — shows current order items, total, and payment request button
// ---------------------------------------------------------------------------

/**
 * Displays the customer's current order: items, total, and payment request.
 * The "会計をお願いする" button is disabled while the order is in
 * 'payment_requested' status (idempotent operation, but no need to re-submit).
 */
export default function OrderSummary(props: {
  order: Order | null;
  onRequestPayment: () => Promise<{ ok: boolean; message?: string }>;
}) {
  const [requesting, setRequesting] = createSignal(false);
  const [error, setError] = createSignal("");

  async function handleRequestPayment() {
    setError("");
    setRequesting(true);
    try {
      const result = await props.onRequestPayment();
      if (!result.ok) {
        setError(result.message ?? "エラーが発生しました。");
      }
    } finally {
      setRequesting(false);
    }
  }

  return (
    <section class="order-summary">
      <h2>ご注文内容</h2>

      <Show when={error()}>
        <p class="summary-error" role="alert">
          {error()}
        </p>
      </Show>

      <Show
        when={props.order && props.order.items.length > 0}
        fallback={<p class="empty">注文がまだありません</p>}
      >
        <ul class="order-items">
          <For each={props.order?.items ?? []}>
            {(item) => (
              <li class="order-item">
                <span class="order-item-name">{item.name_snapshot}</span>
                <span class="order-item-qty">× {item.quantity}</span>
                <span class="order-item-price">
                  ¥{(item.unit_price_snapshot * item.quantity).toLocaleString()}
                </span>
              </li>
            )}
          </For>
        </ul>

        <div class="order-total">
          <span>合計</span>
          <span class="total-amount">
            ¥{(props.order?.total ?? 0).toLocaleString()}
          </span>
        </div>

        <Show
          when={props.order?.status === "payment_requested"}
          fallback={
            <button
              type="button"
              class="btn-payment"
              onClick={handleRequestPayment}
              disabled={requesting()}
            >
              {requesting() ? "送信中..." : "会計をお願いする"}
            </button>
          }
        >
          <p class="payment-requested-msg" aria-live="polite">
            会計をお待ちください。スタッフが参ります。
          </p>
        </Show>
      </Show>
    </section>
  );
}
