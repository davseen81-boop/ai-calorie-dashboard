import { NextRequest } from "next/server";

import { fail, handleRouteError, ok } from "@/lib/api/response";
import { applyRoutine } from "@/lib/db/routines";
import { applyRoutineSchema } from "@/lib/validation/routines";

export const dynamic = "force-dynamic";

/**
 * POST /api/routines/[id]/apply
 *
 * Logs the routine's meals as real meals. They are ordinary meals afterwards —
 * editable and deletable like any other, with no lingering link to the routine.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    // An empty body is normal here ("log it now"), so a parse failure just
    // means "no options given" rather than a bad request.
    const body: unknown = await request.json().catch(() => ({}));
    const { at } = applyRoutineSchema.parse(body);

    const result = await applyRoutine(params.id, { at });
    if (!result) return fail("not_found", "Routine not found.", 404);

    return ok(
      {
        routine: result.routine,
        mealIds: result.mealIds,
        mealCount: result.mealIds.length,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
