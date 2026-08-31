CREATE TABLE `availability_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`submission_id` text NOT NULL,
	`work_date` text NOT NULL,
	`kind` text NOT NULL,
	`start_minutes` integer,
	`end_minutes` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submission_id`) REFERENCES `availability_submissions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "availability_entries_kind_chk" CHECK("availability_entries"."kind" IN ('available', 'day_off')),
	CONSTRAINT "availability_entries_work_date_chk" CHECK("availability_entries"."work_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "availability_entries_available_times_chk" CHECK("availability_entries"."kind" != 'available' OR ("availability_entries"."start_minutes" IS NOT NULL AND "availability_entries"."end_minutes" IS NOT NULL AND "availability_entries"."start_minutes" >= 0 AND "availability_entries"."start_minutes" < 1440 AND "availability_entries"."end_minutes" > "availability_entries"."start_minutes" AND "availability_entries"."end_minutes" <= "availability_entries"."start_minutes" + 1440)),
	CONSTRAINT "availability_entries_day_off_times_chk" CHECK("availability_entries"."kind" != 'day_off' OR ("availability_entries"."start_minutes" IS NULL AND "availability_entries"."end_minutes" IS NULL))
);
--> statement-breakpoint
CREATE INDEX `idx_availability_entries_submission` ON `availability_entries` (`submission_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_availability_entries_store` ON `availability_entries` (`store_id`);--> statement-breakpoint
CREATE TABLE `availability_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`period_id` text NOT NULL,
	`member_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`submitted_at` integer,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `schedule_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "availability_submissions_status_chk" CHECK("availability_submissions"."status" IN ('draft', 'submitted')),
	CONSTRAINT "availability_submissions_submitted_chk" CHECK("availability_submissions"."status" != 'submitted' OR "availability_submissions"."submitted_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_availability_submissions_pair` ON `availability_submissions` (`period_id`,`member_id`);--> statement-breakpoint
CREATE INDEX `idx_availability_submissions_store` ON `availability_submissions` (`store_id`);--> statement-breakpoint
CREATE TABLE `member_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text NOT NULL,
	`position_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_member_positions_pair` ON `member_positions` (`member_id`,`position_id`);--> statement-breakpoint
CREATE INDEX `idx_member_positions_store` ON `member_positions` (`store_id`);--> statement-breakpoint
CREATE TABLE `member_work_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`member_id` text NOT NULL,
	`hourly_wage` integer,
	`weekly_cap_minutes` integer,
	`is_minor` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "member_work_profiles_wage_nonneg_chk" CHECK("member_work_profiles"."hourly_wage" IS NULL OR "member_work_profiles"."hourly_wage" >= 0),
	CONSTRAINT "member_work_profiles_cap_positive_chk" CHECK("member_work_profiles"."weekly_cap_minutes" IS NULL OR "member_work_profiles"."weekly_cap_minutes" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_member_work_profiles_member` ON `member_work_profiles` (`member_id`);--> statement-breakpoint
CREATE INDEX `idx_member_work_profiles_store` ON `member_work_profiles` (`store_id`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_positions_store` ON `positions` (`store_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `schedule_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'collecting' NOT NULL,
	`submission_deadline` integer NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "schedule_periods_status_chk" CHECK("schedule_periods"."status" IN ('collecting', 'building', 'published')),
	CONSTRAINT "schedule_periods_date_format_chk" CHECK("schedule_periods"."start_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' AND "schedule_periods"."end_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "schedule_periods_dates_chk" CHECK("schedule_periods"."end_date" >= "schedule_periods"."start_date"),
	CONSTRAINT "schedule_periods_published_chk" CHECK("schedule_periods"."status" != 'published' OR "schedule_periods"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_schedule_periods_store_start` ON `schedule_periods` (`store_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `shift_patterns` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`name` text NOT NULL,
	`start_minutes` integer NOT NULL,
	`end_minutes` integer NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shift_patterns_times_chk" CHECK("shift_patterns"."start_minutes" >= 0 AND "shift_patterns"."start_minutes" < 1440 AND "shift_patterns"."end_minutes" > "shift_patterns"."start_minutes" AND "shift_patterns"."end_minutes" <= "shift_patterns"."start_minutes" + 1440)
);
--> statement-breakpoint
CREATE INDEX `idx_shift_patterns_store` ON `shift_patterns` (`store_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`period_id` text NOT NULL,
	`member_id` text NOT NULL,
	`position_id` text,
	`work_date` text NOT NULL,
	`start_minutes` integer NOT NULL,
	`end_minutes` integer NOT NULL,
	`break_minutes` integer DEFAULT 0 NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `schedule_periods`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "shifts_work_date_chk" CHECK("shifts"."work_date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
	CONSTRAINT "shifts_times_chk" CHECK("shifts"."start_minutes" >= 0 AND "shifts"."start_minutes" < 1440 AND "shifts"."end_minutes" > "shifts"."start_minutes" AND "shifts"."end_minutes" <= "shifts"."start_minutes" + 1440),
	CONSTRAINT "shifts_break_chk" CHECK("shifts"."break_minutes" >= 0 AND "shifts"."break_minutes" < "shifts"."end_minutes" - "shifts"."start_minutes")
);
--> statement-breakpoint
CREATE INDEX `idx_shifts_store_date` ON `shifts` (`store_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_shifts_period` ON `shifts` (`period_id`);--> statement-breakpoint
CREATE INDEX `idx_shifts_member_date` ON `shifts` (`member_id`,`work_date`);--> statement-breakpoint
CREATE TABLE `staffing_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`store_id` text NOT NULL,
	`weekday` integer NOT NULL,
	`position_id` text NOT NULL,
	`start_minutes` integer NOT NULL,
	`end_minutes` integer NOT NULL,
	`required_headcount` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "staffing_requirements_weekday_chk" CHECK("staffing_requirements"."weekday" BETWEEN 0 AND 6),
	CONSTRAINT "staffing_requirements_times_chk" CHECK("staffing_requirements"."start_minutes" >= 0 AND "staffing_requirements"."start_minutes" < 1440 AND "staffing_requirements"."end_minutes" > "staffing_requirements"."start_minutes" AND "staffing_requirements"."end_minutes" <= "staffing_requirements"."start_minutes" + 1440),
	CONSTRAINT "staffing_requirements_headcount_nonneg_chk" CHECK("staffing_requirements"."required_headcount" >= 0)
);
--> statement-breakpoint
CREATE INDEX `idx_staffing_requirements_store_weekday` ON `staffing_requirements` (`store_id`,`weekday`);