import { render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SalesHistory, { shiftDate } from "./SalesHistory";

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

const mockPayments = [
  {
    id: "pay-1",
    order_id: "order-1",
    seat_name: "テーブル1",
    total_amount: 1600,
    method: "cash",
    discount_amount: 0,
    discount_reason: null,
    paid_at: 1_700_000_000_000,
    items: [
      {
        id: "item-1",
        name_snapshot: "唐揚げ",
        unit_price_snapshot: 500,
        quantity: 2,
        status: "ordered",
      },
      {
        id: "item-2",
        name_snapshot: "ビール",
        unit_price_snapshot: 600,
        quantity: 1,
        status: "cancelled",
      },
    ],
  },
  {
    id: "pay-2",
    order_id: "order-2",
    seat_name: "テーブル2",
    total_amount: 800,
    // Distinct from pay-1's method: the per-method breakdown tests below
    // need cash/card totals to differ from each other and from the grand
    // total, or their assertions would collide with unrelated text.
    method: "card",
    discount_amount: 0,
    discount_reason: null,
    paid_at: 1_700_000_100_000,
    items: [
      {
        id: "item-3",
        name_snapshot: "ラーメン",
        unit_price_snapshot: 800,
        quantity: 1,
        status: "ordered",
      },
    ],
  },
];

describe("shiftDate", () => {
  it("shifts forward within a month", () => {
    expect(shiftDate("2026-07-16", 1)).toBe("2026-07-17");
  });

  it("shifts backward across a month boundary", () => {
    expect(shiftDate("2026-07-01", -1)).toBe("2026-06-30");
  });

  it("shifts across a year boundary", () => {
    expect(shiftDate("2025-12-31", 1)).toBe("2026-01-01");
  });

  it("shifts backward across a year boundary", () => {
    expect(shiftDate("2026-01-01", -1)).toBe("2025-12-31");
  });
});

describe("SalesHistory", () => {
  it("computes total revenue, check count, and average per check", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/payments", method: "GET", json: { data: mockPayments } },
      ]),
    );

    const { findByText } = render(() => <SalesHistory />);
    await findByText("¥2,400"); // 1600 + 800
    await findByText("2件");
    await findByText("¥1,200"); // average: 2400 / 2
  });

  it("breaks down revenue per payment method", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/payments", method: "GET", json: { data: mockPayments } },
      ]),
    );

    render(() => <SalesHistory />);
    const breakdown = await screen.findByRole("list", {
      name: "支払い方法別内訳",
    });
    const scoped = within(breakdown);
    await scoped.findByText("¥1,600"); // cash: pay-1 only
    await scoped.findByText("¥800"); // card: pay-2 only
    await scoped.findByText("¥0"); // qr: no payments
  });

  it("labels each check with its payment method", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/payments", method: "GET", json: { data: mockPayments } },
      ]),
    );

    render(() => <SalesHistory />);
    const checkList = await screen.findByRole("list", { name: "会計一覧" });
    const scoped = within(checkList);
    await scoped.findByText("現金");
    await scoped.findByText("カード");
  });

  it("shows the empty state when there are no payments for the day", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/payments", method: "GET", json: { data: [] } }]),
    );

    const { findByText } = render(() => <SalesHistory />);
    await findByText(/この日の会計はありません/);
  });

  it("shows an error message when the API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/payments",
          method: "GET",
          ok: false,
          json: { error: { code: "UNAUTHORIZED", message: "要認証" } },
        },
      ]),
    );

    const { findByRole } = render(() => <SalesHistory />);
    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("要認証");
  });

  it("expands a check to reveal its items, with the cancelled one struck through", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/payments", method: "GET", json: { data: mockPayments } },
      ]),
    );

    const { findByText } = render(() => <SalesHistory />);
    const checkHeader = await findByText("テーブル1");
    await user.click(checkHeader);

    const activeItem = await findByText("唐揚げ");
    const cancelledItem = await findByText("ビール");
    expect(activeItem.closest("li")?.className).not.toMatch(/itemCancelled/);
    expect(cancelledItem.closest("li")?.className).toMatch(/itemCancelled/);
  });

  it("shows no struck-through total or discount line for an undiscounted check", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/payments", method: "GET", json: { data: mockPayments } },
      ]),
    );

    const { findByText, queryByText } = render(() => <SalesHistory />);
    const checkHeader = await findByText("テーブル1");
    await user.click(checkHeader);
    await findByText("唐揚げ");

    expect(queryByText("割引", { exact: false })).toBeNull();
  });

  it("shows the pre-discount total struck through and the discount reason", async () => {
    const user = userEvent.setup();
    const discountedPayment = {
      id: "pay-3",
      order_id: "order-3",
      seat_name: "テーブル3",
      total_amount: 700,
      method: "cash",
      discount_amount: 300,
      discount_reason: "常連割引",
      paid_at: 1_700_000_200_000,
      items: [
        {
          id: "item-4",
          name_snapshot: "定食",
          unit_price_snapshot: 1000,
          quantity: 1,
          status: "ordered",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/payments",
          method: "GET",
          json: { data: [discountedPayment] },
        },
      ]),
    );

    render(() => <SalesHistory />);
    const originalTotal = await screen.findByText("¥1,000"); // pre-discount
    expect(originalTotal.className).toMatch(/checkTotalOriginal/);

    const checkList = await screen.findByRole("list", { name: "会計一覧" });
    const scoped = within(checkList);
    await scoped.findByText("¥700"); // actual charged total

    const checkHeader = await scoped.findByText("テーブル3");
    await user.click(checkHeader);

    await scoped.findByText("割引（常連割引）");
    await scoped.findByText("-¥300");
  });

  function extractRange(url: string): { from: number; to: number } {
    const from = Number(
      new URL(url, "http://localhost").searchParams.get("from"),
    );
    const to = Number(new URL(url, "http://localhost").searchParams.get("to"));
    return { from, to };
  }

  it("re-fetches an earlier range when navigating to the previous day", async () => {
    const fetchMock = mockFetch([
      { url: "/api/payments", method: "GET", json: { data: [] } },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(() => <SalesHistory />);
    const prevBtn = await screen.findByRole("button", { name: /前日/ });
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(1));
    const initialRange = extractRange(fetchMock.mock.calls[0]?.[0] as string);

    await user.click(prevBtn);

    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(2));
    const prevRange = extractRange(fetchMock.mock.calls[1]?.[0] as string);
    expect(prevRange.from).toBe(initialRange.from - 24 * 60 * 60 * 1000);
    expect(prevRange.to).toBe(initialRange.to - 24 * 60 * 60 * 1000);
  });

  it("re-fetches a later range when navigating to the next day", async () => {
    const fetchMock = mockFetch([
      { url: "/api/payments", method: "GET", json: { data: [] } },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(() => <SalesHistory />);
    const nextBtn = await screen.findByRole("button", { name: /翌日/ });
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(1));
    const initialRange = extractRange(fetchMock.mock.calls[0]?.[0] as string);

    await user.click(nextBtn);

    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(2));
    const nextRange = extractRange(fetchMock.mock.calls[1]?.[0] as string);
    expect(nextRange.from).toBe(initialRange.from + 24 * 60 * 60 * 1000);
    expect(nextRange.to).toBe(initialRange.to + 24 * 60 * 60 * 1000);
  });
});
