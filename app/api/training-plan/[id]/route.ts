import { NextRequest } from "next/server";

import { fail, handleRouteError, ok } from "@/lib/api/response";
import { requireUserId } from "@/lib/auth/session";
import { deleteTrainingSession } from "@/lib/db/training-plan";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const userId = await requireUserId();
    const deleted = await deleteTrainingSession(params.id, userId);

    if (!deleted) return fail("not_found", "No such session.", 404);
    return ok({ id: params.id });
  } catch (error) {
    return handleRouteError(error);
  }
}
