import "server-only";

import { z } from "zod";

/**
 * SERVER-ONLY environment (secrets and connection strings).
 *
 * The `server-only` import turns any accidental client import into a build
 * error rather than a silent key leak into the browser bundle.
 *
 * Split into two independently-validated groups on purpose. A single schema
 * would mean a route that only reads the database still fails to load without
 * an Anthropic key — which breaks `next build`, since it evaluates every route's
 * module scope while collecting page data.
 */

/** `FOO=` in a dotenv file yields "", which should mean "not set". */
function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/**
 * Builds a lazily-validated, memoised accessor for a group of variables.
 *
 * `TOut extends object` is required because a Proxy target must be an object,
 * and an unconstrained `z.infer<T>` is not known to be one.
 */
function lazyEnv<TOut extends object>(
  schema: z.ZodType<TOut>,
  read: () => Record<string, string | undefined>,
  label: string,
): TOut {
  let cached: TOut | null = null;

  return new Proxy({} as TOut, {
    get(_target, prop) {
      if (!cached) {
        const parsed = schema.safeParse(read());
        if (!parsed.success) {
          const issues = parsed.error.issues
            .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
            .join("\n");
          throw new Error(
            `Invalid ${label} environment variables.\n${issues}\n\n` +
              `Copy .env.example to .env.local and fill in the values.`,
          );
        }
        cached = parsed.data;
      }
      return cached[prop as keyof TOut];
    },
  });
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

const dbEnvSchema = z
  .object({
    /**
     * `file:./local.db` locally, or a `libsql://…turso.io` URL in production.
     * A plain SQLite file cannot be used on serverless hosts — their storage is
     * ephemeral — which is why deployment uses Turso.
     */
    DATABASE_URL: z.string().min(1).default("file:./local.db"),
    /** Required by Turso; must be absent for a local file. */
    DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
  })
  .refine(
    (v) => v.DATABASE_URL.startsWith("file:") || Boolean(v.DATABASE_AUTH_TOKEN),
    {
      path: ["DATABASE_AUTH_TOKEN"],
      message: "required when DATABASE_URL points at Turso",
    },
  );

export const dbEnv = lazyEnv(
  dbEnvSchema,
  () => ({
    DATABASE_URL: emptyToUndefined(process.env.DATABASE_URL),
    DATABASE_AUTH_TOKEN: emptyToUndefined(process.env.DATABASE_AUTH_TOKEN),
  }),
  "database",
);

// ---------------------------------------------------------------------------
// Anthropic
// ---------------------------------------------------------------------------

const aiEnvSchema = z.object({
  ANTHROPIC_API_KEY: z
    .string()
    .min(1, "required before meal analysis will work"),
  /**
   * One model covers both modes — Claude is natively multimodal, so text and
   * photo analysis run through the same model rather than two separate ones.
   * Configurable so it can be swapped without a code change.
   */
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5"),
});

export const aiEnv = lazyEnv(
  aiEnvSchema,
  () => ({
    ANTHROPIC_API_KEY: emptyToUndefined(process.env.ANTHROPIC_API_KEY),
    ANTHROPIC_MODEL: emptyToUndefined(process.env.ANTHROPIC_MODEL),
  }),
  "Anthropic",
);
