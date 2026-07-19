import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreContext } from "../layouts/AdminGuard";
import StoreSettings from "./StoreSettings";

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

function renderWithStore(
  store: {
    id: string;
    name: string;
    email: string;
    role: "owner" | "staff";
  } = {
    id: "store-1",
    name: "テスト食堂",
    email: "owner@test.internal",
    role: "owner",
  },
) {
  return render(() => (
    <StoreContext.Provider value={store}>
      <StoreSettings />
    </StoreContext.Provider>
  ));
}

describe("StoreSettings — store name", () => {
  it("pre-fills the name field with the current store name", async () => {
    renderWithStore();
    const input = (await screen.findByLabelText("店舗名")) as HTMLInputElement;
    expect(input.value).toBe("テスト食堂");
  });

  it("shows the current email as read-only text", async () => {
    renderWithStore();
    await screen.findByText("owner@test.internal");
  });

  it("saves the new name via PATCH and shows a confirmation", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/stores/me",
        method: "PATCH",
        json: { data: { id: "store-1", name: "新食堂", slug: "test-abcde" } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderWithStore();
    const input = await screen.findByLabelText("店舗名");
    await user.clear(input);
    await user.type(input, "新食堂");
    const saveBtn = screen.getByRole("button", { name: "保存" });
    await user.click(saveBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stores/me",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"name":"新食堂"'),
      }),
    );
    await screen.findByText("保存しました。");
  });

  it("shows an error when the rename request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/stores/me",
          method: "PATCH",
          ok: false,
          json: {
            error: { code: "VALIDATION_ERROR", message: "店舗名が不正です。" },
          },
        },
      ]),
    );

    renderWithStore();
    const saveBtn = await screen.findByRole("button", { name: "保存" });
    await user.click(saveBtn);

    await screen.findByText("店舗名が不正です。");
  });
});

describe("StoreSettings — email change", () => {
  it("requests an email change and shows the confirmation notice", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/stores/me/email-change",
        method: "POST",
        json: { data: { sent: true } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderWithStore();
    const input = await screen.findByLabelText("新しいメールアドレス");
    await user.type(input, "new-owner@example.com");
    const submitBtn = screen.getByRole("button", { name: "変更をリクエスト" });
    await user.click(submitBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/stores/me/email-change",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"new_email":"new-owner@example.com"'),
      }),
    );
    await screen.findByText(/確認メールを送信しました/);
    expect(screen.queryByLabelText("新しいメールアドレス")).toBeNull();
    // The current email is unchanged until the link is clicked, so it
    // stays visible (not hidden) alongside the "check your inbox" notice.
    expect(screen.queryByText("owner@test.internal")).not.toBeNull();
  });

  it("shows a dev-only verify link when verify_url is present", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/stores/me/email-change",
          method: "POST",
          json: {
            data: {
              sent: true,
              verify_url: "https://api.example.com/api/auth/verify?token=abc",
            },
          },
        },
      ]),
    );

    renderWithStore();
    const input = await screen.findByLabelText("新しいメールアドレス");
    await user.type(input, "new-owner@example.com");
    await user.click(screen.getByRole("button", { name: "変更をリクエスト" }));

    const link = (await screen.findByRole("link", {
      name: "このリンクで直接確定する",
    })) as HTMLAnchorElement;
    expect(link.href).toBe("https://api.example.com/api/auth/verify?token=abc");
  });

  it("shows an error when the email-change request fails (e.g. duplicate)", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/stores/me/email-change",
          method: "POST",
          ok: false,
          json: {
            error: {
              code: "VALIDATION_ERROR",
              message: "このメールアドレスはすでに使用されています。",
            },
          },
        },
      ]),
    );

    renderWithStore();
    const input = await screen.findByLabelText("新しいメールアドレス");
    await user.type(input, "taken@example.com");
    await user.click(screen.getByRole("button", { name: "変更をリクエスト" }));

    await screen.findByText("このメールアドレスはすでに使用されています。");
    // The form stays visible so the owner can correct and retry.
    expect(screen.queryByLabelText("新しいメールアドレス")).not.toBeNull();
  });
});

describe("StoreSettings — log out everywhere", () => {
  it("calls POST /api/auth/logout-all when clicked", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/auth/logout-all",
        method: "POST",
        json: { data: { sent: true } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    renderWithStore();
    const btn = await screen.findByRole("button", {
      name: "ログアウト（全端末）",
    });
    await user.click(btn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/logout-all",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
