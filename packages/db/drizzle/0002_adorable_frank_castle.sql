PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_order_items` (
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
	CONSTRAINT "order_items_status_chk" CHECK("__new_order_items"."status" IN ('ordered', 'served', 'cancelled')),
	CONSTRAINT "order_items_quantity_positive_chk" CHECK("__new_order_items"."quantity" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_order_items`("id", "store_id", "order_id", "menu_item_id", "name_snapshot", "unit_price_snapshot", "quantity", "status", "created_at") SELECT "id", "store_id", "order_id", "menu_item_id", "name_snapshot", "unit_price_snapshot", "quantity", "status", "created_at" FROM `order_items`;--> statement-breakpoint
DROP TABLE `order_items`;--> statement-breakpoint
ALTER TABLE `__new_order_items` RENAME TO `order_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_order_items_order` ON `order_items` (`order_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_order_items_store` ON `order_items` (`store_id`);--> statement-breakpoint
CREATE TABLE `__new_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`seat_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`closed_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_status_chk" CHECK("__new_orders"."status" IN ('open', 'payment_requested', 'paid', 'cancelled')),
	CONSTRAINT "orders_closed_status_has_closed_at_chk" CHECK("__new_orders"."status" NOT IN ('paid', 'cancelled') OR "__new_orders"."closed_at" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_orders`("id", "store_id", "seat_id", "status", "created_at", "closed_at") SELECT "id", "store_id", "seat_id", "status", "created_at", "closed_at" FROM `orders`;--> statement-breakpoint
DROP TABLE `orders`;--> statement-breakpoint
ALTER TABLE `__new_orders` RENAME TO `orders`;--> statement-breakpoint
CREATE INDEX `idx_orders_seat` ON `orders` (`seat_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_orders_store` ON `orders` (`store_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_one_active_order_per_seat` ON `orders` (`seat_id`) WHERE "orders"."status" IN ('open', 'payment_requested');