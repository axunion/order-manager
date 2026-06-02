import { createSignal, onMount, Show } from "solid-js";
import { apiFetch, jsonFetch } from "../../lib/client";
import MenuList from "./MenuList";
import OrderSummary from "./OrderSummary";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// OrderScreen — SolidJS Island for /order/:seatToken
// ---------------------------------------------------------------------------

/**
 * Customer-facing order screen.
 * On mount, fetches the bootstrap data (seat, menu, current order) via
 * GET /api/order/:seatToken, then renders the menu and order summary.
 *
 * seatToken: the QR token from the URL, used for all API calls.
 * seatName: server-side resolved seat name shown immediately before fetch.
 */
export default function OrderScreen(props: {
  seatToken: string;
  seatName: string;
}) {
  const [categories, setCategories] = createSignal<Category[]>([]);
  const [menuItems, setMenuItems] = createSignal<MenuItem[]>([]);
  const [order, setOrder] = createSignal<Order | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal("");

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  async function loadBootstrap() {
    setLoading(true);
    setError("");
    const result = await apiFetch<BootstrapData>(
      `/api/order/${props.seatToken}`,
    );
    if (!result.ok || !result.data) {
      // Clear stale data so it cannot be accessed via stale closures in handlers.
      setCategories([]);
      setMenuItems([]);
      setOrder(null);
      setError(result.message ?? "データの読み込みに失敗しました。");
    } else {
      setCategories(result.data.menu.categories);
      setMenuItems(result.data.menu.items);
      setOrder(result.data.order);
    }
    setLoading(false);
  }

  onMount(async () => {
    await loadBootstrap();
  });

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

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
    // Reload full order state so items list is also up-to-date
    await loadBootstrap();
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div class="order-screen">
      <Show when={loading()}>
        <p class="order-loading" aria-live="polite">
          読み込み中...
        </p>
      </Show>

      <Show when={!loading() && error()}>
        <p class="order-error" role="alert">
          {error()}
        </p>
      </Show>

      <Show when={!loading() && !error()}>
        <MenuList
          categories={categories()}
          items={menuItems()}
          onAddItems={handleAddItems}
        />
        <OrderSummary order={order()} onRequestPayment={handleRequestPayment} />
      </Show>
    </div>
  );
}
