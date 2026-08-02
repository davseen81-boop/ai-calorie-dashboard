/**
 * Distinguishes "the model misbehaved" from "the network broke" from "nobody
 * configured a key". Shared by every provider so route handlers map one error
 * type to HTTP status regardless of which AI is in use.
 */
export class AiAnalysisError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_response"
      | "upstream_error"
      | "not_configured"
      | "refused"
      | "not_food"
      | "empty_result",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "AiAnalysisError";
  }
}
