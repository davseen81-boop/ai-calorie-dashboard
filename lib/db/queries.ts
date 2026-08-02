import "server-only";

import { and, asc, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "./index";
import {
  meals,
  mealItems,
  profiles,
  type MealItemRow,
  type MealRow,
  type MealWithItems,
  type NewMealItemRow,
  type ProfileRow,
} from "./schema";

/** The handle passed to a `db.transaction` callback. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Accepts either the root handle or an open transaction. */
type DbOrTx = typeof db | Transaction;

/**
 * Data access layer.
 *
 * Everything that would have been a Postgres trigger under Supabase lives here
 * instead: total recalculation, profile provisioning, and ownership scoping.
 * Route handlers should call these rather than touching `db` directly, so those
 * invariants cannot be bypassed.
 */

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * The user's settings row, created on first access.
 *
 * Replaces Supabase's `handle_new_user` trigger: rather than reacting to a
 * signup event, the single-user build provisions lazily the first time the
 * profile is read.
 */
export async function getOrCreateProfile(
  userId: string,
): Promise<ProfileRow> {
  const existing = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
  });
  if (existing) return existing;

  // `onConflictDoNothing` guards the race where two concurrent requests both
  // see no row and both try to insert.
  await db.insert(profiles).values({ id: userId }).onConflictDoNothing();

  const created = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
  });
  if (!created) {
    throw new Error(`Failed to provision profile for user ${userId}`);
  }
  return created;
}

export async function updateProfile(
  patch: Partial<Omit<ProfileRow, "id" | "createdAt" | "updatedAt">>,
  userId: string,
): Promise<ProfileRow> {
  await getOrCreateProfile(userId);

  const [updated] = await db
    .update(profiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(profiles.id, userId))
    .returning();

  return updated;
}

// ---------------------------------------------------------------------------
// Meal totals
// ---------------------------------------------------------------------------

/**
 * Recompute a meal's denormalised macro totals from its items.
 *
 * Replaces the Postgres `recalc_meal_totals` trigger. Must be called inside the
 * same transaction as any item mutation, otherwise a concurrent read can
 * observe totals that disagree with the items.
 */
export async function recalcMealTotals(
  tx: DbOrTx,
  mealId: string,
): Promise<void> {
  const [totals] = await tx
    .select({
      calories: sql<number>`coalesce(sum(${mealItems.calories}), 0)`,
      protein: sql<number>`coalesce(sum(${mealItems.proteinG}), 0)`,
      carbs: sql<number>`coalesce(sum(${mealItems.carbsG}), 0)`,
      fat: sql<number>`coalesce(sum(${mealItems.fatG}), 0)`,
    })
    .from(mealItems)
    .where(eq(mealItems.mealId, mealId));

  // Rounded before storing: summing REALs produces artefacts like
  // 5.6000000000000005, which would otherwise reach the UI verbatim and
  // compound as these totals are themselves summed for the dashboard.
  await tx
    .update(meals)
    .set({
      totalCalories: round(totals?.calories ?? 0),
      totalProteinG: round(totals?.protein ?? 0),
      totalCarbsG: round(totals?.carbs ?? 0),
      totalFatG: round(totals?.fat ?? 0),
      updatedAt: new Date(),
    })
    .where(eq(meals.id, mealId));
}

/** One decimal place — finer precision is noise for nutrition estimates. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Neutralise LIKE wildcards in user input so searching for "100%" does not
 * match every row. Paired with an explicit `ESCAPE '\'` at the call site.
 */
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

// ---------------------------------------------------------------------------
// Meals
// ---------------------------------------------------------------------------

export interface CreateMealInput {
  name: string;
  mealType: MealRow["mealType"];
  source: MealRow["source"];
  rawInput?: string | null;
  imageUrl?: string | null;
  notes?: string | null;
  aiConfidence?: number | null;
  loggedAt: Date;
  items: Array<Omit<NewMealItemRow, "id" | "mealId" | "position">>;
}

/** Insert a meal and its items atomically, then derive the totals. */
export async function createMeal(
  input: CreateMealInput,
  userId: string,
): Promise<MealWithItems> {
  const mealId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(meals).values({
      id: mealId,
      userId,
      name: input.name,
      mealType: input.mealType,
      source: input.source,
      rawInput: input.rawInput ?? null,
      imageUrl: input.imageUrl ?? null,
      notes: input.notes ?? null,
      aiConfidence: input.aiConfidence ?? null,
      loggedAt: input.loggedAt,
    });

    if (input.items.length > 0) {
      await tx.insert(mealItems).values(
        input.items.map((item, index) => ({
          ...item,
          id: crypto.randomUUID(),
          mealId,
          position: index,
        })),
      );
    }

    await recalcMealTotals(tx, mealId);
  });

  const meal = await getMealById(mealId, userId);
  if (!meal) throw new Error("Meal vanished immediately after creation");
  return meal;
}

