import { z } from "zod";

import { MEAL_TYPES } from "@/lib/db/schema";

/**
 * The contract between the model and the app.
 *
 * Defined twice, deliberately:
 *  - `mealAnalysisJsonSchema` is sent to Claude via `output_config.format`,
 *    which makes the model's JSON syntactically valid by construction.
 *  - `mealAnalysisSchema` (Zod) re-validates the parsed result.
 *
 * The second check is not redundant. Structured Outputs guarantee *shape*, not
 * *sense* — a model can still return a negative calorie count or a confidence
 * of 7. Zod is where those get rejected.
 */

export const analyzedItemSchema = z.object({
  name: z.string().min(1).max(120),
  /** Number of `unit`s, e.g. 2 (slices). */
  quantity: z.number().positive().max(1000),
  /** Free text: 'g', 'slice', 'cup', 'serving'… */
  unit: z.string().min(1).max(40),
  calories: z.number().min(0).max(10000),
  protein_g: z.number().min(0).max(1000),
  carbs_g: z.number().min(0).max(1000),
  fat_g: z.number().min(0).max(1000),
});

export const mealAnalysisSchema = z.object({
  /** False when the input does not describe or depict food at all. */
  is_food: z.boolean(),
  meal_name: z.string().min(1).max(120),
  meal_type: z.enum(MEAL_TYPES),
  /** The model's own confidence, 0..1. Surfaced as a badge in the UI. */
  confidence: z.number().min(0).max(1),
  items: z.array(analyzedItemSchema).max(30),
  /** Caveats worth showing the user, or '' when there are none. */
  notes: z.string().max(500),
});

export type AnalyzedItem = z.infer<typeof analyzedItemSchema>;
export type MealAnalysis = z.infer<typeof mealAnalysisSchema>;

/**
 * JSON Schema mirror of the above, for Claude's structured outputs.
 *
 * Hand-written rather than derived from the Zod schema: the generated
 * converters couple us to a specific zod major version, and the API rejects
 * most of what they emit anyway. Every object needs `additionalProperties:
 * false` and a complete `required` list, and numeric/string constraints
 * (`minimum`, `maxLength`, …) are not supported — optionality is expressed by
 * allowing an empty value, not by omitting a key. Range checking is Zod's job.
 */
export const mealAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["is_food", "meal_name", "meal_type", "confidence", "items", "notes"],
  properties: {
    is_food: {
      type: "boolean",
      description: "false if the input is not food (e.g. a photo of a car)",
    },
    meal_name: {
      type: "string",
      description: "Short human label for the whole meal, e.g. 'Chicken salad'",
    },
    meal_type: {
      type: "string",
      enum: [...MEAL_TYPES],
    },
    confidence: {
      type: "number",
      description: "0 to 1. Lower it when portion sizes are ambiguous.",
    },
    items: {
      type: "array",
      description: "One entry per distinct food. Empty when is_food is false.",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "name",
          "quantity",
          "unit",
          "calories",
          "protein_g",
          "carbs_g",
          "fat_g",
        ],
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", description: "g, ml, slice, cup, serving…" },
          calories: { type: "number", description: "kcal for the full quantity" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
        },
      },
    },
    notes: {
      type: "string",
      description: "Assumptions or caveats. Empty string when none.",
    },
  },
} as const;
