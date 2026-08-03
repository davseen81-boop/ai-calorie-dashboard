import { NextRequest } from "next/server";

import { fail, handleRouteError, ok } from "@/lib/api/response";
import { requireUserId } from "@/lib/auth/session";
import { deleteExercise } from "@/lib/db/exercise";

export const dynamic = "force-dynamic";

/** DELETE /api/exercise/[id] */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userId = await requireUserId();
    const deleted = await deleteExercise(params.id, userId);
    if (!deleted) return fail("not_found", "Exercise not found.", 404);
    return ok({ id: params.id, deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
