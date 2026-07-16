PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_magic_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`token` text NOT NULL,
	`purpose` text NOT NULL,
	`new_email` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "magic_link_tokens_purpose_chk" CHECK("__new_magic_link_tokens"."purpose" IN ('signup', 'login', 'email_change'))
);
--> statement-breakpoint
INSERT INTO `__new_magic_link_tokens`("id", "store_id", "token", "purpose", "new_email", "expires_at", "used_at", "created_at") SELECT "id", "store_id", "token", "purpose", NULL, "expires_at", "used_at", "created_at" FROM `magic_link_tokens`;--> statement-breakpoint
DROP TABLE `magic_link_tokens`;--> statement-breakpoint
ALTER TABLE `__new_magic_link_tokens` RENAME TO `magic_link_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `magic_link_tokens_token_unique` ON `magic_link_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_magic_link_tokens_store` ON `magic_link_tokens` (`store_id`);