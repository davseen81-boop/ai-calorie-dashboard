import { NextRequest } from "next/server";

import { analyzeMealPhotos, analyzeMealText } from "@/lib/ai/analyze";
import { handleRouteError, ok } from "@/lib/api/response";
import { getOrCreateProfile } from "@/lib/db/queries";
import { requireUserId } from "@/lib/auth/session";
import { localTimeLabel } from "@/lib/date";
import { analyzeRequestSchema } from "@/lib/validation/meals";

/**
 * POST /api/meals/analyze
 *
 * Estimates nutrition from text or a photo. Analysis only — nothing is written
 * to the database, and uploaded images are discarded once the model has seen
 * them. The client shows the result for correction, then POSTs to /api/meals.
 */

// Vision calls routinely take 15-30s; the platform default would cut them off.
export const maxDuration = 60;
// The route reads the profile, so it can never be statically rendered.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const input = analyzeRequestSchema.parse(body);

    const userId = await requireUserId();
    const profile = await getOrCreateProfile(userId);
    const context = {
      dietaryPreferences: parseDietaryPreferences(profile.dietaryPreferences),
      mealTypeHint: input.mealTypeHint,
      localTime: localTimeLabel(profile.timezone),
    };

    const analysis =
      input.mode === "text"
        ? await analyzeMealText(input.description, context)
        : await analyzeMealPhotos(input.images, {
            ...context,
            caption: input.caption,
          });

    // Reshaped from the model's snake_case into the app's camelCase so the
    // client never sees two naming conventions.
    return ok({
      name: analysis.meal_name,
      mealType: analysis.meal_type,
      confidence: analysis.confidence,
      notes: analysis.notes || null,
      items: analysis.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: Math.round(item.calories),
        proteinG: round1(item.protein_g),
        carbsG: round1(item.carbs_g),
        fatG: round1(item.fat_g),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** Stored as a JSON string because SQLite has no array type. */
function parseDietaryPreferences(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
