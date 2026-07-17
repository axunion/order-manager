import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import SeatManager from "./SeatManager";

// Echoes the input URL (which embeds the seat's qr_token) so tests can
// assert the rendered QR image actually reflects the current token,
// rather than a fixed stub that can't distinguish old vs. new.
vi.mock("qrcode", () => ({
  default: {
    toDataURL: vi
      .fn()
      .mockImplementation((url: string) =>
        Promise.resolve(`data:image/png;base64,${encodeURIComponent(url)}`),
      ),
  },
}));

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
                is_active: true,
                created_at: 1000,
              },
            ],
          },
        },
      ]),
    );

    const { findByRole } = render(() => <SeatManager />);
    await findByRole("button", { name: /無効化.*Table 1/ });
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
            is_active: true,
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
});

describe("SeatManager — rename", () => {
  it("submits PATCH /api/seats/:id when the rename form is submitted", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/seats",
        method: "GET",
        json: {
          data: [
            {
              id: "s5",
              store_id: "st1",
              name: "Old Name",
              qr_token: "qr-rename",
              is_active: true,
              created_at: 1000,
            },
          ],
        },
      },
      {
        url: "/api/seats/s5",
        method: "PATCH",
        json: {
          data: {
            id: "s5",
            store_id: "st1",
            name: "New Name",
            qr_token: "qr-rename",
            is_active: true,
            created_at: 1000,
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <SeatManager />);
    const editBtn = await screen.findByRole("button", {
      name: "座席名を編集 Old Name",
    });
    await user.click(editBtn);

    const input = screen.getByLabelText("座席名を編集 Old Name");
    await user.clear(input);
    await user.type(input, "New Name");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seats/s5",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"name":"New Name"'),
      }),
    );
    await screen.findByText("New Name");
  });

  it("cancels the edit without submitting", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/seats",
          method: "GET",
          json: {
            data: [
              {
                id: "s6",
                store_id: "st1",
                name: "Keep Name",
                qr_token: "qr-cancel",
                is_active: true,
                created_at: 1000,
              },
            ],
          },
        },
      ]),
    );

    render(() => <SeatManager />);
    const editBtn = await screen.findByRole("button", {
      name: "座席名を編集 Keep Name",
    });
    await user.click(editBtn);

    const input = screen.getByLabelText("座席名を編集 Keep Name");
    await user.clear(input);
    await user.type(input, "Discarded");
    await user.click(screen.getByRole("button", { name: "キャンセル" }));

    await screen.findByText("Keep Name");
    expect(screen.queryByText("Discarded")).toBeNull();
  });
});

describe("SeatManager — retire", () => {
  it("sends DELETE to /api/seats/:id when retire is confirmed", async () => {
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
              name: "To Retire",
              qr_token: "qr-xyz",
              is_active: true,
              created_at: 1000,
            },
          ],
        },
      },
      {
        url: "/api/seats/s3",
        method: "DELETE",
        json: { data: { id: "s3", is_active: false } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <SeatManager />);
    const retireBtn = await screen.findByRole("button", {
      name: /無効化.*To Retire|To Retire.*無効化/,
    });
    await user.click(retireBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: "無効化する",
    });
    await user.click(confirmBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seats/s3",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("removes the seat from the active list after retiring", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/seats",
          method: "GET",
          json: {
            data: [
              {
                id: "s7",
                store_id: "st1",
                name: "Gone Soon",
                qr_token: "qr-gone",
                is_active: true,
                created_at: 1000,
              },
            ],
          },
        },
        {
          url: "/api/seats/s7",
          method: "DELETE",
          json: { data: { id: "s7", is_active: false } },
        },
      ]),
    );

    render(() => <SeatManager />);
    const retireBtn = await screen.findByRole("button", {
      name: /無効化.*Gone Soon|Gone Soon.*無効化/,
    });
    await user.click(retireBtn);
    await user.click(await screen.findByRole("button", { name: "無効化する" }));

    await screen.findByText(/座席がまだありません/);
  });

  it("shows a conflict error when retiring a seat with an active order", async () => {
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
              is_active: true,
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
            message: "進行中の注文があるため座席を無効化できません。",
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <SeatManager />);
    const retireBtn = await screen.findByRole("button", {
      name: /無効化.*Busy Seat|Busy Seat.*無効化/,
    });
    await user.click(retireBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: "無効化する",
    });
    await user.click(confirmBtn);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("無効化できません");
  });

  it("retires only the clicked seat when two active seats exist", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/seats",
        method: "GET",
        json: {
          data: [
            {
              id: "s14",
              store_id: "st1",
              name: "Keep This",
              qr_token: "qr-keep",
              is_active: true,
              created_at: 1000,
            },
            {
              id: "s15",
              store_id: "st1",
              name: "Retire This",
              qr_token: "qr-retire",
              is_active: true,
              created_at: 2000,
            },
          ],
        },
      },
      {
        url: "/api/seats/s15",
        method: "DELETE",
        json: { data: { id: "s15", is_active: false } },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <SeatManager />);
    const retireBtn = await screen.findByRole("button", {
      name: /無効化.*Retire This|Retire This.*無効化/,
    });
    await user.click(retireBtn);
    await user.click(await screen.findByRole("button", { name: "無効化する" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seats/s15",
      expect.objectContaining({ method: "DELETE" }),
    );
    await screen.findByText("Keep This");
    expect(screen.queryByText("Retire This")).toBeNull();
  });
});

