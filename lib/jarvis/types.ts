/**
 * Provider-neutral conversation types.
 *
 * Gemini and Claude disagree on almost everything about tool use — role names,
 * where results go, how calls are identified. Rather than write the agent loop
 * twice, the loop speaks in these types and each provider translates.
 */

/** A model's request to run one tool. */
export interface ToolCall {
  /** Claude requires results to reference the call by id; Gemini matches on
   *  name. Always populated so the loop can pair them either way. */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** The outcome of running one tool, fed back to the model. */
export interface ToolResult {
  id: string;
  name: string;
  /** Must be an object: Gemini rejects a bare scalar as a function response. */
  output: Record<string, unknown>;
}

/**
 * Provider-native message content, carried verbatim across rounds.
 *
 * Reconstructing an assistant turn from `text` + `calls` loses fields the
 * provider requires back unchanged — Gemini 3 rejects a function call replayed
 * without its thought signature, and Claude does the same with thinking blocks.
 * Tagged so a provider only ever trusts content it produced itself.
 */
export interface RawAssistantContent {
  provider: "gemini" | "anthropic";
  content: unknown;
}

export type Turn =
  | { role: "user"; text: string }
  | {
      role: "assistant";
      text: string;
      calls: ToolCall[];
      raw?: RawAssistantContent;
    }
  | { role: "tool"; results: ToolResult[] };

/** A tool as the model sees it. Plain JSON Schema — both providers take it. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ProviderResponse {
  text: string;
  calls: ToolCall[];
  raw?: RawAssistantContent;
}

export type ChatProviderCall = (input: {
  system: string;
  turns: Turn[];
  tools: ToolSpec[];
}) => Promise<ProviderResponse>;

/** One completed side effect, surfaced to the UI so the user sees what changed. */
export interface JarvisAction {
  tool: string;
  summary: string;
  /** Whether cached dashboard data is now stale. */
  mutating: boolean;
}

export interface JarvisMessage {
  role: "user" | "assistant";
  content: string;
}

export interface JarvisResult {
  reply: string;
  actions: JarvisAction[];
}
