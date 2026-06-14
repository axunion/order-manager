CREATE TABLE `magic_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`token` text NOT NULL,
	`purpose` text NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "magic_link_tokens_purpose_chk" CHECK("magic_link_tokens"."purpose" IN ('signup', 'login'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `magic_link_tokens_token_unique` ON `magic_link_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_magic_link_tokens_store` ON `magic_link_tokens` (`store_id`);--> statement-breakpoint
CREATE TABLE `menu_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`is_available` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `menu_categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "menu_items_price_positive_chk" CHECK("menu_items"."price" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_menu_items_store` ON `menu_items` (`store_id`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`name_snapshot` text NOT NULL,
	`unit_price_snapshot` integer NOT NULL,
	`quantity` integer NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_status_chk" CHECK("order_items"."status" IN ('ordered', 'served')),
	CONSTRAINT "order_items_quantity_positive_chk" CHECK("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `idx_order_items_order` ON `order_items` (`order_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_order_items_store` ON `order_items` (`store_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`seat_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_status_chk" CHECK("orders"."status" IN ('open', 'payment_requested', 'paid')),
	CONSTRAINT "orders_paid_has_closed_at_chk" CHECK("orders"."status" != 'paid' OR "orders"."closed_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `idx_orders_seat` ON `orders` (`seat_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_orders_store` ON `orders` (`store_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_one_active_order_per_seat` ON `orders` (`seat_id`) WHERE "orders"."status" IN ('open', 'payment_requested');--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`total_amount` integer NOT NULL,
	`method` text NOT NULL,
	`paid_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_total_amount_nonneg_chk" CHECK("payments"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_order_id_unique` ON `payments` (`order_id`);--> statement-breakpoint
CREATE TABLE `seats` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`qr_token` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seats_qr_token_unique` ON `seats` (`qr_token`);--> statement-breakpoint
CREATE INDEX `idx_seats_store` ON `seats` (`store_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`session_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_session_token_unique` ON `sessions` (`session_token`);--> statement-breakpoint
CREATE INDEX `idx_sessions_store` ON `sessions` (`store_id`);--> statement-breakpoint
CREATE TABLE `stores` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`email` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`activated_at` integer,
	`created_at` integer NOT NULL,
	CONSTRAINT "stores_status_chk" CHECK("stores"."status" IN ('pending', 'active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stores_slug_unique` ON `stores` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `stores_email_unique` ON `stores` (`email`);