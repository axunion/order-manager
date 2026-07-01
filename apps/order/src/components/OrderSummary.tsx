import { For, Show } from "solid-js";
import type { Order } from "./OrderScreen";
import styles from "./OrderSummary.module.css";

export default function OrderSummary(props: { order: Order | null }) {
  return (
    <section class={styles.section}>
      <h2 class={styles.heading}>ご注文内容</h2>

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
      </Show>
    </section>
  );
}
