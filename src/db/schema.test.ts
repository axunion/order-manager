import { getTableConfig, type SQLiteTable } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import {
  magicLinkTokens,
  menuCategories,
  menuItems,
  orderItems,
  orders,
  payments,
  seats,
  sessions,
  stores,
} from "./schema";

function colNames(table: SQLiteTable): Set<string> {
  return new Set(getTableConfig(table).columns.map((c) => c.name));
}

function findCol(table: SQLiteTable, name: string) {
  return getTableConfig(table).columns.find((c) => c.name === name);
}

describe("stores", () => {
  it("table name", () => expect(getTableConfig(stores).name).toBe("stores"));
  it("columns", () =>
    expect(colNames(stores)).toEqual(
      new Set([
        "id",
        "name",
        "slug",
        "email",
        "status",
        "activated_at",
        "created_at",
      ]),
    ));
  it("status default is 'pending'", () => {
    const col = findCol(stores, "status");
    expect(col?.default).toBe("pending");
  });
  it("activated_at is nullable", () => {
    const col = findCol(stores, "activated_at");
    expect(col?.notNull).toBe(false);
  });
});

describe("sessions", () => {
  it("table name", () =>
    expect(getTableConfig(sessions).name).toBe("sessions"));
  it("columns", () =>
    expect(colNames(sessions)).toEqual(
      new Set([
        "id",
        "store_id",
        "session_token",
        "expires_at",
        "last_used_at",
        "created_at",
      ]),
    ));
  it("last_used_at is nullable", () => {
    const col = findCol(sessions, "last_used_at");
    expect(col?.notNull).toBe(false);
  });
});

describe("magic_link_tokens", () => {
  it("table name", () =>
    expect(getTableConfig(magicLinkTokens).name).toBe("magic_link_tokens"));
  it("columns", () =>
    expect(colNames(magicLinkTokens)).toEqual(
      new Set([
        "id",
        "store_id",
        "token",
        "purpose",
        "expires_at",
        "used_at",
        "created_at",
      ]),
    ));
  it("purpose enum values", () => {
    const col = findCol(magicLinkTokens, "purpose");
    expect(col?.enumValues).toEqual(["signup", "login"]);
  });
  it("used_at is nullable", () => {
    const col = findCol(magicLinkTokens, "used_at");
    expect(col?.notNull).toBe(false);
  });
});

describe("menu_categories", () => {
  it("table name", () =>
    expect(getTableConfig(menuCategories).name).toBe("menu_categories"));
  it("columns", () =>
    expect(colNames(menuCategories)).toEqual(
      new Set(["id", "store_id", "name", "sort_order"]),
    ));
  it("has store_id for tenant isolation", () =>
    expect(colNames(menuCategories).has("store_id")).toBe(true));
});

describe("menu_items", () => {
  it("table name", () =>
    expect(getTableConfig(menuItems).name).toBe("menu_items"));
  it("columns", () =>
    expect(colNames(menuItems)).toEqual(
      new Set([
        "id",
        "store_id",
        "category_id",
        "name",
        "price",
        "is_available",
        "sort_order",
      ]),
    ));
  it("has store_id for tenant isolation", () =>
    expect(colNames(menuItems).has("store_id")).toBe(true));
  it("category_id is nullable", () => {
    const col = findCol(menuItems, "category_id");
    expect(col?.notNull).toBe(false);
  });
});

describe("seats", () => {
  it("table name", () => expect(getTableConfig(seats).name).toBe("seats"));
  it("columns", () =>
    expect(colNames(seats)).toEqual(
      new Set(["id", "store_id", "name", "qr_token", "created_at"]),
    ));
  it("has store_id for tenant isolation", () =>
    expect(colNames(seats).has("store_id")).toBe(true));
});

describe("orders", () => {
  it("table name", () => expect(getTableConfig(orders).name).toBe("orders"));
  it("columns", () =>
    expect(colNames(orders)).toEqual(
      new Set([
        "id",
        "store_id",
        "seat_id",
        "status",
        "created_at",
        "closed_at",
      ]),
    ));
  it("has store_id for tenant isolation", () =>
    expect(colNames(orders).has("store_id")).toBe(true));
  it("status enum values", () => {
    const col = findCol(orders, "status");
    expect(col?.enumValues).toEqual(["open", "payment_requested", "paid"]);
  });
  it("closed_at is nullable", () => {
    const col = findCol(orders, "closed_at");
    expect(col?.notNull).toBe(false);
  });
});

describe("order_items", () => {
  it("table name", () =>
    expect(getTableConfig(orderItems).name).toBe("order_items"));
  it("columns", () =>
    expect(colNames(orderItems)).toEqual(
      new Set([
        "id",
        "store_id",
        "order_id",
        "menu_item_id",
        "name_snapshot",
        "unit_price_snapshot",
        "quantity",
        "status",
        "created_at",
      ]),
    ));
  it("has store_id for tenant isolation", () =>
    expect(colNames(orderItems).has("store_id")).toBe(true));
  it("status enum values", () => {
    const col = findCol(orderItems, "status");
    expect(col?.enumValues).toEqual(["ordered", "served"]);
  });
});

describe("payments", () => {
  it("table name", () =>
    expect(getTableConfig(payments).name).toBe("payments"));
  it("columns", () =>
    expect(colNames(payments)).toEqual(
      new Set([
        "id",
        "store_id",
        "order_id",
        "total_amount",
        "method",
        "paid_at",
      ]),
    ));
  it("has store_id for tenant isolation", () =>
    expect(colNames(payments).has("store_id")).toBe(true));
  it("method enum values", () => {
    const col = findCol(payments, "method");
    expect(col?.enumValues).toEqual(["cash"]);
  });
});
