import "server-only";

import { GoogleGenAI, type Content, type Part } from "@google/genai";

import { aiEnv } from "@/lib/env-server";
import { AiAnalysisError } from "@/lib/ai/errors";
import { mapGeminiError } from "@/lib/ai/providers/gemini";
import type { ChatProviderCall, ToolCall, Turn } from "../types";

/**
 * Gemini function calling.
 *
 * Separate from the meal-analysis provider because the two want opposite
 * things: that one pins the response to a JSON schema, which Gemini does not
 * allow alongside tools.
 */

let client: GoogleGenAI | null = null;

/**
 * Gemini treats `id` on a function call as optional and matches responses by
 * name when it is absent. The loop needs an id regardless (Claude requires
 * one), so a synthetic one is minted here and stripped again on the way back —
 * echoing an id Gemini never issued is rejected.
 */
const SYNTHETIC_ID = "auto:";

function toContents(turns: Turn[]): Content[] {
  const contents: Content[] = [];

  for (const turn of turns) {
    if (turn.role === "user") {
      contents.push({ role: "user", parts: [{ text: turn.text }] });
      continue;
    }

    if (turn.role === "assistant") {
      // Replayed verbatim when we have it: Gemini 3 rejects a function call
      // sent back without the thought signature it came with.
      if (turn.raw?.provider === "gemini") {
        contents.push(turn.raw.content as Content);
        continue;
      }

      const parts: Part[] = [];
      if (turn.text) parts.push({ text: turn.text });
      for (const call of turn.calls) {
        parts.push({
          functionCall: {
            ...(call.id.startsWith(SYNTHETIC_ID) ? {} : { id: call.id }),
            name: call.name,
            args: call.args,
          },
        });
      }
      if (parts.length > 0) contents.push({ role: "model", parts });
      continue;
    }

    contents.push({
      // Function results go back under the user role, not a "tool" role.
      role: "user",
      parts: turn.results.map((result) => ({
        functionResponse: {
          ...(result.id.startsWith(SYNTHETIC_ID) ? {} : { id: result.id }),
          name: result.name,
          response: result.output,
        },
      })),
    });
  }

  return contents;
}

export const callGeminiChat: ChatProviderCall = async ({ system, turns, tools }) => {
  // Read before the client is built: caching a client made with an empty key
  // would poison every later request in this instance.
  const apiKey = aiEnv.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiAnalysisError(
      "Jarvis isn't set up yet — GEMINI_API_KEY is missing.",
      "not_configured",
    );
  }

  const model = aiEnv.GEMINI_MODEL;
  client ??= new GoogleGenAI({ apiKey });

  try {
    const response = await client.models.generateContent({
      model,
      contents: toContents(turns),
      config: {
        systemInstruction: system,
        // Warmer than analysis: this is conversation, and identical phrasing
        // every time reads as a script rather than an assistant.
        temperature: 0.4,
        // Generous because thinking tokens count against this ceiling, and a
        // truncated turn loses the tool call along with the reply.
        maxOutputTokens: 8192,
        tools: [
          {
            functionDeclarations: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              // Plain JSON Schema, so one definition serves both providers.
              parametersJsonSchema: tool.parameters,
            })),
          },
        ],
      },
    });

    const blocked = response.promptFeedback?.blockReason;
    if (blocked) {
      throw new AiAnalysisError(
        "Gemini's safety filters declined that message.",
        "refused",
        blocked,
      );
    }

    const content = response.candidates?.[0]?.content;

    // `thought` parts carry the model's reasoning and must not be shown.
    const text = (content?.parts ?? [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();

    const calls: ToolCall[] = (response.functionCalls ?? [])
      .filter((call) => Boolean(call.name))
      .map((call, index) => ({
        id: call.id ?? `${SYNTHETIC_ID}${index}`,
        name: call.name!,
        args: (call.args ?? {}) as Record<string, unknown>,
      }));

    return {
      text,
      calls,
      ...(content ? { raw: { provider: "gemini" as const, content } } : {}),
    };
  } catch (error) {
    throw mapGeminiError(error, model);
  }
};
