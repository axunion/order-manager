import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { data, mockFetch } from "../test-helpers";
import LoginForm from "./LoginForm";

afterEach(() => vi.restoreAllMocks());

describe("LoginForm", () => {
  it("tells the API the link belongs to the shift app", async () => {
    // Without this field the API redirects verified logins to ADMIN_ORIGIN,
    // so every staff member would land in the wrong SPA — and nothing else
    // in this app would notice.
    const fetchStub = mockFetch([
      {
        url: "/api/auth/login",
        method: "POST",
        json: data({ message: "sent" }),
      },
    ]);
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    render(() => <LoginForm />);

    await user.type(
      screen.getByLabelText("メールアドレス"),
      "staff@test.internal",
    );
    await user.click(
      screen.getByRole("button", { name: "ログインリンクを送信" }),
    );

    const call = fetchStub.mock.calls.at(-1) as [string, RequestInit];
    expect(String(call[0])).toContain("/api/auth/login");
    expect(JSON.parse(String(call[1].body))).toEqual({
      email: "staff@test.internal",
      app: "shift",
    });
    expect(await screen.findByText(/メールを送信しました/)).toBeTruthy();
  });

  it("keeps the form up and shows the reason when the API rejects the email", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/auth/login",
          method: "POST",
          ok: false,
          json: {
            error: { code: "NOT_FOUND", message: "登録されていません" },
          },
        },
      ]),
    );
    const user = userEvent.setup();

    render(() => <LoginForm />);

    await user.type(
      screen.getByLabelText("メールアドレス"),
      "nobody@test.internal",
    );
    await user.click(
      screen.getByRole("button", { name: "ログインリンクを送信" }),
    );

    expect(await screen.findByText("登録されていません")).toBeTruthy();
    expect(screen.queryByText(/メールを送信しました/)).toBeNull();
  });
});
