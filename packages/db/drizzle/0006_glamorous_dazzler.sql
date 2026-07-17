CREATE TABLE `menu_item_option_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`menu_item_id` text NOT NULL,
	`group_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`menu_item_id`) REFERENCES `menu_items`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `option_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_menu_item_option_groups_item` ON `menu_item_option_groups` (`menu_item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_menu_item_option_groups_unique` ON `menu_item_option_groups` (`menu_item_id`,`group_id`);--> statement-breakpoint
CREATE TABLE `option_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`min_select` integer DEFAULT 0 NOT NULL,
	`max_select` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "option_groups_min_select_nonneg_chk" CHECK("option_groups"."min_select" >= 0),
	CONSTRAINT "option_groups_max_select_positive_chk" CHECK("option_groups"."max_select" > 0),
	CONSTRAINT "option_groups_min_le_max_chk" CHECK("option_groups"."min_select" <= "option_groups"."max_select")
);
--> statement-breakpoint
CREATE INDEX `idx_option_groups_store` ON `option_groups` (`store_id`);--> statement-breakpoint
CREATE TABLE `options` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`price_delta` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`group_id`) REFERENCES `option_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_options_group` ON `options` (`group_id`);--> statement-breakpoint
CREATE INDEX `idx_options_store` ON `options` (`store_id`);--> statement-breakpoint
CREATE TABLE `order_item_options` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_item_id` text NOT NULL,
	`name_snapshot` text NOT NULL,
	`group_name_snapshot` text NOT NULL,
	`price_delta_snapshot` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_order_item_options_order_item` ON `order_item_options` (`order_item_id`);--> statement-breakpoint
CREATE INDEX `idx_order_item_options_store` ON `order_item_options` (`store_id`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `note` text;