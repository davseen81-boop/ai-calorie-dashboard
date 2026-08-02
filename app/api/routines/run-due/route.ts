import { handleRouteError, ok } from "@/lib/api/response";
import { runDueSchedules } from "@/lib/db/routines";

export const dynamic = "force-dynamic";

/**
 * POST /api/routines/run-due
 *
 * Applies any schedule whose time has passed today and hasn't already run.
 * Idempotent — safe to call on every app load, and safe to call concurrently.
 */
export async function POST() {
  try {
    return ok(await runDueSchedules());
  } catch (error) {
    return handleRouteError(error);
  }
}
