import "server-only";

import { aiEnv } from "@/lib/env-server";
import { AiAnalysisError } from "./errors";
import { mealAnalysisSchema, type MealAnalysis } from "./schemas";
import {
  TEXT_ANALYSIS_PROMPT,
  VISION_ANALYSIS_PROMPT,
  buildUserContext,
} from "./prompts";
import { callGemini } from "./providers/gemini";
import { callAnthropic } from "./providers/anthropic";
import type { ProviderCall, ProviderRequest } from "./providers/types";

export { AiAnalysisError };

/**
 * Provider dispatch.
 *
 * The prompts, schema, validation and error handling are shared — swapping
 * providers is one env var, not a code change.
 */
function getProvider(): ProviderCall {
  return aiEnv.AI_PROVIDER === "anthropic" ? callAnthropic : callGemini;
}

export interface AnalyzeContext {
  dietaryPreferences: string[];
  mealTypeHint?: string;
  localTime?: string;
}

/**
 * Shared post-processing.
 *
 * A response schema makes the JSON well-formed, but the content still has to
 * be checked: Zod catches out-of-range numbers, and `is_food: false` is a
 * successful call the caller must still treat as a failure to log.
 */
function parseAnalysis(raw: string | null | undefined): MealAnalysis {
  if (!raw) {
    throw new AiAnalysisError("Model returned an empty response", "empty_result");
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AiAnalysisError(
      "Model returned text that is not valid JSON",
      "invalid_response",
      raw.slice(0, 500),
    );
  }

  const parsed = mealAnalysisSchema.safeParse(json);
  if (!parsed.success) {
    throw new AiAnalysisError(
      "Model response did not match the expected schema",
      "invalid_response",
      parsed.error.issues,
    );
  }

  if (!parsed.data.is_food) {
    throw new AiAnalysisError(
      parsed.data.notes || "That does not look like food.",
      "not_food",
    );
  }

  if (parsed.data.items.length === 0) {
    throw new AiAnalysisError("No foods could be identified.", "empty_result");
  }

  return parsed.data;
}

/** Estimate nutrition from a written description. */
export async function analyzeMealText(
  description: string,
  context: AnalyzeContext,
): Promise<MealAnalysis> {
  const userContext = buildUserContext(context);

  const request: ProviderRequest = {
    system: userContext
      ? `${TEXT_ANALYSIS_PROMPT}\n\n${userContext}`
      : TEXT_ANALYSIS_PROMPT,
    text: description,
  };

  return parseAnalysis(await getProvider()(request));
}

/** Media types every supported provider accepts. */
const ALLOWED_IMAGE_TYPES = ["jpeg", "png", "gif", "webp"] as const;

/**
 * Split a `data:image/png;base64,…` URL into its parts.
 *
 * The route has already validated the shape, so a failure here means the
 * contract between validation and this function drifted.
 */
function parseImageDataUrl(dataUrl: string): {
  mediaType: string;
  base64: string;
} {
  const match = /^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new AiAnalysisError(
      "Image must be a base64 data URL.",
      "invalid_response",
    );
  }

  const [, subtype, base64] = match;
  // `image/jpg` is a common but non-standard spelling that APIs reject.
  const normalised = subtype === "jpg" ? "jpeg" : subtype;
  const mediaType = ALLOWED_IMAGE_TYPES.includes(
    normalised as (typeof ALLOWED_IMAGE_TYPES)[number],
  )
    ? `image/${normalised}`
    : "image/jpeg";

  return { mediaType, base64 };
}

/**
 * Estimate nutrition from a photo.
 *
 * `imageDataUrl` must be a full data URL — the route validates the prefix and
 * size before this is called. The image is never persisted.
 */
export async function analyzeMealPhoto(
  imageDataUrl: string,
  context: AnalyzeContext & { caption?: string },
): Promise<MealAnalysis> {
  const userContext = buildUserContext(context);
  const image = parseImageDataUrl(imageDataUrl);

  const request: ProviderRequest = {
    system: userContext
      ? `${VISION_ANALYSIS_PROMPT}\n\n${userContext}`
      : VISION_ANALYSIS_PROMPT,
    text: context.caption?.trim()
      ? `Analyse this meal. The user adds: ${context.caption.trim()}`
      : "Analyse this meal photo.",
    image,
  };

  return parseAnalysis(await getProvider()(request));
}
