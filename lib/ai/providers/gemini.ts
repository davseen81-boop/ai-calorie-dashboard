import "server-only";

import { GoogleGenAI } from "@google/genai";

import { aiEnv } from "@/lib/env-server";
import { AiAnalysisError } from "../errors";
import { mealAnalysisGeminiSchema } from "../schemas";
import type { ProviderCall } from "./types";

let client: GoogleGenAI | null = null;

/**
 * The key is checked *before* the client is built, not after: the client is
 * cached for the lifetime of the process, so constructing one with an empty
 * key would poison every later request in that instance.
 */
function getClient(apiKey: string): GoogleGenAI {
  // Lazy: importing this module must not require a key, so routes that never
  // analyse a meal still load.
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

/**
 * Gemini implementation.
 *
 * `responseSchema` + a JSON mime type constrains the output to the schema, the
 * same guarantee Claude's `output_config.format` gives. Zod still re-checks the
 * values afterwards — a schema fixes shape, not sense.
 */
export const callGemini: ProviderCall = async ({ system, text, images }) => {
  // Resolved outside the try below, so a missing key surfaces as
  // `not_configured` rather than being wrapped as an upstream failure.
  const apiKey = aiEnv.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiAnalysisError(
      "AI analysis isn't set up yet — GEMINI_API_KEY is missing.",
      "not_configured",
    );
  }

  const model = aiEnv.GEMINI_MODEL;
  const ai = getClient(apiKey);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            // Images first: the model attends better when the pictures
            // precede the instruction referring to them.
            ...(images ?? []).map((image) => ({
              inlineData: { mimeType: image.mediaType, data: image.base64 },
            })),
            { text },
          ],
        },
      ],
      config: {
        systemInstruction: system,
        responseMimeType: "application/json",
        responseSchema: mealAnalysisGeminiSchema,
        // Nutrition estimation wants consistency; exactly 0 makes some models
        // repeat pathological outputs verbatim.
        temperature: 0.2,
        maxOutputTokens: 4096,
      },
    });

    const blocked = response.promptFeedback?.blockReason;
    if (blocked) {
      throw new AiAnalysisError(
        "The request was blocked by Gemini's safety filters.",
        "refused",
        blocked,
      );
    }

    return response.text ?? null;
  } catch (error) {
    throw mapGeminiError(error, model);
  }
};

/**
 * Turns whatever the SDK threw into a typed error the routes can map to a
 * status. Shared with the Jarvis chat provider so both surfaces explain a dead
 * key, an exhausted quota and a retired model the same way.
 */
export function mapGeminiError(
  error: unknown,
  model: string,
  envVar = "GEMINI_MODEL",
): AiAnalysisError {
  if (error instanceof AiAnalysisError) return error;

  const message = error instanceof Error ? error.message : String(error);

  // Free-tier keys hit quota routinely, so it gets its own wording.
  const rateLimited = /quota|rate limit|RESOURCE_EXHAUSTED|429/i.test(message);
  /**
   * Per-day and per-minute exhaustion arrive as the same 429 but need opposite
   * advice: "wait a minute" is actively misleading when the allowance is gone
   * until midnight Pacific. Google names the quota it enforced, so use it.
   */
  const dailyQuota = rateLimited && /PerDay/i.test(message);
  // Google retires models for new accounts while still listing them for
  // existing ones — without this, that reads as an unexplained outage.
  const badModel = /not found|no longer available|NOT_FOUND|404/i.test(message);
  // Popular models shed load with a 503 rather than a queue. Nothing is wrong
  // with the request, so this is the one case worth retrying.
  const overloaded =
    !rateLimited && /UNAVAILABLE|high demand|overloaded|503/i.test(message);

  return new AiAnalysisError(
    dailyQuota
      ? `Today's free Gemini allowance for "${model}" is used up. It resets at ` +
        `midnight Pacific time — or switch ${envVar} to a model with a larger ` +
        `free tier, or enable billing on the key.`
      : rateLimited
        ? "Gemini's rate limit was hit. Wait a minute and try again."
        : badModel
          ? `Gemini rejected the model "${model}". Set ${envVar} to one your account can use.`
          : overloaded
            ? "Gemini is busy right now. Give it a moment and try again."
            : "Could not reach Gemini.",
    "upstream_error",
    message,
    overloaded,
  );
}
