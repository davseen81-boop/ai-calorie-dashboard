import { z } from "zod";

import {
  ACTIVITY_LEVELS,
  BIOLOGICAL_SEXES,
  GOAL_TYPES,
  THEMES,
} from "@/lib/db/schema";

/**
 * PATCH /api/profile
 *
 * Bounds mirror the settings sliders, so a hand-crafted request can't store a
 * goal the UI could never produce.
 */
export const updateProfileSchema = z
  .object({
    displayName: z.string().trim().max(80).nullish(),
    dailyCalorieGoal: z.number().int().min(500).max(10000).optional(),

    // Null clears an override and returns the day to following the normal
    // goal, so nullish rather than optional.
    restDayCalories: z.number().int().min(500).max(10000).nullish(),
    activeDayCalories: z.number().int().min(500).max(10000).nullish(),

    proteinPct: z.number().int().min(0).max(100).optional(),
    carbsPct: z.number().int().min(0).max(100).optional(),
    fatPct: z.number().int().min(0).max(100).optional(),
    dietaryPreferences: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    timezone: z
      .string()
      .min(1)
      .max(64)
      .refine(isValidTimeZone, "Not a recognised IANA timezone")
      .optional(),
    theme: z.enum(THEMES).optional(),

    // Body metrics for the BMR estimate. Bounds are physiological sanity
    // checks, not clinical limits — they exist so a typo can't produce a
    // nonsensical calorie target.
    sex: z.enum(BIOLOGICAL_SEXES).nullish(),
    age: z.number().int().min(13).max(120).nullish(),
    heightCm: z.number().min(90).max(250).nullish(),
    weightKg: z.number().min(25).max(400).nullish(),
    activityLevel: z.enum(ACTIVITY_LEVELS).nullish(),
    goalType: z.enum(GOAL_TYPES).nullish(),
    adjustTargetForExercise: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  })
  .refine(
    (v) => {
      // The three percentages only mean anything together, so they must be
      // sent together and must total 100 — otherwise a partial update could
      // leave a stored split that doesn't describe a whole day.
      const supplied = [v.proteinPct, v.carbsPct, v.fatPct].filter(
        (n) => n !== undefined,
      );
      if (supplied.length === 0) return true;
      if (supplied.length !== 3) return false;
      return v.proteinPct! + v.carbsPct! + v.fatPct! === 100;
    },
    {
      path: ["proteinPct"],
      message: "Send all three macro percentages together, totalling 100.",
    },
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
