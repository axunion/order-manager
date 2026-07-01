import { Button } from "@order/ui";
import { createSignal, For, Show } from "solid-js";
import styles from "./MenuList.module.css";
import type { AddItemsInput, MenuGroup } from "./OrderScreen";
import { categoryElementId } from "./OrderScreen";
import QuantityStepper from "./QuantityStepper";

export default function MenuList(props: {
  groups: MenuGroup[];
  onAddItems: (
    items: AddItemsInput,
  ) => Promise<{ ok: boolean; message?: string }>;
}) {
  const [quantities, setQuantities] = createSignal<Record<string, number>>({});
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [success, setSuccess] = createSignal("");

  function getQuantity(itemId: string): number {
    return quantities()[itemId] ?? 1;
  }

  function setQuantity(itemId: string, value: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(1, value) }));
  }

  async function handleOrderItem(itemId: string) {
    setError("");
    setSuccess("");
    setSubmitting(true);
    try {
      const qty = getQuantity(itemId);
      const result = await props.onAddItems([
        { menu_item_id: itemId, quantity: qty },
      ]);
      if (!result.ok) {
        setError(result.message ?? "注文に失敗しました。");
      } else {
        setQuantities((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        setSuccess("注文しました！");
        setTimeout(() => setSuccess(""), 2000);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section class={styles.section}>
      <h2 class={styles.heading}>メニュー</h2>

      <Show when={error()}>
        <p class={styles.alertError} role="alert">
          {error()}
        </p>
      </Show>

      <Show when={success()}>
        <p class={styles.alertSuccess} aria-live="polite">
          {success()}
        </p>
      </Show>

      <Show
        when={props.groups.length > 0}
        fallback={<p class={styles.empty}>メニューがまだ登録されていません</p>}
      >
        <For each={props.groups}>
          {(group) => (
            <div class={styles.group} id={categoryElementId(group.key)}>
              <h3 class={styles.categoryLabel}>{group.categoryName}</h3>
              <ul class={styles.list}>
                <For each={group.items}>
                  {(item) => (
                    <li class={styles.item}>
                      <div class={styles.itemInfo}>
                        <span class={styles.itemName}>{item.name}</span>
                        <span class={styles.itemPrice}>
                          ¥{item.price.toLocaleString()}
                        </span>
                      </div>
                      <div class={styles.itemOrder}>
                        <QuantityStepper
                          itemName={item.name}
                          quantity={getQuantity(item.id)}
                          decreaseDisabled={
                            submitting() || getQuantity(item.id) <= 1
                          }
                          increaseDisabled={submitting()}
                          onDecrease={() =>
                            setQuantity(item.id, getQuantity(item.id) - 1)
                          }
                          onIncrease={() =>
                            setQuantity(item.id, getQuantity(item.id) + 1)
                          }
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          aria-label={`${item.name}を注文する`}
                          onClick={() => handleOrderItem(item.id)}
                          disabled={submitting()}
                        >
                          {submitting() ? "注文中..." : "注文する"}
                        </Button>
                      </div>
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </For>
      </Show>
    </section>
  );
}
