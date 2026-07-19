CREATE TABLE `members` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text DEFAULT 'staff' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`activated_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "members_role_chk" CHECK("members"."role" IN ('owner', 'staff')),
	CONSTRAINT "members_status_chk" CHECK("members"."status" IN ('pending', 'active'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_email_unique` ON `members` (`email`);--> statement-breakpoint
CREATE INDEX `idx_members_store` ON `members` (`store_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_magic_link_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text NOT NULL,
	`token` text NOT NULL,
	`purpose` text NOT NULL,
	`new_email` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "magic_link_tokens_purpose_chk" CHECK("__new_magic_link_tokens"."purpose" IN ('signup', 'login', 'email_change', 'invite'))
);
--> statement-breakpoint
INSERT INTO `__new_magic_link_tokens`("id", "store_id", "member_id", "token", "purpose", "new_email", "expires_at", "used_at", "created_at") SELECT "id", "store_id", "member_id", "token", "purpose", "new_email", "expires_at", "used_at", "created_at" FROM `magic_link_tokens`;--> statement-breakpoint
DROP TABLE `magic_link_tokens`;--> statement-breakpoint
ALTER TABLE `__new_magic_link_tokens` RENAME TO `magic_link_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `magic_link_tokens_token_unique` ON `magic_link_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_magic_link_tokens_store` ON `magic_link_tokens` (`store_id`);--> statement-breakpoint
CREATE INDEX `idx_magic_link_tokens_member` ON `magic_link_tokens` (`member_id`);--> statement-breakpoint
ALTER TABLE `sessions` ADD `member_id` text NOT NULL REFERENCES members(id);--> statement-breakpoint
CREATE INDEX `idx_sessions_member` ON `sessions` (`member_id`);