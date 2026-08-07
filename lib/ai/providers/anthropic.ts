import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { aiEnv } from "@/lib/env-server";
import { AiAnalysisError } from "../errors";
import { mealAnalysisJsonSchema } from "../schemas";
import type { ProviderCall } from "./types";

let client: Anthropic | null = null;

/**
 * Claude implementation, kept so the provider can be switched back with a
 * single env var. `output_config.format` constrains the response to the
 * schema; Zod still re-checks the values.
 */
export const callAnthropic: ProviderCall = async ({ system, text, images }) => {
  const apiKey = aiEnv.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiAnalysisError(
      "AI analysis isn't set up yet — ANTHROPIC_API_KEY is missing.",
      "not_configured",
    );
  }

  client ??= new Anthropic({ apiKey });

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: aiEnv.ANTHROPIC_MODEL,
      // Generous because max_tokens caps thinking *plus* the response text.
      max_tokens: 16000,
      system,
      messages: [
        {
          role: "user",
          content: [
            ...((images ?? []).map((image) => ({
              type: "image",
              source: {
                type: "base64",
                media_type:
                  image.mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
                data: image.base64,
              },
            })) satisfies Anthropic.ContentBlockParam[]),
            { type: "text", text },
          ],
        },
      ],
      output_config: {
        effort: images?.length ? "medium" : "low",
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

  // Classifiers decline with a normal 200, so this must be checked before
  // reading content.
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

  const out = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");

  return out || null;
};
