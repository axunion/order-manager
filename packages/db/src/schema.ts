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
    /**
     * Consumption tax rate, as a whole percent (8 or 10). Not exposed in the
     * admin UI in v1 — every item is dine-in standard-rate (10) — it exists
     * so receipts stay correct if takeout or rate changes ever arrive.
     */
    tax_rate: integer("tax_rate").notNull().default(10),
  },
  (table) => [
    index("idx_menu_items_store").on(table.store_id),
    check("menu_items_price_positive_chk", sql`${table.price} > 0`),
    check("menu_items_tax_rate_chk", sql`${table.tax_rate} IN (8, 10)`),
  ],
);

// ---------------------------------------------------------------------------
// option_groups — store-level, reusable across items (e.g. "Size").
// Per-item groups would force duplication across every item that shares
// the same choices (e.g. every drink needs a "Size" group).
// ---------------------------------------------------------------------------
export const optionGroups = sqliteTable(
  "option_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    name: text("name").notNull(),
    /** Minimum selections required from this group at order time. */
    min_select: integer("min_select").notNull().default(0),
    /** Maximum selections allowed from this group at order time. */
    max_select: integer("max_select").notNull().default(1),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_option_groups_store").on(table.store_id),
    check("option_groups_min_select_nonneg_chk", sql`${table.min_select} >= 0`),
    check(
      "option_groups_max_select_positive_chk",
      sql`${table.max_select} > 0`,
    ),
    check(
      "option_groups_min_le_max_chk",
      sql`${table.min_select} <= ${table.max_select}`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// options — individual choices within a group (e.g. "Large", +100 JPY).
// price_delta may be negative; the invariant "unit price + selected deltas
// stays positive" spans multiple rows, so it's enforced in the order
// submission API, not a DB CHECK constraint.
// ---------------------------------------------------------------------------
export const options = sqliteTable(
  "options",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    group_id: text("group_id")
      .notNull()
      .references(() => optionGroups.id),
    name: text("name").notNull(),
    /** JPY delta applied to unit price when selected; may be negative. */
    price_delta: integer("price_delta").notNull().default(0),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_options_group").on(table.group_id),
    index("idx_options_store").on(table.store_id),
  ],
);

// ---------------------------------------------------------------------------
// menu_item_option_groups — join: which groups are attached to which items.
// No store_id: every access path starts from an already tenant-validated
// item or group, unlike order_items/order_item_options below which are
// queried in bulk across a store's history and need direct filtering.
// ---------------------------------------------------------------------------
export const menuItemOptionGroups = sqliteTable(
  "menu_item_option_groups",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    menu_item_id: text("menu_item_id")
      .notNull()
      .references(() => menuItems.id),
    group_id: text("group_id")
      .notNull()
      .references(() => optionGroups.id),
    sort_order: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_menu_item_option_groups_item").on(table.menu_item_id),
    uniqueIndex("idx_menu_item_option_groups_unique").on(
      table.menu_item_id,
      table.group_id,
    ),
  ],
);

// ---------------------------------------------------------------------------
// members — login identity for a store; one row per person who can log in.
// Replaces stores.email as the login identity (stores.email stays fixed,
// display-only, post-signup — see domain-model.md).
// ---------------------------------------------------------------------------
export const members = sqliteTable(
  "members",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    /** Login identity; UNIQUE globally (one email = one member, like stores.email). */
    email: text("email").notNull().unique(),
    role: text("role", { enum: ["owner", "staff"] })
      .notNull()
      .default("staff"),
    /**
     * pending — invited/signed up, email not yet verified
     * active   — email verified; can log in
     */
    status: text("status", { enum: ["pending", "active"] })
      .notNull()
      .default("pending"),
    /** Set when status transitions to 'active' (Unix ms) */
    activated_at: integer("activated_at"), // nullable
    /**
     * Rate limiting for POST /me/email-change: counts attempts (conflict or
     * not) within the current hourly window, reset when the window expires.
     * Separate from magic_link_tokens' own MAGIC_LINK_HOURLY_CAP, which only
     * counts tokens actually issued — a request rejected for a conflicting
     * new_email never reaches issuance, so it would otherwise go uncounted.
     */
    email_change_attempt_count: integer("email_change_attempt_count")
      .notNull()
      .default(0),
    /** Unix ms; null until the first attempt in a window */
    email_change_window_started_at: integer("email_change_window_started_at"), // nullable
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()), // Unix ms
  },
  (table) => [
    index("idx_members_store").on(table.store_id),
    check("members_role_chk", sql`${table.role} IN ('owner', 'staff')`),
    check("members_status_chk", sql`${table.status} IN ('pending', 'active')`),
  ],
);

