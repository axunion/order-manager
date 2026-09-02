import { render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoreContext } from "../layouts/ShiftGuard";
import { data, mockFetch } from "../test-helpers";
import MySchedulePage from "./MySchedulePage";

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
  role: "staff" as const,
};

const period = {
  id: "period-1",
  start_date: "2026-09-01",
  end_date: "2026-09-15",
  status: "published" as const,
  submission_deadline: 1,
  published_at: 2,
};

const renderPage = () =>
  render(() => (
    <StoreContext.Provider value={store}>
      <MySchedulePage />
    </StoreContext.Provider>
  ));

afterEach(() => vi.restoreAllMocks());

describe("MySchedulePage", () => {
  it("lists the member's own shifts for a published period", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/shift/periods", json: data([period]) },
        {
          url: "/api/shift/schedule/period-1",
          json: data({
            period,
            published: true,
            shifts: [
              {
                id: "shift-1",
                period_id: "period-1",
                member_id: "member-1",
                position_id: null,
                work_date: "2026-09-01",
                start_minutes: 540,
                end_minutes: 1020,
                break_minutes: 60,
                note: null,
              },
            ],
          }),
        },
      ]),
    );

    renderPage();

    expect(await screen.findByText("9/1(火)")).toBeTruthy();
    expect(screen.getByText("09:00–17:00")).toBeTruthy();
    expect(screen.getByText(/実働 7時間/)).toBeTruthy();
  });

  it("says the schedule is not published yet rather than showing nothing", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/shift/periods",
          json: data([{ ...period, status: "building", published_at: null }]),
        },
        {
          url: "/api/shift/schedule/period-1",
          json: data({
            period: { ...period, status: "building", published_at: null },
            published: false,
            shifts: [],
          }),
        },
      ]),
    );

    renderPage();

    expect(await screen.findByText(/まだ公開されていません/)).toBeTruthy();
  });

  it("offers a submission link only while a period is collecting", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/shift/periods",
          json: data([{ ...period, status: "collecting", published_at: null }]),
        },
        {
          url: "/api/shift/schedule/period-1",
          json: data({
            period: { ...period, status: "collecting", published_at: null },
            published: false,
            shifts: [],
          }),
        },
      ]),
    );

    renderPage();

    const link = await screen.findByRole("link", { name: "希望を入力する" });
    expect(link.getAttribute("href")).toBe("/periods/period-1/availability");
  });

  it("hides the submission link once submissions are closed", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([
        { url: "/api/shift/periods", json: data([period]) },
        {
          url: "/api/shift/schedule/period-1",
          json: data({ period, published: true, shifts: [] }),
        },
      ]),
    );

    renderPage();

    await screen.findByText(/割り当てられたシフトはありません/);
    expect(screen.queryByRole("link", { name: "希望を入力する" })).toBeNull();
  });

  it("shows the newest period, not whichever one answers first", async () => {
    const older = {
      ...period,
      id: "period-0",
      start_date: "2026-08-16",
      end_date: "2026-08-31",
    };
    const fetchStub = mockFetch([
      // The API returns periods newest first.
      { url: "/api/shift/periods", json: data([period, older]) },
      {
        url: "/api/shift/schedule/period-0",
        json: data({ period: older, published: true, shifts: [] }),
      },
      {
        url: "/api/shift/schedule/period-1",
        json: data({ period, published: true, shifts: [] }),
      },
    ]);
    vi.stubGlobal("fetch", fetchStub);

    renderPage();

    expect(await screen.findByText("9/1(火)〜9/15(火)")).toBeTruthy();
    expect(
      fetchStub.mock.calls.some((call) =>
        String(call[0]).endsWith("/api/shift/schedule/period-0"),
      ),
    ).toBe(false);
  });

  it("says so when the store has no periods at all", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch([{ url: "/api/shift/periods", json: data([]) }]),
    );

    renderPage();

    expect(await screen.findByText("まだ期間がありません。")).toBeTruthy();
  });
});
