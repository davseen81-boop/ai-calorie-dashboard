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
    readonly code: ApiError["code"] | "network_error" | "timeout",
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/**
 * Default request timeout.
 *
 * Without one, a hung upstream leaves the UI spinning indefinitely with no way
 * out. Vision calls are the slow case, so this is generous rather than tight —
 * see `timeoutMs` for per-call overrides.
 */
const DEFAULT_TIMEOUT_MS = 90_000;

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
}

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  let response: Response;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  try {
    response = await fetch(path, {
      ...init,
      signal: controller.signal,
      headers: {
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    // An abort is our own timeout firing, not a connectivity problem — saying
    // "check your connection" there would send the user down a dead end.
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiRequestError(
        "That took too long and was cancelled. Try again, or enter the meal manually.",
        "timeout",
        0,
      );
    }
    // Offline, DNS failure, or the dev server restarting mid-request.
    throw new ApiRequestError(
      "Could not reach the server. Check your connection.",
      "network_error",
      0,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timeout);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON body means the request never reached the app — a platform
    // error page, a proxy, or a crash. 413 is the one worth naming: the
    // hosting platform rejects oversized bodies itself, with plain text.
    if (response.status === 413) {
      throw new ApiRequestError(
        "That upload was too large to send. Try a smaller photo.",
        "payload_too_large",
        413,
      );
    }
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
  post: <T>(path: string, body: unknown, options?: { timeoutMs?: number }) =>
    request<T>(path, {
      method: "POST",
      body: JSON.stringify(body),
      ...options,
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
