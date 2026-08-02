import { NextRequest } from "next/server";

import { fail, handleRouteError, ok } from "@/lib/api/response";
import { deleteRoutine, getRoutineById, updateRoutine } from "@/lib/db/routines";
import { updateRoutineSchema } from "@/lib/validation/routines";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: { id: string };
}

/** GET /api/routines/[id] */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const routine = await getRoutineById(params.id);
    if (!routine) return fail("not_found", "Routine not found.", 404);
    return ok(routine);
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/routines/[id]
 *
 * Supplying `meals` replaces the whole list; `schedule: null` clears the
 * schedule, while omitting it leaves the schedule alone.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const body: unknown = await request.json();
    const input = updateRoutineSchema.parse(body);

    const routine = await updateRoutine(params.id, {
      name: input.name,
      isFavorite: input.isFavorite,
      meals: input.meals?.map((meal) => ({
        name: meal.name,
        mealType: meal.mealType,
        timeOfDay: meal.timeOfDay ?? null,
        items: meal.items,
      })),
      // Distinguish "not provided" from "explicitly cleared".
      schedule: "schedule" in input ? (input.schedule ?? null) : undefined,
    });

    if (!routine) return fail("not_found", "Routine not found.", 404);
    return ok(routine);
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE /api/routines/[id] — meals already logged from it are kept. */
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const deleted = await deleteRoutine(params.id);
    if (!deleted) return fail("not_found", "Routine not found.", 404);
    return ok({ id: params.id, deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
