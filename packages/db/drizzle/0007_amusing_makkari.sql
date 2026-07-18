CREATE TABLE `staff_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`seat_id` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seat_id`) REFERENCES `seats`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "staff_calls_status_chk" CHECK("staff_calls"."status" IN ('open', 'resolved')),
	CONSTRAINT "staff_calls_resolved_has_resolved_at_chk" CHECK("staff_calls"."status" != 'resolved' OR "staff_calls"."resolved_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `idx_staff_calls_store_status` ON `staff_calls` (`store_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_one_open_call_per_seat` ON `staff_calls` (`seat_id`) WHERE "staff_calls"."status" = 'open';