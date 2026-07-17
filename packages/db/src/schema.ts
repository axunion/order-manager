import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// stores — one record per tenant
// ---------------------------------------------------------------------------
export const stores = sqliteTable(
  "stores",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    /** URL-friendly identifier */
    slug: text("slug").notNull().unique(),
    /** Owner email; used as the Magic Link delivery address */
    email: text("email").notNull().unique(),
    /**
     * Lifecycle state:
     *   pending    — registered, email not yet verified
     *   active     — email verified; admin access granted
     *   suspended  — future: account disabled
     */
    status: text("status", {
      enum: ["pending", "active", "suspended"],
    })
      .notNull()
      .default("pending"),
    /** Set when status transitions to 'active' (Unix ms) */
    activated_at: integer("activated_at"), // nullable
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()), // Unix ms
  },
  (table) => [
    check(
      "stores_status_chk",
      sql`${table.status} IN ('pending', 'active', 'suspended')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// menu_categories
// ---------------------------------------------------------------------------
export const menuCategories = sqliteTable("menu_categories", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
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
      .$defaultFn(() => crypto.randomUUID()),
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
    /** ≤ 500 chars, enforced by Zod (CreateItemInput/UpdateItemInput) */
    description: text("description"), // nullable
    /**
     * R2 object key (not a URL), e.g. menu/{store_id}/{item_id}/{random}.{ext}.
     * Nullable — items may have no photo. Served via GET /api/menu/images/:key.
     */
    image_key: text("image_key"), // nullable
  },
  (table) => [
    index("idx_menu_items_store").on(table.store_id),
    check("menu_items_price_positive_chk", sql`${table.price} > 0`),
  ],
);

// ---------------------------------------------------------------------------
// sessions — admin login sessions (one store can have many active sessions)
// ---------------------------------------------------------------------------
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    /** UUID v4 stored in HttpOnly session_token cookie */
    session_token: text("session_token").notNull().unique(),
    /** Unix ms; session is invalid after this timestamp */
    expires_at: integer("expires_at").notNull(),
    /** Reserved for future sliding-window expiry (nullable) */
    last_used_at: integer("last_used_at"),
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()), // Unix ms
  },
  (table) => [index("idx_sessions_store").on(table.store_id)],
);

// ---------------------------------------------------------------------------
// magic_link_tokens — short-lived one-time-use tokens for Magic Link auth
// ---------------------------------------------------------------------------
export const magicLinkTokens = sqliteTable(
  "magic_link_tokens",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    /** UUID v4 embedded in the Magic Link URL */
    token: text("token").notNull().unique(),
    /**
     * 'signup' for first-time onboarding; 'login' for returning owners;
     * 'email_change' for re-verifying a new owner email (see new_email).
     */
    purpose: text("purpose", {
      enum: ["signup", "login", "email_change"],
    }).notNull(),
    /** Target address for 'email_change' tokens only; null otherwise */
    new_email: text("new_email"), // nullable
    /** Unix ms; token is invalid after this timestamp */
    expires_at: integer("expires_at").notNull(),
    /** Set when the token is consumed; kept for audit trail (not deleted) */
    used_at: integer("used_at"), // nullable
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()), // Unix ms
  },
  (table) => [
    index("idx_magic_link_tokens_store").on(table.store_id),
    check(
      "magic_link_tokens_purpose_chk",
      sql`${table.purpose} IN ('signup', 'login', 'email_change')`,
    ),
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
      .$defaultFn(() => crypto.randomUUID()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    /** UUID v4 embedded in QR code URL: /order/:qr_token */
    qr_token: text("qr_token").notNull().unique(),
    /**
     * Soft-delete flag. Retired seats (false) keep their row — and name —
     * forever so historical orders/sales stay intact; requireSeat rejects
     * their qr_token like an unknown one.
     */
    is_active: integer("is_active", { mode: "boolean" })
      .notNull()
      .default(true),
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()), // Unix ms
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
      .$defaultFn(() => crypto.randomUUID()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    seat_id: text("seat_id")
      .notNull()
      .references(() => seats.id),
    /**
     * State machine:
     *   open → payment_requested → paid
     *   open | payment_requested → cancelled (terminal; walkouts, mistaken table)
     */
    status: text("status", {
      enum: ["open", "payment_requested", "paid", "cancelled"],
    }).notNull(),
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()), // Unix ms
    /** set when status transitions to 'paid' or 'cancelled' */
    closed_at: integer("closed_at"), // Unix ms, nullable
  },
  (table) => [
    index("idx_orders_seat").on(table.seat_id, table.status),
    index("idx_orders_store").on(table.store_id, table.status),
    // Enforce the one-active-order-per-seat invariant at the DB level.
    // Covers only 'open' and 'payment_requested' rows so historical paid
    // (and cancelled) orders for the same seat are unrestricted.
    uniqueIndex("idx_one_active_order_per_seat")
      .on(table.seat_id)
      .where(sql`${table.status} IN ('open', 'payment_requested')`),
    check(
      "orders_status_chk",
      sql`${table.status} IN ('open', 'payment_requested', 'paid', 'cancelled')`,
    ),
    // Enforce that closed_at is always set once an order reaches a terminal status.
    check(
      "orders_closed_status_has_closed_at_chk",
      sql`${table.status} NOT IN ('paid', 'cancelled') OR ${table.closed_at} IS NOT NULL`,
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
      .$defaultFn(() => crypto.randomUUID()),
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
     *   ordered | served → cancelled (terminal; wrong dish can be voided after delivery)
     */
    status: text("status", {
      enum: ["ordered", "served", "cancelled"],
    }).notNull(),
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()), // Unix ms
  },
  (table) => [
    index("idx_order_items_order").on(table.order_id, table.status),
    index("idx_order_items_store").on(table.store_id),
    check(
      "order_items_status_chk",
      sql`${table.status} IN ('ordered', 'served', 'cancelled')`,
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
      .$defaultFn(() => crypto.randomUUID()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    order_id: text("order_id")
      .notNull()
      .unique()
      .references(() => orders.id),
    /** sum of unit_price_snapshot x quantity for all order_items at checkout */
    total_amount: integer("total_amount").notNull(),
    /** Phase 1: 'cash'. Phase 4 will extend to 'card' | 'qr'. */
    method: text("method", { enum: ["cash"] }).notNull(),
    paid_at: integer("paid_at").notNull(), // Unix ms
  },
  (table) => [
    check("payments_total_amount_nonneg_chk", sql`${table.total_amount} >= 0`),
    check("payments_method_chk", sql`${table.method} IN ('cash')`),
  ],
);
