DROP INDEX `payments_order_id_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_one_settled_payment_per_order` ON `payments` (`order_id`) WHERE "payments"."voided_at" IS NULL;