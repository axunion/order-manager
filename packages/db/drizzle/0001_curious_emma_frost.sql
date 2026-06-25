PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`order_id` text NOT NULL,
	`total_amount` integer NOT NULL,
	`method` text NOT NULL,
	`paid_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "payments_total_amount_nonneg_chk" CHECK("__new_payments"."total_amount" >= 0),
	CONSTRAINT "payments_method_chk" CHECK("__new_payments"."method" IN ('cash'))
);
--> statement-breakpoint
INSERT INTO `__new_payments`("id", "store_id", "order_id", "total_amount", "method", "paid_at") SELECT "id", "store_id", "order_id", "total_amount", "method", "paid_at" FROM `payments`;--> statement-breakpoint
DROP TABLE `payments`;--> statement-breakpoint
ALTER TABLE `__new_payments` RENAME TO `payments`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `payments_order_id_unique` ON `payments` (`order_id`);