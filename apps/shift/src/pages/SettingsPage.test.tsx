import { fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreContext } from "../layouts/ShiftGuard";
import { data, type MockRoute, mockFetch } from "../test-helpers";
import SettingsPage from "./SettingsPage";

vi.mock("@solidjs/router", () => ({
  useNavigate: () => vi.fn(),
  A: (props: { href: string; children: unknown }) => (
    <a href={props.href}>{props.children as string}</a>
  ),
}));

const store = {
  id: "store-1",
  name: "テスト店舗",
  email: "owner@test.internal",
  role: "owner" as const,
};

const positions = [
  { id: "pos-1", name: "ホール", sort_order: 0, is_active: true },
];

const members = [
  {
    id: "member-1",
    email: "hall@test.internal",
    role: "staff" as const,
    position_ids: [] as string[],
    hourly_wage: null,
    weekly_cap_minutes: null,
    is_minor: false,
  },
];

const routes = (extra: MockRoute[] = []): MockRoute[] => [
  ...extra,
  { url: "/api/shift/positions", json: data(positions) },
  { url: "/api/shift/templates/patterns", json: data([]) },
  { url: "/api/shift/templates/requirements", json: data([]) },
  { url: "/api/shift/members", json: data(members) },
];

/** happy-dom's <input type="time"> ignores per-character typing. */
const fireInput = (element: HTMLElement, value: string) =>
  fireEvent.input(element, { target: { value } });

const renderPage = () =>
  render(() => (
    <StoreContext.Provider value={store}>
      <SettingsPage />
    </StoreContext.Provider>
  ));

const bodyOf = (
  stub: ReturnType<typeof mockFetch>,
  method: string,
  path: string,
) => {
  const call = stub.mock.calls.find(
    (c) =>
      (c[1] as RequestInit | undefined)?.method === method &&
      String(c[0]).includes(path),
  ) as [string, RequestInit] | undefined;
  return call ? JSON.parse(String(call[1].body)) : undefined;
};

afterEach(() => vi.restoreAllMocks());

describe("SettingsPage", () => {
  it("adds a position with the next sort order", async () => {
    const fetchStub = mockFetch(
      routes([{ url: "/api/shift/positions", method: "POST", json: data({}) }]),
    );
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    await user.type(await screen.findByLabelText("ポジション名"), "キッチン");
    await user.click(
      screen.getAllByRole("button", { name: "追加" })[0] as Element,
    );

    expect(bodyOf(fetchStub, "POST", "/api/shift/positions")).toEqual({
      name: "キッチン",
      sort_order: 1,
    });
  });

  it("stores a pattern that ends after midnight as minutes past the day", async () => {
    // 22:00–01:00 is a band that runs into tomorrow, not one that runs
    // backwards: the API's canonical encoding wants 1500, never 60.
    const fetchStub = mockFetch(
      routes([
        {
          url: "/api/shift/templates/patterns",
          method: "POST",
          json: data({}),
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    await user.type(await screen.findByLabelText("パターン名"), "深夜");
    fireInput(screen.getByLabelText("パターンの開始"), "22:00");
    fireInput(screen.getByLabelText("パターンの終了"), "01:00");
    await user.click(
      screen.getAllByRole("button", { name: "追加" })[1] as Element,
    );

    expect(bodyOf(fetchStub, "POST", "/api/shift/templates/patterns")).toEqual({
      name: "深夜",
      start_minutes: 1320,
      end_minutes: 1500,
      sort_order: 0,
    });
  });

  it("saves a work profile in the units the API stores", async () => {
    const fetchStub = mockFetch(
      routes([
        {
          url: "/api/shift/members/member-1/work-profile",
          method: "PUT",
          json: data({}),
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole("button", { name: "編集" }));
    await user.type(screen.getByLabelText("時給（円）"), "1200");
    // Entered in hours, stored in minutes.
    await user.type(screen.getByLabelText("週上限（時間）"), "28");
    await user.click(screen.getByLabelText("18歳未満"));
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(bodyOf(fetchStub, "PUT", "/work-profile")).toEqual({
      hourly_wage: 1200,
      weekly_cap_minutes: 1680,
      is_minor: true,
    });
  });

  it("sends the whole position list when one is toggled on", async () => {
    const fetchStub = mockFetch(
      routes([
        {
          url: "/api/shift/members/member-1/positions",
          method: "PUT",
          json: data({}),
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole("button", { name: "ホール" }));

    expect(bodyOf(fetchStub, "PUT", "/positions")).toEqual({
      position_ids: ["pos-1"],
    });
  });
});
