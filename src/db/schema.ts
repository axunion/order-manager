import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import { newId } from "../lib/id";
import { now } from "../lib/time";

// ---------------------------------------------------------------------------
// stores — one record per tenant
// ---------------------------------------------------------------------------
export const stores = sqliteTable("stores", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId()),
  name: text("name").notNull(),
  /** URL-friendly identifier, reserved for future use */
  slug: text("slug").notNull().unique(),
  /** UUID v4 token stored in HttpOnly cookie for admin access */
  access_token: text("access_token").notNull().unique(),
  created_at: integer("created_at")
    .notNull()
    .$defaultFn(() => now()), // Unix ms
});

// ---------------------------------------------------------------------------
// menu_categories
// ---------------------------------------------------------------------------
export const menuCategories = sqliteTable("menu_categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => newId()),
  store_id: text("store_id")
    .notNull()
    .references(() => stores.id),
  name: text("name").notNull(),
  sort_order: integer("sort_order").notNull().default(0),
});

// ---------------------------------------------------------------------------
// menu_items
// ---------------------------------------------------------------------------
export const menuItems = sqliteTable(
  "menu_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    /** nullable — items can exist without a category */
    category_id: text("category_id").references(() => menuCategories.id),
    name: text("name").notNull(),
    /** price in JPY (tax-inclusive) */
    price: integer("price").notNull(),
    is_available: integer("is_available", { mode: "boolean" })
      .notNull()
      .default(true),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_menu_items_store").on(table.store_id),
    check("menu_items_price_positive_chk", sql`${table.price} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// seats
// ---------------------------------------------------------------------------
export const seats = sqliteTable(
  "seats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    /** UUID v4 embedded in QR code URL: /order/:qr_token */
    qr_token: text("qr_token").notNull().unique(),
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => now()), // Unix ms
  },
  (table) => [index("idx_seats_store").on(table.store_id)],
);

// ---------------------------------------------------------------------------
// orders — one "check" per table visit
// ---------------------------------------------------------------------------
export const orders = sqliteTable(
  "orders",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    seat_id: text("seat_id")
      .notNull()
      .references(() => seats.id),
    /**
     * State machine:
     *   open → payment_requested → paid
     */
    status: text("status", {
      enum: ["open", "payment_requested", "paid"],
    }).notNull(),
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => now()), // Unix ms
    /** set when status transitions to 'paid' */
    closed_at: integer("closed_at"), // Unix ms, nullable
  },
  (table) => [
    index("idx_orders_seat").on(table.seat_id, table.status),
    index("idx_orders_store").on(table.store_id, table.status),
    check(
      "orders_status_chk",
      sql`${table.status} IN ('open', 'payment_requested', 'paid')`,
    ),
    // Enforce that closed_at is always set when an order reaches 'paid' status.
    check(
      "orders_paid_has_closed_at_chk",
      sql`${table.status} != 'paid' OR ${table.closed_at} IS NOT NULL`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// order_items — line items within an order
// Tenant isolation: store_id is denormalized here so that every query can
// apply a store_id filter directly, satisfying the multi-tenant isolation rule
// without requiring a join through orders.
// ---------------------------------------------------------------------------
export const orderItems = sqliteTable(
  "order_items",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    order_id: text("order_id")
      .notNull()
      .references(() => orders.id),
    /** kept for reference; actual billing uses snapshots below */
    menu_item_id: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id),
    /** snapshot of menu_items.name at order time */
    name_snapshot: text("name_snapshot").notNull(),
    /** snapshot of menu_items.price at order time */
    unit_price_snapshot: integer("unit_price_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
    /**
     * State machine:
     *   ordered → served
     */
    status: text("status", {
      enum: ["ordered", "served"],
    }).notNull(),
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => now()), // Unix ms
  },
  (table) => [
    index("idx_order_items_order").on(table.order_id, table.status),
    index("idx_order_items_store").on(table.store_id),
    check(
      "order_items_status_chk",
      sql`${table.status} IN ('ordered', 'served')`,
    ),
    check("order_items_quantity_positive_chk", sql`${table.quantity} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// payments — one record per closed order
// store_id is denormalized here for the same reason as order_items.
// ---------------------------------------------------------------------------
export const payments = sqliteTable(
  "payments",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => newId()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    order_id: text("order_id")
      .notNull()
      .unique()
      .references(() => orders.id),
    /** sum of unit_price_snapshot × quantity for all order_items at checkout */
    total_amount: integer("total_amount").notNull(),
    /** Phase 1: 'cash'. Phase 4 will extend to 'card' | 'qr'. */
    method: text("method", { enum: ["cash"] }).notNull(),
    paid_at: integer("paid_at").notNull(), // Unix ms
  },
  (table) => [
    check("payments_total_amount_nonneg_chk", sql`${table.total_amount} >= 0`),
  ],
);
