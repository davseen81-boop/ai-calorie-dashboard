import { NextRequest } from "next/server";

import { handleRouteError, ok } from "@/lib/api/response";
import { requireUserId } from "@/lib/auth/session";
import { runJarvis } from "@/lib/jarvis/agent";
import { jarvisRequestSchema } from "@/lib/validation/jarvis";

export const dynamic = "force-dynamic";

/**
 * POST /api/jarvis
 *
 * One conversational turn. The client holds the transcript and replays it, so
 * the server stays stateless and no chat history is persisted anywhere.
 *
 * `maxDuration` is raised because a turn can chain several tool calls, each of
 * which is a model round trip — the platform's default would cut a legitimate
 * multi-step answer short.
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body: unknown = await request.json();
    const { messages } = jarvisRequestSchema.parse(body);

    return ok(await runJarvis({ messages, userId }));
  } catch (error) {
    return handleRouteError(error);
  }
}
