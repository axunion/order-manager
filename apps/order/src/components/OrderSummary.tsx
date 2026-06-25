import { Button } from "@order/ui";
import { createSignal, For, Show } from "solid-js";
import type { Order } from "./OrderScreen";
import styles from "./OrderSummary.module.css";

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
    <section class={styles.section}>
      <h2 class={styles.heading}>ご注文内容</h2>

      <Show when={error()}>
        <p class={styles.alertError} role="alert">
          {error()}
        </p>
      </Show>

      <Show
        when={props.order && props.order.items.length > 0}
        fallback={<p class={styles.empty}>注文がまだありません</p>}
      >
        <ul class={styles.items}>
          <For each={props.order?.items ?? []}>
            {(item) => (
              <li class={styles.item}>
                <span class={styles.itemName}>{item.name_snapshot}</span>
                <span class={styles.itemQty}>× {item.quantity}</span>
                <span class={styles.itemPrice}>
                  ¥{(item.unit_price_snapshot * item.quantity).toLocaleString()}
                </span>
              </li>
            )}
          </For>
        </ul>

        <div class={styles.total}>
          <span>合計</span>
          <span class={styles.totalAmount}>
            ¥{(props.order?.total ?? 0).toLocaleString()}
          </span>
        </div>

        <Show
          when={props.order?.status === "payment_requested"}
          fallback={
            <Button
              variant="success"
              fullWidth
              onClick={handleRequestPayment}
              disabled={requesting()}
            >
              {requesting() ? "送信中..." : "会計をお願いする"}
            </Button>
          }
        >
          <p class={styles.paymentRequestedMsg} aria-live="polite">
            会計をお待ちください。スタッフが参ります。
          </p>
        </Show>
      </Show>
    </section>
  );
}
