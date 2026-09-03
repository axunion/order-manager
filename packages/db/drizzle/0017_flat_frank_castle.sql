CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`product` text NOT NULL,
	`plan` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "subscriptions_product_chk" CHECK("subscriptions"."product" IN ('order', 'shift')),
	CONSTRAINT "subscriptions_status_chk" CHECK("subscriptions"."status" IN ('active', 'suspended'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subscriptions_store_product` ON `subscriptions` (`store_id`,`product`);--> statement-breakpoint
-- Grandfather every existing store into the order product. Hand-written:
-- drizzle generates schema DDL only, and the entitlement gate must not turn
-- stores that predate this table into non-subscribers.
-- created_at comes from SQL here (second precision) because a backfill has no
-- Worker request context; everywhere else it is Date.now() in the Worker.
INSERT INTO `subscriptions` (`id`, `store_id`, `product`, `status`, `created_at`)
SELECT
	lower(substr(h, 1, 8) || '-' || substr(h, 9, 4) || '-4' || substr(h, 14, 3)
		|| '-a' || substr(h, 18, 3) || '-' || substr(h, 21, 12)),
	store_id,
	'order',
	'active',
	CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM (
	SELECT `id` AS store_id, hex(randomblob(16)) AS h
	FROM `stores`
	WHERE NOT EXISTS (
		SELECT 1 FROM `subscriptions` s
		WHERE s.`store_id` = `stores`.`id` AND s.`product` = 'order'
	)
);
