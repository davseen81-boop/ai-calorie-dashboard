CREATE TABLE `routine_meal_items` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_meal_id` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'serving' NOT NULL,
	`calories` real DEFAULT 0 NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`routine_meal_id`) REFERENCES `routine_meals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routine_meal_items_meal_idx` ON `routine_meal_items` (`routine_meal_id`,`position`);--> statement-breakpoint
CREATE TABLE `routine_meals` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`name` text NOT NULL,
	`meal_type` text DEFAULT 'snack' NOT NULL,
	`time_of_day` text,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routine_meals_routine_idx` ON `routine_meals` (`routine_id`,`position`);--> statement-breakpoint
CREATE TABLE `routine_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`routine_id` text NOT NULL,
	`user_id` text DEFAULT 'local-user' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`days_of_week` text DEFAULT '1,2,3,4,5,6,7' NOT NULL,
	`time_of_day` text DEFAULT '08:00' NOT NULL,
	`last_run_on` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routine_schedules_user_idx` ON `routine_schedules` (`user_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'local-user' NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'meal' NOT NULL,
	`is_favorite` integer DEFAULT false NOT NULL,
	`use_count` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `routines_user_idx` ON `routines` (`user_id`,`is_favorite`);