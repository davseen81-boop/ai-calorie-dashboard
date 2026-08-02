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
    proteinGoalG: z.number().int().min(0).max(500).optional(),
    carbsGoalG: z.number().int().min(0).max(1000).optional(),
    fatGoalG: z.number().int().min(0).max(400).optional(),
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
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