// ---------------------------------------------------------------------------
// sessions — admin login sessions (one member can have many active sessions)
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
    /** Denormalized from members.store_id — avoids a join on every request. */
    member_id: text("member_id")
      .notNull()
      .references(() => members.id),
    /** UUID v4 stored in HttpOnly session_token cookie */
    session_token: text("session_token").notNull().unique(),
    /** Unix ms; session is invalid after this timestamp */
    expires_at: integer("expires_at").notNull(),
    /** Sliding expiry watermark; refreshed at most once/hour by requireStore */
    last_used_at: integer("last_used_at"),
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()), // Unix ms
  },
  (table) => [
    index("idx_sessions_store").on(table.store_id),
    index("idx_sessions_member").on(table.member_id),
  ],
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
    /** Denormalized from members.store_id — avoids a join on every request. */
    member_id: text("member_id")
      .notNull()
      .references(() => members.id),
    /** UUID v4 embedded in the Magic Link URL */
    token: text("token").notNull().unique(),
    /**
     * 'signup' for first-time onboarding; 'login' for returning members;
     * 'email_change' for re-verifying a new member email (see new_email);
     * 'invite' for a staff invite (owner-issued, targets a new member);
     * 'reactivate' for an owner reactivating their own suspended store.
     */
    purpose: text("purpose", {
      enum: ["signup", "login", "email_change", "invite", "reactivate"],
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
    index("idx_magic_link_tokens_member").on(table.member_id),
    check(
      "magic_link_tokens_purpose_chk",
      sql`${table.purpose} IN ('signup', 'login', 'email_change', 'invite', 'reactivate')`,
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
// staff_calls — customer "call staff" requests, one open call per seat.
// A partial unique index enforces "at most one open call per seat" at the
// DB level (same pattern as idx_one_active_order_per_seat below), so
// concurrent taps of the call button race safely: the loser's INSERT
// fails the constraint and the API re-reads the winner's row instead.
// ---------------------------------------------------------------------------
export const staffCalls = sqliteTable(
  "staff_calls",
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
     *   open → resolved (terminal; staff acknowledges the call)
     */
    status: text("status", {
      enum: ["open", "resolved"],
    })
      .notNull()
      .default("open"),
    created_at: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()), // Unix ms
    /** set when status transitions to 'resolved' */
    resolved_at: integer("resolved_at"), // Unix ms, nullable
  },
  (table) => [
    index("idx_staff_calls_store_status").on(table.store_id, table.status),
    // Enforce the one-open-call-per-seat invariant at the DB level.
    uniqueIndex("idx_one_open_call_per_seat")
      .on(table.seat_id)
      .where(sql`${table.status} = 'open'`),
    check(
      "staff_calls_status_chk",
      sql`${table.status} IN ('open', 'resolved')`,
    ),
    check(
      "staff_calls_resolved_has_resolved_at_chk",
      sql`${table.status} != 'resolved' OR ${table.resolved_at} IS NOT NULL`,
    ),
  ],
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
    /** snapshot of menu_items.tax_rate at order time; feeds receipt breakdown */
    tax_rate_snapshot: integer("tax_rate_snapshot").notNull().default(10),
    quantity: integer("quantity").notNull(),
    /**
     * State machine:
     *   ordered → served
     *   ordered | served → cancelled (terminal; wrong dish can be voided after delivery)
     */
    status: text("status", {
      enum: ["ordered", "served", "cancelled"],
    }).notNull(),
    /** Customer free-text note, e.g. "no onions". ≤ 200 chars, enforced by Zod. */
    note: text("note"), // nullable
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
    check(
      "order_items_tax_rate_snapshot_chk",
      sql`${table.tax_rate_snapshot} IN (8, 10)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// order_item_options — snapshot of each selected option at order time.
// Snapshot semantics extend to options: the bill never changes when the
// owner edits option definitions after an order is placed.
// store_id is denormalized for the same reason as order_items.
// ---------------------------------------------------------------------------
export const orderItemOptions = sqliteTable(
  "order_item_options",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    store_id: text("store_id")
      .notNull()
      .references(() => stores.id),
    order_item_id: text("order_item_id")
      .notNull()
      .references(() => orderItems.id),
    /** snapshot of options.name at order time */
    name_snapshot: text("name_snapshot").notNull(),
    /** snapshot of option_groups.name at order time, e.g. "Size" */
    group_name_snapshot: text("group_name_snapshot").notNull(),
    /** snapshot of options.price_delta at order time */
    price_delta_snapshot: integer("price_delta_snapshot").notNull(),
  },
  (table) => [
    index("idx_order_item_options_order_item").on(table.order_item_id),
    index("idx_order_item_options_store").on(table.store_id),
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
    /**
     * Not globally unique — a voided payment's row stays for audit history,
     * so re-settling the same order after a void must be able to insert a
     * second row for it. Uniqueness only applies among non-voided rows;
     * see idx_one_settled_payment_per_order below.
     */
    order_id: text("order_id")
      .notNull()
      .references(() => orders.id),
    /**
     * Charged amount: (sum of unit_price_snapshot x quantity for all
     * order_items at checkout) − discount_amount.
     */
    total_amount: integer("total_amount").notNull(),
    /** Recorded at a staff-operated terminal; no processor integration. */
    method: text("method", { enum: ["cash", "card", "qr"] }).notNull(),
    /** Whole-check discount, bounded server-side to [0, items total]. */
    discount_amount: integer("discount_amount").notNull().default(0),
    /** Required when discount_amount > 0; null otherwise. */
    discount_reason: text("discount_reason"), // nullable
    paid_at: integer("paid_at").notNull(), // Unix ms
    /** Set when the payment is voided; all-or-nothing, no partial refunds. */
    voided_at: integer("voided_at"), // Unix ms, nullable
    /** Required when voided_at is set; null otherwise. */
    void_reason: text("void_reason"), // nullable
  },
  (table) => [
    check("payments_total_amount_nonneg_chk", sql`${table.total_amount} >= 0`),
    check(
      "payments_method_chk",
      sql`${table.method} IN ('cash', 'card', 'qr')`,
    ),
    check(
      "payments_discount_amount_nonneg_chk",
      sql`${table.discount_amount} >= 0`,
    ),
    check(
      "payments_discount_has_reason_chk",
      sql`${table.discount_amount} = 0 OR ${table.discount_reason} IS NOT NULL`,
    ),
    check(
      "payments_void_has_reason_chk",
      sql`${table.voided_at} IS NULL OR ${table.void_reason} IS NOT NULL`,
    ),
    // Enforces "at most one settled (non-voided) payment per order" —
    // mirrors idx_one_active_order_per_seat's partial-unique pattern, so a
    // concurrent double-checkout still races safely at the DB level.
    uniqueIndex("idx_one_settled_payment_per_order")
      .on(table.order_id)
      .where(sql`${table.voided_at} IS NULL`),
  ],
);
