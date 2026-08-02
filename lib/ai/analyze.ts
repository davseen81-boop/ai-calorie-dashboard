import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { aiEnv } from "@/lib/env-server";
import {
  mealAnalysisJsonSchema,
  mealAnalysisSchema,
  type MealAnalysis,
} from "./schemas";
import {
  TEXT_ANALYSIS_PROMPT,
  VISION_ANALYSIS_PROMPT,
  buildUserContext,
} from "./prompts";

/** Distinguishes "the model misbehaved" from "the network broke". */
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

let client: Anthropic | null = null;

interface AiConfig {
  apiKey: string;
  model: string;
}

/**
 * Read the Anthropic settings, converting a missing key into a typed error.
 *
 * Must be called inside the caller's try block: reading `aiEnv` triggers
 * validation, and an unconverted throw here would surface to the user as a
 * generic 500 instead of "AI analysis is not configured".
 */
function getAiConfig(): AiConfig {
  try {
    return { apiKey: aiEnv.ANTHROPIC_API_KEY, model: aiEnv.ANTHROPIC_MODEL };
  } catch (error) {
    throw new AiAnalysisError(
      "AI analysis is not configured. Add ANTHROPIC_API_KEY to .env.local and restart the server.",
      "not_configured",
      error instanceof Error ? error.message : undefined,
    );
  }
}

function getClient(apiKey: string): Anthropic {
  // Lazy so that importing this module does not require ANTHROPIC_API_KEY —
  // routes that never analyse a meal should not fail to load.
  client ??= new Anthropic({ apiKey });
  return client;
}

export interface AnalyzeContext {
  dietaryPreferences: string[];
  mealTypeHint?: string;
  localTime?: string;
}

/**
 * Shared post-processing for both modes.
 *
 * Structured outputs make the JSON well-formed, but the content still has to be
 * checked: Zod catches out-of-range numbers, and `is_food: false` is a
 * successful call that the caller must still treat as a failure to log.
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

/**
 * Effort tuning.
 *
 * Claude Opus 5 performs strongly at low effort, and both modes are scoped
 * extraction tasks rather than open-ended reasoning. Photo analysis gets a step
 * up because judging portion size from visual references is the harder half.
 *
 * Thinking is deliberately left at its default (on): disabling it on this model
 * is the more expensive lever, and low effort already provides the saving.
 */
const TEXT_EFFORT = "low" as const;
const VISION_EFFORT = "medium" as const;

/** Wraps SDK failures so callers see one error type. */
async function callModel(
  config: AiConfig,
  effort: "low" | "medium" | "high",
  system: string,
  content: Anthropic.ContentBlockParam[],
): Promise<string | null> {
  let message: Anthropic.Message;

  try {
    message = await getClient(config.apiKey).messages.create({
      model: config.model,
      // Generous because `max_tokens` caps thinking *plus* the response text;
      // the JSON itself is small, but a tight cap would truncate mid-object.
      max_tokens: 16000,
      system,
      messages: [{ role: "user", content }],
      output_config: {
        effort,
        // Constrains the response to the schema, so the JSON is well-formed by
        // construction. Zod still re-checks the values — see ./schemas.ts.
        format: { type: "json_schema", schema: mealAnalysisJsonSchema },
      },
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      throw new AiAnalysisError(
        error.status === 429
          ? "Rate limited by Anthropic. Try again in a moment."
          : `Anthropic request failed (${error.status ?? "network"}).`,
        "upstream_error",
        error.message,
      );
    }
    throw new AiAnalysisError(
      "Could not reach Anthropic.",
      "upstream_error",
      error instanceof Error ? error.message : String(error),
    );
  }

  // Safety classifiers can decline a request; that arrives as a normal 200
  // with an empty or partial `content`, so it must be checked before reading.
  if (message.stop_reason === "refusal") {
    throw new AiAnalysisError(
      "The request was declined by Anthropic's safety systems.",
      "refused",
      message.stop_details,
    );
  }

  if (message.stop_reason === "max_tokens") {
    throw new AiAnalysisError(
      "The analysis was cut off before it finished.",
      "invalid_response",
    );
  }

  // `content` is a union of block types; only text carries the JSON.
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return text || null;
}

/** Estimate nutrition from a written description. */
export async function analyzeMealText(
  description: string,
  context: AnalyzeContext,
): Promise<MealAnalysis> {
  const config = getAiConfig();
  const userContext = buildUserContext(context);

  const raw = await callModel(
    config,
    TEXT_EFFORT,
    userContext
      ? `${TEXT_ANALYSIS_PROMPT}\n\n${userContext}`
      : TEXT_ANALYSIS_PROMPT,
    [{ type: "text", text: description }],
  );

  return parseAnalysis(raw);
}

/** Media types Claude accepts for image blocks. */
type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/**
 * Split a `data:image/png;base64,…` URL into the parts the API wants.
 *
 * The route has already validated the shape, so a failure here means the
 * contract between validation and this function drifted.
 */
function parseImageDataUrl(dataUrl: string): {
  mediaType: ImageMediaType;
  data: string;
} {
  const match = /^data:image\/(jpeg|jpg|png|webp|gif);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    throw new AiAnalysisError(
      "Image must be a base64 data URL.",
      "invalid_response",
    );
  }

  const [, subtype, data] = match;
  // `image/jpg` is a common but non-standard spelling the API rejects.
  const mediaType = (subtype === "jpg" ? "jpeg" : subtype) as
    | "jpeg"
    | "png"
    | "webp"
    | "gif";

  return { mediaType: `image/${mediaType}`, data };
}

/**
 * Estimate nutrition from a photo.
 *
 * `imageDataUrl` must be a full data URL — the route validates the prefix and
 * size before this is called.
 */
export async function analyzeMealPhoto(
  imageDataUrl: string,
  context: AnalyzeContext & { caption?: string },
): Promise<MealAnalysis> {
  const config = getAiConfig();
  const userContext = buildUserContext(context);
  const { mediaType, data } = parseImageDataUrl(imageDataUrl);

  const raw = await callModel(
    config,
    VISION_EFFORT,
    userContext
      ? `${VISION_ANALYSIS_PROMPT}\n\n${userContext}`
      : VISION_ANALYSIS_PROMPT,
    [
      // Image first: the model attends better when the picture precedes the
      // instruction that refers to it.
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data },
      },
      {
        type: "text",
        text: context.caption?.trim()
          ? `Analyse this meal. The user adds: ${context.caption.trim()}`
          : "Analyse this meal photo.",
      },
    ],
  );

  return parseAnalysis(raw);
}
