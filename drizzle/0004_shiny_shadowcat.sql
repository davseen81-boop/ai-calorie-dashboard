-- Hand-corrected. drizzle-kit emitted a DROP INDEX for users_google_id_unique
-- before that column existed, and placed the ADD COLUMN statements after the
-- CREATE INDEX that depends on them. Reordered so every object exists before
-- it is referenced.

-- 1. New columns first — everything below depends on them.
ALTER TABLE `users` ADD `google_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_url` text;--> statement-breakpoint

-- 2. Drop the indexes libSQL rebuilds when a column definition changes.
DROP INDEX IF EXISTS `meal_items_meal_position_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `meals_user_logged_at_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `routine_meal_items_meal_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `routine_meals_routine_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `routine_schedules_user_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `routines_user_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `users_email_unique`;--> statement-breakpoint

-- 3. Google accounts have no password, so the column must allow NULL.
ALTER TABLE `users` ALTER COLUMN "password_hash" TO "password_hash" text;--> statement-breakpoint

-- 4. Recreate the indexes, plus the new one on google_id.
CREATE INDEX `meal_items_meal_position_idx` ON `meal_items` (`meal_id`,`position`);--> statement-breakpoint
CREATE INDEX `meals_user_logged_at_idx` ON `meals` (`user_id`,`logged_at`);--> statement-breakpoint
CREATE INDEX `routine_meal_items_meal_idx` ON `routine_meal_items` (`routine_meal_id`,`position`);--> statement-breakpoint
CREATE INDEX `routine_meals_routine_idx` ON `routine_meals` (`routine_id`,`position`);--> statement-breakpoint
CREATE INDEX `routine_schedules_user_idx` ON `routine_schedules` (`user_id`,`enabled`);--> statement-breakpoint
CREATE INDEX `routines_user_idx` ON `routines` (`user_id`,`is_favorite`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_id_unique` ON `users` (`google_id`);
