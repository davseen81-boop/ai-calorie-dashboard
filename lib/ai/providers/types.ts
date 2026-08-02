/** What every AI provider must implement for meal analysis. */
export interface ProviderRequest {
  /** Full system prompt, already including any per-user context. */
  system: string;
  /** The user's written description, or the caption accompanying a photo. */
  text: string;
  /** Present only for photo analysis. */
  image?: { mediaType: string; base64: string };
}

/**
 * Returns the model's raw JSON string. Parsing and validation are shared —
 * a provider's only job is to produce schema-shaped JSON text or throw an
 * `AiAnalysisError`.
 */
export type ProviderCall = (request: ProviderRequest) => Promise<string | null>;
