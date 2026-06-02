import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import MenuManager from "./MenuManager";

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mock fetch helper
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

describe("MenuManager", () => {
  it("fetches categories and items on mount and renders them", async () => {
    // "Drinks" can appear in multiple DOM nodes (category list span, item category
    // span, and select option), so findByText would throw "Found multiple". Use
    // findByRole with accessible name instead — it is unique per item.
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/menu/categories",
          method: "GET",
          json: {
            data: [{ id: "c1", name: "Drinks", sort_order: 0, store_id: "s1" }],
          },
        },
        {
          url: "/api/menu/items",
          method: "GET",
          json: {
            data: [
              {
                id: "i1",
                name: "Latte",
                price: 500,
                is_available: true,
                category_id: "c1",
                sort_order: 0,
                store_id: "s1",
              },
            ],
          },
        },
      ]),
    );

    const { findByRole } = render(() => <MenuManager />);
    // Category delete button confirms categories section rendered.
    await findByRole("button", { name: /削除.*Drinks/ });
    // Item delete button confirms items section rendered.
    await findByRole("button", { name: /削除.*Latte/ });
  });

  it("submits POST /api/menu/categories when the category form is submitted", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { url: "/api/menu/categories", method: "GET", json: { data: [] } },
      { url: "/api/menu/items", method: "GET", json: { data: [] } },
      {
        url: "/api/menu/categories",
        method: "POST",
        json: {
          data: { id: "c2", name: "Food", sort_order: 0, store_id: "s1" },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { getByLabelText, getByRole } = render(() => <MenuManager />);
    await user.type(getByLabelText(/カテゴリ名/), "Food");
    await user.click(getByRole("button", { name: /カテゴリを追加/ }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/menu/categories",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: expect.stringContaining('"name":"Food"'),
      }),
    );
  });

  it("submits POST /api/menu/items when the item form is submitted", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { url: "/api/menu/categories", method: "GET", json: { data: [] } },
      { url: "/api/menu/items", method: "GET", json: { data: [] } },
      {
        url: "/api/menu/items",
        method: "POST",
        json: {
          data: {
            id: "i2",
            name: "Espresso",
            price: 350,
            is_available: true,
            category_id: null,
            sort_order: 0,
            store_id: "s1",
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { getByLabelText, getByRole } = render(() => <MenuManager />);
    await user.type(getByLabelText(/商品名/), "Espresso");
    await user.type(getByLabelText(/価格/), "350");
    await user.click(getByRole("button", { name: /商品を追加/ }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/menu/items",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"name":"Espresso"'),
      }),
    );
  });

  it("sends DELETE to /api/menu/categories/:id when delete is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/menu/categories",
        method: "GET",
        json: {
          data: [
            { id: "c3", name: "To Delete", sort_order: 0, store_id: "s1" },
          ],
        },
      },
      { url: "/api/menu/items", method: "GET", json: { data: [] } },
      {
        url: "/api/menu/categories/c3",
        method: "DELETE",
        json: { data: { id: "c3" } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { findByRole } = render(() => <MenuManager />);
    const deleteBtn = await findByRole("button", {
      name: /削除.*To Delete|To Delete.*削除/,
    });
    await user.click(deleteBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/menu/categories/c3",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("sends DELETE to /api/menu/items/:id when delete is clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      { url: "/api/menu/categories", method: "GET", json: { data: [] } },
      {
        url: "/api/menu/items",
        method: "GET",
        json: {
          data: [
            {
              id: "i3",
              name: "To Delete Item",
              price: 200,
              is_available: true,
              category_id: null,
              sort_order: 0,
              store_id: "s1",
            },
          ],
        },
      },
      {
        url: "/api/menu/items/i3",
        method: "DELETE",
        json: { data: { id: "i3" } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    const { findByRole } = render(() => <MenuManager />);
    const deleteBtn = await findByRole("button", {
      name: /削除.*To Delete Item|To Delete Item.*削除/,
    });
    await user.click(deleteBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/menu/items/i3",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("shows an error message when API call fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/menu/categories", method: "GET", json: { data: [] } },
        { url: "/api/menu/items", method: "GET", json: { data: [] } },
        {
          url: "/api/menu/categories",
          method: "POST",
          ok: false,
          json: {
            error: { code: "VALIDATION_ERROR", message: "name is required" },
          },
        },
      ]),
    );

    const { getByLabelText, getByRole, findByRole } = render(() => (
      <MenuManager />
    ));
    await user.type(getByLabelText(/カテゴリ名/), "X");
    await user.click(getByRole("button", { name: /カテゴリを追加/ }));

    const alert = await findByRole("alert");
    expect(alert.textContent).toContain("name is required");
  });
});
