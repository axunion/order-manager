import { describe, expect, it } from "vitest";
import { errorResponse, jsonResponse } from "./http";

describe("jsonResponse", () => {
  it("returns 200 by default", async () => {
    const res = jsonResponse({ id: "1", name: "test" });
    expect(res.status).toBe(200);
  });

  it("wraps data in { data } envelope", async () => {
    const res = jsonResponse({ id: "1" });
    const body = await res.json();
    expect(body).toEqual({ data: { id: "1" } });
  });

  it("accepts a custom status code", async () => {
    const res = jsonResponse({ id: "2" }, 201);
    expect(res.status).toBe(201);
  });

  it("sets Content-Type to application/json", () => {
    const res = jsonResponse({});
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});

describe("errorResponse", () => {
  it("returns the given status code", async () => {
    const res = errorResponse("NOT_FOUND", "not found", 404);
    expect(res.status).toBe(404);
  });

  it("wraps error in { error: { code, message } } envelope", async () => {
    const res = errorResponse("VALIDATION_ERROR", "name is required", 400);
    const body = await res.json();
    expect(body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "name is required" },
    });
  });

  it("sets Content-Type to application/json", () => {
    const res = errorResponse("SERVER_ERROR", "oops", 500);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
