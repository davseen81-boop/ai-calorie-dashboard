CREATE TABLE `day_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text DEFAULT 'local-user' NOT NULL,
	`date` text NOT NULL,
	`day_type` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `day_plans_user_date_idx` ON `day_plans` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `profiles` ADD `rest_day_calories` integer;--> statement-breakpoint
ALTER TABLE `profiles` ADD `active_day_calories` integer;--> statement-breakpoint
ALTER TABLE `profiles` ADD `protein_pct` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `carbs_pct` integer DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE `profiles` ADD `fat_pct` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
-- Backfill: turn existing gram goals into the equivalent percentages, so an
-- established profile keeps the split it already had rather than snapping to
-- the 30/40/30 default. Fat is the remainder, which guarantees a total of 100.
UPDATE `profiles`
SET
  `protein_pct` = CAST(ROUND(`protein_goal_g` * 4.0 * 100.0 / (`protein_goal_g` * 4.0 + `carbs_goal_g` * 4.0 + `fat_goal_g` * 9.0)) AS INTEGER),
  `carbs_pct`   = CAST(ROUND(`carbs_goal_g`   * 4.0 * 100.0 / (`protein_goal_g` * 4.0 + `carbs_goal_g` * 4.0 + `fat_goal_g` * 9.0)) AS INTEGER),
  `fat_pct`     = 100
                  - CAST(ROUND(`protein_goal_g` * 4.0 * 100.0 / (`protein_goal_g` * 4.0 + `carbs_goal_g` * 4.0 + `fat_goal_g` * 9.0)) AS INTEGER)
                  - CAST(ROUND(`carbs_goal_g`   * 4.0 * 100.0 / (`protein_goal_g` * 4.0 + `carbs_goal_g` * 4.0 + `fat_goal_g` * 9.0)) AS INTEGER)
WHERE (`protein_goal_g` * 4.0 + `carbs_goal_g` * 4.0 + `fat_goal_g` * 9.0) > 0;
