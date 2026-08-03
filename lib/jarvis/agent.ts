import "server-only";

import { aiEnv } from "@/lib/env-server";
import { AiAnalysisError } from "@/lib/ai/errors";
import { getOrCreateProfile } from "@/lib/db/queries";
import { buildJarvisPrompt } from "./prompt";
import { callGeminiChat } from "./providers/gemini";
import { callAnthropicChat } from "./providers/anthropic";
import {
  TOOL_SPECS,
  executeTool,
  todaySnapshot,
  type ToolContext,
} from "./tools";
import type {
  ChatProviderCall,
  JarvisAction,
  JarvisMessage,
  JarvisResult,
  ToolResult,
  Turn,
} from "./types";

/**
 * The agent loop.
 *
 * Provider-neutral: it speaks in `Turn`s and lets the provider translate, so
 * switching `AI_PROVIDER` swaps one import rather than rewriting the loop.
 */

function getProvider(): ChatProviderCall {
  return aiEnv.AI_PROVIDER === "anthropic" ? callAnthropicChat : callGeminiChat;
}

/**
 * How many times the model may call tools before it has to answer.
 *
 * A realistic chain is short — list_routines, apply_routine, get_today is
 * three. Six leaves room for a retry after a rejected argument without letting
 * a confused model bill the user for an unbounded loop.
 */
const MAX_ROUNDS = 6;

/** Belt and braces: caps total work even if each round asks for many calls. */
const MAX_TOOL_CALLS = 15;

/** The database stores preferences as a JSON string; a corrupt value is not
 *  worth failing a conversation over. */
function readPreferences(encoded: string): string[] {
  try {
    const parsed: unknown = JSON.parse(encoded);
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

export async function runJarvis(input: {
  messages: JarvisMessage[];
  userId: string;
  now?: Date;
}): Promise<JarvisResult> {
  const now = input.now ?? new Date();
  const ctx: ToolContext = { userId: input.userId, now };

  const [profile, snapshot] = await Promise.all([
    getOrCreateProfile(input.userId),
    todaySnapshot(ctx),
  ]);

  const system = buildJarvisPrompt({
    snapshot,
    displayName: profile.displayName,
    dietaryPreferences: readPreferences(profile.dietaryPreferences),
  });

  // Prior assistant turns arrive as plain text with no tool calls, which both
  // providers accept. Empty ones are dropped — Claude rejects a message with
  // no content blocks.
  const turns: Turn[] = input.messages
    .filter((message) => message.content.trim().length > 0)
    .map((message) =>
      message.role === "user"
        ? { role: "user", text: message.content }
        : { role: "assistant", text: message.content, calls: [] },
    );

  const provider = getProvider();
  const actions: JarvisAction[] = [];
  let toolCallsUsed = 0;

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    let response;
    try {
      response = await withRetry(() =>
        provider({ system, turns, tools: TOOL_SPECS }),
      );
    } catch (error) {
      // The model can fail *after* a tool has already written to the database
      // — a rate limit on the round that was going to summarise the work. The
      // meal is logged either way, so the failure must be reported alongside
      // what happened rather than replacing it. Only a failure before anything
      // changed is safe to propagate as a plain error.
      if (actions.length === 0) throw error;

      console.error("Jarvis failed after taking action:", error);
      return {
        reply: `${describe(actions)}. I then lost my train of thought before I could summarise it — the numbers on the dashboard are correct.`,
        actions,
      };
    }

    if (response.calls.length === 0) {
      return {
        reply:
          response.text ||
          "I didn't catch that — tell me what you ate and I'll log it.",
        actions,
      };
    }

    turns.push({
      role: "assistant",
      text: response.text,
      calls: response.calls,
      ...(response.raw ? { raw: response.raw } : {}),
    });

    const results: ToolResult[] = [];
    for (const call of response.calls) {
      // Every call still gets a result, even past the cap: a tool_use block
      // without a matching result is a protocol error, not just a missing
      // answer.
      if (toolCallsUsed >= MAX_TOOL_CALLS) {
        results.push({
          id: call.id,
          name: call.name,
          output: { error: "Too many steps in one message. Answer with what you have." },
        });
        continue;
      }

      toolCallsUsed += 1;
      const outcome = await executeTool(call, ctx);
      results.push({ id: call.id, name: call.name, output: outcome.output });
      if (outcome.action) actions.push(outcome.action);
    }

    turns.push({ role: "tool", results });
  }

  // Ran out of rounds still asking for tools. Same principle as above: the
  // actions already taken are real and must be reported.
  return {
    reply:
      actions.length > 0
        ? `${describe(actions)}. I got stuck working out what to say after that.`
        : "I got stuck on that one. Try rephrasing it, or log it from the dashboard.",
    actions,
  };
}

/** Falls back to the tool summaries when the model never produced prose. */
function describe(actions: JarvisAction[]): string {
  return actions.map((action) => action.summary).join(". ");
}

/**
 * One retry, and only for provider capacity failures.
 *
 * Popular models shed load with a 503 several times an hour; surfacing that to
 * someone mid-sentence makes the assistant look broken when waiting a second
 * fixes it. Quota errors are explicitly not retried — see `retryable`.
 */
async function withRetry<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!(error instanceof AiAnalysisError) || !error.retryable) throw error;

    await new Promise((resolve) => setTimeout(resolve, 1500));
    return call();
  }
}
