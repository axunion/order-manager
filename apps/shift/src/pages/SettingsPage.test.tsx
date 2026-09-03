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

const patterns = [
  {
    id: "pattern-1",
    name: "早番",
    start_minutes: 540,
    end_minutes: 1020,
    sort_order: 0,
    is_active: true,
  },
];

const requirements = [
  {
    id: "req-1",
    weekday: 2,
    position_id: "pos-1",
    start_minutes: 540,
    end_minutes: 1020,
    required_headcount: 2,
  },
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

const routes = (
  extra: MockRoute[] = [],
  overrides: Partial<{
    positions: unknown;
    patterns: unknown;
    requirements: unknown;
    members: unknown;
  }> = {},
): MockRoute[] => [
  ...extra,
  {
    // The settings screen asks for retired positions too, so it can offer a
    // way back from "使わない".
    url: "/api/shift/positions?include_inactive=true",
    json: data(overrides.positions ?? positions),
  },
  {
    url: "/api/shift/templates/patterns",
    json: data(overrides.patterns ?? []),
  },
  {
    url: "/api/shift/templates/requirements",
    json: data(overrides.requirements ?? []),
  },
  { url: "/api/shift/members", json: data(overrides.members ?? members) },
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
    await user.click(screen.getByRole("button", { name: "ポジションを追加" }));

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
    await user.click(screen.getByRole("button", { name: "パターンを追加" }));

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

    await user.click(
      await screen.findByRole("button", {
        name: "hall@test.internalの勤務条件を編集",
      }),
    );
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

  it("numbers a new pattern after the ones already there", async () => {
    const fetchStub = mockFetch(
      routes(
        [
          {
            url: "/api/shift/templates/patterns",
            method: "POST",
            json: data({}),
          },
        ],
        { patterns },
      ),
    );
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    await user.type(await screen.findByLabelText("パターン名"), "遅番");
    await user.click(screen.getByRole("button", { name: "パターンを追加" }));

    expect(
      bodyOf(fetchStub, "POST", "/api/shift/templates/patterns").sort_order,
    ).toBe(1);
  });

  it("retires a position instead of deleting it, and can bring it back", async () => {
    // Shifts and staffing requirements reference a position, so an old
    // schedule still has to render: this must never become a DELETE.
    const retired = [{ ...positions[0], is_active: false }];
    let listCalls = 0;
    const fetchStub = vi
      .fn()
      .mockImplementation((url: string, init?: RequestInit) => {
        const method = (init?.method ?? "GET").toUpperCase();
        if (String(url).includes("/api/shift/positions") && method === "GET") {
          listCalls += 1;
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              data: listCalls === 1 ? positions : retired,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ data: {} }),
        });
      });
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "「ホール」を使わない" }),
    );

    const call = fetchStub.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "PATCH",
    ) as [string, RequestInit];
    expect(String(call[0])).toContain("/api/shift/positions/pos-1");
    expect(JSON.parse(String(call[1].body))).toEqual({
      name: "ホール",
      sort_order: 0,
      is_active: false,
    });
    expect(
      fetchStub.mock.calls.some(
        (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(false);

    // A retired position is still listed, with a way back.
    expect(
      await screen.findByRole("button", { name: "「ホール」を復帰" }),
    ).toBeTruthy();
  });

  it("retires a pattern rather than deleting it", async () => {
    const fetchStub = mockFetch(
      routes(
        [
          {
            url: "/api/shift/templates/patterns/pattern-1",
            method: "PATCH",
            json: data({}),
          },
        ],
        { patterns },
      ),
    );
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "「早番」を使わない" }),
    );

    expect(
      bodyOf(fetchStub, "PATCH", "/api/shift/templates/patterns/pattern-1")
        .is_active,
    ).toBe(false);
    expect(
      fetchStub.mock.calls.some(
        (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(false);
  });

  it("adds a requirement for an overnight band, and zero is a real headcount", async () => {
    // 0 closes a band that used to need staff — it is not "unset".
    const fetchStub = mockFetch(
      routes([
        {
          url: "/api/shift/templates/requirements",
          method: "POST",
          json: data({}),
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    fireInput(await screen.findByLabelText("必要人数の開始"), "22:00");
    fireInput(screen.getByLabelText("必要人数の終了"), "01:00");
    fireInput(screen.getByLabelText("人数"), "0");
    await user.click(screen.getByRole("button", { name: "必要人数を追加" }));

    expect(
      bodyOf(fetchStub, "POST", "/api/shift/templates/requirements"),
    ).toEqual({
      weekday: 1,
      position_id: "pos-1",
      start_minutes: 1320,
      end_minutes: 1500,
      required_headcount: 0,
    });
  });

  it("hard-deletes a requirement once the confirmation is accepted", async () => {
    const fetchStub = mockFetch(
      routes(
        [
          {
            url: "/api/shift/templates/requirements/req-1",
            method: "DELETE",
            json: data({}),
          },
        ],
        { requirements },
      ),
    );
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "火曜 ホール 09:00–17:00 2人を削除",
      }),
    );
    expect(
      fetchStub.mock.calls.some(
        (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
      ),
    ).toBe(false);

    await user.click(await screen.findByRole("button", { name: "削除する" }));

    const call = fetchStub.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === "DELETE",
    ) as [string, RequestInit];
    expect(String(call[0])).toContain(
      "/api/shift/templates/requirements/req-1",
    );
  });

  it("clears a member's positions when the last one is toggled off", async () => {
    const assigned = [{ ...members[0], position_ids: ["pos-1"] }];
    const fetchStub = mockFetch(
      routes(
        [
          {
            url: "/api/shift/members/member-1/positions",
            method: "PUT",
            json: data({}),
          },
        ],
        { members: assigned },
      ),
    );
    vi.stubGlobal("fetch", fetchStub);
    const user = userEvent.setup();

    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "hall@test.internal ホール" }),
    );

    expect(bodyOf(fetchStub, "PUT", "/positions")).toEqual({
      position_ids: [],
    });
  });

  it("shows the API's reason when a write is refused", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        routes([
          {
            url: "/api/shift/positions",
            method: "POST",
            ok: false,
            status: 400,
            json: {
              error: {
                code: "VALIDATION_ERROR",
                message: "その名前はすでに使われています。",
              },
            },
          },
        ]),
      ),
    );
    const user = userEvent.setup();

    renderPage();

    await user.type(await screen.findByLabelText("ポジション名"), "ホール");
    await user.click(screen.getByRole("button", { name: "ポジションを追加" }));

    expect(
      await screen.findByText("その名前はすでに使われています。"),
    ).toBeTruthy();
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

    await user.click(
      await screen.findByRole("button", {
        name: "hall@test.internal ホール",
      }),
    );

    expect(bodyOf(fetchStub, "PUT", "/positions")).toEqual({
      position_ids: ["pos-1"],
    });
  });
});
