import { z } from "zod";

/**
 * PUBLIC environment. Safe to import from client components.
 *
 * `process.env.NEXT_PUBLIC_*` must be written out literally — Next.js inlines
 * these by static text substitution at build time, so a dynamic lookup like
 * `process.env[key]` would compile to `undefined` in the browser bundle.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cached: PublicEnv | null = null;

function loadPublicEnv(): PublicEnv {
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid public environment variables.\n${issues}`);
  }

  return parsed.data;
}

/**
 * Validated public env.
 *
 * Resolution is deferred to first property access rather than done at import
 * time, so `next build` still succeeds on a machine without a `.env.local`.
 */
export const env: PublicEnv = new Proxy({} as PublicEnv, {
  get(_target, prop) {
    cached ??= loadPublicEnv();
    return cached[prop as keyof PublicEnv];
  },
});
