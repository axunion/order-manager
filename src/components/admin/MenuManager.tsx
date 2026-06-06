import { createSignal, For, onMount, Show } from "solid-js";
import { apiFetch, jsonFetch } from "../../lib/client";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import ErrorAlert from "../ui/ErrorAlert";
import Select from "../ui/Select";
import styles from "./MenuManager.module.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Category = {
  id: string;
  store_id: string;
  name: string;
  sort_order: number;
};

type Item = {
  id: string;
  store_id: string;
  name: string;
  price: number;
  is_available: boolean;
  category_id: string | null;
  sort_order: number;
};

// ---------------------------------------------------------------------------
// MenuManager — SolidJS Island for /admin/menu
// ---------------------------------------------------------------------------

/**
 * Admin menu management UI.
 * Handles CRUD for menu categories and items by calling /api/menu/* endpoints.
 * Cookie authentication is automatic (same-origin HttpOnly cookie).
 */
export default function MenuManager() {
  const [categories, setCategories] = createSignal<Category[]>([]);
  const [items, setItems] = createSignal<Item[]>([]);
  const [error, setError] = createSignal("");

  // Category form state
  const [catName, setCatName] = createSignal("");
  const [catSortOrder, setCatSortOrder] = createSignal(0);
  const [catSubmitting, setCatSubmitting] = createSignal(false);

  // Item form state
  const [itemName, setItemName] = createSignal("");
  const [itemPrice, setItemPrice] = createSignal("");
  const [itemCategoryId, setItemCategoryId] = createSignal<string>("");
  const [itemIsAvailable, setItemIsAvailable] = createSignal(true);
  const [itemSortOrder, setItemSortOrder] = createSignal(0);
  const [itemSubmitting, setItemSubmitting] = createSignal(false);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  async function loadCategories() {
    const result = await apiFetch<Category[]>("/api/menu/categories");
    if (result.ok && result.data) setCategories(result.data);
  }

  async function loadItems() {
    const result = await apiFetch<Item[]>("/api/menu/items");
    if (result.ok && result.data) setItems(result.data);
  }

  onMount(async () => {
    await Promise.all([loadCategories(), loadItems()]);
  });

  // ---------------------------------------------------------------------------
  // Category handlers
  // ---------------------------------------------------------------------------

  const handleCategorySubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setCatSubmitting(true);
    try {
      const result = await jsonFetch<Category>("/api/menu/categories", "POST", {
        name: catName(),
        sort_order: catSortOrder(),
      });
      if (!result.ok) {
        setError(result.message ?? "エラーが発生しました");
        return;
      }
      setCatName("");
      setCatSortOrder(0);
      await loadCategories();
    } finally {
      setCatSubmitting(false);
    }
  };

  const handleCategoryDelete = async (id: string, _name: string) => {
    setError("");
    const result = await apiFetch(`/api/menu/categories/${id}`, {
      method: "DELETE",
    });
    if (!result.ok) {
      setError(result.message ?? "削除に失敗しました");
      return;
    }
    await Promise.all([loadCategories(), loadItems()]);
  };

  // ---------------------------------------------------------------------------
  // Item handlers
  // ---------------------------------------------------------------------------

  const handleItemSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError("");
    setItemSubmitting(true);
    try {
      const price = Number(itemPrice());
      const categoryId = itemCategoryId() || null;
      const result = await jsonFetch<Item>("/api/menu/items", "POST", {
        name: itemName(),
        price,
        is_available: itemIsAvailable(),
        category_id: categoryId,
        sort_order: itemSortOrder(),
      });
      if (!result.ok) {
        setError(result.message ?? "エラーが発生しました");
        return;
      }
      setItemName("");
      setItemPrice("");
      setItemCategoryId("");
      setItemIsAvailable(true);
      setItemSortOrder(0);
      await loadItems();
    } finally {
      setItemSubmitting(false);
    }
  };

  const handleItemDelete = async (id: string) => {
    setError("");
    const result = await apiFetch(`/api/menu/items/${id}`, {
      method: "DELETE",
    });
    if (!result.ok) {
      setError(result.message ?? "削除に失敗しました");
      return;
    }
    await loadItems();
  };

  const handleToggleAvailability = async (item: Item) => {
    setError("");
    const result = await jsonFetch<Item>(
      `/api/menu/items/${item.id}`,
      "PATCH",
      {
        name: item.name,
        price: item.price,
        is_available: !item.is_available,
        category_id: item.category_id,
        sort_order: item.sort_order,
      },
    );
    if (!result.ok) {
      setError(result.message ?? "更新に失敗しました");
      return;
    }
    await loadItems();
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div class={styles.menuManager}>
      {/* Global error */}
      <Show when={error()}>
        <ErrorAlert>{error()}</ErrorAlert>
      </Show>

      {/* ── Categories ── */}
      <section class={styles.menuSection}>
        <h2>メニューカテゴリ</h2>

        {/* Add category form */}
        <form onSubmit={handleCategorySubmit} class={styles.menuForm}>
          <div class={styles.field}>
            <label for="cat-name">カテゴリ名</label>
            <input
              id="cat-name"
              type="text"
              value={catName()}
              onInput={(e) => setCatName(e.currentTarget.value)}
              placeholder="例：ドリンク"
              required
              maxLength={100}
              disabled={catSubmitting()}
            />
          </div>
          <div class={styles.field}>
            <label for="cat-sort">表示順</label>
            <input
              id="cat-sort"
              type="number"
              min={0}
              value={catSortOrder()}
              onInput={(e) => setCatSortOrder(Number(e.currentTarget.value))}
              disabled={catSubmitting()}
            />
          </div>
          <Button type="submit" disabled={catSubmitting()}>
            {catSubmitting() ? "追加中..." : "カテゴリを追加"}
          </Button>
        </form>

        {/* Category list */}
        <Show
          when={categories().length > 0}
          fallback={<p class={styles.empty}>カテゴリがまだありません</p>}
        >
          <ul class={styles.menuList}>
            <For each={categories()}>
              {(cat) => (
                <li class={styles.menuListItem}>
                  <span class={styles.itemName}>{cat.name}</span>
                  <span class={styles.itemSort}>順: {cat.sort_order}</span>
                  <ConfirmDialog
                    triggerLabel="削除"
                    aria-label={`削除 ${cat.name}`}
                    title="カテゴリの削除"
                    description={`「${cat.name}」を削除しますか？この操作は元に戻せません。`}
                    onConfirm={() => handleCategoryDelete(cat.id, cat.name)}
                  />
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      {/* ── Items ── */}
      <section class={styles.menuSection}>
        <h2>メニュー商品</h2>

        {/* Add item form */}
        <form onSubmit={handleItemSubmit} class={styles.menuForm}>
          <div class={styles.field}>
            <label for="item-name">商品名</label>
            <input
              id="item-name"
              type="text"
              value={itemName()}
              onInput={(e) => setItemName(e.currentTarget.value)}
              placeholder="例：ラテ"
              required
              maxLength={100}
              disabled={itemSubmitting()}
            />
          </div>
          <div class={styles.field}>
            <label for="item-price">価格（円）</label>
            <input
              id="item-price"
              type="number"
              min={1}
              value={itemPrice()}
              onInput={(e) => setItemPrice(e.currentTarget.value)}
              placeholder="例：500"
              required
              disabled={itemSubmitting()}
            />
          </div>
          <div class={styles.field}>
            <label for="item-category">カテゴリ</label>
            <Select
              id="item-category"
              options={categories().map((c) => ({
                value: c.id,
                label: c.name,
              }))}
              value={itemCategoryId() || null}
              onChange={setItemCategoryId}
              placeholder="-- なし --"
              disabled={itemSubmitting()}
            />
          </div>
          <div class={[styles.field, styles.fieldCheck].join(" ")}>
            <label>
              <input
                type="checkbox"
                checked={itemIsAvailable()}
                onChange={(e) => setItemIsAvailable(e.currentTarget.checked)}
                disabled={itemSubmitting()}
              />
              提供中
            </label>
          </div>
          <div class={styles.field}>
            <label for="item-sort">表示順</label>
            <input
              id="item-sort"
              type="number"
              min={0}
              value={itemSortOrder()}
              onInput={(e) => setItemSortOrder(Number(e.currentTarget.value))}
              disabled={itemSubmitting()}
            />
          </div>
          <Button type="submit" disabled={itemSubmitting()}>
            {itemSubmitting() ? "追加中..." : "商品を追加"}
          </Button>
        </form>

        {/* Item list */}
        <Show
          when={items().length > 0}
          fallback={<p class={styles.empty}>商品がまだありません</p>}
        >
          <ul class={styles.menuList}>
            <For each={items()}>
              {(item) => {
                const catName = () =>
                  categories().find((c) => c.id === item.category_id)?.name ??
                  "なし";
                return (
                  <li
                    class={styles.menuListItem}
                    classList={{
                      [styles.menuListItemUnavailable]: !item.is_available,
                    }}
                  >
                    <span class={styles.itemName}>{item.name}</span>
                    <span class={styles.itemPrice}>
                      ¥{item.price.toLocaleString()}
                    </span>
                    <span class={styles.itemCategory}>{catName()}</span>
                    <span
                      class={styles.itemStatus}
                      classList={{
                        [styles.itemStatusUnavailable]: !item.is_available,
                      }}
                    >
                      {item.is_available ? "提供中" : "提供停止"}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleToggleAvailability(item)}
                    >
                      {item.is_available ? "停止" : "再開"}
                    </Button>
                    <ConfirmDialog
                      triggerLabel="削除"
                      aria-label={`削除 ${item.name}`}
                      title="商品の削除"
                      description={`「${item.name}」を削除しますか？この操作は元に戻せません。`}
                      onConfirm={() => handleItemDelete(item.id)}
                    />
                  </li>
                );
              }}
            </For>
          </ul>
        </Show>
      </section>
    </div>
  );
}
