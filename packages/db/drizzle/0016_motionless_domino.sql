CREATE INDEX `idx_menu_categories_store` ON `menu_categories` (`store_id`);--> statement-breakpoint
CREATE INDEX `idx_payments_store_paid_at` ON `payments` (`store_id`,`paid_at`);