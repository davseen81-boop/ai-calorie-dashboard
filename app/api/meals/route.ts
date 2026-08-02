import { NextRequest } from "next/server";

import { handleRouteError, ok } from "@/lib/api/response";
import { createMeal, listMeals } from "@/lib/db/queries";
import { requireUserId } from "@/lib/auth/session";
import { createMealSchema, listMealsQuerySchema } from "@/lib/validation/meals";

export const dynamic = "force-dynamic";

/**
 * GET /api/meals
 *
 * Filterable meal list, newest first. Backs the history page.
 * Query: from, to (ISO), limit, offset, search, mealType.
 */
export async function GET(request: NextRequest) {
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams);
    const query = listMealsQuerySchema.parse(params);

    const userId = await requireUserId();
    const meals = await listMeals(query, userId);

    return ok({
      meals,
      // `hasMore` avoids a second count query; the client only needs to know
      // whether to offer another page.
      hasMore: meals.length === query.limit,
      limit: query.limit,
      offset: query.offset,
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/meals
 *
 * Persists a meal and its items. Totals are derived server-side from the items
 * rather than trusted from the client, so a stale or tampered total cannot
 * disagree with the rows it is supposed to summarise.
 */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const input = createMealSchema.parse(body);

    const userId = await requireUserId();
    const meal = await createMeal({
      name: input.name,
      mealType: input.mealType,
      source: input.source,
      rawInput: input.rawInput ?? null,
      notes: input.notes ?? null,
      aiConfidence: input.aiConfidence ?? null,
      loggedAt: input.loggedAt ?? new Date(),
      items: input.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
      })),
    }, userId);

    return ok(meal, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
