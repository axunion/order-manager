import { apiFetch, jsonFetch } from "@order/core/client";
import { createSignal, onMount, Show } from "solid-js";
import MenuList from "./MenuList";
import styles from "./OrderScreen.module.css";
import OrderSummary from "./OrderSummary";

export type Category = {
  id: string;
  name: string;
  sort_order: number;
};

export type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  price: number;
  sort_order: number;
};

export type OrderItem = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: "ordered" | "served";
  created_at: number;
};

export type Order = {
  id: string;
  status: "open" | "payment_requested";
  items: OrderItem[];
  total: number;
};

type BootstrapData = {
  seat: { name: string };
  menu: { categories: Category[]; items: MenuItem[] };
  order: Order | null;
};

export type AddItemsInput = { menu_item_id: string; quantity: number }[];

export default function OrderScreen(props: { seatToken: string }) {
  const [seatName, setSeatName] = createSignal("");
  const [categories, setCategories] = createSignal<Category[]>([]);
  const [menuItems, setMenuItems] = createSignal<MenuItem[]>([]);
  const [order, setOrder] = createSignal<Order | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");

  async function loadBootstrap() {
    setLoading(true);
    setError("");
    const result = await apiFetch<BootstrapData>(
      `/api/order/${props.seatToken}`,
    );
    if (!result.ok || !result.data) {
      setCategories([]);
      setMenuItems([]);
      setOrder(null);
      setError(result.message ?? "データの読み込みに失敗しました。");
    } else {
      setSeatName(result.data.seat.name);
      setCategories(result.data.menu.categories);
      setMenuItems(result.data.menu.items);
      setOrder(result.data.order);
    }
    setLoading(false);
  }

  onMount(async () => {
    await loadBootstrap();
  });

  async function handleAddItems(
    items: AddItemsInput,
  ): Promise<{ ok: boolean; message?: string }> {
    setError("");
    const result = await jsonFetch<{ order: Order }>(
      `/api/order/${props.seatToken}/items`,
      "POST",
      { items },
    );
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    if (result.data) {
      setOrder(result.data.order);
    }
    return { ok: true };
  }

  async function handleRequestPayment(): Promise<{
    ok: boolean;
    message?: string;
  }> {
    setError("");
    const result = await apiFetch<{ id: string; status: string }>(
      `/api/order/${props.seatToken}/request-payment`,
      { method: "PATCH" },
    );
    if (!result.ok) {
      return { ok: false, message: result.message };
    }
    await loadBootstrap();
    return { ok: true };
  }

  return (
    <>
      <header class={styles.header}>
        <h1 class={styles.headerTitle}>{seatName() || "セルフオーダー"}</h1>
        <p class={styles.headerSub}>セルフオーダー</p>
      </header>
      <main class={styles.main}>
        <Show when={loading()}>
          <p class={styles.loading} aria-live="polite">
            読み込み中...
          </p>
        </Show>

        <Show when={!loading() && error()}>
          <p class={styles.error} role="alert">
            {error()}
          </p>
        </Show>

        <Show when={!loading() && !error()}>
          <MenuList
            categories={categories()}
            items={menuItems()}
            onAddItems={handleAddItems}
          />
          <OrderSummary
            order={order()}
            onRequestPayment={handleRequestPayment}
          />
        </Show>
      </main>
    </>
  );
}
