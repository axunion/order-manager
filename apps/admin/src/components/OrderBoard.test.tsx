import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrderBoard from "./OrderBoard";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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
    return Promise.resolve({ ok, json: async () => route.json });
  });
}

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

  it("shows a 提供取消 button (not 提供済み) for items that are already served", async () => {
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

    const { findByRole, queryByRole } = render(() => <OrderBoard />);
    await findByRole("button", { name: /提供取消/ });
    expect(queryByRole("button", { name: /提供済み/ })).toBeNull();
  });

  it("sends PATCH to unserve endpoint when 提供取消 button is clicked", async () => {
    const user = userEvent.setup();
    const servedOrder = {
      ...mockOrder,
      items: [{ ...mockOrder.items[0], status: "served" }],
    };
    const fetchMock = mockFetch([
      {
        url: "/api/admin/orders",
        method: "GET",
        json: { data: [servedOrder] },
      },
      {
        url: "/api/admin/orders/items/item-1/unserve",
        method: "PATCH",
        json: { data: { id: "item-1", status: "ordered" } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { findByRole } = render(() => <OrderBoard />);
    const unserveBtn = await findByRole("button", { name: /提供取消/ });
    await user.click(unserveBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/orders/items/item-1/unserve",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("shows a 取消済み badge and no action buttons for a cancelled item", async () => {
    const cancelledOrder = {
      ...mockOrder,
      items: [{ ...mockOrder.items[0], status: "cancelled" }],
    };
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/admin/orders",
          method: "GET",
          json: { data: [cancelledOrder] },
        },
      ]),
    );

    const { findByText, queryByRole } = render(() => <OrderBoard />);
    await findByText("取消済み");
    expect(queryByRole("button", { name: /提供済み/ })).toBeNull();
    expect(queryByRole("button", { name: /提供取消/ })).toBeNull();
    expect(queryByRole("button", { name: /明細を取消/ })).toBeNull();
  });

  it("voids an item via the confirm dialog", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/admin/orders",
        method: "GET",
        json: { data: [mockOrder] },
      },
      {
        url: "/api/admin/orders/items/item-1/cancel",
        method: "PATCH",
        json: { data: { id: "item-1", status: "cancelled" } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <OrderBoard />);
    const voidBtn = await screen.findByRole("button", {
      name: "明細を取消 ラーメン (item-1)",
    });
    await user.click(voidBtn);

    const confirmBtn = await screen.findByRole("button", { name: "取消する" });
    await user.click(confirmBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/orders/items/item-1/cancel",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("cancels a whole order via the confirm dialog", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/admin/orders",
        method: "GET",
        json: { data: [mockOrder] },
      },
      {
        url: "/api/admin/orders/order-1/cancel",
        method: "PATCH",
        json: { data: { id: "order-1", status: "cancelled" } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <OrderBoard />);
    const cancelBtn = await screen.findByRole("button", {
      name: "注文をキャンセル テーブル1",
    });
    await user.click(cancelBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: "キャンセルする",
    });
    await user.click(confirmBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/orders/order-1/cancel",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("shows an error when the void PATCH fails (e.g. order already paid)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/admin/orders",
          method: "GET",
          json: { data: [mockOrder] },
        },
        {
          url: "/api/admin/orders/items/item-1/cancel",
          method: "PATCH",
          ok: false,
          json: {
            error: {
              code: "CONFLICT",
              message:
                "会計済みまたはキャンセル済みの注文の明細は取り消せません。",
            },
          },
        },
      ]),
    );

    render(() => <OrderBoard />);
    const voidBtn = await screen.findByRole("button", {
      name: "明細を取消 ラーメン (item-1)",
    });
    await user.click(voidBtn);

    const confirmBtn = await screen.findByRole("button", { name: "取消する" });
    await user.click(confirmBtn);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("取り消せません");
  });

  it("shows an error when the cancel-order PATCH fails (e.g. order already paid)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/admin/orders",
          method: "GET",
          json: { data: [mockOrder] },
        },
        {
          url: "/api/admin/orders/order-1/cancel",
          method: "PATCH",
          ok: false,
          json: {
            error: {
              code: "CONFLICT",
              message: "会計済みの注文はキャンセルできません。",
            },
          },
        },
      ]),
    );

    render(() => <OrderBoard />);
    const cancelBtn = await screen.findByRole("button", {
      name: "注文をキャンセル テーブル1",
    });
    await user.click(cancelBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: "キャンセルする",
    });
    await user.click(confirmBtn);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("会計済みの注文はキャンセルできません");
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

    await vi.advanceTimersByTimeAsync(0);
    const callsAfterMount = fetchMock.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
