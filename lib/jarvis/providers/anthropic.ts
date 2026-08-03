import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { aiEnv } from "@/lib/env-server";
import { AiAnalysisError } from "@/lib/ai/errors";
import type { ChatProviderCall, ToolCall, Turn } from "../types";

/**
 * Claude tool use, kept so `AI_PROVIDER` still switches the whole app rather
 * than most of it.
 */

let client: Anthropic | null = null;

function toMessages(turns: Turn[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];

  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
      continue;
    }

    if (turn.role === "assistant") {
      // Replayed verbatim when we have it — a tool_use block sent back without
      // the thinking block it arrived with is rejected.
      if (turn.raw?.provider === "anthropic") {
        messages.push({
          role: "assistant",
          content: turn.raw.content as Anthropic.ContentBlockParam[],
        });
        continue;
      }

      const content: Anthropic.ContentBlockParam[] = [];
      if (turn.text) content.push({ type: "text", text: turn.text });
      for (const call of turn.calls) {
        content.push({
          type: "tool_use",
          id: call.id,
          name: call.name,
          input: call.args,
        });
      }
      if (content.length > 0) messages.push({ role: "assistant", content });
      continue;
    }

    messages.push({
      role: "user",
      content: turn.results.map((result) => ({
        type: "tool_result" as const,
        tool_use_id: result.id,
        content: JSON.stringify(result.output),
      })),
    });
  }

  return messages;
}

export const callAnthropicChat: ChatProviderCall = async ({ system, turns, tools }) => {
  const apiKey = aiEnv.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiAnalysisError(
      "Jarvis isn't set up yet — ANTHROPIC_API_KEY is missing.",
      "not_configured",
    );
  }

  client ??= new Anthropic({ apiKey });

  let message: Anthropic.Message;
  try {
    message = await client.messages.create({
      model: aiEnv.ANTHROPIC_MODEL,
      max_tokens: 4096,
      system,
      messages: toMessages(turns),
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool["input_schema"],
      })),
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

  // Classifiers decline with a normal 200, so this is checked before content.
  if (message.stop_reason === "refusal") {
    throw new AiAnalysisError(
      "That message was declined by Anthropic's safety systems.",
      "refused",
      message.stop_details,
    );
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  const calls: ToolCall[] = message.content
    .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
    .map((block) => ({
      id: block.id,
      name: block.name,
      args: (block.input ?? {}) as Record<string, unknown>,
    }));

  return {
    text,
    calls,
    raw: { provider: "anthropic", content: message.content },
  };
};
