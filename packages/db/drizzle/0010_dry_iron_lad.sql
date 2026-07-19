PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_menu_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`category_id` text,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`is_available` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`description` text,
	`image_key` text,
	`tax_rate` integer DEFAULT 10 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `menu_categories`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "menu_items_price_positive_chk" CHECK("__new_menu_items"."price" > 0),
	CONSTRAINT "menu_items_tax_rate_chk" CHECK("__new_menu_items"."tax_rate" IN (8, 10))
);
--> statement-breakpoint
INSERT INTO `__new_menu_items`("id", "store_id", "category_id", "name", "price", "is_available", "sort_order", "description", "image_key", "tax_rate") SELECT "id", "store_id", "category_id", "name", "price", "is_available", "sort_order", "description", "image_key", "tax_rate" FROM `menu_items`;--> statement-breakpoint
DROP TABLE `menu_items`;--> statement-breakpoint
ALTER TABLE `__new_menu_items` RENAME TO `menu_items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_menu_items_store` ON `menu_items` (`store_id`);--> statement-breakpoint
CREATE TABLE `__new_order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`menu_item_id` text NOT NULL,
	`name_snapshot` text NOT NULL,
	`unit_price_snapshot` integer NOT NULL,
	`tax_rate_snapshot` integer DEFAULT 10 NOT NULL,
	`quantity` integer NOT NULL,
	`status` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_status_chk" CHECK("__new_order_items"."status" IN ('ordered', 'served', 'cancelled')),
	CONSTRAINT "order_items_quantity_positive_chk" CHECK("__new_order_items"."quantity" > 0),
	CONSTRAINT "order_items_tax_rate_snapshot_chk" CHECK("__new_order_items"."tax_rate_snapshot" IN (8, 10))
);
--> statement-breakpoint
INSERT INTO `__new_order_items`("id", "store_id", "order_id", "menu_item_id", "name_snapshot", "unit_price_snapshot", "tax_rate_snapshot", "quantity", "status", "note", "created_at") SELECT "id", "store_id", "order_id", "menu_item_id", "name_snapshot", "unit_price_snapshot", "tax_rate_snapshot", "quantity", "status", "note", "created_at" FROM `order_items`;--> statement-breakpoint
DROP TABLE `order_items`;--> statement-breakpoint
ALTER TABLE `__new_order_items` RENAME TO `order_items`;--> statement-breakpoint
CREATE INDEX `idx_order_items_order` ON `order_items` (`order_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_order_items_store` ON `order_items` (`store_id`);