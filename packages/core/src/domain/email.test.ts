import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEmailContent, sendMagicLinkEmail } from "./email";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("buildEmailContent", () => {
  it("returns signup subject/body with the magic link embedded", () => {
    const { subject, html } = buildEmailContent(
      "signup",
      "https://api.example.com/verify?token=abc",
    );
    expect(subject).toContain("確認");
    expect(html).toContain("https://api.example.com/verify?token=abc");
  });

  it("returns login subject/body with the magic link embedded", () => {
    const { subject, html } = buildEmailContent(
      "login",
      "https://api.example.com/verify?token=def",
    );
    expect(subject).toContain("ログイン");
    expect(html).toContain("https://api.example.com/verify?token=def");
  });

  it("returns email_change subject/body with the magic link embedded", () => {
    const { subject, html } = buildEmailContent(
      "email_change",
      "https://api.example.com/verify?token=ghi",
    );
    expect(subject).toContain("メールアドレス変更");
    expect(html).toContain("https://api.example.com/verify?token=ghi");
  });

  it("returns invite subject/body with the magic link embedded", () => {
    const { subject, html } = buildEmailContent(
      "invite",
      "https://api.example.com/verify?token=jkl",
    );
    expect(subject).toContain("招待");
    expect(html).toContain("https://api.example.com/verify?token=jkl");
  });

  it("produces distinct content per purpose", () => {
    const url = "https://api.example.com/verify?token=x";
    const signup = buildEmailContent("signup", url);
    const login = buildEmailContent("login", url);
    const emailChange = buildEmailContent("email_change", url);
    const invite = buildEmailContent("invite", url);
    const subjects = [signup, login, emailChange, invite].map((c) => c.subject);
    expect(new Set(subjects).size).toBe(subjects.length);
  });
});

describe("sendMagicLinkEmail", () => {
  it("logs to console instead of calling fetch when resendApiKey is absent", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendMagicLinkEmail(
      {
        to: "owner@example.com",
        magicLinkUrl: "https://api.example.com/verify?token=abc",
        purpose: "email_change",
      },
      {},
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("owner@example.com"),
    );
  });

  it("calls the Resend API with the email_change subject/body when resendApiKey is set", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);

    await sendMagicLinkEmail(
      {
        to: "newowner@example.com",
        magicLinkUrl: "https://api.example.com/verify?token=xyz",
        purpose: "email_change",
      },
      { resendApiKey: "test-key" },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("newowner@example.com");
    expect(body.subject).toContain("メールアドレス変更");
    expect(body.html).toContain("https://api.example.com/verify?token=xyz");
  });

  it("throws when the Resend API responds with an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "boom",
      }),
    );

    await expect(
      sendMagicLinkEmail(
        {
          to: "owner@example.com",
          magicLinkUrl: "https://api.example.com/verify?token=abc",
          purpose: "login",
        },
        { resendApiKey: "test-key" },
      ),
    ).rejects.toThrow(/Resend API error/);
  });
});
