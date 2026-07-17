import { describe, expect, it } from "vitest";
import {
  buildClearSessionCookie,
  buildSessionCookie,
  MAGIC_LINK_HOURLY_CAP,
  MAGIC_LINK_TTL_MS,
  SESSION_TOKEN_COOKIE,
  SESSION_TTL_MS,
} from "./auth";

describe("SESSION_TOKEN_COOKIE", () => {
  it("is the string 'session_token'", () => {
    expect(SESSION_TOKEN_COOKIE).toBe("session_token");
  });
});

describe("SESSION_TTL_MS", () => {
  it("is 30 days in milliseconds", () => {
    expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe("MAGIC_LINK_TTL_MS", () => {
  it("is 15 minutes in milliseconds", () => {
    expect(MAGIC_LINK_TTL_MS).toBe(15 * 60 * 1000);
  });
});

describe("MAGIC_LINK_HOURLY_CAP", () => {
  it("is 5", () => {
    expect(MAGIC_LINK_HOURLY_CAP).toBe(5);
  });
});

describe("buildSessionCookie", () => {
  it("includes the token value", () => {
    const cookie = buildSessionCookie("my-token-abc");
    expect(cookie).toContain("session_token=my-token-abc");
  });

  it("sets HttpOnly flag", () => {
    const cookie = buildSessionCookie("tok");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("sets SameSite=None for cross-origin support", () => {
    const cookie = buildSessionCookie("tok");
    expect(cookie.toLowerCase()).toContain("samesite=none");
  });

  it("sets Path=/", () => {
    const cookie = buildSessionCookie("tok");
    expect(cookie).toContain("Path=/");
  });

  it("sets Max-Age to 30 days in seconds", () => {
    const cookie = buildSessionCookie("tok");
    const expectedMaxAge = Math.floor(SESSION_TTL_MS / 1000);
    expect(cookie).toContain(`Max-Age=${expectedMaxAge}`);
  });

  it("does NOT include Secure by default", () => {
    const cookie = buildSessionCookie("tok");
    expect(cookie.toLowerCase()).not.toContain("secure");
  });

  it("includes Secure when secure=true", () => {
    const cookie = buildSessionCookie("tok", { secure: true });
    expect(cookie.toLowerCase()).toContain("secure");
  });

  it("includes Domain when domain is provided", () => {
    const cookie = buildSessionCookie("tok", { domain: ".example.com" });
    expect(cookie).toContain("Domain=.example.com");
  });

  it("does NOT include Domain when domain is omitted", () => {
    const cookie = buildSessionCookie("tok");
    expect(cookie.toLowerCase()).not.toContain("domain");
  });
});

describe("buildClearSessionCookie", () => {
  it("sets Max-Age=0 to expire the cookie immediately", () => {
    const cookie = buildClearSessionCookie();
    expect(cookie).toContain("Max-Age=0");
  });

  it("sets HttpOnly flag", () => {
    const cookie = buildClearSessionCookie();
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("sets Path=/", () => {
    const cookie = buildClearSessionCookie();
    expect(cookie).toContain("Path=/");
  });

  it("sets SameSite=None", () => {
    const cookie = buildClearSessionCookie();
    expect(cookie.toLowerCase()).toContain("samesite=none");
  });

  it("includes Secure when secure=true", () => {
    const cookie = buildClearSessionCookie({ secure: true });
    expect(cookie.toLowerCase()).toContain("secure");
  });

  it("includes Domain when domain is provided", () => {
    const cookie = buildClearSessionCookie({ domain: ".example.com" });
    expect(cookie).toContain("Domain=.example.com");
  });
});
