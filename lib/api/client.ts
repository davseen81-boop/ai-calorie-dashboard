import type { ApiError } from "./response";

/**
 * Typed fetch wrapper for the app's own API.
 *
 * Every route answers with `{ data }` or `{ error }`, so unwrapping and error
 * handling belong in one place rather than in each React Query hook.
 */

/** Carries the server's error code so the UI can branch on it, not on prose. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly code: ApiError["code"] | "network_error",
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    // Offline, DNS failure, or the dev server restarting mid-request.
    throw new ApiRequestError(
      "Could not reach the server. Check your connection.",
      "network_error",
      0,
      error instanceof Error ? error.message : String(error),
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON body means something upstream failed (proxy, crash) — the
    // status code is the only signal available.
    throw new ApiRequestError(
      `Unexpected response from the server (${response.status}).`,
      "internal_error",
      response.status,
    );
  }

  if (!response.ok) {
    const error = (payload as { error?: ApiError }).error;
    throw new ApiRequestError(
      error?.message ?? `Request failed (${response.status}).`,
      error?.code ?? "internal_error",
      response.status,
      error?.details,
    );
  }

  return (payload as { data: T }).data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
