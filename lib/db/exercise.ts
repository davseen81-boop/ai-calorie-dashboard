import "server-only";

import { and, desc, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "./index";
import { exerciseEntries, type ExerciseEntryRow } from "./schema";

/** Exercise entries and their daily totals. */

export interface CreateExerciseInput {
  name: string;
  activityKey?: string | null;
  durationMinutes: number;
  caloriesBurned: number;
  source: "estimated" | "manual";
  notes?: string | null;
  performedAt: Date;
}

export async function createExercise(
  input: CreateExerciseInput,
  userId: string,
): Promise<ExerciseEntryRow> {
  const id = crypto.randomUUID();

  await db.insert(exerciseEntries).values({
    id,
    userId,
    name: input.name,
    activityKey: input.activityKey ?? null,
    durationMinutes: input.durationMinutes,
    // Rounded on write so the stored figure matches what the user was shown.
    caloriesBurned: Math.round(input.caloriesBurned),
    source: input.source,
    notes: input.notes ?? null,
    performedAt: input.performedAt,
  });

  const created = await db.query.exerciseEntries.findFirst({
    where: eq(exerciseEntries.id, id),
  });
  if (!created) throw new Error("Exercise vanished immediately after creation");
  return created;
}

export async function listExercise(
  options: { from?: Date; to?: Date; limit?: number },
  userId: string,
): Promise<ExerciseEntryRow[]> {
  return db.query.exerciseEntries.findMany({
    where: and(
      eq(exerciseEntries.userId, userId),
      options.from ? gte(exerciseEntries.performedAt, options.from) : undefined,
      options.to ? lt(exerciseEntries.performedAt, options.to) : undefined,
    ),
    orderBy: desc(exerciseEntries.performedAt),
    limit: options.limit ?? 100,
  });
}

/** Total net calories burned in a half-open instant range. */
export async function sumExerciseCalories(
  from: Date,
  to: Date,
  userId: string,
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${exerciseEntries.caloriesBurned}), 0)`,
    })
    .from(exerciseEntries)
    .where(
      and(
        eq(exerciseEntries.userId, userId),
        gte(exerciseEntries.performedAt, from),
        lt(exerciseEntries.performedAt, to),
      ),
    );

  return Math.round(row?.total ?? 0);
}

export async function deleteExercise(
  id: string,
  userId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(exerciseEntries)
    .where(
      and(eq(exerciseEntries.id, id), eq(exerciseEntries.userId, userId)),
    )
    .returning({ id: exerciseEntries.id });

  return deleted.length > 0;
}
