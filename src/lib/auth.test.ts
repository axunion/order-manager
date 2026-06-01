import { describe, expect, it } from "vitest";
import { ACCESS_TOKEN_COOKIE, buildAuthCookie } from "./auth";

describe("ACCESS_TOKEN_COOKIE", () => {
  it("is the string 'access_token'", () => {
    expect(ACCESS_TOKEN_COOKIE).toBe("access_token");
  });
});

describe("buildAuthCookie", () => {
  it("includes the token value", () => {
    const cookie = buildAuthCookie("my-token-abc");
    expect(cookie).toContain("access_token=my-token-abc");
  });

  it("sets HttpOnly flag", () => {
    const cookie = buildAuthCookie("tok");
    expect(cookie.toLowerCase()).toContain("httponly");
  });

  it("sets SameSite=Lax", () => {
    const cookie = buildAuthCookie("tok");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("sets Path=/", () => {
    const cookie = buildAuthCookie("tok");
    expect(cookie).toContain("Path=/");
  });

  it("does NOT include Secure by default", () => {
    const cookie = buildAuthCookie("tok");
    expect(cookie.toLowerCase()).not.toContain("secure");
  });

  it("includes Secure when secure=true", () => {
    const cookie = buildAuthCookie("tok", true);
    expect(cookie.toLowerCase()).toContain("secure");
  });
});
