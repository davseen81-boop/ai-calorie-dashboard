import "server-only";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "./index";
import {
  DEFAULT_USER_ID,
  routineMealItems,
  routineMeals,
  routineSchedules,
  routines,
  type MealType,
  type RoutineKind,
  type RoutineWithMeals,
} from "./schema";
import { createMeal, getOrCreateProfile } from "./queries";

/**
 * Routine storage and application.
 *
 * Applying a routine deliberately reuses `createMeal`, so routine-logged meals
 * are ordinary meals — totals derived the same way, editable and deletable the
 * same way. Nothing downstream needs to know a routine was involved.
 */

export interface RoutineMealInput {
  name: string;
  mealType: MealType;
  timeOfDay?: string | null;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
  }>;
}

export interface CreateRoutineInput {
  name: string;
  kind: RoutineKind;
  isFavorite?: boolean;
  meals: RoutineMealInput[];
  schedule?: {
    enabled: boolean;
    daysOfWeek: number[];
    timeOfDay: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listRoutines(
  userId: string = DEFAULT_USER_ID,
): Promise<RoutineWithMeals[]> {
  const rows = await db.query.routines.findMany({
    where: eq(routines.userId, userId),
    // Favourites first, then whatever gets used most — the picker should put
    // the meal you actually repeat at the top without you organising it.
    orderBy: [
      desc(routines.isFavorite),
      desc(routines.useCount),
      desc(routines.updatedAt),
    ],
  });

  return hydrate(rows);
}

export async function getRoutineById(
  id: string,
  userId: string = DEFAULT_USER_ID,
): Promise<RoutineWithMeals | null> {
  const row = await db.query.routines.findFirst({
    where: and(eq(routines.id, id), eq(routines.userId, userId)),
  });
  if (!row) return null;
  return (await hydrate([row]))[0] ?? null;
}

/** Loads meals, items and schedules for a set of routines without N+1 queries. */
async function hydrate(
  rows: Array<typeof routines.$inferSelect>,
): Promise<RoutineWithMeals[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const meals = await db.query.routineMeals.findMany({
    where: inArray(routineMeals.routineId, ids),
    orderBy: asc(routineMeals.position),
  });

  const items = meals.length
    ? await db.query.routineMealItems.findMany({
        where: inArray(
          routineMealItems.routineMealId,
          meals.map((m) => m.id),
        ),
        orderBy: asc(routineMealItems.position),
      })
    : [];

  const schedules = await db.query.routineSchedules.findMany({
    where: inArray(routineSchedules.routineId, ids),
  });

  const itemsByMeal = new Map<string, typeof items>();
  for (const item of items) {
    const bucket = itemsByMeal.get(item.routineMealId);
    if (bucket) bucket.push(item);
    else itemsByMeal.set(item.routineMealId, [item]);
  }

  const mealsByRoutine = new Map<string, typeof meals>();
  for (const meal of meals) {
    const bucket = mealsByRoutine.get(meal.routineId);
    if (bucket) bucket.push(meal);
    else mealsByRoutine.set(meal.routineId, [meal]);
  }

  const scheduleByRoutine = new Map(schedules.map((s) => [s.routineId, s]));

  return rows.map((row) => ({
    ...row,
    meals: (mealsByRoutine.get(row.id) ?? []).map((meal) => ({
      ...meal,
      items: itemsByMeal.get(meal.id) ?? [],
    })),
    schedule: scheduleByRoutine.get(row.id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createRoutine(
  input: CreateRoutineInput,
  userId: string = DEFAULT_USER_ID,
): Promise<RoutineWithMeals> {
  const routineId = crypto.randomUUID();

  await db.transaction(async (tx) => {
    await tx.insert(routines).values({
      id: routineId,
      userId,
      name: input.name,
      kind: input.kind,
      isFavorite: input.isFavorite ?? false,
    });

    await writeMeals(tx, routineId, input.meals);
    await writeSchedule(tx, routineId, userId, input.schedule ?? null);
  });

  const routine = await getRoutineById(routineId, userId);
  if (!routine) throw new Error("Routine vanished immediately after creation");
  return routine;
}

export interface UpdateRoutineInput {
  name?: string;
  isFavorite?: boolean;
  meals?: RoutineMealInput[];
  schedule?: CreateRoutineInput["schedule"];
}

export async function updateRoutine(
  id: string,
  input: UpdateRoutineInput,
  userId: string = DEFAULT_USER_ID,
): Promise<RoutineWithMeals | null> {
  const existing = await db.query.routines.findFirst({
    where: and(eq(routines.id, id), eq(routines.userId, userId)),
  });
  if (!existing) return null;

  await db.transaction(async (tx) => {
    const fields: Record<string, unknown> = {};
    if (input.name !== undefined) fields.name = input.name;
    if (input.isFavorite !== undefined) fields.isFavorite = input.isFavorite;

    if (Object.keys(fields).length > 0) {
      await tx
        .update(routines)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(routines.id, id));
    }

    // Replaced wholesale rather than diffed — the editor hands back the full
    // list, and reconciling per row adds failure modes for no visible gain.
    if (input.meals) {
      await tx.delete(routineMeals).where(eq(routineMeals.routineId, id));
      await writeMeals(tx, id, input.meals);
    }

    if (input.schedule !== undefined) {
      await tx.delete(routineSchedules).where(eq(routineSchedules.routineId, id));
      await writeSchedule(tx, id, userId, input.schedule);
    }
  });

  return getRoutineById(id, userId);
}

export async function deleteRoutine(
  id: string,
  userId: string = DEFAULT_USER_ID,
): Promise<boolean> {
  const deleted = await db
    .delete(routines)
    .where(and(eq(routines.id, id), eq(routines.userId, userId)))
    .returning({ id: routines.id });
  return deleted.length > 0;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function writeMeals(
  tx: Tx,
  routineId: string,
  meals: RoutineMealInput[],
): Promise<void> {
  for (const [index, meal] of meals.entries()) {
    const mealId = crypto.randomUUID();
    await tx.insert(routineMeals).values({
      id: mealId,
      routineId,
      name: meal.name,
      mealType: meal.mealType,
      timeOfDay: meal.timeOfDay ?? null,
      position: index,
    });

    if (meal.items.length > 0) {
      await tx.insert(routineMealItems).values(
        meal.items.map((item, itemIndex) => ({
          ...item,
          id: crypto.randomUUID(),
          routineMealId: mealId,
          position: itemIndex,
        })),
      );
    }
  }
}

async function writeSchedule(
  tx: Tx,
  routineId: string,
  userId: string,
  schedule: CreateRoutineInput["schedule"],
): Promise<void> {
  if (!schedule) return;
  await tx.insert(routineSchedules).values({
    id: crypto.randomUUID(),
    routineId,
    userId,
    enabled: schedule.enabled,
    daysOfWeek: schedule.daysOfWeek.join(","),
    timeOfDay: schedule.timeOfDay,
  });
}

// ---------------------------------------------------------------------------
// Applying
// ---------------------------------------------------------------------------

/**
 * Log a routine's meals as real meals.
 *
 * `at` anchors the local day. A meal with a `timeOfDay` is logged at that
 * wall-clock time on that day, so a day template spreads across the day
 * instead of stacking at the moment you tapped it.
 */
export async function applyRoutine(
  id: string,
  options: { at?: Date; timezone?: string } = {},
  userId: string = DEFAULT_USER_ID,
): Promise<{ routine: RoutineWithMeals; mealIds: string[] } | null> {
  const routine = await getRoutineById(id, userId);
  if (!routine) return null;

  const profile = await getOrCreateProfile(userId);
  const timezone = options.timezone ?? profile.timezone;
  const anchor = options.at ?? new Date();

  const mealIds: string[] = [];
  for (const meal of routine.meals) {
    const created = await createMeal(
      {
        name: meal.name,
        mealType: meal.mealType,
        source: "manual",
        rawInput: null,
        notes: `Logged from routine "${routine.name}"`,
        aiConfidence: null,
        loggedAt: meal.timeOfDay
          ? atLocalTime(anchor, timezone, meal.timeOfDay)
          : anchor,
        items: meal.items.map((item) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          calories: item.calories,
          proteinG: item.proteinG,
          carbsG: item.carbsG,
          fatG: item.fatG,
        })),
      },
      userId,
    );
    mealIds.push(created.id);
  }

  await db
    .update(routines)
    .set({
      useCount: sql`${routines.useCount} + 1`,
      lastUsedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(routines.id, id));

  const refreshed = await getRoutineById(id, userId);
  return { routine: refreshed ?? routine, mealIds };
}

// ---------------------------------------------------------------------------
// Scheduled catch-up
// ---------------------------------------------------------------------------

/**
 * Apply any schedule whose time has passed today and which hasn't run today.
 *
 * Called when the app loads rather than by a timer. That means a routine is
 * never logged before its time has actually arrived, and a day you never
 * opened the app simply isn't back-filled — both preferable to inventing
 * meals you may not have eaten.
 */
export async function runDueSchedules(
  now: Date = new Date(),
  userId: string = DEFAULT_USER_ID,
): Promise<{ applied: Array<{ routineId: string; name: string }> }> {
  const profile = await getOrCreateProfile(userId);
  const timezone = profile.timezone;

  const { date: today, weekday, minutes: nowMinutes } = localParts(now, timezone);

  const schedules = await db.query.routineSchedules.findMany({
    where: and(
      eq(routineSchedules.userId, userId),
      eq(routineSchedules.enabled, true),
    ),
  });

  const applied: Array<{ routineId: string; name: string }> = [];

  for (const schedule of schedules) {
    if (schedule.lastRunOn === today) continue;

    const days = schedule.daysOfWeek
      .split(",")
      .map((d) => Number.parseInt(d, 10))
      .filter(Number.isFinite);
    if (!days.includes(weekday)) continue;

    if (toMinutes(schedule.timeOfDay) > nowMinutes) continue;

    // Claim the slot before doing the work: two tabs opening at once would
    // otherwise both pass the checks above and log the meal twice.
    const claimed = await db
      .update(routineSchedules)
      .set({ lastRunOn: today, updatedAt: new Date() })
      .where(
        and(
          eq(routineSchedules.id, schedule.id),
          schedule.lastRunOn === null
            ? sql`${routineSchedules.lastRunOn} is null`
            : eq(routineSchedules.lastRunOn, schedule.lastRunOn),
        ),
      )
      .returning({ id: routineSchedules.id });

    if (claimed.length === 0) continue;

    const result = await applyRoutine(
      schedule.routineId,
      { at: atLocalTime(now, timezone, schedule.timeOfDay), timezone },
      userId,
    );
    if (result) {
      applied.push({ routineId: schedule.routineId, name: result.routine.name });
    }
  }

  return { applied };
}

// ---------------------------------------------------------------------------
// Local-time helpers
// ---------------------------------------------------------------------------

function localParts(at: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });

  const parts = Object.fromEntries(
    fmt.formatToParts(at).map((p) => [p.type, p.value]),
  );

  const weekdayMap: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdayMap[parts.weekday ?? "Mon"] ?? 1,
    // "24" appears at midnight under hour12:false in some runtimes.
    minutes:
      (Number.parseInt(parts.hour ?? "0", 10) % 24) * 60 +
      Number.parseInt(parts.minute ?? "0", 10),
  };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((v) => Number.parseInt(v, 10));
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * The instant corresponding to `hh:mm` on `anchor`'s local day.
 *
 * Derived by measuring the zone's offset at that moment rather than assuming
 * one, so it stays correct across DST boundaries.
 */
function atLocalTime(anchor: Date, timeZone: string, hhmm: string): Date {
  const { date } = localParts(anchor, timeZone);
  const [y, mo, d] = date.split("-").map((v) => Number.parseInt(v, 10));
  const [h, mi] = hhmm.split(":").map((v) => Number.parseInt(v, 10));

  const guess = Date.UTC(y, mo - 1, d, h || 0, mi || 0);
  // How far the zone is from UTC at that instant.
  const asUtc = new Date(guess);
  const shown = new Date(
    asUtc.toLocaleString("en-US", { timeZone }),
  ).getTime();
  const wallUtc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  const offset = shown - wallUtc;

  return new Date(guess - offset);
}
