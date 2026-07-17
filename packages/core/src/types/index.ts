import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitive schemas
// ---------------------------------------------------------------------------

/** Trimmed, non-empty display name (1–100 chars). */
const displayName = z
  .string()
  .transform((s) => s.trim())
  .pipe(z.string().min(1).max(100));

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

export const CreateStoreInput = z.object({
  /** Store display name. Trimmed; must be 1–100 characters after trimming. */
  name: displayName,
  /** Owner email — Magic Link is sent here. */
  email: z.email(),
});
export type CreateStoreInput = z.infer<typeof CreateStoreInput>;

export interface StoreCreatedResponse {
  id: string;
  name: string;
  slug: string;
  /** Magic Link URL. Only present when ENVIRONMENT !== "production". */
  verify_url?: string;
}

export const UpdateStoreNameInput = z.object({
  name: displayName,
});
export type UpdateStoreNameInput = z.infer<typeof UpdateStoreNameInput>;

export interface StoreResponse {
  id: string;
  name: string;
  slug: string;
}

export const EmailChangeInput = z.object({
  new_email: z.email(),
});
export type EmailChangeInput = z.infer<typeof EmailChangeInput>;

export interface EmailChangeResponse {
  sent: true;
  /** Magic Link URL. Only present when ENVIRONMENT !== "production". */
  verify_url?: string;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const LoginInput = z.object({
  email: z.email(),
});
export type LoginInput = z.infer<typeof LoginInput>;

export interface LoginResponse {
  sent: true;
  /** Magic Link URL. Only present when ENVIRONMENT !== "production" and a token was issued. */
  verify_url?: string;
}

// ---------------------------------------------------------------------------
// Menu — categories
// ---------------------------------------------------------------------------

export const CreateCategoryInput = z.object({
  name: displayName,
  sort_order: z.number().int().min(0).default(0),
});
export type CreateCategoryInput = z.infer<typeof CreateCategoryInput>;

export const UpdateCategoryInput = z.object({
  name: displayName,
  sort_order: z.number().int().min(0).default(0),
});
export type UpdateCategoryInput = z.infer<typeof UpdateCategoryInput>;

export interface CategoryResponse {
  id: string;
  store_id: string;
  name: string;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Menu — items
// ---------------------------------------------------------------------------

/** Trimmed description, ≤ 500 chars; empty after trimming normalizes to null. */
const itemDescription = z
  .string()
  .max(500)
  .nullable()
  .transform((s) => {
    if (s === null) return null;
    const trimmed = s.trim();
    return trimmed.length === 0 ? null : trimmed;
  });

export const CreateItemInput = z.object({
  name: displayName,
  /** Price in JPY (tax-inclusive). Must be > 0. */
  price: z.number().int().positive(),
  is_available: z.boolean().default(true),
  category_id: z.string().nullable().default(null),
  sort_order: z.number().int().min(0).default(0),
  description: itemDescription.optional().default(null),
});
export type CreateItemInput = z.infer<typeof CreateItemInput>;

export const UpdateItemInput = z.object({
  name: displayName,
  price: z.number().int().positive(),
  is_available: z.boolean(),
  // optional: omitting preserves the current DB value; null clears it.
  category_id: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
  description: itemDescription.optional(),
  // optional: omitting preserves current attachments; [] detaches all groups.
  option_group_ids: z.array(z.string()).optional(),
});
export type UpdateItemInput = z.infer<typeof UpdateItemInput>;

export interface MenuItemResponse {
  id: string;
  store_id: string;
  category_id: string | null;
  name: string;
  price: number;
  is_available: boolean;
  sort_order: number;
  description: string | null;
  image_key: string | null;
  /** Option groups currently attached to this item, for pre-filling the edit form. */
  option_group_ids: string[];
}

// ---------------------------------------------------------------------------
// Menu — option groups & options
// ---------------------------------------------------------------------------

const optionGroupSelectFields = {
  /** Minimum selections required from this group at order time. */
  min_select: z.number().int().min(0).default(0),
  /** Maximum selections allowed from this group at order time. */
  max_select: z.number().int().positive().default(1),
};

const optionGroupSelectRefinement = {
  message: "min_select must be <= max_select",
  path: ["min_select"],
};

export const CreateOptionGroupInput = z
  .object({
    name: displayName,
    sort_order: z.number().int().min(0).default(0),
    ...optionGroupSelectFields,
  })
  .refine(
    (data) => data.min_select <= data.max_select,
    optionGroupSelectRefinement,
  );
export type CreateOptionGroupInput = z.infer<typeof CreateOptionGroupInput>;

// Full-replace, not partial: mirrors UpdateCategoryInput's convention where
// every field is required on PATCH, unlike UpdateItemInput's omit-preserves
// fields. min_select/max_select must always be resent together.
export const UpdateOptionGroupInput = z
  .object({
    name: displayName,
    sort_order: z.number().int().min(0).default(0),
    ...optionGroupSelectFields,
  })
  .refine(
    (data) => data.min_select <= data.max_select,
    optionGroupSelectRefinement,
  );
export type UpdateOptionGroupInput = z.infer<typeof UpdateOptionGroupInput>;

export interface OptionGroupResponse {
  id: string;
  store_id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
}

export const CreateOptionInput = z.object({
  name: displayName,
  /** JPY delta applied to the item's unit price when selected; may be negative. */
  price_delta: z.number().int(),
  sort_order: z.number().int().min(0).default(0),
});
export type CreateOptionInput = z.infer<typeof CreateOptionInput>;

export const UpdateOptionInput = z.object({
  name: displayName,
  price_delta: z.number().int(),
  sort_order: z.number().int().min(0).default(0),
});
export type UpdateOptionInput = z.infer<typeof UpdateOptionInput>;

export interface OptionResponse {
  id: string;
  store_id: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
}

/** An option group with its options, as embedded per-item in bootstrap. */
export interface MenuItemOptionGroup {
  id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  options: {
    id: string;
    name: string;
    price_delta: number;
    sort_order: number;
  }[];
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

export const CreateSeatInput = z.object({
  name: displayName,
});
export type CreateSeatInput = z.infer<typeof CreateSeatInput>;

export const UpdateSeatInput = z.object({
  name: displayName,
});
export type UpdateSeatInput = z.infer<typeof UpdateSeatInput>;

export interface SeatResponse {
  id: string;
  store_id: string;
  name: string;
  qr_token: string;
  is_active: boolean;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Order (customer screen)
// ---------------------------------------------------------------------------

/** Trimmed customer note, ≤ 200 chars; empty after trimming normalizes to null. */
const orderItemNote = z
  .string()
  .max(200)
  .nullable()
  .transform((s) => {
    if (s === null) return null;
    const trimmed = s.trim();
    return trimmed.length === 0 ? null : trimmed;
  });

export const AddOrderItemsInput = z.object({
  items: z
    .array(
      z.object({
        menu_item_id: z
          .string()
          .transform((s) => s.trim())
          .pipe(z.string().min(1)),
        quantity: z.number().int().min(1).max(99),
        option_ids: z.array(z.string()).default([]),
        note: orderItemNote.optional().default(null),
      }),
    )
    .min(1),
});
export type AddOrderItemsInput = z.infer<typeof AddOrderItemsInput>;

export interface OrderItemOptionResponse {
  id: string;
  name_snapshot: string;
  group_name_snapshot: string;
  price_delta_snapshot: number;
}

export interface OrderItemResponse {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: "ordered" | "served" | "cancelled";
  created_at: number;
  options: OrderItemOptionResponse[];
  note: string | null;
}

export interface OrderResponse {
  id: string;
  status: "open" | "payment_requested" | "paid" | "cancelled";
  items: OrderItemResponse[];
  total: number;
}

export interface BootstrapResponse {
  seat: { name: string };
  menu: {
    categories: { id: string; name: string; sort_order: number }[];
    items: {
      id: string;
      category_id: string | null;
      name: string;
      price: number;
      sort_order: number;
      description: string | null;
      image_key: string | null;
      option_groups: MenuItemOptionGroup[];
    }[];
  };
  order: OrderResponse | null;
}

// ---------------------------------------------------------------------------
// Admin orders
// ---------------------------------------------------------------------------

export interface AdminOrderItemResponse {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  options: OrderItemOptionResponse[];
  note: string | null;
  status: "ordered" | "served" | "cancelled";
  created_at: number;
}

export interface AdminOrderResponse {
  id: string;
  seat_name: string;
  status: "open" | "payment_requested";
  items: AdminOrderItemResponse[];
  total: number;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export const CreatePaymentInput = z.object({
  order_id: z
    .string()
    .transform((s) => s.trim())
    .pipe(z.string().min(1)),
});
export type CreatePaymentInput = z.infer<typeof CreatePaymentInput>;

export interface PaymentResponse {
  id: string;
  order_id: string;
  total_amount: number;
  method: "cash";
  paid_at: number;
}
