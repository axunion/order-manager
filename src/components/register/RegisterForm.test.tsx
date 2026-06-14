import { render } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import RegisterForm from "./RegisterForm";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RegisterForm", () => {
  it("renders a store name input", () => {
    const { getByLabelText } = render(() => <RegisterForm />);
    expect(getByLabelText(/店舗名/)).toBeTruthy();
  });

  it("renders an email input", () => {
    const { getByLabelText } = render(() => <RegisterForm />);
    expect(getByLabelText(/メールアドレス/)).toBeTruthy();
  });

  it("renders a submit button", () => {
    const { getByRole } = render(() => <RegisterForm />);
    expect(getByRole("button", { name: /申し込む/ })).toBeTruthy();
  });

  it("calls POST /api/stores with name and email on submit", async () => {
    const user = userEvent.setup();
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { id: "1", name: "My Cafe", slug: "my-cafe-abc12" },
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { getByLabelText, getByRole } = render(() => <RegisterForm />);
    await user.type(getByLabelText(/店舗名/), "My Cafe");
    await user.type(getByLabelText(/メールアドレス/), "owner@example.com");
    await user.click(getByRole("button", { name: /申し込む/ }));

    expect(mockFetch).toHaveBeenCalledWith(
      "/api/stores",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ name: "My Cafe", email: "owner@example.com" }),
      }),
    );
  });

  it("shows an error message on API failure", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: { code: "SERVER_ERROR", message: "server failed" },
        }),
      }),
    );

    const { getByLabelText, getByRole, findByText } = render(() => (
      <RegisterForm />
    ));
    await user.type(getByLabelText(/店舗名/), "Fail Shop");
    await user.type(getByLabelText(/メールアドレス/), "fail@example.com");
    await user.click(getByRole("button", { name: /申し込む/ }));

    expect(await findByText(/server failed/)).toBeTruthy();
  });
});