describe("SeatManager — QR rotation", () => {
  it("sends POST to rotate-qr when reissue is confirmed", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/seats",
        method: "GET",
        json: {
          data: [
            {
              id: "s8",
              store_id: "st1",
              name: "Rotate Me",
              qr_token: "qr-old",
              is_active: true,
              created_at: 1000,
            },
          ],
        },
      },
      {
        url: "/api/seats/s8/rotate-qr",
        method: "POST",
        json: {
          data: {
            id: "s8",
            store_id: "st1",
            name: "Rotate Me",
            qr_token: "qr-new",
            is_active: true,
            created_at: 1000,
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <SeatManager />);
    const rotateBtn = await screen.findByRole("button", {
      name: "QRコードを再発行 Rotate Me",
    });
    await user.click(rotateBtn);

    const oldQrImg = screen.getByAltText("QR Rotate Me") as HTMLImageElement;
    expect(oldQrImg.src).toContain(encodeURIComponent("qr-old"));

    const confirmBtn = await screen.findByRole("button", {
      name: "再発行する",
    });
    await user.click(confirmBtn);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seats/s8/rotate-qr",
      expect.objectContaining({ method: "POST" }),
    );

    // The rendered QR image is regenerated from the new token, not the old one.
    await vi.waitFor(() => {
      const newQrImg = screen.getByAltText("QR Rotate Me") as HTMLImageElement;
      expect(newQrImg.src).toContain(encodeURIComponent("qr-new"));
    });
  });

  it("returns 409 when the seat has an active order and does not change the token", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/seats",
          method: "GET",
          json: {
            data: [
              {
                id: "s11",
                store_id: "st1",
                name: "Busy Rotate",
                qr_token: "qr-busy-rotate",
                is_active: true,
                created_at: 1000,
              },
            ],
          },
        },
        {
          url: "/api/seats/s11/rotate-qr",
          method: "POST",
          ok: false,
          json: {
            error: {
              code: "CONFLICT",
              message: "進行中の注文があるためQRコードを再発行できません。",
            },
          },
        },
      ]),
    );

    render(() => <SeatManager />);
    const rotateBtn = await screen.findByRole("button", {
      name: "QRコードを再発行 Busy Rotate",
    });
    await user.click(rotateBtn);
    await user.click(await screen.findByRole("button", { name: "再発行する" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("再発行できません");

    const img = screen.getByAltText("QR Busy Rotate") as HTMLImageElement;
    expect(img.src).toContain(encodeURIComponent("qr-busy-rotate"));
  });

  it("acts on the clicked seat's id, not another seat's, when two active seats exist", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch([
      {
        url: "/api/seats",
        method: "GET",
        json: {
          data: [
            {
              id: "s12",
              store_id: "st1",
              name: "Seat A",
              qr_token: "qr-a",
              is_active: true,
              created_at: 1000,
            },
            {
              id: "s13",
              store_id: "st1",
              name: "Seat B",
              qr_token: "qr-b",
              is_active: true,
              created_at: 2000,
            },
          ],
        },
      },
      {
        url: "/api/seats/s13/rotate-qr",
        method: "POST",
        json: {
          data: {
            id: "s13",
            store_id: "st1",
            name: "Seat B",
            qr_token: "qr-b-new",
            is_active: true,
            created_at: 2000,
          },
        },
      },
    ]);
    vi.stubGlobal("fetch", fetchMock);

    render(() => <SeatManager />);
    const rotateBtn = await screen.findByRole("button", {
      name: "QRコードを再発行 Seat B",
    });
    await user.click(rotateBtn);
    await user.click(await screen.findByRole("button", { name: "再発行する" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seats/s13/rotate-qr",
      expect.objectContaining({ method: "POST" }),
    );
    const seatACalls = fetchMock.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).includes("/api/seats/s12/rotate-qr"),
    );
    expect(seatACalls).toHaveLength(0);
  });
});

describe("SeatManager — retired seats toggle", () => {
  it("hides retired seats until the toggle is checked", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      mockFetch([
        {
          url: "/api/seats",
          method: "GET",
          json: {
            data: [
              {
                id: "s9",
                store_id: "st1",
                name: "Active Table",
                qr_token: "qr-active",
                is_active: true,
                created_at: 1000,
              },
              {
                id: "s10",
                store_id: "st1",
                name: "Retired Table",
                qr_token: "qr-retired",
                is_active: false,
                created_at: 900,
              },
            ],
          },
        },
      ]),
    );

    render(() => <SeatManager />);
    await screen.findByText("Active Table");
    expect(screen.queryByText("Retired Table")).toBeNull();

    const toggle = screen.getByLabelText("無効化した座席を表示");
    await user.click(toggle);

    await screen.findByText("Retired Table");
  });
});
