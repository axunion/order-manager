import { createSignal, For, Show } from "solid-js";
import type { AddItemsInput, Category, MenuItem } from "./OrderScreen";

// ---------------------------------------------------------------------------
// MenuList — shows available menu grouped by category
// ---------------------------------------------------------------------------

/**
 * Displays the store menu. Customers can select a quantity for each item
 * and submit an order. Calls onAddItems with the selected items.
 */
export default function MenuList(props: {
  categories: Category[];
  items: MenuItem[];
  onAddItems: (
    items: AddItemsInput,
  ) => Promise<{ ok: boolean; message?: string }>;
}) {
  // Quantity map: menu_item_id → quantity (default 1 when shown)
  const [quantities, setQuantities] = createSignal<Record<string, number>>({});
  const [submitting, setSubmitting] = createSignal(false);
  const [error, setError] = createSignal("");
  const [success, setSuccess] = createSignal("");

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function getQuantity(itemId: string): number {
    return quantities()[itemId] ?? 1;
  }

  function setQuantity(itemId: string, value: number) {
    setQuantities((prev) => ({ ...prev, [itemId]: Math.max(1, value) }));
  }

  /**
   * Groups items by their category_id.
   * Items without a category appear under a synthetic null group.
   */
  function groupedItems(): {
    categoryId: string | null;
    categoryName: string;
    items: MenuItem[];
  }[] {
    const groups = new Map<
      string | null,
      { categoryId: string | null; categoryName: string; items: MenuItem[] }
    >();

    // Preserve category sort order for keyed groups
    for (const cat of props.categories) {
      groups.set(cat.id, {
        categoryId: cat.id,
        categoryName: cat.name,
        items: [],
      });
    }
    const uncategorized = {
      categoryId: null,
      categoryName: "その他",
      items: [] as MenuItem[],
    };
    groups.set(null, uncategorized);

    for (const item of props.items) {
      const key = item.category_id ?? null;
      const group = groups.get(key);
      if (group) {
        group.items.push(item);
      } else {
        // category_id exists but is not in the categories list — treat as その他
        uncategorized.items.push(item);
      }
    }

    // Remove empty groups
    return [...groups.values()].filter((g) => g.items.length > 0);
  }

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

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
        // Reset quantity after successful order
        setQuantities((prev) => {
          const next = { ...prev };
          delete next[itemId];
          return next;
        });
        setSuccess("注文しました！");
        // Clear success message after 2 seconds
        setTimeout(() => setSuccess(""), 2000);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section class="menu-section">
      <h2>メニュー</h2>

      <Show when={error()}>
        <p class="menu-error" role="alert">
          {error()}
        </p>
      </Show>

      <Show when={success()}>
        <p class="menu-success" aria-live="polite">
          {success()}
        </p>
      </Show>

      <Show
        when={props.items.length > 0}
        fallback={<p class="empty">メニューがまだ登録されていません</p>}
      >
        <For each={groupedItems()}>
          {(group) => (
            <div class="menu-group">
              <h3 class="menu-category">{group.categoryName}</h3>
              <ul class="menu-list">
                <For each={group.items}>
                  {(item) => (
                    <li class="menu-item">
                      <div class="menu-item-info">
                        <span class="menu-item-name">{item.name}</span>
                        <span class="menu-item-price">
                          ¥{item.price.toLocaleString()}
                        </span>
                      </div>
                      <div class="menu-item-order">
                        <div class="quantity-control">
                          <button
                            type="button"
                            class="qty-btn"
                            aria-label={`${item.name}の数量を減らす`}
                            onClick={() =>
                              setQuantity(item.id, getQuantity(item.id) - 1)
                            }
                            disabled={submitting() || getQuantity(item.id) <= 1}
                          >
                            −
                          </button>
                          <span class="qty-value">{getQuantity(item.id)}</span>
                          <button
                            type="button"
                            class="qty-btn"
                            aria-label={`${item.name}の数量を増やす`}
                            onClick={() =>
                              setQuantity(item.id, getQuantity(item.id) + 1)
                            }
                            disabled={submitting()}
                          >
                            ＋
                          </button>
                        </div>
                        <button
                          type="button"
                          class="btn-order"
                          aria-label={`${item.name}を注文する`}
                          onClick={() => handleOrderItem(item.id)}
                          disabled={submitting()}
                        >
                          {submitting() ? "注文中..." : "注文する"}
                        </button>
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
