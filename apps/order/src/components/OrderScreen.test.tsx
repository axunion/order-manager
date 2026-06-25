import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrderScreen from "./OrderScreen";

afterEach(() => {
  vi.restoreAllMocks();
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

const bootstrapEmpty = {
  data: {
    seat: { name: "テーブル1" },
    menu: { categories: [], items: [] },
    order: null,
  },
};

const bootstrapWithMenu = {
  data: {
    seat: { name: "テーブル2" },
    menu: {
      categories: [{ id: "cat1", name: "ドリンク", sort_order: 0 }],
      items: [
        {
          id: "item1",
          category_id: "cat1",
          name: "コーヒー",
          price: 500,
          sort_order: 0,
        },
        {
          id: "item2",
          category_id: "cat1",
          name: "紅茶",
          price: 450,
          sort_order: 1,
        },
      ],
    },
    order: null,
  },
};

const bootstrapWithOrder = {
  data: {
    seat: { name: "テーブル3" },
    menu: {
      categories: [],
      items: [
        {
          id: "item3",
          category_id: null,
          name: "ラーメン",
          price: 800,
          sort_order: 0,
        },
      ],
    },
    order: {
      id: "order1",
      status: "open",
      items: [
        {
          id: "oi1",
          name_snapshot: "ラーメン",
          unit_price_snapshot: 800,
          quantity: 2,
          status: "ordered",
          created_at: 1000,
        },
      ],
      total: 1600,
    },
  },
};

describe("OrderScreen", () => {
  it("shows loading state before bootstrap completes", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => new Promise(() => {})),
    );
    const { getByText } = render(() => <OrderScreen seatToken="test-token" />);
    expect(getByText(/読み込み中/)).toBeTruthy();
  });

  it("shows error when bootstrap API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/order/",
          method: "GET",
          ok: false,
          json: {
            error: {
              code: "NOT_FOUND",
              message: "席が見つかりません",
            },
          },
        },
      ]),
    );

    const { findByRole } = render(() => <OrderScreen seatToken="bad-token" />);
    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("席が見つかりません");
  });

  it("renders the menu after successful bootstrap", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/order/", method: "GET", json: bootstrapWithMenu },
      ]),
    );

    const { findByText } = render(() => <OrderScreen seatToken="test-token" />);
    await findByText("コーヒー");
    await findByText("紅茶");
  });

  it("shows empty state when menu has no items", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/order/", method: "GET", json: bootstrapEmpty }]),
    );

    const { findByText } = render(() => <OrderScreen seatToken="test-token" />);
    await findByText(/メニューがまだ登録されていません/);
  });

  it("shows 'no order yet' when order is null", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/order/", method: "GET", json: bootstrapEmpty }]),
    );

    const { findByText } = render(() => <OrderScreen seatToken="test-token" />);
    await findByText(/注文がまだありません/);
  });

  it("shows order items and total when order exists", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/order/",
          method: "GET",
          json: bootstrapWithOrder,
        },
      ]),
    );

    const { findByText } = render(() => <OrderScreen seatToken="test-token" />);
    await findByText("合計");
    await findByText("会計をお願いする");
  });

  it("clicking '注文する' calls POST /items and updates order", async () => {
    const fetchMock = mockFetch([
      { url: "/api/order/", method: "GET", json: bootstrapWithMenu },
      {
        url: /items/,
        method: "POST",
        json: {
          data: {
            order: {
              id: "order1",
              status: "open",
              items: [
                {
                  id: "oi1",
                  name_snapshot: "コーヒー",
                  unit_price_snapshot: 500,
                  quantity: 1,
                  status: "ordered",
                  created_at: 1000,
                },
              ],
              total: 500,
            },
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const { findByRole } = render(() => <OrderScreen seatToken="test-token" />);
    const orderBtn = await findByRole("button", { name: /コーヒーを注文する/ });
    await user.click(orderBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/items"),
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"menu_item_id":"item1"'),
      }),
    );
    await findByRole("button", { name: /会計をお願いする/ });
  });

  it("shows error when POST /items fails", async () => {
    const fetchMock = mockFetch([
      { url: "/api/order/", method: "GET", json: bootstrapWithMenu },
      {
        url: /items/,
        method: "POST",
        ok: false,
        json: {
          error: {
            code: "CONFLICT",
            message: "会計要求中のため注文できません。",
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const { findByRole } = render(() => <OrderScreen seatToken="test-token" />);
    const orderBtn = await findByRole("button", { name: /コーヒーを注文する/ });
    await user.click(orderBtn);

    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("会計要求中");
  });

  it("shows 会計待ち message when order status is payment_requested", async () => {
    const bootstrap = {
      data: {
        ...bootstrapWithOrder.data,
        order: {
          ...bootstrapWithOrder.data.order,
          status: "payment_requested",
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/order/", method: "GET", json: bootstrap }]),
    );

    const { findByText } = render(() => <OrderScreen seatToken="test-token" />);
    await findByText(/会計をお待ちください/);
  });

  it("'会計をお願いする' button calls PATCH request-payment", async () => {
    const fetchMock = mockFetch([
      { url: "/api/order/", method: "GET", json: bootstrapWithOrder },
      {
        url: /request-payment/,
        method: "PATCH",
        json: { data: { id: "order1", status: "payment_requested" } },
      },
      {
        url: "/api/order/",
        method: "GET",
        json: {
          data: {
            ...bootstrapWithOrder.data,
            order: {
              ...bootstrapWithOrder.data.order,
              status: "payment_requested",
            },
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const { findByRole } = render(() => <OrderScreen seatToken="test-token" />);
    const payBtn = await findByRole("button", { name: /会計をお願いする/ });
    await user.click(payBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/request-payment"),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
