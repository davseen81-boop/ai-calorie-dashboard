import { NextRequest } from "next/server";

import { handleRouteError, ok } from "@/lib/api/response";
import { createRoutine, listRoutines } from "@/lib/db/routines";
import { requireUserId } from "@/lib/auth/session";
import { createRoutineSchema } from "@/lib/validation/routines";

export const dynamic = "force-dynamic";

/** GET /api/routines — favourites first, then most-used. */
export async function GET() {
  try {
    const userId = await requireUserId();
    return ok({ routines: await listRoutines(userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST /api/routines — save a reusable meal or day template. */
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    const input = createRoutineSchema.parse(body);

    const userId = await requireUserId();
    const routine = await createRoutine({
      name: input.name,
      kind: input.kind,
      isFavorite: input.isFavorite,
      meals: input.meals.map((meal) => ({
        name: meal.name,
        mealType: meal.mealType,
        timeOfDay: meal.timeOfDay ?? null,
        items: meal.items,
      })),
      schedule: input.schedule ?? null,
    }, userId);

    return ok(routine, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
