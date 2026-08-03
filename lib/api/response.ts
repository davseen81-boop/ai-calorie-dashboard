import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { AiAnalysisError } from "@/lib/ai/errors";
import { UnauthorizedError } from "@/lib/auth/session";

/**
 * One response envelope for every route: `{ data }` on success,
 * `{ error: { code, message, details? } }` on failure. A single shape means the
 * client has one place to branch, and React Query error handling stays uniform.
 */

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "validation_failed"
  | "ai_invalid_response"
  | "ai_not_food"
  | "ai_not_configured"
  | "ai_refused"
  | "ai_upstream_error"
  | "payload_too_large"
  | "internal_error";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

export type ApiResponse<T> = { data: T } | { error: ApiError };

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, init);
}

export function fail(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

/**
 * Converts a thrown error into a response.
 *
 * Deliberately never forwards an unknown error's message to the client — an
 * unexpected throw can carry a connection string or file path. Those are logged
 * server-side and replaced with a generic message.
 */
export function handleRouteError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return fail("unauthorized", error.message, 401);
  }

  if (error instanceof ZodError) {
    return fail(
      "validation_failed",
      "The request body was not valid.",
      422,
      error.issues,
    );
  }

  if (error instanceof AiAnalysisError) {
    switch (error.code) {
      case "not_food":
        return fail("ai_not_food", error.message, 422);
      case "not_configured":
        // 503 rather than 500: the service is unavailable but the request was
        // fine, and the message tells the operator exactly what to do.
        return fail("ai_not_configured", error.message, 503);
      case "refused":
        // Safety classifiers declined. Vanishingly unlikely for food, but it
        // arrives as a normal 200 so it must be handled rather than crash.
        return fail("ai_refused", error.message, 422);
      case "invalid_response":
      case "empty_result":
        return fail("ai_invalid_response", error.message, 502, error.details);
      case "upstream_error":
        // The user gets a short message; the operator needs the provider's
        // actual response, which is the only thing that distinguishes a quota
        // from an outage from a malformed request.
        console.error("AI upstream error:", error.message, error.details);
        return fail("ai_upstream_error", error.message, 503);
    }
  }

  console.error("Unhandled route error:", error);
  return fail("internal_error", "Something went wrong.", 500);
}
