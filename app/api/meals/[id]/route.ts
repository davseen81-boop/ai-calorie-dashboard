import { NextRequest } from "next/server";

import { fail, handleRouteError, ok } from "@/lib/api/response";
import { deleteMeal, getMealById, updateMeal } from "@/lib/db/queries";
import { updateMealSchema } from "@/lib/validation/meals";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

/** GET /api/meals/[id] */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const meal = await getMealById(params.id);
    if (!meal) return fail("not_found", "Meal not found.", 404);
    return ok(meal);
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/meals/[id]
 *
 * Supplying `items` replaces the whole list and re-derives the totals.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const body: unknown = await request.json();
    const input = updateMealSchema.parse(body);

    const meal = await updateMeal(params.id, {
      name: input.name,
      mealType: input.mealType,
      notes: input.notes,
      loggedAt: input.loggedAt,
      items: input.items?.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
      })),
    });

    if (!meal) return fail("not_found", "Meal not found.", 404);
    return ok(meal);
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/meals/[id] — items cascade. */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const deleted = await deleteMeal(params.id);
    if (!deleted) return fail("not_found", "Meal not found.", 404);
    return ok({ id: params.id, deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
