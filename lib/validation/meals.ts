import { z } from "zod";

import { MEAL_TYPES, MEAL_SOURCES } from "@/lib/db/schema";

/** Request-body schemas for the meal routes. */

/**
 * Deliberately below the hosting platform's request-body limit (4.5MB on
 * Vercel). Anything larger is rejected by the platform *before* this code
 * runs, producing an opaque 413 the client can't explain — so the cap here
 * has to leave headroom rather than match it.
 *
 * The client compresses to well under this; the limit is a backstop.
 */
const MAX_IMAGE_DATA_URL_CHARS = 3_500_000;

const dataUrlSchema = z
  .string()
  .max(
    MAX_IMAGE_DATA_URL_CHARS,
    "That image is too large even after compression. Try a smaller photo.",
  )
  .regex(
    /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/,
    "Expected a base64 data URL for a JPEG, PNG, WebP or GIF image.",
  );

/**
 * POST /api/meals/analyze
 *
 * A discriminated union rather than optional fields, so "text mode with no
 * text" and "photo mode with no image" are unrepresentable.
 */
export const analyzeRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("text"),
    description: z
      .string()
      .trim()
      .min(2, "Describe what you ate.")
      .max(2000, "That description is too long."),
    mealTypeHint: z.enum(MEAL_TYPES).optional(),
  }),
  z.object({
    mode: z.literal("photo"),
    image: dataUrlSchema,
    caption: z.string().trim().max(500).optional(),
    mealTypeHint: z.enum(MEAL_TYPES).optional(),
  }),
]);

export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

/** A single food row, after the user has had a chance to correct it. */
export const mealItemInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(1000),
  unit: z.string().trim().min(1).max(40),
  calories: z.number().min(0).max(10000),
  proteinG: z.number().min(0).max(1000),
  carbsG: z.number().min(0).max(1000),
  fatG: z.number().min(0).max(1000),
});

/** POST /api/meals */
export const createMealSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mealType: z.enum(MEAL_TYPES),
  source: z.enum(MEAL_SOURCES).default("manual"),
  rawInput: z.string().max(2000).nullish(),
  notes: z.string().max(500).nullish(),
  aiConfidence: z.number().min(0).max(1).nullish(),
  /** ISO 8601. Defaults to now when the client does not say. */
  loggedAt: z.coerce.date().optional(),
  items: z
    .array(mealItemInputSchema)
    .min(1, "A meal needs at least one item.")
    .max(30),
});

export type CreateMealInput = z.infer<typeof createMealSchema>;

/**
 * PATCH /api/meals/[id]
 *
 * Every field optional, but at least one must be present — an empty patch is
 * almost always a client bug, and silently succeeding hides it.
 */
export const updateMealSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    mealType: z.enum(MEAL_TYPES).optional(),
    notes: z.string().max(500).nullish(),
    loggedAt: z.coerce.date().optional(),
    /** When present, replaces the item list wholesale. */
    items: z.array(mealItemInputSchema).min(1).max(30).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });

export type UpdateMealInput = z.infer<typeof updateMealSchema>;

/** GET /api/meals query parameters. */
export const listMealsQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().trim().max(120).optional(),
  mealType: z.enum(MEAL_TYPES).optional(),
});
