import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

/**
 * SQLite / libSQL schema.
 *
 * Runs unchanged against a local `file:./local.db` in development and against
 * Turso in production — libSQL is SQLite, so there is no dialect drift.
 *
 * Notes on SQLite-specific choices:
 *  - No enum type exists, so `text({ enum: [...] })` gives the TS union while
 *    the column stays plain TEXT.
 *  - Timestamps are stored as unix milliseconds (INTEGER) rather than ISO text,
 *    so range filters and ORDER BY are numeric rather than lexicographic.
 *  - Money-free numerics use REAL; nothing here needs exact decimal semantics.
 */

/** Single-user build: every row is attributed to this id. */
export const DEFAULT_USER_ID = "local-user";

export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export const MEAL_SOURCES = ["text", "photo", "manual"] as const;
export const THEMES = ["light", "dark", "system"] as const;

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
};

/**
 * User settings and daily targets. One row per user — in the single-user build
 * that means exactly one row, keyed by DEFAULT_USER_ID.
 */
export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),

  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),

  dailyCalorieGoal: integer("daily_calorie_goal").notNull().default(2000),
  proteinGoalG: integer("protein_goal_g").notNull().default(150),
  carbsGoalG: integer("carbs_goal_g").notNull().default(200),
  fatGoalG: integer("fat_goal_g").notNull().default(65),

  /**
   * JSON-encoded string[] — SQLite has no array type. Read/written through the
   * `dietaryPreferences` helpers in `lib/db/serialize.ts` so the encoding never
   * leaks into feature code.
   */
  dietaryPreferences: text("dietary_preferences").notNull().default("[]"),

  /** IANA zone, e.g. 'Asia/Singapore'. "Today" is bucketed in this zone. */
  timezone: text("timezone").notNull().default("UTC"),

  theme: text("theme", { enum: THEMES }).notNull().default("system"),

  ...timestamps,
});

/**
 * One logged meal. Macro totals are denormalised here and recomputed by
 * `recalcMealTotals()` inside the same transaction that mutates items —
 * SQLite has triggers, but Drizzle does not manage them, so keeping the rule
 * in one place in TypeScript is less fragile than a hand-maintained trigger.
 */
export const meals = sqliteTable(
  "meals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default(DEFAULT_USER_ID),

    name: text("name").notNull(),
    mealType: text("meal_type", { enum: MEAL_TYPES }).notNull().default("snack"),
    source: text("source", { enum: MEAL_SOURCES }).notNull().default("text"),

    /** Original user input, kept for auditing and re-analysis. */
    rawInput: text("raw_input"),
    imageUrl: text("image_url"),
    notes: text("notes"),

    totalCalories: real("total_calories").notNull().default(0),
    totalProteinG: real("total_protein_g").notNull().default(0),
    totalCarbsG: real("total_carbs_g").notNull().default(0),
    totalFatG: real("total_fat_g").notNull().default(0),

    /** Model self-reported confidence 0..1; null for manual entries. */
    aiConfidence: real("ai_confidence"),

    /** When the food was eaten (user-editable), not when the row was written. */
    loggedAt: integer("logged_at", { mode: "timestamp_ms" }).notNull(),

    ...timestamps,
  },
  (table) => ({
    // The dashboard's hot path: this user's meals within a date range, newest
    // first.
    userLoggedAtIdx: index("meals_user_logged_at_idx").on(
      table.userId,
      table.loggedAt,
    ),
  }),
);

/** The individual foods the AI identified within a meal. */
export const mealItems = sqliteTable(
  "meal_items",
  {
    id: text("id").primaryKey(),
    mealId: text("meal_id")
      .notNull()
      .references(() => meals.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("serving"),

    calories: real("calories").notNull().default(0),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),

    /** Preserves AI ordering so the edit list matches what the user saw. */
    position: integer("position").notNull().default(0),

    ...timestamps,
  },
  (table) => ({
    mealPositionIdx: index("meal_items_meal_position_idx").on(
      table.mealId,
      table.position,
    ),
  }),
);

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;
export type MealRow = typeof meals.$inferSelect;
export type NewMealRow = typeof meals.$inferInsert;
export type MealItemRow = typeof mealItems.$inferSelect;
export type NewMealItemRow = typeof mealItems.$inferInsert;

export type MealType = (typeof MEAL_TYPES)[number];
export type MealSource = (typeof MEAL_SOURCES)[number];
export type Theme = (typeof THEMES)[number];

/** A meal joined with its items — the shape the API returns. */
export type MealWithItems = MealRow & { items: MealItemRow[] };
