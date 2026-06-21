import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CheckoutPanel from "./CheckoutPanel";

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

/** A minimal pending order for testing. */
const mockPendingOrder = {
  id: "order-checkout-1",
  seat_name: "テーブル2",
  status: "payment_requested",
  items: [
    {
      id: "item-checkout-1",
      name_snapshot: "ビール",
      unit_price_snapshot: 600,
      quantity: 2,
      status: "ordered",
      created_at: 2_000_000,
    },
  ],
  total: 1200,
  created_at: 1_500_000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CheckoutPanel", () => {
  it("fetches pending orders on mount and renders them", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/payments/pending",
          method: "GET",
          json: { data: [mockPendingOrder] },
        },
      ]),
    );

    const { findByText, findAllByText } = render(() => <CheckoutPanel />);
    await findByText("テーブル2");
    await findByText("ビール");
    // ¥1,200 appears in order total and line item price
    const amounts = await findAllByText("¥1,200");
    expect(amounts.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the empty state when there are no pending orders", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/payments/pending",
          method: "GET",
          json: { data: [] },
        },
      ]),
    );

    const { findByText } = render(() => <CheckoutPanel />);
    await findByText(/会計待ちの伝票はありません/);
  });

  it("shows an error message when the API call fails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/payments/pending",
          method: "GET",
          ok: false,
          json: { error: { code: "UNAUTHORIZED", message: "要認証" } },
        },
      ]),
    );

    const { findByRole } = render(() => <CheckoutPanel />);
    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("要認証");
  });

  it("sends POST to /api/payments when 会計完了 button is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/payments/pending",
        method: "GET",
        json: { data: [mockPendingOrder] },
      },
      {
        url: "/api/payments",
        method: "POST",
        json: {
          data: {
            id: "payment-1",
            order_id: "order-checkout-1",
            total_amount: 1200,
            method: "cash",
            paid_at: Date.now(),
          },
        },
      },
      // Second GET after payment — order is gone
      {
        url: "/api/payments/pending",
        method: "GET",
        json: { data: [] },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { findByRole } = render(() => <CheckoutPanel />);
    const checkoutBtn = await findByRole("button", { name: /会計完了/ });
    await user.click(checkoutBtn);

    // Should have called POST /api/payments
    const postCalls = fetchMock.mock.calls.filter((args: unknown[]) => {
      const url = args[0] as string;
      const init = args[1] as RequestInit | undefined;
      return (
        url.includes("/api/payments") &&
        !url.includes("/pending") &&
        (init?.method ?? "").toUpperCase() === "POST"
      );
    });
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("shows an error when payment POST fails", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/payments/pending",
        method: "GET",
        json: { data: [mockPendingOrder] },
      },
      {
        url: "/api/payments",
        method: "POST",
        ok: false,
        json: {
          error: { code: "CONFLICT", message: "この注文は既に会計済みです。" },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { findByRole } = render(() => <CheckoutPanel />);
    const checkoutBtn = await findByRole("button", { name: /会計完了/ });
    await user.click(checkoutBtn);

    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("会計済み");
  });

  it("action error persists through the next successful poll", async () => {
    vi.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const fetchMock = mockFetch([
      // Initial GET — load the pending order
      {
        url: "/api/payments/pending",
        method: "GET",
        json: { data: [mockPendingOrder] },
      },
      // POST fails with a conflict error
      {
        url: "/api/payments",
        method: "POST",
        ok: false,
        json: {
          error: { code: "CONFLICT", message: "この注文は既に会計済みです。" },
        },
      },
      // Next poll GET succeeds — should NOT clear the action error
      {
        url: "/api/payments/pending",
        method: "GET",
        json: { data: [mockPendingOrder] },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { findByRole } = render(() => <CheckoutPanel />);
    await vi.advanceTimersByTimeAsync(0); // flush initial mount

    const checkoutBtn = await findByRole("button", { name: /会計完了/ });
    await user.click(checkoutBtn);

    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("会計済み");

    // Advance 5 seconds — background poll fires and GET succeeds
    await vi.advanceTimersByTimeAsync(5000);

    // Action error must still be visible after the successful poll
    expect(alert.textContent).toContain("会計済み");
  });

  it("disables 会計完了 button while processing to prevent double payment", async () => {
    // Use fake timers to catch the button state during async processing
    vi.useFakeTimers();
    let resolvePost!: () => void;
    const postPromise = new Promise<void>((res) => {
      resolvePost = res;
    });

    const baseMock = mockFetch([
      {
        url: "/api/payments/pending",
        method: "GET",
        json: { data: [mockPendingOrder] },
      },
    ]);
    const fetchMock = vi
      .fn()
      .mockImplementation(async (url: string, init?: RequestInit) => {
        if (
          (init?.method ?? "GET").toUpperCase() === "POST" &&
          url.includes("/api/payments")
        ) {
          await postPromise;
          return {
            ok: true,
            json: async () => ({
              data: {
                id: "payment-1",
                order_id: "order-checkout-1",
                total_amount: 1200,
                method: "cash",
                paid_at: Date.now(),
              },
            }),
          };
        }
        return baseMock(url, init);
      });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { findByRole } = render(() => <CheckoutPanel />);

    await vi.advanceTimersByTimeAsync(0);
    const checkoutBtn = await findByRole("button", { name: /会計完了/ });

    // Click without awaiting — the POST hangs
    const clickPromise = user.click(checkoutBtn);

    // Two flushes: one for the click handler's synchronous update, one for the
    // extra microtask introduced by the async mock function.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    // Button should be disabled while processing
    expect((checkoutBtn as HTMLButtonElement).disabled).toBe(true);

    // Resolve and clean up
    resolvePost();
    await clickPromise;
  });

  it("polls every 5 seconds via setInterval", async () => {
    vi.useFakeTimers();
    const fetchMock = mockFetch([
      {
        url: "/api/payments/pending",
        method: "GET",
        json: { data: [] },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <CheckoutPanel />);

    // Flush the initial onMount fetch
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterMount = fetchMock.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    // Advance by 5 seconds — the setInterval callback should fire once more
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(callsAfterMount);
  });
});
