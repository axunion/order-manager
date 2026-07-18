import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrderScreen from "./OrderScreen";

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

const bootstrapEmpty = {
  data: {
    seat: { name: "テーブル1" },
    menu: { categories: [], items: [] },
    order: null,
    call: null,
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
          option_groups: [],
        },
        {
          id: "item2",
          category_id: "cat1",
          name: "紅茶",
          price: 450,
          sort_order: 1,
          option_groups: [],
        },
      ],
    },
    order: null,
    call: null,
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
          option_groups: [],
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
          options: [],
          note: null,
        },
      ],
      total: 1600,
    },
    call: null,
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

  it("renders an item's description and photo when present", async () => {
    const bootstrap = {
      data: {
        ...bootstrapWithMenu.data,
        menu: {
          categories: bootstrapWithMenu.data.menu.categories,
          items: [
            {
              id: "item1",
              category_id: "cat1",
              name: "コーヒー",
              price: 500,
              sort_order: 0,
              description: "深煎り豆を使用した自家製ブレンド",
              image_key: "menu/store1/item1/abc.jpg",
              option_groups: [],
            },
          ],
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/order/", method: "GET", json: bootstrap }]),
    );

    const { findByText, findByAltText } = render(() => (
      <OrderScreen seatToken="test-token" />
    ));
    await findByText("深煎り豆を使用した自家製ブレンド");
    const img = (await findByAltText("コーヒー")) as HTMLImageElement;
    expect(img.src).toContain("/api/menu/images/menu/store1/item1/abc.jpg");
  });

  it("renders a compact item card with no photo or description text when absent", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/order/", method: "GET", json: bootstrapWithMenu },
      ]),
    );

    const { findByText, queryByRole, container } = render(() => (
      <OrderScreen seatToken="test-token" />
    ));
    await findByText("コーヒー");
    expect(queryByRole("img")).toBeNull();
    // Guards the proposal's "compact layout" requirement: no reserved
    // thumbnail space, not just no <img> tag.
    expect(container.querySelector('[class*="itemThumb"]')).toBeNull();
  });

  it("renders a photo without a description, and a description without a photo, independently", async () => {
    const bootstrap = {
      data: {
        ...bootstrapWithMenu.data,
        menu: {
          categories: bootstrapWithMenu.data.menu.categories,
          items: [
            {
              id: "item1",
              category_id: "cat1",
              name: "コーヒー",
              price: 500,
              sort_order: 0,
              description: null,
              image_key: "menu/store1/item1/abc.jpg",
              option_groups: [],
            },
            {
              id: "item2",
              category_id: "cat1",
              name: "紅茶",
              price: 450,
              sort_order: 1,
              description: "香り高い茶葉を使用",
              image_key: null,
              option_groups: [],
            },
          ],
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/order/", method: "GET", json: bootstrap }]),
    );

    const { findByAltText, findByText, queryByAltText } = render(() => (
      <OrderScreen seatToken="test-token" />
    ));
    // コーヒー: photo present, no description text rendered for it.
    await findByAltText("コーヒー");
    // 紅茶: description present, no photo rendered for it.
    await findByText("香り高い茶葉を使用");
    expect(queryByAltText("紅茶")).toBeNull();
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
                  options: [],
                  note: null,
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

  it("shows a cancelled item with a 取消済み label and excludes it from the total", async () => {
    const bootstrap = {
      data: {
        ...bootstrapWithOrder.data,
        order: {
          id: "order1",
          status: "open",
          items: [
            {
              id: "oi1",
              name_snapshot: "ラーメン",
              unit_price_snapshot: 800,
              quantity: 1,
              status: "ordered",
              created_at: 1000,
              options: [],
              note: null,
            },
            {
              id: "oi2",
              name_snapshot: "ビール",
              unit_price_snapshot: 600,
              quantity: 1,
              status: "cancelled",
              created_at: 1001,
              options: [],
              note: null,
            },
          ],
          total: 800,
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/order/", method: "GET", json: bootstrap }]),
    );

    const { findByText, queryByText } = render(() => (
      <OrderScreen seatToken="test-token" />
    ));
    await findByText("ビール");
    await findByText("取消済み");
    // Total (800) excludes the cancelled ビール line; 1,400 would be the
    // (wrong) sum if it were still counted.
    expect(queryByText("1,400")).toBeNull();
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

describe("OrderScreen call staff", () => {
  it("shows the waiting status from bootstrap immediately, without tapping the button", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/order/",
          method: "GET",
          json: {
            data: {
              ...bootstrapEmpty.data,
              call: { id: "call1", status: "open", created_at: 1000 },
            },
          },
        },
      ]),
    );

    const { findByText, findByRole } = render(() => (
      <OrderScreen seatToken="test-token" />
    ));
    await findByText("呼んでいます");
    // The button stays enabled: the API is idempotent, so re-tapping is
    // harmless, and a disabled control risks reading as broken mid-wait.
    const button = await findByRole("button", { name: "スタッフを呼ぶ" });
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("tapping 呼ぶ posts to /call and shows the waiting status", async () => {
    const fetchMock = mockFetch([
      { url: "/api/order/", method: "GET", json: bootstrapEmpty },
      {
        url: /\/call$/,
        method: "POST",
        json: { data: { id: "call1", status: "open", created_at: 2000 } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const { findByRole, findByText } = render(() => (
      <OrderScreen seatToken="test-token" />
    ));
    const button = await findByRole("button", { name: "スタッフを呼ぶ" });
    await user.click(button);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/call"),
      expect.objectContaining({ method: "POST" }),
    );
    await findByText("呼んでいます");
  });

  it("shows an error when the POST /call fails", async () => {
    const fetchMock = mockFetch([
      { url: "/api/order/", method: "GET", json: bootstrapEmpty },
      {
        url: /\/call$/,
        method: "POST",
        ok: false,
        json: {
          error: { code: "NOT_FOUND", message: "座席が見つかりません。" },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    const { findByRole } = render(() => <OrderScreen seatToken="test-token" />);
    const button = await findByRole("button", { name: "スタッフを呼ぶ" });
    await user.click(button);

    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("座席が見つかりません");
  });

  it("clears the waiting status once a background poll sees the call resolved, without disturbing menu state", async () => {
    vi.useFakeTimers();
    let resolved = false;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/order/")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            data: {
              ...bootstrapWithMenu.data,
              call: resolved
                ? null
                : { id: "call1", status: "open", created_at: 1000 },
            },
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        json: async () => ({ error: { code: "NOT_FOUND", message: "" } }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(() => <OrderScreen seatToken="test-token" />);
    await vi.advanceTimersByTimeAsync(0);
    expect(screen.getByText("呼んでいます")).toBeTruthy();
    const menuItemBefore = screen.getByText("コーヒー");

    resolved = true;
    await vi.advanceTimersByTimeAsync(5000);
    expect(screen.queryByText("呼んでいます")).toBeNull();
    // A full loadBootstrap() would call setMenuItems() with fresh objects,
    // which <For> renders as a full remove-and-recreate (a new DOM node),
    // even though the mock data is unchanged; pollCall must not do that.
    // An identity check is the only way to actually distinguish the two —
    // queryByText("コーヒー") alone would pass for both, since the *text*
    // reappears either way.
    expect(screen.getByText("コーヒー")).toBe(menuItemBefore);
  });
});
