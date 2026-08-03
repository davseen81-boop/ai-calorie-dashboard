import "server-only";

import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "./index";
import { dayPlans, type DayPlanRow, type DayType } from "./schema";

/**
 * Planned day types.
 *
 * Only non-normal days are stored — a missing row means a normal day. That
 * keeps the table proportional to how often someone actually deviates, rather
 * than one row per day forever.
 */

export async function getDayType(
  date: string,
  userId: string,
): Promise<DayType> {
  const row = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.userId, userId), eq(dayPlans.date, date)),
  });
  return row?.dayType ?? "normal";
}

export async function listDayPlans(
  range: { from: string; to: string },
  userId: string,
): Promise<DayPlanRow[]> {
  return db.query.dayPlans.findMany({
    where: and(
      eq(dayPlans.userId, userId),
      gte(dayPlans.date, range.from),
      lte(dayPlans.date, range.to),
    ),
  });
}

/**
 * Set (or clear) a day's type.
 *
 * Setting a day back to normal deletes the row rather than storing "normal",
 * so the table only ever holds deliberate deviations.
 */
export async function setDayType(
  date: string,
  dayType: DayType,
  userId: string,
): Promise<DayType> {
  if (dayType === "normal") {
    await db
      .delete(dayPlans)
      .where(and(eq(dayPlans.userId, userId), eq(dayPlans.date, date)));
    return "normal";
  }

  await db
    .insert(dayPlans)
    .values({ id: crypto.randomUUID(), userId, date, dayType })
    .onConflictDoUpdate({
      // Matches the unique index on (user_id, date).
      target: [dayPlans.userId, dayPlans.date],
      set: { dayType, updatedAt: new Date() },
    });

  return dayType;
}

/** Day types for a set of dates, for the weekly chart. */
export async function getDayTypeMap(
  dates: string[],
  userId: string,
): Promise<Map<string, DayType>> {
  if (dates.length === 0) return new Map();

  const rows = await db.query.dayPlans.findMany({
    where: and(eq(dayPlans.userId, userId), inArray(dayPlans.date, dates)),
  });

  return new Map(rows.map((row) => [row.date, row.dayType]));
}
