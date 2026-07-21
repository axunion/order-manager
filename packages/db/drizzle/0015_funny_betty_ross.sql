ALTER TABLE `members` ADD `email_change_attempt_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `email_change_window_started_at` integer;