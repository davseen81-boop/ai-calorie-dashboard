CREATE TABLE `exercise_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'local-user' NOT NULL,
	`name` text NOT NULL,
	`activity_key` text,
	`duration_minutes` integer NOT NULL,
	`calories_burned` real DEFAULT 0 NOT NULL,
	`source` text DEFAULT 'estimated' NOT NULL,
	`notes` text,
	`performed_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `exercise_user_performed_idx` ON `exercise_entries` (`user_id`,`performed_at`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `adjust_target_for_exercise` integer DEFAULT true NOT NULL;