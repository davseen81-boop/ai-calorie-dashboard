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

/**
 * Rows created before accounts existed carry this id.
 *
 * The first person to sign up adopts them, so an existing single-user install
 * keeps its history instead of stranding it behind a login.
 */
export const DEFAULT_USER_ID = "local-user";


export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export const MEAL_SOURCES = ["text", "photo", "manual"] as const;
export const THEMES = ["light", "dark", "system"] as const;

/** The two values the Mifflin-St Jeor equation is defined for. */
export const BIOLOGICAL_SEXES = ["male", "female"] as const;

export const ACTIVITY_LEVELS = [
  "sedentary",
  "light",
  "moderate",
  "active",
  "very_active",
] as const;

export const GOAL_TYPES = ["lose", "maintain", "gain"] as const;

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
/**
 * An account.
 *
 * Deliberately has no foreign keys pointing at it: `meals.userId` and friends
 * predate this table and still hold `local-user` until adoption, which an FK
 * would reject.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  /** Stored lowercased and trimmed; the uniqueness guarantee depends on it. */
  email: text("email").notNull().unique(),
  /** scrypt, as `salt:derivedKey` in hex. Never the password itself. */
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name"),
  ...timestamps,
});

export type UserRow = typeof users.$inferSelect;

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

  /**
   * Body metrics for the BMR/TDEE estimate. All nullable — the calculator is
   * optional, and the manual calorie slider works without any of them.
   *
   * `sex` is the biological sex the Mifflin-St Jeor equation is defined for;
   * it is used for nothing else.
   */
  sex: text("sex", { enum: BIOLOGICAL_SEXES }),
  /** Snapshot rather than a birth date: a year's drift is ~5 kcal. */
  age: integer("age"),
  heightCm: real("height_cm"),
  weightKg: real("weight_kg"),
  activityLevel: text("activity_level", { enum: ACTIVITY_LEVELS }),
  goalType: text("goal_type", { enum: GOAL_TYPES }),

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

// ---------------------------------------------------------------------------
// Routines — reusable meals and whole-day templates
// ---------------------------------------------------------------------------

export const ROUTINE_KINDS = ["meal", "day"] as const;

/**
 * A saved, reusable eating pattern.
 *
 * `kind: "meal"` holds exactly one entry in `routineMeals` ("my usual
 * breakfast"); `kind: "day"` holds several ("training day"). Both use the same
 * child tables rather than parallel structures, so applying a routine is one
 * code path regardless of kind.
 */
export const routines = sqliteTable(
  "routines",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().default(DEFAULT_USER_ID),

    name: text("name").notNull(),
    kind: text("kind", { enum: ROUTINE_KINDS }).notNull().default("meal"),

    /** Pinned to the top of the picker. */
    isFavorite: integer("is_favorite", { mode: "boolean" })
      .notNull()
      .default(false),

    /** Cheap usage signal for ordering the picker by what's actually used. */
    useCount: integer("use_count").notNull().default(0),
    lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),

    ...timestamps,
  },
  (table) => ({
    userIdx: index("routines_user_idx").on(table.userId, table.isFavorite),
  }),
);

export const routineMeals = sqliteTable(
  "routine_meals",
  {
    id: text("id").primaryKey(),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    mealType: text("meal_type", { enum: MEAL_TYPES }).notNull().default("snack"),

    /**
     * Optional `HH:mm`. On a day template this spaces the meals across the day
     * instead of stacking them all at the moment it was applied.
     */
    timeOfDay: text("time_of_day"),

    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    routineIdx: index("routine_meals_routine_idx").on(
      table.routineId,
      table.position,
    ),
  }),
);

export const routineMealItems = sqliteTable(
  "routine_meal_items",
  {
    id: text("id").primaryKey(),
    routineMealId: text("routine_meal_id")
      .notNull()
      .references(() => routineMeals.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    quantity: real("quantity").notNull().default(1),
    unit: text("unit").notNull().default("serving"),
    calories: real("calories").notNull().default(0),
    proteinG: real("protein_g").notNull().default(0),
    carbsG: real("carbs_g").notNull().default(0),
    fatG: real("fat_g").notNull().default(0),

    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => ({
    mealIdx: index("routine_meal_items_meal_idx").on(
      table.routineMealId,
      table.position,
    ),
  }),
);

/**
 * Optional auto-logging schedule for a routine.
 *
 * Runs are *caught up* when the app is next opened rather than fired by a
 * timer, so a meal is only ever logged once its scheduled time has actually
 * passed — never for a time still in the future. `lastRunOn` is the local
 * calendar date of the last run and makes the operation idempotent.
 */
export const routineSchedules = sqliteTable(
  "routine_schedules",
  {
    id: text("id").primaryKey(),
    routineId: text("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().default(DEFAULT_USER_ID),

    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),

    /** ISO weekdays as CSV — "1,2,3,4,5" is Mon–Fri. */
    daysOfWeek: text("days_of_week").notNull().default("1,2,3,4,5,6,7"),

    /** `HH:mm` in the profile's timezone. */
    timeOfDay: text("time_of_day").notNull().default("08:00"),

    /** Local `yyyy-MM-dd` of the last run; the idempotency key. */
    lastRunOn: text("last_run_on"),

    ...timestamps,
  },
  (table) => ({
    userIdx: index("routine_schedules_user_idx").on(table.userId, table.enabled),
  }),
);

export type RoutineRow = typeof routines.$inferSelect;
export type RoutineMealRow = typeof routineMeals.$inferSelect;
export type RoutineMealItemRow = typeof routineMealItems.$inferSelect;
export type RoutineScheduleRow = typeof routineSchedules.$inferSelect;
export type RoutineKind = (typeof ROUTINE_KINDS)[number];

/** A routine with everything needed to apply it. */
export type RoutineWithMeals = RoutineRow & {
  meals: Array<RoutineMealRow & { items: RoutineMealItemRow[] }>;
  schedule: RoutineScheduleRow | null;
};

export type ProfileRow = typeof profiles.$inferSelect;
export type NewProfileRow = typeof profiles.$inferInsert;
export type MealRow = typeof meals.$inferSelect;
export type NewMealRow = typeof meals.$inferInsert;
export type MealItemRow = typeof mealItems.$inferSelect;
export type NewMealItemRow = typeof mealItems.$inferInsert;

export type MealType = (typeof MEAL_TYPES)[number];
export type MealSource = (typeof MEAL_SOURCES)[number];
export type Theme = (typeof THEMES)[number];
export type BiologicalSex = (typeof BIOLOGICAL_SEXES)[number];
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];
export type GoalType = (typeof GOAL_TYPES)[number];

/** A meal joined with its items — the shape the API returns. */
export type MealWithItems = MealRow & { items: MealItemRow[] };