export async function getMealById(
  mealId: string,
  userId: string,
): Promise<MealWithItems | null> {
  const meal = await db.query.meals.findFirst({
    where: and(eq(meals.id, mealId), eq(meals.userId, userId)),
  });
  if (!meal) return null;

  const items = await db.query.mealItems.findMany({
    where: eq(mealItems.mealId, mealId),
    orderBy: asc(mealItems.position),
  });

  return { ...meal, items };
}

export interface ListMealsOptions {
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
  search?: string;
  mealType?: MealRow["mealType"];
}

/** Meals whose `loggedAt` falls in `[from, to)`, newest first. */
export async function listMeals(
  options: ListMealsOptions = {},
  userId: string,
): Promise<MealWithItems[]> {
  const { from, to, limit = 100, offset = 0, search, mealType } = options;

  const rows = await db.query.meals.findMany({
    where: and(
      eq(meals.userId, userId),
      from ? gte(meals.loggedAt, from) : undefined,
      to ? lt(meals.loggedAt, to) : undefined,
      mealType ? eq(meals.mealType, mealType) : undefined,
      // SQLite's LIKE is case-insensitive for ASCII, which is what the history
      // search box wants. `%` and `_` in the term are escaped so a user typing
      // "100%" does not match everything.
      search
        ? sql`${meals.name} like ${`%${escapeLikePattern(search)}%`} escape '\\'`
        : undefined,
    ),
    orderBy: desc(meals.loggedAt),
    limit,
    offset,
  });

  if (rows.length === 0) return [];

  // One query for all items, then group in memory — avoids N+1 without needing
  // a join that would duplicate meal columns per item.
  const ids = rows.map((r) => r.id);
  const items = await db.query.mealItems.findMany({
    where: inArray(mealItems.mealId, ids),
    orderBy: asc(mealItems.position),
  });

  const byMeal = new Map<string, MealItemRow[]>();
  for (const item of items) {
    const bucket = byMeal.get(item.mealId);
    if (bucket) bucket.push(item);
    else byMeal.set(item.mealId, [item]);
  }

  return rows.map((row) => ({ ...row, items: byMeal.get(row.id) ?? [] }));
}

export interface UpdateMealInput {
  name?: string;
  mealType?: MealRow["mealType"];
  notes?: string | null;
  loggedAt?: Date;
  /** When present, replaces the entire item list. */
  items?: Array<Omit<NewMealItemRow, "id" | "mealId" | "position">>;
}

/**
 * Patch a meal, optionally replacing its items.
 *
 * Items are replaced wholesale rather than diffed: the edit UI hands back the
 * full corrected list, and reconciling per-row would add failure modes for no
 * user-visible gain. Returns null when the meal does not exist or is not owned
 * by this user — the caller maps that to a 404.
 */
export async function updateMeal(
  mealId: string,
  input: UpdateMealInput,
  userId: string,
): Promise<MealWithItems | null> {
  const existing = await db.query.meals.findFirst({
    where: and(eq(meals.id, mealId), eq(meals.userId, userId)),
  });
  if (!existing) return null;

  await db.transaction(async (tx) => {
    const { items, ...fields } = input;

    if (Object.keys(fields).length > 0) {
      await tx
        .update(meals)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(meals.id, mealId));
    }

    if (items) {
      await tx.delete(mealItems).where(eq(mealItems.mealId, mealId));
      await tx.insert(mealItems).values(
        items.map((item, index) => ({
          ...item,
          id: crypto.randomUUID(),
          mealId,
          position: index,
        })),
      );
      await recalcMealTotals(tx, mealId);
    }
  });

  return getMealById(mealId, userId);
}

export async function deleteMeal(
  mealId: string,
  userId: string,
): Promise<boolean> {
  // Items disappear via ON DELETE CASCADE (foreign keys are enabled in
  // lib/db/index.ts).
  const deleted = await db
    .delete(meals)
    .where(and(eq(meals.id, mealId), eq(meals.userId, userId)))
    .returning({ id: meals.id });

  return deleted.length > 0;
}
