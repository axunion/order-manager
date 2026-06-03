import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrderBoard from "./OrderBoard";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type MockRoute = {
  url: string | RegExp;
  method?: string;
  ok?: boolean;
  json: unknown;
};

function mockFetch(routes: MockRoute[]) {
  return vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const route = routes.find((r) => {
      const urlMatch =
        typeof r.url === "string" ? url.includes(r.url) : r.url.test(url);
      const methodMatch = !r.method || r.method.toUpperCase() === method;
      return urlMatch && methodMatch;
    });
    if (!route) {
      return Promise.resolve({
        ok: false,
        json: async () => ({
          error: { code: "NOT_FOUND", message: "no route" },
        }),
      });
    }
    const ok = route.ok !== false;
    return Promise.resolve({
      ok,
      json: async () => route.json,
    });
  });
}

/** A minimal active order for testing. */
const mockOrder = {
  id: "order-1",
  seat_name: "テーブル1",
  status: "open",
  items: [
    {
      id: "item-1",
      name_snapshot: "ラーメン",
      unit_price_snapshot: 800,
      quantity: 2,
      status: "ordered",
    },
  ],
  total: 1600,
  created_at: 1_000_000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OrderBoard", () => {
  it("fetches orders on mount and renders them", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/admin/orders",
          method: "GET",
          json: { data: [mockOrder] },
        },
      ]),
    );

    const { findByText, findAllByText } = render(() => <OrderBoard />);
    await findByText("テーブル1");
    await findByText("ラーメン");
    // ¥1,600 appears both in order-total and order-item-price — findAllByText is expected
    const amounts = await findAllByText("¥1,600");
    expect(amounts.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the empty state when there are no active orders", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/admin/orders",
          method: "GET",
          json: { data: [] },
        },
      ]),
    );

    const { findByText } = render(() => <OrderBoard />);
    await findByText(/アクティブな注文はありません/);
  });

  it("shows an error message when the API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/admin/orders",
          method: "GET",
          ok: false,
          json: { error: { code: "UNAUTHORIZED", message: "要認証" } },
        },
      ]),
    );

    const { findByRole } = render(() => <OrderBoard />);
    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("要認証");
  });

  it("shows 会計要求中 badge for payment_requested orders", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/admin/orders",
          method: "GET",
          json: {
            data: [{ ...mockOrder, status: "payment_requested" }],
          },
        },
      ]),
    );

    const { findByText } = render(() => <OrderBoard />);
    await findByText(/会計要求中/);
  });

  it("sends PATCH to serve endpoint when 提供済み button is clicked", async () => {
    const user = userEvent.setup();
    const servedOrder = {
      ...mockOrder,
      items: [{ ...mockOrder.items[0], status: "served" }],
    };
    const fetchMock = mockFetch([
      {
        url: "/api/admin/orders",
        method: "GET",
        json: { data: [mockOrder] },
      },
      {
        url: "/api/admin/orders/items/item-1/serve",
        method: "PATCH",
        json: { data: { id: "item-1", status: "served" } },
      },
      // Second GET after serve
      {
        url: "/api/admin/orders",
        method: "GET",
        json: { data: [servedOrder] },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { findByRole } = render(() => <OrderBoard />);
    const serveBtn = await findByRole("button", { name: /提供済み/ });
    await user.click(serveBtn);

    // Should have called PATCH /api/admin/orders/items/item-1/serve
    const patchCalls = fetchMock.mock.calls.filter((args: unknown[]) => {
      const url = args[0] as string;
      const init = args[1] as RequestInit | undefined;
      return (
        url.includes("/api/admin/orders/items/item-1/serve") &&
        (init?.method ?? "").toUpperCase() === "PATCH"
      );
    });
    expect(patchCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("disables 提供済み button for items that are already served", async () => {
    const servedOrder = {
      ...mockOrder,
      items: [{ ...mockOrder.items[0], status: "served" }],
    };
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/admin/orders",
          method: "GET",
          json: { data: [servedOrder] },
        },
      ]),
    );

    const { findByRole } = render(() => <OrderBoard />);
    const btn = await findByRole("button", { name: /提供済み/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("polls every 5 seconds via setInterval", async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch([
      {
        url: "/api/admin/orders",
        method: "GET",
        json: { data: [] },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <OrderBoard />);

    // Flush the initial onMount fetch (advance by 0 ms to drain microtasks)
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterMount = fetchMock.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    // Advance by 5 seconds — the setInterval callback should fire once more
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
