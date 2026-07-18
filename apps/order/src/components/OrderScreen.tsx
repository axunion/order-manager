import { apiFetch, jsonFetch } from "@order/core/client";
import { createMemo, createSignal, onMount, Show } from "solid-js";
import CategoryNav from "./CategoryNav";
import CheckoutBar from "./CheckoutBar";
import Header from "./Header";
import MenuList from "./MenuList";
import styles from "./OrderScreen.module.css";
import OrderSummary from "./OrderSummary";

export type Category = {
  id: string;
  name: string;
  sort_order: number;
};

export type MenuItemOption = {
  id: string;
  name: string;
  price_delta: number;
  sort_order: number;
};

export type MenuItemOptionGroup = {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  options: MenuItemOption[];
};

export type MenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  price: number;
  sort_order: number;
  description: string | null;
  image_key: string | null;
  option_groups: MenuItemOptionGroup[];
};

export type OrderItemOption = {
  id: string;
  name_snapshot: string;
  group_name_snapshot: string;
  price_delta_snapshot: number;
};

export type OrderItem = {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: "ordered" | "served" | "cancelled";
  created_at: number;
  options: OrderItemOption[];
  note: string | null;
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

export type AddItemsInput = {
  menu_item_id: string;
  quantity: number;
  option_ids?: string[];
  note?: string | null;
}[];

export type MenuGroup = {
  key: string;
  categoryName: string;
  items: MenuItem[];
};

export function categoryElementId(key: string): string {
  return `menu-category-${key}`;
}

export function groupMenuItems(
  categories: Category[],
  items: MenuItem[],
): MenuGroup[] {
  const groups = new Map<string, MenuGroup>();
  for (const cat of categories) {
    groups.set(cat.id, { key: cat.id, categoryName: cat.name, items: [] });
  }
  const uncategorized: MenuGroup = {
    key: "uncategorized",
    categoryName: "その他",
    items: [],
  };
  groups.set("uncategorized", uncategorized);
  for (const item of items) {
    const key = item.category_id ?? "uncategorized";
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
    } else {
      uncategorized.items.push(item);
    }
  }
  return [...groups.values()].filter((g) => g.items.length > 0);
}

export default function OrderScreen(props: { seatToken: string }) {
  const [seatName, setSeatName] = createSignal("");
  const [categories, setCategories] = createSignal<Category[]>([]);
  const [menuItems, setMenuItems] = createSignal<MenuItem[]>([]);
  const [order, setOrder] = createSignal<Order | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");
  const ready = createMemo(() => !loading() && !error());
  const menuGroups = createMemo(() =>
    groupMenuItems(categories(), menuItems()),
  );

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
      <Header seatName={seatName() || "セルフオーダー"} />
      <Show when={ready()}>
        <CategoryNav groups={menuGroups()} />
      </Show>
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

        <Show when={ready()}>
          <MenuList groups={menuGroups()} onAddItems={handleAddItems} />
          <OrderSummary order={order()} />
        </Show>
      </main>
      <Show when={ready()}>
        <CheckoutBar order={order()} onRequestPayment={handleRequestPayment} />
      </Show>
    </>
  );
}
