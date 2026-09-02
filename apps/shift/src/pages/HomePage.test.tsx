import { render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreContext, type StoreInfo } from "../layouts/ShiftGuard";
import { data, mockFetch } from "../test-helpers";
import HomePage from "./HomePage";

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
  A: (props: { href: string; children: unknown }) => (
    <a href={props.href}>{props.children as string}</a>
  ),
}));

const storeAs = (role: "owner" | "staff"): StoreInfo => ({
  id: "store-1",
  name: "テスト店舗",
  email: "someone@test.internal",
  role,
});

const renderAs = (role: "owner" | "staff") =>
  render(() => (
    <StoreContext.Provider value={storeAs(role)}>
      <HomePage />
    </StoreContext.Provider>
  ));

afterEach(() => vi.restoreAllMocks());

describe("HomePage", () => {
  it("gives an owner the period list they build from", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/shift/periods", json: data([]) }]),
    );

    renderAs("owner");

    expect(await screen.findByText("シフト期間")).toBeTruthy();
    expect(screen.queryByText("マイシフト")).toBeNull();
  });

  it("gives a staff member their own shifts on the same route", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/shift/periods", json: data([]) }]),
    );

    renderAs("staff");

    expect(await screen.findByText("マイシフト")).toBeTruthy();
    expect(screen.queryByText("シフト期間")).toBeNull();
  });
});
