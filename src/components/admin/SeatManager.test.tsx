import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SeatManager from "./SeatManager";

// Stub qrcode.toDataURL at module level so Vitest's hoist processes it correctly.
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,STUB"),
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SeatManager", () => {
  it("fetches seats on mount and renders them", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/seats",
          method: "GET",
          json: {
            data: [
              {
                id: "s1",
                store_id: "st1",
                name: "Table 1",
                qr_token: "qr-abc",
                created_at: 1000,
              },
            ],
          },
        },
      ]),
    );

    const { findByRole } = render(() => <SeatManager />);
    // Delete button confirms the seat row is rendered.
    await findByRole("button", { name: /削除.*Table 1/ });
  });

  it("shows the empty state when there are no seats", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/seats", method: "GET", json: { data: [] } }]),
    );

    const { findByText } = render(() => <SeatManager />);
    await findByText(/座席がまだありません/);
  });

  it("submits POST /api/seats when the seat form is submitted", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { url: "/api/seats", method: "GET", json: { data: [] } },
      {
        url: "/api/seats",
        method: "POST",
        json: {
          data: {
            id: "s2",
            store_id: "st1",
            name: "Table 2",
            qr_token: "qr-def",
            created_at: 2000,
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { getByLabelText, getByRole } = render(() => <SeatManager />);
    await user.type(getByLabelText(/座席名/), "Table 2");
    await user.click(getByRole("button", { name: /座席を追加/ }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seats",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining('"name":"Table 2"'),
      }),
    );
  });

  it("sends DELETE to /api/seats/:id when delete is confirmed", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/seats",
        method: "GET",
        json: {
          data: [
            {
              id: "s3",
              store_id: "st1",
              name: "To Delete",
              qr_token: "qr-xyz",
              created_at: 1000,
            },
          ],
        },
      },
      {
        url: "/api/seats/s3",
        method: "DELETE",
        json: { data: { id: "s3" } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <SeatManager />);
    const deleteBtn = await screen.findByRole("button", {
      name: /削除.*To Delete|To Delete.*削除/,
    });
    await user.click(deleteBtn);

    // Confirm in the dialog
    const confirmBtn = await screen.findByRole("button", { name: "削除する" });
    await user.click(confirmBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seats/s3",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("shows an error message when API call fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/seats", method: "GET", json: { data: [] } },
        {
          url: "/api/seats",
          method: "POST",
          ok: false,
          json: {
            error: {
              code: "VALIDATION_ERROR",
              message: "name is required",
            },
          },
        },
      ]),
    );

    const { getByLabelText, getByRole, findByRole } = render(() => (
      <SeatManager />
    ));
    await user.type(getByLabelText(/座席名/), "X");
    await user.click(getByRole("button", { name: /座席を追加/ }));

    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("name is required");
  });

  it("shows a conflict error when deleting a seat with orders", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/seats",
        method: "GET",
        json: {
          data: [
            {
              id: "s4",
              store_id: "st1",
              name: "Busy Seat",
              qr_token: "qr-busy",
              created_at: 1000,
            },
          ],
        },
      },
      {
        url: "/api/seats/s4",
        method: "DELETE",
        ok: false,
        json: {
          error: {
            code: "CONFLICT",
            message: "この座席には注文が紐づいているため削除できません。",
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <SeatManager />);
    const deleteBtn = await screen.findByRole("button", {
      name: /削除.*Busy Seat|Busy Seat.*削除/,
    });
    await user.click(deleteBtn);

    // Confirm in the dialog
    const confirmBtn = await screen.findByRole("button", { name: "削除する" });
    await user.click(confirmBtn);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("削除できません");
  });
});
