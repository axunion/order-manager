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

export const CreateItemInput = z.object({
  name: displayName,
  /** Price in JPY (tax-inclusive). Must be > 0. */
  price: z.number().int().positive(),
  is_available: z.boolean().default(true),
  category_id: z.string().nullable().default(null),
  sort_order: z.number().int().min(0).default(0),
});
export type CreateItemInput = z.infer<typeof CreateItemInput>;

export const UpdateItemInput = z.object({
  name: displayName,
  price: z.number().int().positive(),
  is_available: z.boolean(),
  // optional: omitting preserves the current DB value; null clears it.
  category_id: z.string().nullable().optional(),
  sort_order: z.number().int().min(0).optional(),
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
}

// ---------------------------------------------------------------------------
// Seats
// ---------------------------------------------------------------------------

export const CreateSeatInput = z.object({
  name: displayName,
});
export type CreateSeatInput = z.infer<typeof CreateSeatInput>;

export interface SeatResponse {
  id: string;
  store_id: string;
  name: string;
  qr_token: string;
  created_at: number;
}

// ---------------------------------------------------------------------------
// Order (customer screen)
// ---------------------------------------------------------------------------

export const AddOrderItemsInput = z.object({
  items: z
    .array(
      z.object({
        menu_item_id: z
          .string()
          .transform((s) => s.trim())
          .pipe(z.string().min(1)),
        quantity: z.number().int().min(1).max(99),
      }),
    )
    .min(1),
});
export type AddOrderItemsInput = z.infer<typeof AddOrderItemsInput>;

export interface OrderItemResponse {
  id: string;
  name_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  status: "ordered" | "served";
  created_at: number;
}

export interface OrderResponse {
  id: string;
  status: "open" | "payment_requested" | "paid";
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
  status: "ordered" | "served";
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
