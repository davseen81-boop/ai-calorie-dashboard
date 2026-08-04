CREATE TABLE `training_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`activity_key` text,
	`duration_minutes` integer NOT NULL,
	`days_of_week` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `training_sessions_user_idx` ON `training_sessions` (`user_id`);